# Ethereum Local Testnet Guide (Deneb/PoS - Pure Docker)

This document describes how to build, run, and debug a faithful Post-Merge Ethereum local testnet based on the logic implemented in `source/docker-testnet/ethereum-testnet/config/`.

## Architecture Overview

The testnet is designed for **maximum reliability** in a single-node development environment using a **Self-Initializing Node Pattern**.

### Core Clients
- **Execution Layer (EL)**: Official Geth (`ethereum/client-go:v1.13.14`)
- **Consensus Layer (CL)**: Official Lighthouse (`sigp/lighthouse:v5.3.0`)
- **Validator Layer**: 4 isolated Official Lighthouse containers.

### The Init Sequence
Before the chain starts, a single ephemeral service prepares the shared Docker volume (`testnet-data`):

1.  **`setup`**: Runs `generate.sh` to generate the common "source of truth":
    - EL `genesis.json` and CL `genesis.ssz`.
    - 4 unique validator keys organized into indexed folders (`/data/node-keys/1..4/`).
    - The shared `jwtsecret`.

2.  **Runtime Nodes (Geth & Validators)**: 
    Each node type uses its official binary to perform its own disk preparation on first boot:
    - **Geth**: Runs `geth init` if it detects an empty database.
    - **Validators**: Run `lighthouse account validator import` if they detect missing keystores, pulling from their assigned index in `node-keys`.

---

## Conceptual Model: Understanding the Layers

The post-merge Ethereum stack is split into three distinct specialized layers. Understanding their 1:N relationship is key to debugging.

### 1. Execution Layer (Geth) — "The Engine"
- **Role**: Manages the EVM, smart contracts, account balances, and transaction mempool.
- **Independence**: Cannot produce a block on its own; waits for instructions from the Consensus Layer via the Engine API.

### 2. Consensus Layer (Beacon Node) — "The Brain"
- **Role**: Handles P2P networking, fork-choice (voting on the "correct" chain), and tracking validator duties.
- **Independence**: Does not understand smart contracts; asks Geth to "validate" the transactions inside a block.

### 3. Validator Client (Signers) — "The Keys"
- **Role**: A secure signing service. It holds the private keys and asks the Beacon Node: *"Is it my turn? What do I sign?"*
- **Scaling (1:N)**: In production (e.g., Coinbase), a single cluster of Beacon/Execution nodes can host **thousands** of validator keys.

### Why this Devnet has 4 Validator Containers?
In our `docker-compose.yaml`, we use **1 Geth** and **1 Beacon Node** for efficiency, but **4 Validator Containers** to simulate a distributed network. This allows us to observe how the protocol distributes duties and sync-committee slots across distinct identities without the resource overhead of 4 full nodes.

---

## Directory Layout (Runtime)

All state is persisted in the `testnet-data` Docker volume, organized as follows:

```text
/data (testnet-data volume)
├── geth/                  # Geth database and genesis.json
├── beacon-config/         # CL config.yaml, genesis.ssz, deploy_block.txt
├── node-keys/             # Raw keys indexed 1-4 for the validator nodes
├── validator-1/           # Lighthouse-encrypted wallet for Val 1
├── ...
└── jwtsecret              # shared 32-byte hex secret
```

---

## Configuration (`docker-compose.yaml`)

The entire network is controlled via one command. The configuration ensures:
- **TTD=0**: PoS is active from Block 0.
- **Forced Liveness**: `--staking`, `--subscribe-all-subnets`, and `--always-prepare-payload` are enabled on the Beacon node to support single-node block production.
- **Deneb Support**: Correct fork epochs (Altair, Bellatrix, Capella, Deneb at 0).

### Key Command
```bash
cd source/docker-testnet/ethereum-testnet/config
docker compose down -v && docker compose up -d --build
```
*Note: The `-v` is critical to ensure a fresh genesis timestamp on every restart.*

---

## Critical Invariants (Debugging)

### 1. The Syncing Deadlock (Slot 0 Gap)
Lighthouse will **refuse to propose blocks** if it starts and finds itself already behind the "wall clock" (i.e., Slot 0 timestamp is in the past).
- **The Symptom**: `SERVICE_UNAVAILABLE: beacon node is syncing: sync is stalled`.
- **The Fix**: The `generate.sh` script automatically sets the `GENESIS_TIME` to `Now + 30s`. This allows Docker orchestration to finish before the chain technically begins.

### 2. Validator Isolation
Each validator container **must** have its own data directory. If multiple containers share a single validator directory, they will lock each other out or risk slashing protection errors.
- **The Fix**: Our setup uses `/data/validator-1` through `/data/validator-4`.

### 3. Geth Sync Status
Lighthouse requires Geth to report as "fully synced" before it will accept its payloads.
- **The Symptom**: `Execution endpoint ... not yet synced`.
- **The Fix**: We use `--txlookuplimit=0` and `--history.transactions=0` in Geth to prevent long background indexing phases that trigger "syncing" status.

---

## Validation Checklist

| Target | Expected Log / Result | Status |
| :--- | :--- | :--- |
| **Beacon** | `INFO Execution enabled from genesis` | ✅ Ready |
| **Validator** | `INFO All validators active slot: X, epoch: 0` | ✅ Proposing |
| **Geth RPC** | `curl ... "method":"eth_blockNumber"` | ✅ > 0 |
| **Block Rate** | New block every 12 seconds | ✅ Stable |

## Troubleshooting Matrix

| Symptom | Root Cause | Fix |
| :--- | :--- | :--- |
| `no beacon client seen` (Geth) | Beacon hasn't sent first instruction yet. | Wait for Genesis Timestamp. |
| `Bad Request` (Duties) | Fork version or config mismatch. | Wipe volumes and rebuild. |
| `InsufficientPeers` (Beacon) | Solo network behavior. | Ignore; normal for devnets. |
| `Waiting for genesis` | Chain hasn't started yet. | Check `date` vs `genesis_time`. |

---

## Roadmap & Future Improvements

- [ ] **Native Artifact Generation**: Replace the dependency on `ethpandaops/ethereum-genesis-generator` by implementing the `genesis.json` and `genesis.ssz` generation logic directly (likely using Geth's genesis utils and Lighthouse's `lcli` or a custom Go/Rust tool). This would allow for a 100% "from scratch" setup without external tool dependencies.
