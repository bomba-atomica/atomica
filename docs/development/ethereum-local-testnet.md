# Developing and Testing a Post-Merge Ethereum Local Testnet (Pure Docker)

## Purpose and Constraints

This document instructs an agent to **build, validate, and debug** a faithful **post-Merge Ethereum local testnet** using:

- Real clients: **Geth (EL)** + **Lighthouse (CL + validators)**
- **Pure Docker / docker-compose**
- No Hardhat, Forge, eth-docker, or Kurtosis

The goal is **production-like behavior**, not convenience abstractions.

> **Authoritative reference implementation:** `source/docker-testnet/ethereum-testnet/`
> This document explains *how to reproduce and reason about that setup*, not reinvent it.

> [!WARNING]
> This document describes a delicate setup. **Fork schedule coherence** (matching EL timestamps, CL epochs, and genesis fork versions) is the critical invariant. If these drift, the network will not produce blocks.

---

## Conceptual Model (Non-Negotiable)

After the Merge:

- Execution Layer **cannot** produce blocks on its own
- Consensus Layer **cannot** execute transactions
- Validators **must exist** or no blocks are proposed

Block production requires this chain to be intact:

```
validator_client → beacon_node → Engine API → geth
```

If blocks are not produced, one of these links is broken.

---

## Directory Layout (Canonical)

Based on the atomica reference implementation:

```text
ethereum-testnet/
├── config/
│   ├── docker-compose.yaml
│   ├── generate-genesis.sh
│   ├── values.env
│   └── jwtsecret
├── testnet/
│   ├── geth/
│   │   └── genesis.json        # Initialized Geth datadir
│   ├── beacon/
│   │   ├── genesis.ssz
│   │   └── config.yaml
│   └── validator_keys/
│       └── lighthouse-data/    # Imported validator keystores
└── jwtsecret
```

---

## Step 1 — JWT Secret (Engine API Authentication)

A **single JWT secret** must be shared between Geth and Lighthouse.

```bash
openssl rand -hex 32 | tr -d "\n" > jwtsecret
```

> [!IMPORTANT]
> The JWT secret must be exactly 64 hex characters with **no trailing newline**.

---

## Step 2 — Genesis Configuration (`values.env`)

The `ethpandaops/ethereum-genesis-generator` uses a `values.env` file. Key invariants:

```bash
# Network ID
CHAIN_ID=32382
EL_NETWORK_ID=32382
CL_NETWORK_ID=32382

# Merge Config - TTD=0 means PoS from genesis
TERMINAL_TOTAL_DIFFICULTY=0
EL_CL_GENESIS_TIMESTAMP=10  # delay in seconds from now

# Consensus Config (All forks active at epoch 0)
ALTAIR_FORK_EPOCH=0
BELLATRIX_FORK_EPOCH=0
CAPELLA_FORK_EPOCH=0
DENEB_FORK_EPOCH=0

# Genesis config
MIN_GENESIS_ACTIVE_VALIDATOR_COUNT=8
GENESIS_FORK_VERSION=0x00000001 # Critical: Must match Lighthouse's expected fork version for the network ID
```

---

## Step 3 — Genesis Generation

Use `ethpandaops/ethereum-genesis-generator` to ensure **joint coherence** between EL and CL artifacts.

### Generate EL Genesis
```bash
docker run --rm -v "$(pwd)/values.env:/config/values.env" -v "$(pwd)/testnet:/data" \
  ethpandaops/ethereum-genesis-generator:5.2.2 el
```

### Generate CL Genesis
```bash
docker run --rm -v "$(pwd)/values.env:/config/values.env" -v "$(pwd)/testnet:/data" \
  ethpandaops/ethereum-genesis-generator:5.2.2 cl
```

---

## Step 4 — Initialize Geth Datadir

```bash
docker run --rm -v "$(pwd)/testnet/geth:/data" ethereum/client-go:v1.13.14 \
  init --datadir=/data /data/genesis.json
```

---

## Step 5 — Generate and Import Validator Keys

### Generate Keys
```bash
docker run --rm --entrypoint eth2-val-tools \
  -v "$(pwd)/testnet/validator_keys:/keys" \
  ethpandaops/ethereum-genesis-generator:5.2.2 \
  keystores --insecure --out-loc="/keys/out" --source-min=0 --source-max=8 \
  --source-mnemonic="your mnemonic here"
```

### Import to Lighthouse
```bash
lighthouse account validator import \
  --datadir /data \
  --keystore "path/to/keystore.json" \
  --password-file "path/to/password.txt" \
  --testnet-dir /testnet \
  --reuse-password
```

> [!CAUTION]
> Do **NOT** use `--network mainnet`. Use `--testnet-dir`.

---

## Step 6 — Docker Compose (Canonical)

Refer to the reference implementation. **Crucial Volume Mounts:**

*   **Beacon:** `- ./testnet/beacon:/testnet:ro` (Root of testnet dir must contain `genesis.ssz` and `config.yaml`)
*   **Validator:** `- ./testnet/beacon:/testnet:ro` (Must match beacon's mount)
*   **JWT:** `- ./jwtsecret:/secrets/jwtsecret:ro` (Must match Geth's mount)

---

## Step 7 — Bring-Up Procedure

```bash
docker compose up -d
docker compose logs -f
```

---

## Step 8 — Validation & Success Criteria

Running `curl` checks is meaningless unless you interpret the results against **Hard Success Criteria**.

### Minimal Success Criteria (All Must Be True)

| Check | Command | Success Condition |
| :--- | :--- | :--- |
| **Blocks Increasing** | `curl -d '{"method":"eth_blockNumber"...}' localhost:8545` | Result > 0 and increasing |
| **Slots Increasing** | `curl localhost:5052/eth/v1/beacon/headers/head` | Slot number increasing |
| **Engine Sync** | `Lighthouse Logs` | ✅ `Execution engine online` |
| **Consensus** | `Lighthouse Logs` | ✅ `Block received` |
| **Proposing** | `Validator Logs` | ✅ `Successfully published block` |

---

# 🌳 Troubleshooting: Binary Decision Tree

**Use this mechanically. Do not guess.**

### 1️⃣ Beacon Log: `Execution endpoint ... connected ... not yet synced`
➡️ **ROOT CAUSE: Fork Schedule Incoherence** (Not connectivity)
*   **Check:** Do `shanghaiTime` (EL) and `CAPELLA_FORK_EPOCH` (CL) align at genesis?
*   **Check:** Does `GENESIS_FORK_VERSION` match `config.yaml`?
*   **Fix:** Regenerate **both** genesis files from `values.env`. **Wipe all volumes.**

### 2️⃣ Beacon Log: `Waiting for genesis`
➡️ **ROOT CAUSE: Time Coherence Failure**
*   **Check:** Is `GENESIS_TIME` in the future?
*   **Check:** Docker host clock drift?
*   **Fix:** Regenerate genesis with timestamp `Now + 60s`.

### 3️⃣ Geth Log: `Post-merge network, but no beacon client seen`
➡️ **ROOT CAUSE: Engine API Auth Failure**
*   **Check:** Is Geth listening on port 8551 (`authrpc`)?
*   **Check:** Are JWT secrets byte-for-byte identical?
*   **Fix:** Remount JWT secret. Ensure no trailing newlines.

### 4️⃣ Slots Advance, Head Slot > 0, Block Number = 0
➡️ **ROOT CAUSE: Validator Failure**
*   **Check:** Is validator container running?
*   **Check:** `Awaiting activation`? (Wait for epoch 1).
*   **Check:** Were keys imported with `--testnet-dir`?

---

# 🚨 “This Breaks Block Production” Matrix

If **any** row below is true, the network **will not** produce blocks.

| Domain | Condition | Symptom | Why? |
| :--- | :--- | :--- | :--- |
| **Genesis** | EL fork timestamps ≠ CL fork epochs | Beacon: `not yet synced` | Invariant violation. |
| **Genesis** | Genesis timestamp mismatch | Beacon: `Waiting for genesis` | Wall-clock incoherence. |
| **Wiring** | JWT mismatch | Geth: `unauthorized` | Engine calls rejected. |
| **Wiring** | Wrong Engine Port (8545 vs 8551) | Beacon: `endpoint unavailable` | Wrong API (RPC vs Engine). |
| **Validator** | Keys not imported | Slots advance, empty blocks | No proposer. |
| **Validator** | `--network mainnet` used | Validator errors | Schema mismatch. |

---

# 🔒 Minimal Invariant Checklist (Deep Debugging)

Lighthouse enforces these **hard guards**. If any fail, it halts block production.

1.  **Genesis Coherence:** CL genesis root == derived EL block 0 hash.
2.  **Fork Schedule:** At Slot 0, `CL active forks == EL active forks`.
3.  **Engine Safety:** JWT matches + Engine API enabled (`--authrpc`).
4.  **Persistence:** Changing genesis **requires** full datadir wipe. Lighthouse trusts disk state over config.

---

## One-Line Agent Rule

> **If Lighthouse says “execution endpoint is not yet synced”, assume fork-schedule or genesis incoherence — not connectivity.**
