use aptos_types::{
    account_address::AccountAddress,
    chain_id::ChainId,
    state_store::{state_key::StateKey, state_value::StateValue, state_storage_usage::StateStorageUsage, StateViewResult},
    transaction::{SignedTransaction, TransactionOutput, TransactionStatus, signature_verified_transaction::SignatureVerifiedTransaction, Transaction, AuxiliaryInfo},
    write_set::WriteSet,
    block_executor::{
        config::BlockExecutorConfigFromOnchain,
        transaction_slice_metadata::TransactionSliceMetadata,
    },
};
use aptos_framework::ReleaseBundle;
use aptos_vm::{aptos_vm::AptosVMBlockExecutor, VMBlockExecutor};
use aptos_vm_genesis::generate_test_genesis;
use aptos_block_executor::txn_provider::default::DefaultTxnProvider;
use move_core_types::move_resource::MoveStructType;
use std::collections::HashMap;
use anyhow::{Context, Result};
use aptos_types::event::{EventHandle, EventKey};

/// Minimal in-memory state view for offline transaction execution
pub struct InMemoryStateView {
    state: HashMap<StateKey, StateValue>,
}

impl InMemoryStateView {
    fn new() -> Self {
        Self {
            state: HashMap::new(),
        }
    }

    fn apply_write_set(&mut self, write_set: &WriteSet) {
        for (state_key, write_op) in write_set.as_v0().iter() {
            // WriteOp is now a wrapper around BaseStateOp
            if let Some(state_value) = write_op.as_state_value_opt() {
                // Creation or Modification
                self.state.insert(state_key.clone(), state_value.clone());
            } else {
                // Deletion
                self.state.remove(state_key);
            }
        }
    }
}

impl aptos_types::state_store::TStateView for InMemoryStateView {
    type Key = StateKey;

    fn get_state_value(&self, state_key: &StateKey) -> StateViewResult<Option<StateValue>> {
        Ok(self.state.get(state_key).cloned())
    }

    fn get_usage(&self) -> StateViewResult<StateStorageUsage> {
        Ok(StateStorageUsage::zero())
    }
}

/// Minimal offline transaction runner
pub struct OfflineTxnRunner {
    state_view: InMemoryStateView,
    chain_id: ChainId,
}

impl OfflineTxnRunner {
    /// Create a new executor with genesis from the given release bundle
    pub fn new(release_bundle: &ReleaseBundle) -> Self {
        let mut state_view = InMemoryStateView::new();
        let chain_id = ChainId::test();

        // Generate genesis using the provided framework
        let genesis = generate_test_genesis(release_bundle, None);

        // Apply genesis write set
        state_view.apply_write_set(genesis.0.write_set());

        Self {
            state_view,
            chain_id,
        }
    }

    /// Fund an account by directly manipulating state
    /// This creates the account and sets up initial balance and sequence number
    pub fn fund_account(&mut self, address: AccountAddress, _amount: u64, sequence_number: u64) {
        use aptos_types::account_config::AccountResource;

        // Create event handles for the account
        let coin_register_events = EventHandle::new(EventKey::new(0, address), 0);
        let key_rotation_events = EventHandle::new(EventKey::new(1, address), 0);

        // Create account resource with the specified sequence number
        let account_resource = AccountResource::new(
            sequence_number,
            vec![],
            coin_register_events,
            key_rotation_events,
        );

        // Create state key for the account resource
        let state_key = StateKey::resource(
            &address,
            &AccountResource::struct_tag(),
        ).expect("Failed to create state key for account resource");

        // Serialize and store the account resource
        let account_blob = bcs::to_bytes(&account_resource)
            .expect("Failed to serialize account resource");
        self.state_view.state.insert(
            state_key,
            StateValue::new_legacy(account_blob.into()),
        );

        // TODO: Also need to create CoinStore for the account with the balance
        // For now, this sets up the basic account structure
        // The test framework in e2e-tests does more sophisticated setup
        // but this should be enough for basic transaction execution
    }

    /// Execute a transaction and return the output
    pub fn execute_transaction(&mut self, txn: SignedTransaction) -> Result<TransactionOutput> {
        // Create the VM block executor
        let vm = AptosVMBlockExecutor::new();

        // Wrap the transaction in the appropriate types
        let sig_verified_txn = SignatureVerifiedTransaction::Valid(Transaction::UserTransaction(txn));
        let txns = vec![sig_verified_txn];

        // Create a transaction provider
        // The auxiliary info is empty for our simple use case
        let auxiliary_info = vec![AuxiliaryInfo::default()];
        let txn_provider = DefaultTxnProvider::new(txns, auxiliary_info);

        // Execute the block with on-chain config
        let onchain_config = BlockExecutorConfigFromOnchain::new_no_block_limit();
        let transaction_slice_metadata = TransactionSliceMetadata::unknown();

        let block_output = vm.execute_block(
            &txn_provider,
            &self.state_view,
            onchain_config,
            transaction_slice_metadata,
        ).context("VM execution failed")?;

        let mut output = block_output.into_transaction_outputs_forced().into_iter().next()
            .context("No output from VM")?;

        // Apply the write set if the transaction succeeded
        if matches!(output.status(), TransactionStatus::Keep(_)) {
            let write_set = output.write_set();
            self.state_view.apply_write_set(write_set);
        }

        Ok(output)
    }

    pub fn enable_tracing(&mut self, trace_path: std::path::PathBuf) {
        std::env::set_var("TRACE", &trace_path);
        // Note: Opcode tracing is controlled by the move-vm-runtime "debugging" feature
        // and environment variables. The actual trace output will be handled by the VM.
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aptos_cached_packages::aptos_stdlib;
    use aptos_types::transaction::RawTransaction;
    use aptos_types::chain_id::ChainId;
    use aptos_keygen::KeyGen;
    use aptos_types::transaction::authenticator::AuthenticationKey;

    #[test]
    fn test_offline_runner_sanity() {
        // 1. Setup
        let head_release_bundle = aptos_cached_packages::head_release_bundle();
        let mut runner = OfflineTxnRunner::new(head_release_bundle);

        // 2. Prepare Sender
        let mut rng = KeyGen::from_os_rng();
        let (private_key, public_key) = rng.generate_ed25519_keypair();

        let sender_address = AuthenticationKey::ed25519(&public_key).account_address();
        let sequence_number = 0;

        runner.fund_account(sender_address, 100_000_000, sequence_number);

        // 3. Create Transaction (Transfer 100 to 0x1)
        let recipient = AccountAddress::ONE;
        let amount = 100u64;
        let payload = aptos_stdlib::aptos_account_transfer(recipient, amount);
        let entry_function = payload.into_entry_function();

        let raw_txn = RawTransaction::new_entry_function(
            sender_address,
            sequence_number,
            entry_function,
            100_000,
            100,
            u64::MAX,
            ChainId::test(),
        );
        let signed_txn = raw_txn.sign(&private_key, public_key).unwrap().into_inner();

        // 4. Execute
        let output = runner.execute_transaction(signed_txn).expect("Execution failed");

        // 5. Verify
        match output.status() {
            TransactionStatus::Keep(_) => {},
            _ => panic!("Expected Keep status, got {:?}", output.status()),
        }
    }
}
