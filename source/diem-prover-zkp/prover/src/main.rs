use anyhow::Result;
use std::path::PathBuf;
use std::time::Duration;
use tokio::time;
use tracing::{info, error, warn};

mod circuit;
mod config;
mod diem_client;
mod ethereum_client;
mod prover;

use crate::config::Config;
use crate::prover::ZKProver;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    info!("🚀 Starting Diem ZKP Prover Service");

    // Load configuration
    let config = Config::load("Config.toml")?;
    info!("✅ Configuration loaded");

    // Initialize prover
    let prover = ZKProver::new(config).await?;
    info!("✅ Prover initialized");

    // Run main loop
    info!("🔄 Starting main loop (polling every {} seconds)", prover.poll_interval());

    prover.run().await?;

    Ok(())
}
