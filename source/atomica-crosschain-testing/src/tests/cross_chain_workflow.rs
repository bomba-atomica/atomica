use crate::env::CrossChainTestEnv;
use aptos_sdk::types::LocalAccount;
use std::convert::TryFrom;
use std::time::Duration;
use aptos_sdk::coin_client::CoinClient;
use aptos_forge::Node;

#[tokio::test]
async fn test_cross_chain_interaction() -> anyhow::Result<()> {
    // 1. Start Environment (Launches Aptos Swarm + Ethereum Docker Testnet)
    let mut env = CrossChainTestEnv::new().await?;
    
    println!("Aptos Validator Endpoint: {}", env.aptos.validators().next().unwrap().rest_api_endpoint());
    println!("Ethereum Beacon Endpoint: {}", env.ethereum.get_beacon_node_url());

    // 2. Verify Ethereum Connectivity
    let header = env.ethereum.get_beacon_header("head").await?;
    println!("Ethereum Head Slot: {}", header["header"]["message"]["slot"]);

    let sync_committee = env.ethereum.get_sync_committee("head").await?;
    println!("Ethereum Sync Committee Keys: {}", sync_committee["keys"].as_array().unwrap().len());
    
    assert!(sync_committee["keys"].as_array().unwrap().len() > 0);

    // 5. Setup Aptos Client & Account
    // We'll create a new Aptos account and fund it using the swarm's root account
    let aptos_client = env.aptos.validators().next().unwrap().rest_client();
    let coin_client = CoinClient::new(&aptos_client);
    
    let mut aptos_account = LocalAccount::generate(&mut rand::rngs::OsRng);
    let root_account = env.aptos.root_account(); // Start with local swarm's root account
    
    // Fund the new account
    // let faucet_port = portpicker::pick_unused_port().unwrap_or(8081); // Unused
    
    let root_balance = coin_client.get_account_balance(&root_account.address()).await?;
    println!("Aptos Root Balance: {}", root_balance);
    assert!(root_balance > 0);

    Ok(())
}
