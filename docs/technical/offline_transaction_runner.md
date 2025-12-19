
# Offline Transaction Runner Specification

## Goal
Enable testing of transaction payloads (e.g., created by TypeScript SDK) against a simulated Move execution environment without running a full testnet.

## Problem Code
Currently, debugging standard Move transactions requires running a local testnet, which is slow and has poor error visibility. Developers often resort to adding `debug::print` in the framework source, which is bad practice.

## Solution
Create a CLI tool `offline-txn-runner` that:
1.  Accepts an arbitrary Reference Genesis (`.mrb` file).
2.  Accepts a signed transaction (as bytes or hex).
3.  Simulates execution using `FakeExecutor`.
4.  Outputs verbose execution results, including detailed error codes and debug traces.

## Usage
```bash
cargo run -p atomica-test-runner --bin offline-txn-runner -- \
  --mrb-path <path/to/genesis.mrb> \
  --txn-path <path/to/signed_txn.bytes> \
  [--is-hex]
```

## Implementation Details

### CLI Arguments
- `mrb-path`: Path to `ReleaseBundle` file (BCS encoded).
- `txn-path`: Path to file containing SignedTransaction.
- `is-hex`: Boolean flag. If set, treats content of `txn-path` as hex string. Otherwise, raw bytes.

### Execution Flow
1.  **Load Genesis**: Read `.mrb` file, deserialize into `ReleaseBundle`.
2.  **Setup Executor**: Instantiate `FakeExecutor::custom_genesis(bundle, None)`.
3.  **Load Transaction**: Read transaction bytes, deserialize into `SignedTransaction`.
4.  **Fund Sender**: 
    - Extract sender address from `SignedTransaction`.
    - Call `executor.store_and_fund_account(sender, large_amount, sequence_number)`.
    - Note: This assumes the transaction nonce matches the funded account (initially 0 if not specified, but we should match the txn's sequence number or ensure account has correct sequence number).
5.  **Execute**: `executor.execute_block(vec![txn])`.
6.  **Report**:
    - Print `VMStatus` (Keep/Discard/Retry).
    - If `Keep(Executed)`, print success.
    - If `Keep(ScriptFailure)`, print error code, location, and message.
    - If `Discard`, print validation error.
    - Capture and print standard output/logs (if `debug::print` is used).

### Logging
- Initialize `aptos_logger` with `Debug` level to capture `debug::print` outputs.
- Ensure `FakeExecutor` environment is set up to allow logging.

## Verification
- Create a test case in `atomica-test-runner` or a script that:
    1.  Uses `aptos` CLI (or existing tools) to compile a script and sign it, saving to file.
    2.  Runs `offline-txn-runner` against `head.mrb`.
    3.  Verifies output contains expected result.
