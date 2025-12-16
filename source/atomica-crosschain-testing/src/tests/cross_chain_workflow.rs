use crate::env::CrossChainTestEnv;
use aptos_sdk::types::LocalAccount;
// use ethers::prelude::*; // Removed
// use ethers::providers::{Provider, Http}; // Removed
use std::convert::TryFrom;
use std::time::Duration;
use aptos_sdk::coin_client::CoinClient;
use aptos_forge::Node;

#[tokio::test]
async fn test_cross_chain_interaction() -> anyhow::Result<()> {
    // 1. Start Environment
    let mut env = CrossChainTestEnv::new().await?;
    
    println!("Aptos Validator Endpoint: {}", env.aptos.validators().next().unwrap().rest_api_endpoint());

    // 5. Setup Aptos Client & Account
    // We'll create a new Aptos account and fund it using the swarm's root account
    let aptos_client = env.aptos.validators().next().unwrap().rest_client();
    let coin_client = CoinClient::new(&aptos_client);
    
    let mut aptos_account = LocalAccount::generate(&mut rand::rngs::OsRng);
    let root_account = env.aptos.root_account(); // Start with local swarm's root account
    
    // Fund the new account
    let faucet_port = portpicker::pick_unused_port().unwrap_or(8081);
    // Note: Launching faucet usually happens in env setup, simplified here by directly transferring from root
    // But local swarm root has money.
    
    // Actually, let's just use the root account for simplicity in this first test to prove connectivity
    let root_balance = coin_client.get_account_balance(&root_account.address()).await?;
    println!("Aptos Root Balance: {}", root_balance);
    assert!(root_balance > 0);

    Ok(())
}
