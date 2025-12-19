
use clap::Parser;
use std::path::PathBuf;
use std::fs;
use aptos_types::transaction::{SignedTransaction, TransactionStatus};

use aptos_framework::ReleaseBundle;

use anyhow::{Context, Result};
use aptos_logger::Logger;

use atomica_tx_debugger::offline_runner::OfflineTxnRunner;


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

    /// Enable verbose opcode tracing to a directory
    #[arg(long)]
    trace: Option<PathBuf>,

    /// Enable verbose logging (shows internal VM and framework logs)
    #[arg(long, short)]
    verbose: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();

    // Initialize Logger to capture debug::print! output and optionally VM logs
    let log_level = if args.verbose {
        aptos_logger::Level::Debug
    } else {
        aptos_logger::Level::Warn
    };
    Logger::new().level(log_level).init();

    // 1. Load Genesis from .mrb
    println!("Loading genesis from {:?}", args.mrb_path);
    let mrb_content = fs::read(&args.mrb_path)
        .with_context(|| format!("Failed to read mrb file: {:?}", args.mrb_path))?;
    let release_bundle: ReleaseBundle = bcs::from_bytes(&mrb_content)
        .context("Failed to deserialize ReleaseBundle from .mrb")?;

    // 2. Setup Runner
    println!("Initializing FakeExecutor...");
    let mut runner = OfflineTxnRunner::new(&release_bundle);

    if let Some(trace_path) = args.trace {
        println!("Opcode tracing enabled. Output will be saved to {:?}", trace_path);
        fs::create_dir_all(&trace_path).context("Failed to create trace directory")?;
        runner.enable_tracing(trace_path.clone());
    }

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

    // Print write set (state changes)
    let write_set = tx_out.write_set();
    let write_set_v0 = write_set.as_v0();
    let changes_count = write_set_v0.iter().count();
    if changes_count > 0 {
        println!("\n=== Write Set ({} changes) ===", changes_count);
        for (state_key, write_op) in write_set_v0.iter() {
            println!("State Key: {:?}", state_key);
            if let Some(state_value) = write_op.as_state_value_opt() {
                let bytes = state_value.bytes();
                if bytes.len() <= 64 {
                    println!("  Value (hex): {}", hex::encode(bytes));
                } else {
                    println!("  Value (hex, {} bytes): {}...", bytes.len(), hex::encode(&bytes[..64]));
                }
                if write_op.is_delete() {
                    println!("  Operation: DELETION");
                } else {
                    println!("  Operation: CREATE/MODIFY");
                }
            } else {
                println!("  Operation: DELETION");
            }
            println!();
        }
    }

    // Print events
    let events = tx_out.events();
    if !events.is_empty() {
        println!("\n=== Events ({}) ===", events.len());
        for (idx, event) in events.iter().enumerate() {
            println!("Event #{}: {:?}", idx, event.type_tag());
            if let Ok(event_data) = bcs::to_bytes(event.event_data()) {
                println!("  Data (hex): {}", hex::encode(&event_data));
            }
        }
    }

    // Handle different transaction statuses
    match tx_out.status() {
        TransactionStatus::Keep(status) => {
            match status {
                aptos_types::transaction::ExecutionStatus::Success => {
                    println!("\n✓ Transaction executed successfully");
                },
                aptos_types::transaction::ExecutionStatus::OutOfGas => {
                    println!("\n✗ Transaction ran out of gas");
                },
                aptos_types::transaction::ExecutionStatus::ExecutionFailure { location, function, code_offset } => {
                    println!("\n✗ Execution failure:");
                    println!("  Location: {:?}", location);
                    println!("  Function: {}", function);
                    println!("  Code offset: {}", code_offset);
                },
                aptos_types::transaction::ExecutionStatus::MoveAbort { location, code, info } => {
                    println!("\n✗ Move abort:");
                    println!("  Location: {:?}", location);
                    println!("  Abort code: {} (0x{:x})", code, code);
                    if let Some(abort_info) = info {
                        println!("\n  Error details:");
                        println!("    Reason: {}", abort_info.reason_name);
                        println!("    Description: {}", abort_info.description);
                    }
                },
                aptos_types::transaction::ExecutionStatus::MiscellaneousError(maybe_code) => {
                    println!("\n✗ Miscellaneous error: {:?}", maybe_code);
                }
            }
        },
        TransactionStatus::Discard(status_code) => {
            println!("\n✗ Transaction discarded:");
            println!("  Status: {:?}", status_code);
            println!("  Code: {} (0x{:x})", *status_code as u64, *status_code as u64);
        },
        TransactionStatus::Retry => {
            println!("\n⟳ Status: Retry (Transient error)");
        }
    }

    Ok(())
}

