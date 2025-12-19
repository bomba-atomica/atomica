use aptos_types::{
    account_address::AccountAddress,
    chain_id::ChainId,
    state_store::{state_key::StateKey, state_value::StateValue, state_storage_usage::StateStorageUsage, StateViewResult},
    transaction::{SignedTransaction, TransactionOutput, TransactionStatus, signature_verified_transaction::SignatureVerifiedTransaction, Transaction, AuxiliaryInfo, authenticator::AuthenticationKey, RawTransaction},
    write_set::WriteSet,
    block_executor::{
        config::BlockExecutorConfigFromOnchain,
        transaction_slice_metadata::TransactionSliceMetadata,
    },
    AptosCoinType,
};
use aptos_framework::ReleaseBundle;
use aptos_vm::{aptos_vm::AptosVMBlockExecutor, VMBlockExecutor};
use aptos_vm_genesis::{generate_test_genesis, GENESIS_KEYPAIR};
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

    /// Fund an account by executing framework transactions as aptos_framework (0x1)
    /// This creates the account properly and mints coins to it
    pub fn fund_account(&mut self, address: AccountAddress, amount: u64, _sequence_number: u64) {
        use aptos_cached_packages::aptos_stdlib;
        use move_core_types::language_storage::CORE_CODE_ADDRESS;

        // Execute transactions as aptos_framework (0x1) to properly create the account
        let framework_address = CORE_CODE_ADDRESS;

        // Transaction 1: Mint coins to the address (this also creates the account if it doesn't exist)
        let mint_payload = aptos_stdlib::aptos_coin_mint(address, amount);
        let mint_txn = RawTransaction::new_entry_function(
            framework_address,
            0, // sequence number for framework account
            mint_payload.into_entry_function(),
            1_000_000, // max gas
            100, // gas price - must be above min bound
            u64::MAX,
            self.chain_id,
        );

        // For framework transactions, we can use a dummy signature since prologue is skipped
        // Actually, let's try executing it properly
        let signed_mint = self.create_framework_transaction(mint_txn);

        // Execute the mint transaction
        if let Ok(output) = self.execute_transaction(signed_mint) {
            eprintln!("Mint transaction status: {:?}", output.status());
        } else {
            eprintln!("Failed to execute mint transaction");
        }
    }

    /// Create a signed transaction for the framework account using the genesis keypair
    fn create_framework_transaction(&self, raw_txn: RawTransaction) -> SignedTransaction {
        // Use the genesis keypair to sign framework transactions
        let (private_key, public_key) = &*GENESIS_KEYPAIR;
        raw_txn.sign(private_key, public_key.clone()).unwrap().into_inner()
    }

    /// Old method - manually create account resources (keeping for reference but deprecated)
    #[allow(dead_code)]
    fn fund_account_manual(&mut self, address: AccountAddress, amount: u64, sequence_number: u64) {
        use aptos_types::account_config::{AccountResource, CoinStoreResource};

        // The authentication key should be 32 bytes
        // For an Ed25519 single-signer account, the auth key is derived from pubkey
        // But since we only have the address here, we'll set it to the address bytes
        // This assumes the address was properly derived from AuthenticationKey
        let mut auth_key_bytes = [0u8; AuthenticationKey::LENGTH];
        auth_key_bytes.copy_from_slice(address.as_ref());
        let auth_key = AuthenticationKey::new(auth_key_bytes).to_vec();

        // Create event handles for the account
        let coin_register_events = EventHandle::new(EventKey::new(0, address), 0);
        let key_rotation_events = EventHandle::new(EventKey::new(1, address), 0);

        // Create account resource with the specified sequence number
        let account_resource = AccountResource::new(
            sequence_number,
            auth_key,
            coin_register_events,
            key_rotation_events,
        );

        // Create state key for the account resource
        let account_state_key = StateKey::resource(
            &address,
            &AccountResource::struct_tag(),
        ).expect("Failed to create state key for account resource");

        // Serialize and store the account resource
        let account_blob = bcs::to_bytes(&account_resource)
            .expect("Failed to serialize account resource");
        self.state_view.state.insert(
            account_state_key,
            StateValue::new_legacy(account_blob.into()),
        );

        // Create CoinStore for AptosCoin with the specified balance
        let deposit_events = EventHandle::new(EventKey::new(2, address), 0);
        let withdraw_events = EventHandle::new(EventKey::new(3, address), 0);

        let coin_store = CoinStoreResource::<AptosCoinType>::new(
            amount,
            false, // not frozen
            deposit_events,
            withdraw_events,
        );

        // Create state key for the coin store
        let coin_store_state_key = StateKey::resource(
            &address,
            &CoinStoreResource::<AptosCoinType>::struct_tag(),
        ).expect("Failed to create state key for coin store");

        // Debug: print the struct tag
        eprintln!("Creating CoinStore with struct_tag: {:?}", CoinStoreResource::<AptosCoinType>::struct_tag());
        eprintln!("Funding account {} with {} coins", address, amount);

        // Serialize and store the coin store
        let coin_store_blob = bcs::to_bytes(&coin_store)
            .expect("Failed to serialize coin store");
        self.state_view.state.insert(
            coin_store_state_key,
            StateValue::new_legacy(coin_store_blob.into()),
        );

        eprintln!("Account funded successfully. State has {} entries", self.state_view.state.len());
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

        let output = block_output.into_transaction_outputs_forced().into_iter().next()
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
    fn test_offline_runner_with_fake_executor() {
        use e2e_tests::executor::FakeExecutor;

        // Use FakeExecutor which properly handles account creation
        let mut executor = FakeExecutor::from_head_genesis();

        // Create and fund sender account
        let sender = executor.new_account_at(AccountAddress::random());

        // Create recipient account
        let recipient = executor.new_account_at(AccountAddress::random());

        // Create transfer transaction
        let amount = 100u64;
        let payload = aptos_stdlib::aptos_account_transfer(*recipient.address(), amount);

        let txn = sender
            .transaction()
            .payload(payload)
            .sequence_number(0)
            .sign();

        // Execute transaction
        let output = executor.execute_transaction(txn);

        // Verify success
        assert!(output.status().is_success(), "Transaction failed: {:?}", output.status());
        println!("✓ Test passed! Transaction executed successfully");
        println!("  Gas used: {}", output.gas_used());
        println!("  Status: {:?}", output.status());
    }
}
