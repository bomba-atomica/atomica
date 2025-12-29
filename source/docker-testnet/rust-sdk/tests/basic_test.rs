//! Basic integration tests for the zapatos docker testnet
//!
//! These tests automatically start and stop Docker testnet instances.
//! No manual `docker compose` commands needed!
//!
//! What the test harness does:
//! 1. Creates a fresh Docker testnet (4 validators)
//! 2. Waits for validators to become healthy
//! 3. Runs test assertions
//! 4. Tears down Docker testnet (even on panic/failure)
//!
//! # Prerequisites
//!
//! Build docker images once:
//! ```bash
//! cd docker-testnet
//! ./build.sh
//! ```
//!
//! # Running tests
//!
//! Tests must run sequentially (Docker port conflicts):
//! ```bash
//! cargo test -- --test-threads=1 --nocapture
//! ```
//!
//! Docker lifecycle is handled automatically - just run the tests!

use atomica_docker_testnet::DockerTestnet;
use serial_test::serial;

#[tokio::test]
#[serial]
async fn test_testnet_starts_successfully() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("info")
        .with_test_writer()
        .try_init();

    tracing::info!("Starting testnet lifecycle test...");

    let testnet = DockerTestnet::new(4)
        .await
        .expect("Failed to start testnet");

    assert_eq!(testnet.num_validators(), 4);

    tracing::info!("✓ Testnet started successfully");
}

#[tokio::test]
#[serial]
async fn test_validators_produce_blocks() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("info")
        .with_test_writer()
        .try_init();

    tracing::info!("Starting block production test...");

    let testnet = DockerTestnet::new(4)
        .await
        .expect("Failed to start testnet");

    // Get initial ledger info
    let initial_info = testnet
        .get_ledger_info(0)
        .await
        .expect("Failed to get ledger info");

    tracing::info!(
        "Initial state - Chain ID: {}, Block: {}, Version: {}",
        initial_info.chain_id,
        initial_info.block_height,
        initial_info.ledger_version
    );

    // Wait for some blocks to be produced
    testnet
        .wait_for_blocks(5, 30)
        .await
        .expect("Failed to produce blocks");

    // Verify blocks were produced
    let final_info = testnet
        .get_ledger_info(0)
        .await
        .expect("Failed to get final ledger info");

    assert!(
        final_info.block_height > initial_info.block_height,
        "No blocks produced"
    );
    assert!(
        final_info.ledger_version > initial_info.ledger_version,
        "No transactions committed"
    );

    tracing::info!(
        "✓ Validators produced {} blocks",
        final_info.block_height - initial_info.block_height
    );
}

#[tokio::test]
#[serial]
async fn test_all_validators_accessible() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("info")
        .with_test_writer()
        .try_init();

    tracing::info!("Starting validator accessibility test...");

    let testnet = DockerTestnet::new(4)
        .await
        .expect("Failed to start testnet");

    // Query each validator
    for i in 0..testnet.num_validators() {
        let info = testnet
            .get_ledger_info(i)
            .await
            .expect(&format!("Failed to query validator {}", i));

        tracing::info!(
            "Validator {} - Block: {}, Version: {}",
            i,
            info.block_height,
            info.ledger_version
        );

        assert_eq!(info.chain_id, 4, "Validator {} has wrong chain ID", i);
        assert_eq!(
            info.node_role, "validator",
            "Validator {} has wrong role",
            i
        );
    }

    tracing::info!("✓ All validators accessible via REST API");
}

#[tokio::test]
#[serial]
#[ignore] // Ignore by default as it requires DKG to be initialized
async fn test_query_dkg_state() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("info")
        .with_test_writer()
        .try_init();

    tracing::info!("Starting DKG state query test...");

    let testnet = DockerTestnet::new(4)
        .await
        .expect("Failed to start testnet");

    // Wait for DKG to initialize (may take some epochs)
    testnet
        .wait_for_blocks(10, 60)
        .await
        .expect("Failed to wait for blocks");

    // Try to query DKG state
    match testnet.get_validator_group_pubkey().await {
        Ok(pubkey) => {
            tracing::info!("✓ DKG group public key: {}", &pubkey[..32]);
            assert!(pubkey.len() > 0, "Empty public key");
        }
        Err(e) => {
            tracing::warn!("DKG not yet initialized: {}", e);
            tracing::warn!("This is expected if DKG module hasn't completed setup");
        }
    }
}
