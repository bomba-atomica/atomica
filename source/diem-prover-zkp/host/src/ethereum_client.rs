//! Ethereum client for interacting with the DiemLightClient contract

use anyhow::Result;
use ethers::prelude::*;
use std::sync::Arc;

abigen!(
    DiemLightClient,
    r#"[
        function getState() external view returns (uint64 version, bytes32 stateRoot, bytes32 accumulator, uint64 timestamp, uint64 epoch)
        function updateState(bytes calldata proofBytes, bytes calldata publicValuesBytes) external
        event StateUpdated(uint64 indexed version, bytes32 stateRoot, uint64 epoch)
    ]"#
);

pub struct EthereumClient {
    contract: DiemLightClient<SignerMiddleware<Provider<Http>, LocalWallet>>,
}

impl EthereumClient {
    pub async fn new(
        rpc_url: &str,
        contract_address: &str,
        private_key: &str,
    ) -> Result<Self> {
        // Connect to Ethereum
        let provider = Provider::<Http>::try_from(rpc_url)?;
        let chain_id = provider.get_chainid().await?;

        // Setup wallet
        let wallet = private_key.parse::<LocalWallet>()?
            .with_chain_id(chain_id.as_u64());

        // Create signer
        let client = SignerMiddleware::new(provider, wallet);
        let client = Arc::new(client);

        // Create contract instance
        let address: Address = contract_address.parse()?;
        let contract = DiemLightClient::new(address, client);

        Ok(Self { contract })
    }

    /// Get the current version from the light client contract
    pub async fn get_current_version(&self) -> Result<u64> {
        let (version, _, _, _, _) = self.contract.get_state().call().await?;
        Ok(version)
    }

    /// Submit a proof to update the light client state
    pub async fn submit_proof(
        &self,
        proof_bytes: &[u8],
        public_values: &[u8],
    ) -> Result<H256> {
        let tx = self.contract
            .update_state(
                proof_bytes.to_vec().into(),
                public_values.to_vec().into(),
            )
            .send()
            .await?
            .await?
            .ok_or_else(|| anyhow::anyhow!("Transaction receipt not found"))?;

        Ok(tx.transaction_hash)
    }
}
