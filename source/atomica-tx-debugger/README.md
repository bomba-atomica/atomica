# Atomica Transaction Debugger (`atomica-tx-debugger`)

## Helper Tool for Offline Transaction Analysis

The `atomica-tx-debugger` is a dedicated, lightweight utility designed to facilitate the debugging and analysis of Move transactions in an offline environment. It decouples transaction execution from the complexity of running a full blockchain node or swarm, allowing developers to isolate and inspect transaction behavior against a static ledger state.

### Scope

This tool is specifically scoped for **stateless transaction verification** and **debugging**. It is *not* intended to be a full node implementation, nor does it handle networking, consensus, or persistent storage beyond the execution of a single transaction session.

Its primary use cases include:
*   **CI/CD Integration**: Verifying transaction scripts against known framework versions without spinning up a testnet.
*   **Post-Mortem Analysis**: Replaying failed transactions with verbose logging enabled to inspect internal Move VM state.
*   **Gas Profiling**: Accurately measuring the gas consumption of specific entry functions or scripts in isolation.
*   **Development**: Rapid iteration on Move modules by executing transactions against a pre-compiled Release Bundle (`.mrb`).

### Inputs

The debugger requires two primary inputs to reconstruct the execution environment:

1.  **Genesis / Release Bundle (`.mrb`)**:
    *   **Flag**: `--mrb-path <PATH>`
    *   **Description**: A Move Release Bundle file that defines the initial state of the Move VM (genesis). This file contains the compiled Move framework and standard library modules.
    *   **Note**: The debugger *does not* build this file. It assumes the `.mrb` has been prepared ahead of time (e.g., from `move-framework-fixtures`).

2.  **Signed Transaction**:
    *   **Flag**: `--txn-path <PATH>`
    *   **Description**: A file containing the serialized `SignedTransaction` bytes. This represents the exact payload submitted by a client (sender address, sequence number, payload, signature, etc.).
    *   **Format**: Raw binary (BCS) by default. Use `--is-hex` if the file contains a hex-encoded string of the BCS bytes.

### Outputs

Upon execution, the tool provides a comprehensive report on the transaction's lifecycle:

*   **Execution Status**: The final result of the transaction (e.g., `Keep(Success)`, `Discard(INSUFFICIENT_BALANCE_FOR_GAS)`).
*   **Gas Usage**: precise detailed breakdown of gas units consumed during execution.
*   **Write Set**: A list of all state changes (resources created, modified, or deleted) that would be applied to the ledger.
*   **Events**: All events emitted during execution, including their types and data payloads.
*   **Debug Logs**: Captures and prints all output from `std::debug::print` calls within the Move code, essential for tracing logic flow.
*   **Error Maps & Stack Traces**: If execution fails, the tool attempts to map the `VMStatus` code to a human-readable description and provide a stack trace of the Move module execution path leading to the error.


### Developer Requirements

To effectively debug transactions, this tool provides:
1.  **Rust Execution Logs**: Full integration with `aptos_logger` to capture internal node logs.
2.  **Move Debug Prints**: Captures output from `std::debug::print` calls in Move.
3.  **Pretty Move Error Mapping**: detailed error reporting including error code, name, description, file, and line number.
4.  **Move Opcode Trace Log**: A trace of executed Move opcodes for deep debugging.

### Usage Example


```bash
# Debug a hex-encoded transaction against the head release bundle
cargo run --bin offline_txn_runner -- \
  --mrb-path ../move-framework-fixtures/head.mrb \
  --txn-path ./failing_txn.hex \
  --is-hex
```

### Build & Test

This crate is designed to be minimal. It does not depend on `aptos-forge` or heavy integration testing frameworks.

*   **Build**: `cargo build --bin offline_txn_runner`
*   **Test**: `cargo test` (Runs unit tests using a cached release bundle)
