
use aptos_language_e2e_tests::executor::FakeExecutor;
use aptos_types::{
    transaction::{SignedTransaction, Transaction, TransactionOutput},

    account_address::AccountAddress,
};
use aptos_language_e2e_tests::account::Account;



use aptos_framework::ReleaseBundle;


use anyhow::{Context, Result};

pub struct OfflineTxnRunner {
    executor: FakeExecutor,
}

impl OfflineTxnRunner {
    pub fn new(release_bundle: &ReleaseBundle) -> Self {
        let executor = FakeExecutor::custom_genesis(release_bundle, None);
        Self { executor }
    }

    pub fn fund_account(&mut self, address: AccountAddress, amount: u64, sequence_number: u64) {
        self.executor.store_and_fund_account(
            Account::new_genesis_account(address),
            amount,
            sequence_number,
        );
    }

    pub fn execute_transaction(&mut self, txn: SignedTransaction) -> Result<TransactionOutput> {
         let output = self.executor.execute_block(vec![txn])
            .context("Failed to execute block")?
            .pop()
            .context("No transaction output returned")?;
        Ok(output)
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
    use aptos_types::transaction::TransactionStatus;

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
