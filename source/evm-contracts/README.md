# Atomica EVM Contracts

Ethereum smart contracts for Atomica's cross-chain atomic deposit system.

## Design Principle: Fail-Only

**Simple and obvious:**

1. `scuttle = true` by default
2. `scuttle = false` requires all checks to pass
3. Miss any deadline → `scuttle = true` (automatic)
4. No recovery, no save attempts

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  NEW AUCTION:  scuttle = true  (DEFAULT - WILL FAIL)      │
│                                                            │
│                      │                                    │
│                      ▼                                    │
│         ┌────────────────────────┐                        │
│         │  ALL CHECKS PASS?      │                        │
│         │  - BLS verified        │                        │
│         │  - State proof valid   │                        │
│         │  - Merkle proof valid  │                        │
│         │  - Deadlines met       │                        │
│         └──────────┬─────────────┘                        │
│                    │                                      │
│           YES ─────┴───── NO                              │
│            │               │                              │
│            ▼               ▼                              │
│     scuttle = false   scuttle = true                      │
│     SUCCESS           REFUND ALL                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Contract Architecture

### Core Contracts

| Contract | Purpose |
|----------|---------|
| `AuctionManager` | Fail-only auction management (scuttle=true default) |
| `DepositBox` | ETH/USDC deposits with commitment tracking |
| `BLSVerifier` | EIP-2537 BLS verification for state proofs |
| `Settlement` | Trade execution from verified proofs |
| `Governance` | Emergency fail-safe (genesis/brick) |
| `IncrementalMerkleTree` | Merkle tree for commitments |

### Trust Model

**v0.1 Beta (Current)**
- Validators receive bids ✓
- Validators provide timelock decryption key ✓
- Validators decrypt bids ✓
- **Validators calculate clearing price → Single verification (trusted)**

**v1.0 & v2.0 (Future)**
- Validators calculate clearing price and transfers
- ZK circuit independently calculates the same
- **Double verification - results must match**

## Quick Start

```bash
forge install
npm install
```

### Build

```bash
forge build
```

### Test

```bash
forge test
```

### Gas Report

```bash
forge test --gas-report
```

## Important Notes

- Contracts are NOT upgradeable (no proxy patterns)
- BLSVerifier uses EIP-2537 precompiles (0x09 for G1 multiexponent, 0x0c for pairing)
- BLSVerifier has NO knowledge of governance
- Governance is ORTHOGONAL to core contracts
- Only `genesis()` and `brick()` functions exist in Governance

## Security

This is research/development code. Before production:
- Complete security audit
- Formal verification of circuits
- Multi-party trusted setup
- Bug bounty program
