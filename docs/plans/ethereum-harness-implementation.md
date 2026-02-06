# Ethereum Testnet Harness Implementation Plan

## 1. Status Overview

### Existing Infrastructure
*   **Docker Setup (`source/docker-testnet/ethereum-testnet`)**:
    *   Production-ready `docker-compose.yaml` defining Geth (EL), Lighthouse Beacon (CL), and 4 Validators
    *   Automated genesis generation via setup container
*   **TypeScript SDK (`source/docker-testnet/ethereum-testnet/typescript-sdk`)**:
    *   Fully functional SDK for Docker lifecycle management
    *   Complete API coverage: Execution Layer (Geth), Beacon Chain (Lighthouse), state proofs
    *   Comprehensive test suite: 15 tests across 3 suites, all passing

### Completed Components
*   **Docker Testnet**: Merge-ready PoS chain with `TerminalTotalDifficulty: 0`, all forks enabled at genesis
*   **TypeScript SDK**: Production-ready programmatic interface with full API coverage
*   **CI/CD**: Active GitHub Actions workflow running all TypeScript tests on every PR/push
*   **Documentation**: Complete README with API reference, examples, and troubleshooting

### Deferred Components
*   **Rust SDK**: Deferred in favor of TypeScript for faster iteration and development velocity
    *   Rust integration (`source/atomica-crosschain-testing`) references non-existent `rust-sdk/`
    *   Will be implemented when cross-language integration becomes necessary

---

## 2. Implementation Status

### Phase 1: Docker Harness + TypeScript SDK (✅ Complete)
**Goal**: Production-ready Ethereum PoS testnet with programmatic control

**Completed**:
1.  **Docker Infrastructure**:
    *   Geth execution layer (v1.13.14) with archive mode, JSON-RPC + WebSocket
    *   Lighthouse beacon node (v5.3.0) with REST API
    *   4 validator clients with automatic key import
    *   Automated genesis generation in setup container
2.  **TypeScript SDK** (`typescript-sdk/src/index.ts`):
    *   Lifecycle: `start()`, `teardown()`, health checks, block waiting
    *   Execution Layer: block queries, balance, transactions, **state proofs via `eth_getProof`**
    *   Beacon Chain: headers, sync committees, finality, light client data
3.  **Test Coverage** (`typescript-sdk/test/`):
    *   `validator-connectivity.test.ts` - EL/CL connectivity and genesis verification
    *   `block-production.test.ts` - Block production and state root matching
    *   `state-proofs.test.ts` - Merkle-Patricia proof generation and verification
    *   **All 15 tests passing** (verified 2026-01-20)
4.  **CI/CD Integration**:
    *   Active workflow: `.github/workflows/docker-testnet-sanity.yml`
    *   Runs all 3 test suites on every PR/push to paths matching `source/docker-testnet/ethereum-testnet/**`
    *   Includes cleanup and debugging steps for failures

### Phase 2: Rust SDK (⏸️ Deferred)
**Goal**: Rust programmatic interface for cross-chain testing

**Decision**: Deferred in favor of TypeScript for faster iteration

**Rationale**:
*   TypeScript SDK provides complete functionality needed for development/testing
*   Faster iteration cycles with Bun runtime
*   Rust integration adds complexity without immediate value
*   Can be implemented later if needed for performance or type-safety requirements

**Current State**:
*   Skeleton code exists in `atomica-crosschain-testing/src/env.rs` (lines 8, 19, 25-27)
*   References non-existent `ethereum-docker-testnet` crate
*   Cross-chain tests cannot compile: `cargo check` fails

**When to Implement**:
*   When cross-language integration becomes necessary
*   When Rust type-safety is required for production bridge contracts
*   When performance requirements exceed TypeScript capabilities

## 3. Next Steps

### Immediate
1.  Continue development using TypeScript SDK
2.  Add more test coverage as needed (e.g., transaction submission, light client sync)

### Future (Rust SDK)
1.  Create `source/docker-testnet/ethereum-testnet/rust-sdk/Cargo.toml`
2.  Implement `EthereumTestnet` struct matching TypeScript API
3.  Update `atomica-crosschain-testing` dependency
4.  Activate `.github/workflows/test-integration.yaml` (currently `.todo`)

## 4. Success Metrics

**Current Status**: ✅ Production Ready
- [x] Docker testnet stable and finalized
- [x] TypeScript SDK with full API coverage
- [x] 100% test pass rate (15/15 tests)
- [x] CI/CD pipeline active and passing
- [x] Documentation complete
- [ ] Rust SDK (deferred)
