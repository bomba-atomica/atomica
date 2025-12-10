use anyhow::{Context, Result};
use aptos_forge::{LocalSwarm, LocalFactory, SwarmExt, Factory};
use std::process::{Child, Command, Stdio};
use std::time::Duration;
use tokio::time::sleep;
use aptos_config::keys::ConfigKey;
use aptos_config::utils::get_available_port;
use rand::rngs::OsRng;
use std::sync::Arc;
use aptos_infallible::Mutex;
use once_cell::sync::Lazy;
use std::num::NonZeroUsize;

pub struct CrossChainTestEnv {
    pub aptos: LocalSwarm,
}

impl CrossChainTestEnv {
    pub async fn new() -> Result<Self> {
        // Aptos Setup
        // Simplified version of smoke_test_environment::new_local_swarm_with_aptos
        let num_validators = 1;
        let genesis_framework = aptos_cached_packages::head_release_bundle().clone();
        
        static FACTORY: Lazy<LocalFactory> =
            Lazy::new(|| LocalFactory::from_workspace(None).unwrap());
        let version = FACTORY.versions().max().unwrap();
        
        static ACTIVE_NODES: Lazy<Arc<Mutex<usize>>> = Lazy::new(|| Arc::new(Mutex::new(0)));
        // Assuming we don't need the strict guard for this single test suite usage, 
        // or we just implement a basic guard if needed. 
        // For simplicity, we skip the global guard as we are running `cargo test` which is controlled.
        // Actually, LocalFactory::new_swarm_with_version requires a guard. 
        // We'll create a dummy one or use the one from forge if possible, but forge doesn't expose it easily.
        // Let's use `aptos_forge::ActiveNodesGuard`.
        let slots = num_validators * 2;
        let guard = aptos_forge::ActiveNodesGuard::grab(slots, ACTIVE_NODES.clone()).await;

        let aptos = FACTORY
            .new_swarm_with_version(
                OsRng,
                NonZeroUsize::new(num_validators).unwrap(),
                0, // num_fullnodes
                &version,
                Some(genesis_framework),
                None, // init_config
                None, // vfn_config
                None, // init_genesis_stake
                None, // init_genesis_config
                guard,
            )
            .await?;
            
        Ok(Self {
            aptos,
        })
    }
}

impl Drop for CrossChainTestEnv {
    fn drop(&mut self) {
        // No anvil to kill
    }
}
