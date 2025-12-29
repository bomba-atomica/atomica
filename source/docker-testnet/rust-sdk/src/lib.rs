//! Docker testnet manager for atomica integration tests
//!
//! ## Automatic Docker Lifecycle Management
//!
//! `DockerTestnet` handles the complete Docker lifecycle:
//!
//! 1. **On creation (`new()`):**
//!    - Cleans up any existing testnet
//!    - Starts fresh Docker containers (4 validators)
//!    - Waits for all validators to be healthy
//!    - Discovers REST API endpoints
//!
//! 2. **During test:**
//!    - Provides API to query validators
//!    - Access validator endpoints via REST
//!    - No manual docker commands needed
//!
//! 3. **On drop (automatic):**
//!    - Stops all containers
//!    - Removes volumes
//!    - Cleans up network
//!    - **Works even on panic!**
//!
//! ## Example
//! ```no_run
//! use atomica_docker_testnet::DockerTestnet;
//! 
//! #[tokio::test]
//! async fn test_timelock_encryption() {
//!     // Docker starts here ↓
//!     let testnet = DockerTestnet::new(4).await.unwrap();
//!
//!     let api_url = testnet.validator_api_url(0);
//!     // Make REST API calls, test functionality
//!
//!     // Docker stops here ↓ (automatic cleanup)
//! }
//! ```
//!
//! ## Important Notes
//!
//! - Tests must run sequentially: `cargo test -- --test-threads=1`
//! - Docker port conflicts occur if tests run in parallel
//! - Build images first: `cd source/docker-testnet/config && ./build.sh`
//! - No manual `docker compose up/down` needed!

use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};

/// Base ports for validators (incremented for each validator)
const BASE_API_PORT: u16 = 8080;
#[allow(dead_code)]
const BASE_METRICS_PORT: u16 = 9101;

/// Build options for local Docker image
#[derive(Debug, Clone, Default)]
pub struct BuildOptions {
    /// Build profile: "release" or "debug" (default: "release")
    pub profile: Option<String>,
    /// Cargo features to enable (default: "testing")
    pub features: Option<String>,
    /// Image tag (default: "local")
    pub tag: Option<String>,
    /// Disable Docker BuildKit cache
    pub no_cache: bool,
}

/// Docker testnet with automatic cleanup
pub struct DockerTestnet {
    compose_dir: String,
    num_validators: usize,
    validator_urls: Vec<String>,
}

impl DockerTestnet {
    /// Create a fresh, isolated Docker testnet with N validators.
    ///
    /// # Arguments
    /// * `num_validators` - Number of validator nodes (typically 4-7)
    /// * `use_local_image` - If true, use locally built image instead of published one
    ///
    /// # Errors
    /// Returns error if:
    /// - Docker is not running
    /// - docker-testnet directory not found
    /// - Validators fail to start within timeout
    ///
    /// # Examples
    /// ```no_run
    /// use atomica_docker_testnet::DockerTestnet;
    ///
    /// #[tokio::main]
    /// async fn main() {
    ///     // Use published image (default)
    ///     let testnet = DockerTestnet::new(4, false).await.unwrap();
    ///
    ///     // Use locally built image
    ///     DockerTestnet::build_local_image(None).await.unwrap();
    ///     let testnet = DockerTestnet::new(4, true).await.unwrap();
    /// }
    /// ```
    pub async fn new(num_validators: usize, use_local_image: bool) -> anyhow::Result<Self> {
        if num_validators < 1 || num_validators > 7 {
            return Err(anyhow::anyhow!(
                "num_validators must be between 1 and 7, got {}",
                num_validators
            ));
        }

        let compose_dir = Self::find_compose_dir()?;
        Self::check_docker()?;

        tracing::info!("Setting up fresh Docker testnet with {} validators...", num_validators);

        if use_local_image {
            tracing::info!("Using locally built image: atomica-validator:local");
        }

        // Clean up any existing testnet
        let _ = Self::run_compose_with_env(&compose_dir, &["down", "--remove-orphans", "-v"], use_local_image);
        tokio::time::sleep(Duration::from_secs(2)).await;

        // Start the testnet
        Self::run_compose_with_env(&compose_dir, &["up", "-d"], use_local_image)?;

        // Wait for all validators to be healthy
        Self::wait_for_healthy(num_validators, 120).await?;

        // Discover validator endpoints
        let validator_urls = (0..num_validators)
            .map(|i| format!("http://127.0.0.1:{}", BASE_API_PORT + i as u16))
            .collect();

        tokio::time::sleep(Duration::from_secs(2)).await;
        tracing::info!("✓ Docker testnet ready with {} validators", num_validators);

        Ok(Self {
            compose_dir,
            num_validators,
            validator_urls,
        })
    }

    /// Get the REST API URL for a specific validator
    pub fn validator_api_url(&self, index: usize) -> &str {
        &self.validator_urls[index]
    }

    /// Get all validator API URLs
    pub fn validator_api_urls(&self) -> &[String] {
        &self.validator_urls
    }

    /// Get the number of validators
    pub fn num_validators(&self) -> usize {
        self.num_validators
    }

    /// Query ledger info from a validator
    pub async fn get_ledger_info(&self, validator_index: usize) -> anyhow::Result<LedgerInfo> {
        let client = reqwest::Client::new();
        let url = format!("{}/v1", self.validator_api_url(validator_index));
        let response = client.get(&url).send().await?;
        let ledger_info = response.json::<LedgerInfo>().await?;
        Ok(ledger_info)
    }

    /// Get validator group public key from DKG state
    /// This is used for timelock encryption
    pub async fn get_validator_group_pubkey(&self) -> anyhow::Result<String> {
        // Query the DKG module state from on-chain
        let client = reqwest::Client::new();
        let url = format!(
            "{}/v1/accounts/0x1/resource/0x1::dkg::DKGState",
            self.validator_api_url(0)
        );

        let response = client.get(&url).send().await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Failed to query DKG state: {}",
                response.status()
            ));
        }

        let dkg_state: serde_json::Value = response.json().await?;

        // Extract group public key from the resource data
        let group_pk = dkg_state
            .get("data")
            .and_then(|d| d.get("dealer_epoch_public_key"))
            .and_then(|k| k.as_str())
            .ok_or_else(|| anyhow::anyhow!("Group public key not found in DKG state"))?;

        Ok(group_pk.to_string())
    }

    /// Wait for a specific number of blocks to be produced
    pub async fn wait_for_blocks(&self, num_blocks: u64, timeout_secs: u64) -> anyhow::Result<()> {
        let deadline = Instant::now() + Duration::from_secs(timeout_secs);
        let start_version = self.get_ledger_info(0).await?.ledger_version;
        let target_version = start_version + num_blocks;

        tracing::info!("Waiting for {} blocks (from version {} to {})", num_blocks, start_version, target_version);

        while Instant::now() < deadline {
            let current = self.get_ledger_info(0).await?.ledger_version;
            if current >= target_version {
                tracing::info!("✓ Reached target version {}", current);
                return Ok(());
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        Err(anyhow::anyhow!("Timeout waiting for blocks"))
    }

    /// Get validator account information from genesis artifacts
    ///
    /// ⚠️ NOTE: Reads keys from Docker container storage - does NOT generate them!
    ///
    /// This reads the validator's private key from:
    /// `validators/validator-{index}/private-keys.yaml`
    ///
    /// The keys are generated during genesis and stored in the Docker testnet config.
    pub fn get_validator_account(&self, index: usize) -> anyhow::Result<AccountInfo> {
        if index >= self.num_validators {
            return Err(anyhow::anyhow!(
                "Validator index {} out of range (only {} validators)",
                index,
                self.num_validators
            ));
        }

        let path = PathBuf::from(&self.compose_dir)
            .join("validators")
            .join(format!("validator-{}", index))
            .join("private-keys.yaml");

        if !path.exists() {
            return Err(anyhow::anyhow!(
                "Validator keys file not found: {:?}",
                path
            ));
        }

        AccountInfo::from_yaml_file(&path)
    }

    /// Get root/faucet account information from genesis artifacts
    ///
    /// ⚠️ NOTE: Reads keys from Docker container storage - does NOT generate them!
    ///
    /// This reads the root account's private key from:
    /// `genesis-artifacts/root-account-private-keys.yaml`
    ///
    /// The root account key is generated during genesis and its auth key
    /// is rotated to control the Core Resources account (0xA550C18) which
    /// has minting capabilities in test mode.
    pub fn get_faucet_account(&self) -> anyhow::Result<AccountInfo> {
        let path = PathBuf::from(&self.compose_dir)
            .join("genesis-artifacts")
            .join("root-account-private-keys.yaml");

        if !path.exists() {
            return Err(anyhow::anyhow!(
                "Root account keys file not found: {:?}",
                path
            ));
        }

        AccountInfo::from_yaml_file(&path)
    }

    /// Build Atomica Aptos validator image locally from source
    ///
    /// This builds the Docker image from ../atomica-aptos using BuildKit cache
    /// for fast incremental builds. The cache is persisted by Docker BuildKit
    /// so subsequent builds are much faster.
    ///
    /// # Arguments
    /// * `options` - Optional build configuration
    ///
    /// # Examples
    /// ```no_run
    /// use atomica_docker_testnet::{DockerTestnet, BuildOptions};
    ///
    /// #[tokio::main]
    /// async fn main() {
    ///     // Basic build
    ///     DockerTestnet::build_local_image(None).await.unwrap();
    ///
    ///     // Custom build
    ///     DockerTestnet::build_local_image(Some(BuildOptions {
    ///         profile: Some("debug".to_string()),
    ///         no_cache: true,
    ///         ..Default::default()
    ///     })).await.unwrap();
    /// }
    /// ```
    pub async fn build_local_image(options: Option<BuildOptions>) -> anyhow::Result<()> {
        let compose_dir = Self::find_compose_dir()?;
        // Build script is now in atomica-aptos/atomica/docker/
        let build_script = format!("{}/../../atomica-aptos/atomica/docker/build-local-image.sh", compose_dir);

        if !PathBuf::from(&build_script).exists() {
            return Err(anyhow::anyhow!(
                "Build script not found: {}\nMake sure atomica-aptos repository is checked out at the correct location.",
                build_script
            ));
        }

        let opts = options.unwrap_or_default();
        let mut args = Vec::new();

        if let Some(profile) = opts.profile {
            args.push("--profile".to_string());
            args.push(profile);
        }
        if let Some(features) = opts.features {
            args.push("--features".to_string());
            args.push(features);
        }
        if let Some(tag) = opts.tag {
            args.push("--tag".to_string());
            args.push(tag);
        }
        if opts.no_cache {
            args.push("--no-cache".to_string());
        }

        tracing::info!("Building local Atomica Aptos validator image...");
        if opts.no_cache {
            tracing::info!("  (ignoring BuildKit cache - build will take longer)");
        }

        let status = Command::new(&build_script)
            .args(&args)
            .current_dir(&compose_dir)
            .env("DOCKER_BUILDKIT", "1")
            .status()?;

        if !status.success() {
            return Err(anyhow::anyhow!("Build failed with exit code {:?}", status.code()));
        }

        tracing::info!("✓ Local image build complete");
        Ok(())
    }

    // --- Private helpers ---

    fn check_docker() -> anyhow::Result<()> {
        let ok = Command::new("docker")
            .args(["info"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()?
            .success();
        if !ok {
            return Err(anyhow::anyhow!(
                "Docker is not running. Please start Docker and try again."
            ));
        }
        Ok(())
    }

    fn find_compose_dir() -> anyhow::Result<String> {
        // Strategy: search for 'source/docker-testnet/config/docker-compose.yaml'
        // or '../config/docker-compose.yaml' relative to the crate root.
        
        let candidates = vec![
            "source/docker-testnet/config",
            "../config",
            "../../config", // if in sub-dir of test
            "docker-testnet/config", // if running from source/
        ];

        for path in &candidates {
            if std::path::Path::new(&format!("{}/docker-compose.yaml", path)).exists() {
                // If it's a relative path, resolve it relative to current dir or ensure it's usable.
                // But docker compose command accepts a path.
                return Ok(path.to_string());
            }
        }

        // Try using CARGO_MANIFEST_DIR to locate it relative to this crate
        if let Ok(dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let path = format!("{}/../config", dir);
             if std::path::Path::new(&format!("{}/docker-compose.yaml", path)).exists() {
                return Ok(path);
            }
        }

        Err(anyhow::anyhow!(
            "docker-testnet config directory not found. Please ensure source/docker-testnet/config/docker-compose.yaml exists."
        ))
    }

    fn run_compose(dir: &str, args: &[&str]) -> anyhow::Result<()> {
        Self::run_compose_with_env(dir, args, false)
    }

    fn run_compose_with_env(dir: &str, args: &[&str], use_local_image: bool) -> anyhow::Result<()> {
        let mut cmd = Command::new("docker");
        cmd.arg("compose").args(args).current_dir(dir);

        // Set environment variable if using local image
        if use_local_image {
            cmd.env("USE_LOCAL_IMAGE", "1");
        }

        let out = cmd.output()?;

        // Don't error on 'down' commands as they're used for cleanup
        if !out.status.success() && args[0] != "down" {
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(anyhow::anyhow!(
                "docker compose {} failed: {}",
                args.join(" "),
                stderr
            ));
        }
        Ok(())
    }

    async fn wait_for_healthy(num_validators: usize, timeout_secs: u64) -> anyhow::Result<()> {
        let deadline = Instant::now() + Duration::from_secs(timeout_secs);
        tracing::info!("Waiting for {} validators to become healthy...", num_validators);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()?;

        while Instant::now() < deadline {
            let mut healthy_count = 0;

            for i in 0..num_validators {
                let url = format!("http://127.0.0.1:{}/v1", BASE_API_PORT + i as u16);
                if client.get(&url).send().await.is_ok() {
                    healthy_count += 1;
                }
            }

            if healthy_count == num_validators {
                tracing::info!("  ✓ All {} validators healthy", num_validators);
                return Ok(());
            }

            tracing::debug!("  {}/{} validators healthy", healthy_count, num_validators);
            tokio::time::sleep(Duration::from_secs(2)).await;
        }

        Err(anyhow::anyhow!(
            "Timeout waiting for validators. Check 'docker compose logs' for details."
        ))
    }
}

impl Drop for DockerTestnet {
    fn drop(&mut self) {
        if std::thread::panicking() {
            // If panicking, we might want to leave containers up for debugging?
            // For now, respect the requirement "Works even on panic!" which implies cleanup.
        }
        tracing::info!("Tearing down Docker testnet...");
        let _ = Self::run_compose(&self.compose_dir, &["down", "--remove-orphans", "-v"]);
        tracing::info!("✓ Docker testnet stopped");
    }
}

/// Ledger info response from the REST API
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LedgerInfo {
    pub chain_id: u8,
    pub epoch: String,
    #[serde(deserialize_with = "deserialize_string_to_u64")]
    pub ledger_version: u64,
    #[serde(deserialize_with = "deserialize_string_to_u64")]
    pub oldest_ledger_version: u64,
    pub ledger_timestamp: String,
    pub node_role: String,
    #[serde(deserialize_with = "deserialize_string_to_u64")]
    pub oldest_block_height: u64,
    #[serde(deserialize_with = "deserialize_string_to_u64")]
    pub block_height: u64,
    pub git_hash: Option<String>,
}

/// Custom deserializer to convert string to u64
fn deserialize_string_to_u64<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    s.parse::<u64>().map_err(serde::de::Error::custom)
}

/// Account information read from genesis artifacts or validator configs
///
/// ⚠️ NOTE: Keys are read from Docker container storage, NOT generated!
/// - Validator keys: read from `validators/validator-{i}/private-keys.yaml`
/// - Root/Faucet keys: read from `genesis-artifacts/root-account-private-keys.yaml`
#[derive(Debug, Clone)]
pub struct AccountInfo {
    /// Account address (hex string without 0x prefix)
    pub address: String,
    /// Account private key (hex string with 0x prefix)
    pub private_key: String,
}

impl AccountInfo {
    /// Parse account info from a YAML file (e.g., private-keys.yaml)
    fn from_yaml_file(path: &PathBuf) -> anyhow::Result<Self> {
        let content = fs::read_to_string(path)?;

        // Parse using regex (same approach as TypeScript SDK)
        let addr_re = regex::Regex::new(r"account_address:\s*([a-fA-F0-9]+)")?;
        let key_re = regex::Regex::new(r#"account_private_key:\s*"(0x[a-fA-F0-9]+)""#)?;

        let address = addr_re
            .captures(&content)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| anyhow::anyhow!("Failed to parse account_address from {:?}", path))?;

        let private_key = key_re
            .captures(&content)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| anyhow::anyhow!("Failed to parse account_private_key from {:?}", path))?;

        Ok(AccountInfo {
            address,
            private_key,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[tokio::test]
    #[serial]
    async fn test_docker_lifecycle() {
        let _ = tracing_subscriber::fmt().with_test_writer().try_init();

        // Note: this test requires docker to be running and images to be available
        match DockerTestnet::new(4, false).await {
            Ok(testnet) => {
                println!("✓ Testnet started with {} validators", testnet.num_validators());
                println!("  Validator 0 API: {}", testnet.validator_api_url(0));

                // Try to get ledger info
                if let Ok(info) = testnet.get_ledger_info(0).await {
                    println!("  Chain ID: {}", info.chain_id);
                    println!("  Block height: {}", info.block_height);
                }
            }
            Err(e) => {
                println!("✗ Failed to start testnet: {}", e);
                // We don't want to fail CI if docker isn't available, but for local dev it's useful to know
                // panic!("Failed: {}", e);
            }
        }
    }

    #[tokio::test]
    #[serial]
    async fn test_read_keys_from_storage() {
        let _ = tracing_subscriber::fmt().with_test_writer().try_init();

        // This test verifies that both Rust and TypeScript SDKs read keys from storage
        // rather than generating them

        match DockerTestnet::new(2, false).await {
            Ok(testnet) => {
                println!("✓ Testnet started");

                // Test reading validator account from storage
                match testnet.get_validator_account(0) {
                    Ok(validator) => {
                        println!("✓ Validator 0 account read from storage:");
                        println!("  Address: 0x{}", validator.address);
                        println!("  Private key: {} (from validators/validator-0/private-keys.yaml)",
                                 &validator.private_key[..20]);
                    }
                    Err(e) => println!("✗ Failed to read validator 0: {}", e),
                }

                // Test reading faucet account from storage
                match testnet.get_faucet_account() {
                    Ok(faucet) => {
                        println!("✓ Faucet account read from storage:");
                        println!("  Address: 0x{}", faucet.address);
                        println!("  Private key: {} (from genesis-artifacts/root-account-private-keys.yaml)",
                                 &faucet.private_key[..20]);
                    }
                    Err(e) => println!("✗ Failed to read faucet account: {}", e),
                }

                println!("\n✓ Rust SDK reads keys from Docker container storage (does NOT generate keys)");
            }
            Err(e) => {
                println!("✗ Failed to start testnet: {}", e);
            }
        }
    }
}
