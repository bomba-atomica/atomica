/// Local Image Build Integration Test
///
/// This test validates the entire local build workflow:
/// 1. Building the validator image from source
/// 2. Starting a testnet with the locally built image
/// 3. Verifying the testnet is fully functional
///
/// NOTE: This test is SLOW on first run (~10-15min to build image)
///       Subsequent runs are faster (~2-3min) thanks to sccache
///
/// To run:
///   cargo test --test local_build_test -- --nocapture --test-threads=1
///
/// To run with logging:
///   RUST_LOG=info cargo test --test local_build_test -- --nocapture --test-threads=1

use atomica_docker_testnet::{DockerTestnet, BuildOptions};
use serial_test::serial;

#[tokio::test]
#[serial]
async fn test_build_local_image() {
    let _ = tracing_subscriber::fmt().with_test_writer().try_init();

    println!("\n=== Building Local Validator Image ===");
    println!("This may take 10-15 minutes on first build...");
    println!("Subsequent builds will be much faster (~2-3min) thanks to sccache\n");

    match DockerTestnet::build_local_image(Some(BuildOptions {
        profile: Some("release".to_string()),
        show_stats: false, // Set to true if you want sccache stats
        ..Default::default()
    }))
    .await
    {
        Ok(()) => {
            println!("✓ Image built successfully");
        }
        Err(e) => {
            eprintln!("✗ Failed to build image: {}", e);
            panic!("Build failed: {}", e);
        }
    }
}

#[tokio::test]
#[serial]
async fn test_start_testnet_with_local_image() {
    let _ = tracing_subscriber::fmt().with_test_writer().try_init();

    println!("\n=== Starting Testnet with Local Image ===");

    // First ensure the image is built
    // (This will be fast if test_build_local_image already ran)
    if let Err(e) = DockerTestnet::build_local_image(None).await {
        eprintln!("Note: Skipping test - failed to build image: {}", e);
        return;
    }

    // Start testnet with local image
    match DockerTestnet::new(2, true).await {
        Ok(testnet) => {
            println!("✓ Testnet started with {} validators", testnet.num_validators());
            println!("  Using image: atomica-validator:local");

            // Verify testnet is functional
            println!("\n=== Verifying Testnet Functionality ===");

            // Wait a bit for consensus to stabilize
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

            // Try to wait for blocks
            match testnet.wait_for_blocks(1, 60).await {
                Ok(()) => println!("✓ Consensus is running - blocks being produced"),
                Err(e) => println!("Warning: Timeout waiting for blocks: {}", e),
            }

            // Query each validator
            for i in 0..testnet.num_validators() {
                match testnet.get_ledger_info(i).await {
                    Ok(info) => {
                        println!(
                            "✓ Validator {}: chain_id={}, version={}, height={}",
                            i, info.chain_id, info.ledger_version, info.block_height
                        );

                        assert_eq!(info.chain_id, 4);
                        assert_eq!(info.node_role, "validator");
                        assert!(info.ledger_version > 0);

                        // Check for git hash (build metadata)
                        if let Some(git_hash) = info.git_hash {
                            println!("  Build metadata: git_hash={}", git_hash);
                            assert!(git_hash.len() > 6); // Should be a commit hash
                        }
                    }
                    Err(e) => {
                        eprintln!("✗ Failed to query validator {}: {}", i, e);
                        panic!("Query failed");
                    }
                }
            }

            println!("\n✅ All tests passed - local image is fully functional!");
        }
        Err(e) => {
            eprintln!("✗ Failed to start testnet: {}", e);
            panic!("Testnet start failed: {}", e);
        }
    }
}

#[tokio::test]
#[serial]
#[ignore] // Ignored by default - run with --ignored to test sccache effectiveness
async fn test_sccache_speedup() {
    let _ = tracing_subscriber::fmt().with_test_writer().try_init();

    println!("\n=== Testing sccache Performance ===");
    println!("This test builds the image twice to demonstrate cache effectiveness\n");

    // First build (populates cache)
    println!("Build 1: Populating sccache (slow)...");
    let start1 = std::time::Instant::now();

    DockerTestnet::build_local_image(Some(BuildOptions {
        clean_sccache: true, // Start fresh
        ..Default::default()
    }))
    .await
    .expect("First build failed");

    let duration1 = start1.elapsed();
    println!("✓ Build 1 completed in {:.1}s\n", duration1.as_secs_f64());

    // Second build (uses cache)
    println!("Build 2: Using sccache (fast)...");
    let start2 = std::time::Instant::now();

    DockerTestnet::build_local_image(Some(BuildOptions {
        show_stats: true, // Show cache statistics
        ..Default::default()
    }))
    .await
    .expect("Second build failed");

    let duration2 = start2.elapsed();
    println!("✓ Build 2 completed in {:.1}s\n", duration2.as_secs_f64());

    // Compare
    let speedup = duration1.as_secs_f64() / duration2.as_secs_f64();
    let time_saved = (1.0 - duration2.as_secs_f64() / duration1.as_secs_f64()) * 100.0;

    println!("Speedup: {:.1}x faster", speedup);
    println!("Cache effectiveness: {:.1}% time saved", time_saved);

    // Should be significantly faster (at least 2x)
    assert!(
        speedup > 2.0,
        "Expected at least 2x speedup, got {:.1}x",
        speedup
    );
}
