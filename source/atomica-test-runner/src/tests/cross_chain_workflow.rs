use crate::env::CrossChainTestEnv;
use aptos_sdk::types::LocalAccount;
use ethers::prelude::*;
use ethers::providers::{Provider, Http};
use std::convert::TryFrom;
use std::time::Duration;
use aptos_sdk::coin_client::CoinClient;
use aptos_forge::Node;

#[tokio::test]
async fn test_cross_chain_interaction() -> anyhow::Result<()> {
    // 1. Start Environment
    let mut env = CrossChainTestEnv::new().await?;
    let anvil_port = env.anvil_port;
    
    println!("Aptos Validator Endpoint: {}", env.aptos.validators().next().unwrap().rest_api_endpoint());
    println!("Anvil Endpoint: http://localhost:{}", anvil_port);

    // 2. Setup Ethereum Client
    let provider = Provider::<Http>::try_from(format!("http://localhost:{}", anvil_port))?
        .interval(Duration::from_millis(10u64));
    
    // Connect to the well-known Anvil account #0 (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
    // Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
    let wallet: LocalWallet = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        .parse::<LocalWallet>()?
        .with_chain_id(31337u64);
        
    let client = SignerMiddleware::new(provider.clone(), wallet.clone());
    
    // 3. Verify Ethereum Balance
    let balance = client.get_balance(wallet.address(), None).await?;
    println!("Eth Balance: {}", balance);
    assert!(balance > U256::zero());

    // 4. Send Ethereum Transaction (Self-transfer)
    let tx = TransactionRequest::new()
        .to(wallet.address())
        .value(1000)
        .from(wallet.address());
    
    let pending_tx = client.send_transaction(tx, None).await?;
    let receipt = pending_tx.await?.unwrap();
    println!("Eth Transaction Mined: {:?}", receipt.transaction_hash);

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
