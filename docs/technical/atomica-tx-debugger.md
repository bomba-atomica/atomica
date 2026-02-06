# Archived: Atomica Transaction Debugger (`atomica-tx-debugger`)

**Date Archived:** 2026-02-02
**Reason:** The tool was unmaintained and depended on missing dependencies (`e2e-tests` in `atomica-aptos`). The project focus has shifted towards using Docker-based infrastructure (`docker-testnet`) for testing and verification, which provides a more realistic environment than the offline runner.

If this tool is needed in the future, it should probably be revived as a standalone repository or tool, potentially leveraging the newer SDKs.

## Original Documentation

### Helper Tool for Offline Transaction Analysis

The `atomica-tx-debugger` was a dedicated, lightweight utility designed to facilitate the debugging and analysis of Move transactions in an offline environment. It decoupled transaction execution from the complexity of running a full blockchain node or swarm, allowing developers to isolate and inspect transaction behavior against a static ledger state.

### Scope

This tool was specifically scoped for **stateless transaction verification** and **debugging**. It was *not* intended to be a full node implementation, nor did it handle networking, consensus, or persistent storage beyond the execution of a single transaction session.

Its primary use cases included:
*   **CI/CD Integration**: Verifying transaction scripts against known framework versions without spinning up a testnet.
*   **Post-Mortem Analysis**: Replaying failed transactions with verbose logging enabled to inspect internal Move VM state.
*   **Gas Profiling**: Accurately measuring the gas consumption of specific entry functions or scripts in isolation.
*   **Development**: Rapid iteration on Move modules by executing transactions against a pre-compiled Release Bundle (`.mrb`).

### Usage

It was a Rust binary:
```bash
cargo run --bin offline_txn_runner -- \
  --mrb-path ../move-framework-fixtures/head.mrb \
  --txn-path ./failing_txn.hex \
  --is-hex
```

It relied on `aptos-vm`, `aptos-framework`, and other crates from the Aptos ecosystem.
