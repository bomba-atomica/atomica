# Ethereum Local Testnet Guide (Deneb/PoS - Pure Docker)

This document describes how to build, run, and debug a faithful Post-Merge Ethereum local testnet based on the logic implemented in `source/docker-testnet/ethereum-testnet/config/`.

## Architecture Overview

The testnet is designed for **maximum reliability** in a single-node development environment using a **Single Setup Service Pattern**.

### Core Clients
- **Execution Layer (EL)**: Geth (`ethereum/client-go:v1.13.14`)
- **Consensus Layer (CL)**: Lighthouse (`sigp/lighthouse:v5.3.0`)
- **Validator Layer**: 4 isolated Lighthouse Validator containers.

### The Init Sequence
Before the chain starts, a single ephemeral service prepares the shared Docker volume (`testnet-data`):

1.  **`setup`**: Runs `generate.sh` in a custom image containing all tools. 
    - Generates EL `genesis.json` and CL `genesis.ssz`.
    - Generates and imports 4 unique validator keystores.
    - Initializes the Geth database via `geth init`.
    - Orchestrates the **Genesis Timestamp** (+30s buffer) to prevent sync deadlocks.

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
├── beacon-data/           # Lighthouse beacon node database
├── validator-1/           # Keystores and slashing protection for Val 1
├── validator-2/           # Keystores and slashing protection for Val 2
├── validator-3/           # Keystores and slashing protection for Val 3
├── validator-4/           # Keystores and slashing protection for Val 4
├── validator_keys/        # Raw generated keys and passwords
├── import_keys.sh         # Generated import orchestration script
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
