use clap::Parser;
use serde::Serialize;
use std::path::PathBuf;
use aptos_language_e2e_tests::executor::FakeExecutor;
use aptos_types::{
    account_address::AccountAddress,
    chain_id::ChainId,
    function_info::FunctionInfo,
    transaction::{
        authenticator::AccountAuthenticator, RawTransaction, SignedTransaction, Transaction,
    },
};
use aptos_crypto::HashValue;
use aptos_cached_packages::aptos_stdlib;
use std::str::FromStr;
use tiny_keccak::{Hasher, Sha3};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long)]
    eth_address: String,

    #[arg(long)]
    scheme: String,

    #[arg(long)]
    issued_at: String,

    #[arg(long)]
    domain: String,

    #[arg(long)]
    digest: String, // Hex string

    #[arg(long)]
    signature: String, // Hex string

    #[arg(long, default_value_t = 1)]
    sequence_number: u64,

    #[arg(long, default_value_t = 4)] // Default to local testnet chain id
    chain_id: u8,
}

#[derive(Serialize)]
struct SIWEAbstractSignature {
    scheme: String,
    issued_at: String,
    signature: Vec<u8>,
}

#[derive(Serialize)]
struct SIWEAbstractPublicKey {
    eth_address_bytes: Vec<u8>,
    domain_bytes: Vec<u8>,
}

fn sha3_256(data: &[u8]) -> Vec<u8> {
    let mut sha3 = Sha3::v256();
    sha3.update(data);
    let mut output = [0u8; 32];
    sha3.finalize(&mut output);
    output.to_vec()
}

fn main() {
    let args = Args::parse();
    
    // Initialize Logger
    aptos_logger::Logger::new().level(aptos_logger::Level::Debug).init();
    println!("Starting Execution Debugger...");

    // 1. Setup FakeExecutor with Head Genesis
    let head_release_bundle = aptos_cached_packages::head_release_bundle();
    let mut executor = FakeExecutor::custom_genesis(head_release_bundle, None);

    // Enable Tracing
    // We set the environment variable programmatically if not set
    if std::env::var("TRACE").is_err() {
        unsafe { std::env::set_var("TRACE", "debug_trace"); }
    }
    // Note: FakeExecutor checks TRACE env var upon creation or via set_tracing method. 
    // Since we created it already, we might need to manually trigger trace setup if accessible, 
    // or rely on `executor` methods if they check it lazily. 
    // The snippet showed `set_tracing` is private. 
    // However, `FakeExecutor` seems to check `ENV_TRACE_DIR` ("TRACE") in internal methods or `set_tracing`.
    // Let's assume setting the env var before running might be enough if we can re-trigger it or if it checks on execution.
    // Actually, looking at `executor.rs` again, `set_tracing` is called within methods or manually?
    // It seems it is effectively enabled if the env var is present when `set_tracing` is called.
    // `set_tracing` is often called by the test runner.
    // Since we are writing a binary, we might not be able to rely on internal test runner logic.
    // However, for `FakeExecutor`, we are limited to its public API.
    // If we can't get traces via `TRACE` directory, we rely on `Enable detailed aptos logging` as requested.
    
    // 2. Construct Payload: 0x1::aptos_account::transfer
    let recipient = AccountAddress::from_str("0x1").unwrap(); 
    let amount = 100u64; // From sanity test
    let payload = aptos_stdlib::aptos_account_transfer(recipient, amount);

    // 3. Sender Address (Derived)
    let eth_address_str = args.eth_address.to_lowercase();
    let eth_address_bytes = eth_address_str.as_bytes().to_vec(); // UTF8 bytes of hex string
    
    // 4. Construct Authenticator
    let function_info = FunctionInfo::new(
        AccountAddress::ONE,
        "ethereum_derivable_account".to_string(),
        "authenticate".to_string(),
    );

    // Digest
    let digest_str = args.digest.trim_start_matches("0x");
    let digest_bytes = hex::decode(digest_str).expect("Invalid digest hex");

    // Signature
    let signature_str = args.signature.trim_start_matches("0x");
    let signature_bytes = hex::decode(signature_str).expect("Invalid signature hex");
    
    // Construct Abstract Signature BCS
    // Variant 1 (MessageV2)
    let sig_struct = SIWEAbstractSignature {
        scheme: args.scheme.clone(),
        issued_at: args.issued_at.clone(),
        signature: signature_bytes.clone(),
    };
    let mut sig_serializer = bcs::Serializer::new();
    sig_serializer.serialize_u32_as_uleb128(1).unwrap(); // Variant 1
    sig_struct.serialize(&mut sig_serializer).unwrap();
    let abstract_signature = sig_serializer.to_bytes();

    // Construct Abstract Public Key BCS
    let pk_struct = SIWEAbstractPublicKey {
        eth_address_bytes: eth_address_bytes.clone(),
        domain_bytes: args.domain.as_bytes().to_vec(),
    };
    let abstract_public_key = bcs::to_bytes(&pk_struct).unwrap();

    let authenticator = AccountAuthenticator::derivable_abstraction(
        function_info,
        digest_bytes,
        abstract_signature,
        abstract_public_key,
    );

    // Derivation Logic to verify sender address
    let mut func_info_serializer = bcs::Serializer::new();
    AccountAddress::ONE.serialize(&mut func_info_serializer).unwrap();
    "ethereum_derivable_account".serialize(&mut func_info_serializer).unwrap();
    "authenticate".serialize(&mut func_info_serializer).unwrap();
    let func_info_bcs = func_info_serializer.to_bytes();

    let mut id_serializer = bcs::Serializer::new();
    eth_address_bytes.serialize(&mut id_serializer).unwrap();
    let id_bcs = id_serializer.to_bytes();

    let mut preimage = Vec::new();
    preimage.extend(func_info_bcs);
    preimage.extend(id_bcs);
    preimage.push(5u8); // Scheme

    let derived_address = AccountAddress::from_bytes(sha3_256(&preimage)).unwrap();
    println!("Derived Sender Address: {}", derived_address);

    // 5. Construct Raw Transaction
    let raw_txn = RawTransaction::new_entry_function(
        derived_address,
        args.sequence_number,
        payload,
        100_000, 
        100, 
        u64::MAX, 
        ChainId::new(args.chain_id),
    );

    let signed_txn = SignedTransaction::new_with_authenticator(raw_txn, authenticator);

    // 6. Fund the account in executor
    // WARNING: `store_and_fund_account` in FakeExecutor typically just sets the balance resource.
    // It DOES NOT run the account creation logic (like initializing `OriginatingAddress` table if needed).
    // For standard Ed25519 accounts, this is fine.
    // For `ethereum_derivable_account`, if the account doesn't exist on chain, 
    // the prologue logic might check if it needs to be created or if it's already there.
    // If we just put balance, it looks like an existing account but might miss some metadata?
    // Actually, `store_and_fund_account` calls `add_account_data`.
    // It creates an `AccountData`.
    // For abstract accounts, we rely on the prologue to handle "first time" things or purely existence of balance?
    // The issue might be that `ethereum_derivable_account` usually assumes the account is created via a specific flow?
    // Or does it just authenticate?
    // If it authenticates `derived_address`, and `derived_address` has balance, the prologue generally succeeds.
    // Let's stick with `store_and_fund_account`.
    executor.store_and_fund_account(
         aptos_types::account_config::Account::new_genesis_account(derived_address),
         100_000_000_000, // Large amount
         args.sequence_number
    );

    // 7. Execute
    let output = executor.execute_block(vec![signed_txn]).unwrap();
    
    for (i, tx_out) in output.iter().enumerate() {
        println!("Tx {}: {:?}", i, tx_out.status());
        match tx_out.status() {
            aptos_types::transaction::TransactionStatus::Keep(status) => {
                 println!("  Keep: {:?}", status);
            }
             aptos_types::transaction::TransactionStatus::Discard(status) => {
                 println!("  Discard: {:?}", status);
                 println!("  (This implies validation failure)");
            }
             aptos_types::transaction::TransactionStatus::Retry => {
                 println!("  Retry");
            }
        }
    }
}
