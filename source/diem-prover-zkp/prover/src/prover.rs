use anyhow::{Result, Context};
use ark_groth16::{Groth16, Proof, ProvingKey};
use ark_bls12_381::{Bls12_381, Fr};
use ark_serialize::CanonicalDeserialize;
use std::path::Path;
use std::time::{Duration, Instant};
use tokio::time;
use tracing::{info, debug, warn, error};

use crate::config::Config;
use crate::diem_client::DiemClient;
use crate::ethereum_client::EthereumClient;
use crate::circuit::{CircuitInputs, generate_witness};

pub struct ZKProver {
    proving_key: ProvingKey<Bls12_381>,
    diem_client: DiemClient,
    ethereum_client: EthereumClient,
    poll_interval: Duration,
}

impl ZKProver {
    pub async fn new(config: Config) -> Result<Self> {
        info!("Initializing ZK prover...");

        // Load proving key
        info!("Loading proving key from: {}", config.circuit.proving_key_path);
        let proving_key = Self::load_proving_key(&config.circuit.proving_key_path)?;
        info!("✅ Proving key loaded");

        // Initialize Diem client
        let diem_client = DiemClient::new(&config.diem.rpc_url)?;
        info!("✅ Diem client initialized");

        // Initialize Ethereum client
        let ethereum_client = EthereumClient::new(
            &config.ethereum.rpc_url,
            &config.ethereum.light_client_address,
            &config.ethereum.private_key_path,
        ).await?;
        info!("✅ Ethereum client initialized");

        Ok(Self {
            proving_key,
            diem_client,
            ethereum_client,
            poll_interval: Duration::from_secs(config.diem.poll_interval_secs),
        })
    }

    pub fn poll_interval(&self) -> u64 {
        self.poll_interval.as_secs()
    }

    pub async fn run(&self) -> Result<()> {
        let mut interval = time::interval(self.poll_interval);

        loop {
            interval.tick().await;

            if let Err(e) = self.process_update().await {
                error!("Failed to process update: {}", e);
                // Continue on error - don't crash the service
                continue;
            }
        }
    }

    async fn process_update(&self) -> Result<()> {
        // 1. Get current Ethereum state
        let current_version = self.ethereum_client.get_current_version().await?;
        debug!("Current Ethereum version: {}", current_version);

        // 2. Check if Diem has new state
        let latest_version = self.diem_client.get_latest_version().await?;
        debug!("Latest Diem version: {}", latest_version);

        if latest_version <= current_version {
            debug!("No new updates available");
            return Ok(());
        }

        info!("📥 New update available: {} -> {}", current_version, latest_version);

        // 3. Get state proof from Diem
        let state_proof = self.diem_client
            .get_state_proof(current_version)
            .await
            .context("Failed to fetch state proof from Diem")?;

        info!("✅ State proof fetched");

        // 4. Generate ZK proof
        info!("🔮 Generating ZK proof (this may take 30-60 seconds)...");
        let start = Instant::now();

        let (proof, public_inputs) = self.generate_proof(&state_proof)
            .context("Failed to generate ZK proof")?;

        let elapsed = start.elapsed();
        info!("✅ Proof generated in {:.2}s", elapsed.as_secs_f64());

        // 5. Submit to Ethereum
        info!("📤 Submitting proof to Ethereum...");
        let tx_hash = self.ethereum_client
            .submit_proof(proof, public_inputs)
            .await
            .context("Failed to submit proof to Ethereum")?;

        info!("✅ Proof submitted! Transaction: 0x{}", hex::encode(tx_hash));
        info!("📊 Updated from version {} to {}", current_version, latest_version);

        Ok(())
    }

    fn generate_proof(
        &self,
        state_proof: &StateProof,
    ) -> Result<(Proof<Bls12_381>, Vec<Fr>)> {
        // 1. Extract circuit inputs from state proof
        let circuit_inputs = CircuitInputs::from_state_proof(state_proof)?;

        // 2. Generate witness
        let witness = generate_witness(&circuit_inputs)?;

        // 3. Generate proof using Groth16
        let mut rng = ark_std::test_rng();
        let proof = Groth16::<Bls12_381>::prove(
            &self.proving_key,
            witness.clone(),
            &mut rng,
        )?;

        // 4. Extract public inputs
        let public_inputs = circuit_inputs.to_public_inputs();

        Ok((proof, public_inputs))
    }

    fn load_proving_key(path: &str) -> Result<ProvingKey<Bls12_381>> {
        let file = std::fs::File::open(path)
            .context(format!("Failed to open proving key file: {}", path))?;

        let proving_key = ProvingKey::<Bls12_381>::deserialize_uncompressed(file)
            .context("Failed to deserialize proving key")?;

        Ok(proving_key)
    }
}

// Placeholder types - would be properly defined in other modules
#[derive(Debug)]
pub struct StateProof {
    // Simplified - actual implementation would match Diem types
}
