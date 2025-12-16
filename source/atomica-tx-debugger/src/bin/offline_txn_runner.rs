
use clap::Parser;
use std::path::PathBuf;
use std::fs;
use aptos_types::transaction::{SignedTransaction, Transaction, TransactionStatus};

use aptos_framework::ReleaseBundle;

use anyhow::{Context, Result};
use aptos_logger::Logger;

use atomica_test_executor::offline_runner::OfflineTxnRunner;


#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Path to the genesis .mrb file (ReleaseBundle)
    #[arg(long)]
    mrb_path: PathBuf,

    /// Path to the signed transaction file
    #[arg(long)]
    txn_path: PathBuf,

    /// Treat the transaction file content as hex string instead of raw bytes
    #[arg(long)]
    is_hex: bool,
}

fn main() -> Result<()> {
    // Initialize Logger to capture debug::print! output
    Logger::new().level(aptos_logger::Level::Debug).init();

    let args = Args::parse();

    // 1. Load Genesis from .mrb
    println!("Loading genesis from {:?}", args.mrb_path);
    let mrb_content = fs::read(&args.mrb_path)
        .with_context(|| format!("Failed to read mrb file: {:?}", args.mrb_path))?;
    let release_bundle: ReleaseBundle = bcs::from_bytes(&mrb_content)
        .context("Failed to deserialize ReleaseBundle from .mrb")?;

    // 2. Setup Runner
    println!("Initializing FakeExecutor...");
    let mut runner = OfflineTxnRunner::new(&release_bundle);

    // 3. Load Transaction
    println!("Loading transaction from {:?}", args.txn_path);
    let txn_bytes = if args.is_hex {
        let content = fs::read_to_string(&args.txn_path)
            .context("Failed to read txn file as string")?;
        let trimmed = content.trim().trim_start_matches("0x");
        hex::decode(trimmed).context("Failed to decode hex string")?
    } else {
        fs::read(&args.txn_path)
            .context("Failed to read txn file as bytes")?
    };

    let signed_txn: SignedTransaction = bcs::from_bytes(&txn_bytes)
        .context("Failed to deserialize SignedTransaction")?;

    let sender = signed_txn.sender();
    let sequence_number = signed_txn.sequence_number();

    println!("Transaction Sender: {}", sender);
    println!("Sequence Number: {}", sequence_number);

    // 4. Fund Sender
    println!("Funding sender account...");
    runner.fund_account(sender, 100_000_000_000, sequence_number);

    // 5. Execute
    println!("Executing transaction...");
    let tx_out = runner.execute_transaction(signed_txn)?;

    // 6. Report Results
    println!("\n=== Execution Result ===");
    println!("Status: {:?}", tx_out.status());
    println!("Gas Used: {}", tx_out.gas_used());
    
    match tx_out.status() {
        TransactionStatus::Keep(status) => {
            println!("Keep Status: {:?}", status);
        },
        TransactionStatus::Discard(status) => {
            println!("Discard Status: {:?}", status);
            println!("Use 'aptos move explain' or similar tools to decode specifics if needed,");
            println!("but typically Discard implies validation failure (auth, gas, seq number).");
        },
        TransactionStatus::Retry => {
            println!("Status: Retry (Transient error)");
        }
    }

    Ok(())
}
