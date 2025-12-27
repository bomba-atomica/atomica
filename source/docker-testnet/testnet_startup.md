# Aptos Testnet Startup Analysis

## Executive Summary

**STATUS**: ✅ RESOLVED - The testnet is now fully operational with all 4 validators participating in consensus.

**ROOT CAUSE**: The generated `node-config.yaml` was initially missing the `listen_address` field in the `validator_network` section. Without this, validators didn't bind to port 6180, causing "Connection refused" errors when they tried to connect to each other.

**FIX**: Updated the genesis generation shell script to include `listen_address: "/ip4/0.0.0.0/tcp/6180"` in the validator_network configuration.

**VERIFICATION**: All 4 validators are now synchronized at the same epoch and block height, successfully producing blocks through consensus.

## Debug Tools Added

### 1. TypeScript Probe Utility

A comprehensive network probe tool is now available:

```bash
# From typescript-sdk directory
npm run build
node scripts/probe.js [num_validators]

# Or with tsx
npx tsx scripts/probe.ts 4
```

The probe tool checks:
- REST API endpoints (http://127.0.0.1:8080-8083/v1)
- Metrics endpoints (http://127.0.0.1:9101-9104)
- Validator synchronization (epoch, block height)
- Container-to-container networking

### 2. Debug Logging

Enable verbose debug logging with environment variable:

```bash
DEBUG_TESTNET=1 npm test
# or
DEBUG_TESTNET=1 node your-script.js
```

This enables:
- Genesis generation debug logs
- Docker compose operation logs  
- Network discovery logs
- Configuration file verification logs

### 3. Manual Verification Commands

```bash
# Check all validator status
for port in 8080 8081 8082 8083; do
    echo "=== Validator on port $port ==="
    curl -s http://127.0.0.1:$port/v1 | jq '{epoch,block_height,node_role}'
done

# Check validator logs for connectivity
docker compose logs --tail=50 validator-0 | grep -i "connect\|error\|peer"

# Check container networking
docker exec atomica-validator-0 curl -s http://172.19.0.11:8080/v1
```

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Docker Network: 172.19.0.0/16                   │
├─────────────────┬─────────────────┬─────────────────┬───────────────┤
│   validator-0   │   validator-1   │   validator-2   │   validator-3 │
│   172.19.0.10   │   172.19.0.11   │   172.19.0.12   │   172.19.0.13 │
│                 │                 │                 │               │
│ Ports:          │ Ports:          │ Ports:          │ Ports:        │
│ 8080 REST API   │ 8080 REST API   │ 8080 REST API   │ 8080 REST API │
│ 6180 Validator  │ 6180 Validator  │ 6180 Validator  │ 6180 Validator│
│ 9101 Metrics    │ 9101 Metrics    │ 9101 Metrics    │ 9101 Metrics  │
└─────────────────┴─────────────────┴─────────────────┴───────────────┘
```

## Observed Symptoms

1. **Validator-0 starts and REST API becomes healthy** (8080 responds)
2. **Validators 1-3 start after validator-0 healthcheck passes**
3. **All validators fail to connect to each other** with:
   ```
   Transport error: Connection refused (os error 111)
   ```
4. **Addresses in logs are correct** - validators know the right IPs and public keys
5. **Port 6180 is not listening** on any container

## Key Log Evidence

```json
{
  "message": "Failed to connect to peer: 7c29442e at address: /ip4/172.19.0.12/tcp/6180/...",
  "error": "Transport error: Connection refused (os error 111)"
}
```

The on-chain discovery IS working - validators correctly discover each other's addresses from genesis. The issue is that port 6180 isn't bound.

## Configuration Analysis

### Current Generated Config (BROKEN)

```yaml
validator_network:
  discovery_method: "onchain"
  mutual_authentication: true
  identity:
    type: "from_file"
    path: "/opt/aptos/identity/validator-identity.yaml"
  # MISSING: listen_address!
```

### Reference Config (CORRECT)

From `atomica-aptos/config/src/config/test_data/validator.yaml`:
```yaml
validator_network:
  discovery_method: "onchain"
  listen_address: "/ip4/0.0.0.0/tcp/6180"  # <-- REQUIRED!
  mutual_authentication: true
  identity:
    type: "from_file"
    path: /path/to/validator-identity.yaml
```

## Fix Required

In `genesis.ts`, the `createValidatorNodeConfig()` function must add:
```yaml
validator_network:
  listen_address: "/ip4/0.0.0.0/tcp/6180"
```

## Startup Flow

1. **Genesis Generation** (`genesis.ts`)
   - `generateGenesis()` creates layout, keys, and validator configs
   - `set-validator-configuration` registers validator addresses in genesis
   - `generate-genesis` produces genesis.blob and waypoint.txt
   - `createValidatorNodeConfig()` generates node-config.yaml files

2. **Docker Compose** (`docker-compose.yaml`)
   - Mounts genesis artifacts at `/opt/aptos/genesis/`
   - Mounts validator identity at `/opt/aptos/identity/`
   - Mounts node config at `/opt/aptos/etc/node-config.yaml`
   - Runs `aptos-node -f /opt/aptos/etc/node-config.yaml`

3. **Node Startup** (`aptos-node`)
   - Loads config from YAML
   - Reads genesis.blob and waypoint.txt
   - Loads identity (private keys) for network authentication
   - Binds to `listen_address` (if specified!)
   - Uses on-chain discovery to find other validators
   - Attempts connections to validator peers

## Required Ports

| Port | Protocol | Purpose                    | Listen Address      |
|------|----------|----------------------------|---------------------|
| 8080 | TCP/HTTP | REST API                   | 0.0.0.0:8080        |
| 6180 | TCP/Noise| Validator-to-Validator     | 0.0.0.0:6180        |
| 6181 | TCP/Noise| VFN Network (optional)     | 0.0.0.0:6181        |
| 9101 | TCP/HTTP | Metrics/Prometheus         | 0.0.0.0:9101        |

## Network Address Format

Aptos uses multiaddresses with Noise IK encryption:
```
/ip4/<host>/tcp/<port>/noise-ik/<x25519_pubkey>/handshake/<version>
```

Example:
```
/ip4/172.19.0.10/tcp/6180/noise-ik/0x383146fadb.../handshake/0
```

## Identity Files

Each validator needs:
- `validator-identity.yaml` - Contains private keys for authentication
- `public-keys.yaml` - Public keys registered in genesis

Format of `validator-identity.yaml`:
```yaml
account_address: 6111e15cf15636e53691104920c42d2cdb7d06a73ef382c50521d86b387b3a93
account_private_key: "0x..."
consensus_private_key: "0x..."
network_private_key: "0x..."  # Used for Noise handshake
```

## Debugging Checklist

- [ ] `listen_address` in validator_network section
- [ ] Port 6180 exposed in docker-compose.yaml
- [ ] Same genesis.blob for all validators
- [ ] Same waypoint.txt for all validators
- [ ] Identity files match what's in genesis
- [ ] Network connectivity between containers (ping test)
- [ ] No firewall blocking container-to-container traffic

## Next Steps

1. **Fix `genesis.ts`** - Add `listen_address` to validator_network config
2. **Add debug logging** - Instrument TypeScript and config generation
3. **Create probe tool** - Test port connectivity and API endpoints
4. **Regenerate and test** - Start fresh with fixed config
