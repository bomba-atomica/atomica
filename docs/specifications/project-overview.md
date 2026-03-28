# Atomica Project Overview

Atomica is a cross-chain auction and settlement system with core workstreams in:
- sealed-bid batch auctions,
- cross-chain state-proof verification,
- EVM contracts and lockbox flows,
- Aptos-side verification and settlement,
- local dual-testnet orchestration and end-to-end testing.

## Current Repository Layout

```text
source/
├── atomica-web/              # Main app + cross-chain tests
├── evm-contracts/            # EVM lockbox/contracts + orchestration
├── state-proofs/             # State-proof generation/verification tooling
├── atomica-zkp/              # ZKP-related artifacts and Solidity integration
├── docker-testnet/           # Local Aptos/Ethereum testnet infrastructure
├── atomica-move-contracts/   # Move contract workspace
├── atomica-crosschain-testing/
├── test-utils/
└── web/
```

## Key Docs

- Product requirements: `docs/specifications/prd.md`
- Architecture overview: `docs/technical/architecture-overview.md`
- Aptos state proofs: `docs/technical/aptos-state-proof.md`
- Aptos proof systems summary: `docs/technical/aptos-proof-systems-summary.md`
- Bridge implementation details: `docs/technical/aptos-ethereum-bridge-implementation.md`
- ZK light client notes: `docs/technical/aptos-zk-light-client.md`
- Developer quick reference: `docs/development/quick-reference.md`

## Note on Legacy Docs

Earlier versions of this document referenced `diem-prover-native/` and `diem-prover-zkp/`.
Those paths are not part of the current repository layout and are superseded by the directories listed above.
