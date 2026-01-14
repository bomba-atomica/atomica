# Developing and Testing a Post-Merge Ethereum Local Testnet (Pure Docker)

## Purpose and Constraints

This document instructs an agent to **build, validate, and debug** a faithful **post-Merge Ethereum local testnet** using:

- Real clients: **Geth (EL)** + **Lighthouse (CL + validators)**
- **Pure Docker / docker-compose**
- No Hardhat, Forge, eth-docker, or Kurtosis

The goal is **production-like behavior**, not convenience abstractions.

> [!TIP]
> **Authoritative reference implementation:** `source/docker-testnet/ethereum-testnet/`
> This document explains *how to reproduce and reason about that setup*, not reinvent it.

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

**Failure modes:**
- JWT mismatch → Engine API auth errors
- Missing JWT → Geth logs "unauthorized engine request"

---

## Step 2 — Genesis Configuration (`values.env`)

The `ethpandaops/ethereum-genesis-generator` uses a `values.env` file:

```bash
# Network ID
CHAIN_ID=32382
EL_NETWORK_ID=32382
CL_NETWORK_ID=32382

# Merge Config - TTD=0 means PoS from genesis
TERMINAL_TOTAL_DIFFICULTY=0
EL_CL_GENESIS_TIMESTAMP=10  # delay in seconds from now

# Validators
NUMBER_OF_VALIDATORS=8
EL_AND_CL_MNEMONIC="your mnemonic here"

# Consensus Config
SECONDS_PER_SLOT=12
ALTAIR_FORK_EPOCH=0
BELLATRIX_FORK_EPOCH=0
CAPELLA_FORK_EPOCH=0
DENEB_FORK_EPOCH=0
ELECTRA_FORK_EPOCH=100000000  # Future fork
FULU_FORK_EPOCH=100000000     # Future fork

# Genesis config
MIN_GENESIS_ACTIVE_VALIDATOR_COUNT=8
GENESIS_FORK_VERSION=0x00000001
```

---

## Step 3 — Genesis Generation

Use `ethpandaops/ethereum-genesis-generator`. This avoids subtle mismatches between EL genesis, CL config, validator deposits, and fork activation parameters.

### Generate EL Genesis

```bash
docker run --rm \
  -v "$(pwd)/values.env:/config/values.env" \
  -v "$(pwd)/testnet:/data" \
  ethpandaops/ethereum-genesis-generator:5.2.2 \
  el
```

### Generate CL Genesis

```bash
docker run --rm \
  -v "$(pwd)/values.env:/config/values.env" \
  -v "$(pwd)/testnet:/data" \
  ethpandaops/ethereum-genesis-generator:5.2.2 \
  cl
```

**Output artifacts:**
- `testnet/metadata/genesis.json` — EL genesis
- `testnet/metadata/genesis.ssz` — CL genesis state
- `testnet/metadata/config.yaml` — CL configuration

---

## Step 4 — Initialize Geth Datadir

Geth requires a **one-time init** before running:

```bash
docker run --rm \
  -v "$(pwd)/testnet/geth:/data" \
  ethereum/client-go:v1.16.8 \
  init /data/genesis.json
```

> [!NOTE]
> Lighthouse does **not** require a separate init step. It reads `--testnet-dir` on startup.

---

## Step 5 — Generate and Import Validator Keys

### Generate Keys

```bash
docker run --rm \
  --entrypoint eth2-val-tools \
  -v "$(pwd)/testnet/validator_keys:/keys" \
  ethpandaops/ethereum-genesis-generator:5.2.2 \
  keystores \
  --insecure \
  --out-loc="/keys/out" \
  --source-mnemonic="your mnemonic here" \
  --source-min=0 \
  --source-max=8
```

### Import to Lighthouse

```bash
lighthouse account validator import \
  --datadir /data \
  --keystore "path/to/keystore.json" \
  --password-file "path/to/password.txt" \
  --network mainnet \
  --reuse-password
```

> [!CAUTION]
> Without validators, slots advance but **no blocks are proposed**. Geth remains at block 0 forever.

---

## Step 6 — Docker Compose (Complete Working Example)

Based on the atomica reference implementation:

```yaml
services:
  geth:
    image: ethereum/client-go:v1.16.8
    container_name: eth-execution
    command:
      - --datadir=/data
      - --networkid=32382
      - --http
      - --http.api=eth,net,web3,debug,engine,txpool
      - --http.addr=0.0.0.0
      - --http.port=8545
      - --http.vhosts=*
      - --http.corsdomain=*
      - --ws
      - --ws.api=eth,net,web3,debug,engine
      - --ws.addr=0.0.0.0
      - --ws.port=8546
      - --ws.origins=*
      - --authrpc.addr=0.0.0.0
      - --authrpc.port=8551
      - --authrpc.vhosts=*
      - --authrpc.jwtsecret=/secrets/jwtsecret
      - --nodiscover
      - --syncmode=full
      - --gcmode=archive
      - --maxpeers=0
    volumes:
      - ./testnet/geth:/data
      - ./jwtsecret:/secrets/jwtsecret:ro
    ports:
      - "8545:8545"
      - "8546:8546"
      - "8551:8551"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:8545"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 10s

  beacon:
    image: sigp/lighthouse:latest
    container_name: eth-beacon
    depends_on:
      geth:
        condition: service_healthy
    command:
      - lighthouse
      - beacon_node
      - --debug-level=info
      - --datadir=/data/beacon
      - --testnet-dir=/testnet
      - --execution-endpoint=http://geth:8551
      - --execution-jwt=/secrets/jwtsecret
      - --http
      - --http-address=0.0.0.0
      - --http-port=5052
      - --http-allow-origin=*
      - --suggested-fee-recipient=0x0000000000000000000000000000000000000000
      - --execution-timeout-multiplier=5
      - --disable-deposit-contract-sync
      - --allow-insecure-genesis-sync
      - --disable-peer-scoring
      - --target-peers=0
    volumes:
      - ./testnet/beacon:/testnet
      - ./jwtsecret:/secrets/jwtsecret:ro
      - beacon-data:/data
    ports:
      - "5052:5052"
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:5052/eth/v1/node/version"]
      interval: 5s
      timeout: 5s
      retries: 60
      start_period: 30s

  validator:
    image: sigp/lighthouse:latest
    container_name: eth-validator
    depends_on:
      beacon:
        condition: service_started
    command:
      - lighthouse
      - validator_client
      - --debug-level=info
      - --testnet-dir=/testnet
      - --beacon-nodes=http://beacon:5052
      - --datadir=/data
      - --init-slashing-protection
      - --suggested-fee-recipient=0x0000000000000000000000000000000000000000
      - --graffiti=localnet
    volumes:
      - ./testnet/beacon:/testnet
      - ./testnet/validator_keys/lighthouse-data:/data

volumes:
  beacon-data:
```

### Geth Flags Reference

| Flag | Purpose |
|------|---------|
| `--authrpc.jwtsecret` | Path to JWT secret for Engine API |
| `--authrpc.addr=0.0.0.0` | Accept Engine API from other containers |
| `--http.api=...,engine,...` | Enable Engine API on HTTP (for debugging) |
| `--nodiscover` | Disable peer discovery (isolated network) |
| `--syncmode=full` | Full sync mode |
| `--gcmode=archive` | Keep all historical state |
| `--maxpeers=0` | No external peers |

### Lighthouse Beacon Flags Reference

| Flag | Purpose |
|------|---------|
| `--testnet-dir` | Directory containing `genesis.ssz` and `config.yaml` |
| `--execution-endpoint` | URL to Geth's Engine API (port 8551) |
| `--execution-jwt` | Path to shared JWT secret |
| `--disable-deposit-contract-sync` | Skip deposit contract sync (local network) |
| `--allow-insecure-genesis-sync` | Required for local testnets |
| `--target-peers=0` | No external peers |

### Lighthouse Validator Flags Reference

| Flag | Purpose |
|------|---------|
| `--testnet-dir` | Must match beacon's testnet-dir |
| `--beacon-nodes` | URL to beacon node HTTP API (port 5052) |
| `--init-slashing-protection` | Initialize slashing protection DB |

---

## Step 7 — Bring-Up Procedure

```bash
docker compose up -d
docker compose logs -f
```

Health checks ensure proper startup order:
1. Geth starts and becomes healthy (HTTP responds)
2. Beacon starts after Geth is healthy
3. Validator starts after beacon is started

---

## Step 8 — Validation Checklist

### Execution Layer

```bash
curl -X POST localhost:8545 \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

Block number **must increase** over time.

### Beacon Node

```bash
curl localhost:5052/eth/v1/node/syncing
```

Expected: `{"data":{"is_syncing":false}}`

### Head Slot

```bash
curl localhost:5052/eth/v1/beacon/headers/head
```

Slot number **must increase** over time.

---

## Log Signals

### Geth

| Log Message | Meaning |
|-------------|---------|
| ✅ `Forkchoice updated` | Engine API working |
| ✅ `Imported new potential chain segment` | Blocks being produced |
| ❌ `Waiting for beacon client` | CL not connected |
| ❌ `no beacon client seen` | Engine API not receiving calls |

### Lighthouse Beacon

| Log Message | Meaning |
|-------------|---------|
| ✅ `Slot advanced` | Time progressing |
| ✅ `Block received` | Blocks being produced |
| ✅ `Execution engine online` | Connected to Geth |
| ❌ `Execution endpoint unavailable` | Cannot reach Geth |

### Lighthouse Validator

| Log Message | Meaning |
|-------------|---------|
| ✅ `Successfully published block` | Validator proposing |
| ✅ `Successfully published attestation` | Validator attesting |
| ❌ `Beacon node is syncing` | Must wait for sync |

---

## Known Failure Modes

| Symptom | Root Cause | Solution |
|---------|------------|----------|
| Slots advance, no blocks | Validator not running or keys not imported | Check `lighthouse-data` directory |
| Geth block stuck at 0 | Beacon not connected | Verify `--execution-endpoint` URL |
| Engine auth errors | JWT mismatch | Ensure same file mounted to both |
| Forkchoice spam | Genesis mismatch | Regenerate both EL and CL genesis |
| "Waiting for genesis" | Genesis time in past | Regenerate with future timestamp |

---

## Success Criteria (Hard)

The network is **valid** if and only if:

- [ ] Block number increases (check `eth_blockNumber`)
- [ ] Slot number increases (check `/eth/v1/beacon/headers/head`)
- [ ] Geth logs show `Forkchoice updated`
- [ ] Beacon logs show `Block received`
- [ ] Validator logs show `Successfully published block`

If any criterion fails, the network is **not functional**.

---

## Source of Truth

When in doubt, defer to:

```
source/docker-testnet/ethereum-testnet/
```

This document explains **why** that setup works, not how to invent a new one.
