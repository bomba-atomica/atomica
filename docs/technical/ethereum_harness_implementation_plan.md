# Ethereum Testnet Harness Implementation Plan

## 1. Status Overview

### Existing Infrastructure
*   **Docker Setup (`source/docker-testnet/ethereum-testnet`)**:
    *   Foundational `docker-compose.yaml` exists defining Geth (EL), Lighthouse Beacon (CL), and Validator.
    *   `generate-genesis.sh` script exists to bootstrap the consensus layer using `lcli`.
*   **TypeScript SDK**:
    *   Functional SDK exists to manage the Docker lifecycle and fetch basic Beacon data (headers, sync committees).
*   **Rust Testing Framework (`source/atomica-crosschain-testing`)**:
    *   Basic `CrossChainTestEnv` structure exists.
    *   Ethereum integration is now **completed**.

### Completed Components
*   **Merge-Ready Genesis**: The `generate-genesis.sh` script now produces a synchronized Geth/Lighthouse genesis with `TerminalTotalDifficulty: 0`.
*   **Rust Integration**: A new Rust crate `ethereum-docker-testnet` provides a programmatic interface to the harness.
*   **Unified Testing**: `CrossChainTestEnv` now spins up both Aptos and Ethereum chains.

---

## 2. Implementation Plan (Completed)

### Phase 1: Harden the Docker Harness (✅ Done)
**Goal**: Ensure the manual Docker setup produces a stable, finalized PoS chain.

1.  **Custom Geth Genesis**:
    *   Updated `generate-genesis.sh` to create `genesis.json` with `terminalTotalDifficulty: 0`.
    *   Implemented initialization of Geth datadir.
2.  **Synchronize Genesis Time**:
    *   Script now coordinates timestamps and fetches the Geth genesis hash for the Beacon Chain.
3.  **Verification**:
    *   `docker-compose.yaml` updated to use the generated testnet data.

### Phase 2: Create Rust SDK for Ethereum Harness (✅ Done)
**Goal**: Allow Rust tests to programmatically manage the Ethereum testnet.

1.  **Create `source/docker-testnet/ethereum-testnet/rust-sdk`**:
    *   Created `ethereum-docker-testnet` crate.
    *   Implemented `EthereumTestnet` struct with `new()`, `teardown()`, `wait_for_healthy()`.
    *   Added methods to fetch Beacon Headers and Sync Committees.

### Phase 3: Integrate into `atomica-crosschain-testing` (✅ Done)
**Goal**: A unified `CrossChainTestEnv` that spins up both chains.

1.  **Update `CrossChainTestEnv`**:
    *   Added `ethereum: EthereumTestnet` field.
    *   Initialization logic added to `new()`.
2.  **Port Test Logic**:
    *   Updated `cross_chain_workflow.rs` to verify Ethereum connectivity (fetch header/sync committee).

### Phase 4: CI/CD Integration (Pending)
1.  **Github Actions**:
    *   Update `.github/workflows/test-integration.yaml` to include the Ethereum Docker testnet steps.

## 3. Next Steps
1.  Run the tests locally: `cargo test -p atomica-cross-chain`.
2.  Update CI pipelines.
