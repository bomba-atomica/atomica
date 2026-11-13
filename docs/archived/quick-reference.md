# Atomica EVM Contracts - Quick Reference

## Contract Architecture

```
AtomicaController (Facade)
├── DepositBox (ETH + USDC deposits)
│   ├── ETHVault
│   └── USDCVault
├── StateCommitment (Merkle tree)
├── BLSVerifier (BLS signature verification)
└── Settlement (Atomic settlement)
```

## Core Contracts

| Contract | Purpose | Location |
|----------|---------|----------|
| `DepositBox` | Handle ETH/USDC deposits with commitments | Main deposit logic |
| `BLSVerifier` | Verify aggregated BLS signatures | BLS12-381 operations |
| `Settlement` | Execute atomic trades based on proofs | Trade finalization |
| `AtomicaController` | Coordinate all contracts | Main entry point |

## Data Flow

1. **Deposit Phase**: User → `depositETH()`/`depositUSDC()`
2. **Confirmation Phase**: Coordinator → BLS signature generation
3. **Auction Phase**: Off-chain double auction execution
4. **Settlement Phase**: User → `executeSettlement()` → Atomic transfers

## Key Functions

### DepositBox
```solidity
depositETH(bytes32 commitment)   // Deposit ETH with commitment
depositUSDC(uint256 amount, bytes32 commitment)  // Deposit USDC
confirmDeposits(bytes32[] commitments, bytes32 newStateRoot)  // Confirm deposits
refundDeposit(address depositor, uint256 nonce)  // Timeout refund
```

### BLSVerifier
```solidity
verifyAggregatedSignature(pubkeys, signature, messageHash, validatorIndices)
verifyStateProof(stateRoot, signature, pubkeys, validatorIndices)
```

### Settlement
```solidity
finalizeTrade(tradeId, clearingPrice, ethToTrade, usdcToTrade, merkleRoot, signature, pubkeys, validatorIndices)
executeSettlement(tradeId, allocationProof, ethDeposited, usdcDeposited)
```

## Docker Testnet Integration

### Starting Testnet
```typescript
import { EthereumDockerTestnet } from '@atomica/docker-testnet-ethereum';

const testnet = await EthereumDockerTestnet.start(4);
await testnet.waitForHealthy();

const rpcUrl = testnet.getExecutionRpcUrl();
const beaconUrl = testnet.getBeaconApiUrl();

await testnet.teardown();
```

### Manual Docker Commands
```bash
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/config
docker compose up -d      # Start
docker compose ps         # Status
docker compose logs -f    # Logs
docker compose down -v    # Stop
```

### Test Accounts
| Index | Address | Balance |
|-------|---------|---------|
| 0 | 0x8943545177806ED17B9F23F0a21ee5948eCaa776 | 1000 ETH |
| 1 | 0x71bE63f3384f5fb98995898A86B02Fb2426c5788 | 1000 ETH |
| 2 | 0xFABB0ac9d68B0B445fB7357272Ff202C5651694a | 1000 ETH |
| 3 | 0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec | 1000 ETH |

## State Proof SDK Integration

### Generate State Proof
```typescript
import { fetchProof, fetchBlock, verifyAccountProof } from '@atomica/state-proof-verifier';

const proof = await fetchProof(rpcUrl, address, [], blockNumber);
const block = await fetchBlock(rpcUrl, blockNumber);
const result = await verifyAccountProof(proof.accountProof, block.stateRoot, address);
```

### Verify Storage Proof
```typescript
const proof = await fetchProof(rpcUrl, address, [storageKey], blockNumber);
const result = await verifyStorageProof(proof.storageProof[0].proof, storageRoot, storageKey);
```

## Security Features

- ReentrancyGuard on all external functions
- Role-based access control
- Circuit breaker for emergencies
- Signature replay protection (chainId + timestamp)
- Whitelisted tokens in TransferManager

## Deployment Addresses

| Network | Contract | Address |
|---------|----------|---------|
| Local | DepositBox | [Deployed via script] |
| Local | BLSVerifier | [Deployed via script] |
| Local | Settlement | [Deployed via script] |
| Sepolia | DepositBox | [TO BE DEPLOYED] |
| Sepolia | BLSVerifier | [TO BE DEPLOYED] |
| Sepolia | Settlement | [TO BE DEPLOYED] |
| Mainnet | DepositBox | [TO BE DEPLOYED] |
| Mainnet | BLSVerifier | [TO BE DEPLOYED] |
| Mainnet | Settlement | [TO BE DEPLOYED] |

## Testing

### Foundry Tests
```bash
cd /home/lucas/atomica/source/atomica-zkp/solidity
forge test
```

### TypeScript Integration Tests
```bash
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/typescript-sdk
bun test
```

### State Proof Tests
```bash
cd /home/lucas/atomica/source/state-proofs/typescript
bun test
```

### Complete E2E Test Flow
```bash
# 1. Start Docker testnet
cd docker-testnet/ethereum-testnet/config && docker compose up -d

# 2. Wait for healthy
sleep 30

# 3. Run all tests
cd atomica-zkp/solidity && forge test
cd docker-testnet/ethereum-testnet/typescript-sdk && bun test
cd state-proofs/typescript && bun test

# 4. Stop testnet
cd docker-testnet/ethereum-testnet/config && docker compose down -v
```

## Implementation Phases

1. **Phase 1 (Weeks 1-2)**: Core Contracts - DepositBox, Merkle tree
2. **Phase 2 (Weeks 3-4)**: BLS Verification - BLS12-381 library
3. **Phase 3 (Weeks 5-6)**: State Proof SDK Integration
4. **Phase 4 (Weeks 7-8)**: Settlement - Trade finalization
5. **Phase 5 (Weeks 9-12)**: Security Audit - Third-party review

## RPC Endpoints (Local Testnet)

| Service | Endpoint | Description |
|---------|----------|-------------|
| Geth HTTP | http://localhost:8545 | JSON-RPC |
| Geth WS | ws://localhost:8546 | WebSocket |
| Beacon API | http://localhost:5052 | REST API |

## Documentation

- Full implementation plan: `evm-contracts-implementation-plan.md`
- Docker and SDK integration: `docker-testnet-sdk-integration.md`
- Contract interfaces: `contract-interfaces.sol`
- This quick reference: `quick-reference.md`
- Docker testnet: `/home/lucas/atomica/source/docker-testnet/`
- State Proof SDK: `/home/lucas/atomica/source/state-proofs/typescript/`

## Next Steps

1. Review and finalize contract interfaces
2. Begin Phase 1 implementation
3. Set up Docker testnet for local testing
4. Integrate State Proof SDK for proof verification
5. Engage security auditors
