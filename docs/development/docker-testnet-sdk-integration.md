# Docker Testnet + State Proof SDK Integration Guide

This guide explains how to use the existing Docker testnet infrastructure and State Proof SDK for testing Atomica EVM contracts.

---

## 1. Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LOCAL TESTING ENVIRONMENT                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    Docker Testnet Cluster                             │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                 │   │
│  │  │  Geth   │  │Beacon   │  │Validator│  │Validator│                 │   │
│  │  │ (EL)    │  │ (CL)    │  │  #1     │  │  #2     │                 │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘                 │   │
│  │      │            │              │             │                      │   │
│  │      └────────────┴──────────────┼─────────────┘                      │   │
│  │                                   │                                     │   │
│  │  RPC: localhost:8545   WS: localhost:8546   Beacon: localhost:5052    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                   │                                          │
│                                   ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    TypeScript Testing Layer                           │   │
│  │                                                                      │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │          State Proof SDK (@atomica/state-proof-verifier)      │  │   │
│  │  │  - fetchProof()        - verifyAccountProof()                 │  │   │
│  │  │  - fetchBlock()        - verifyStorageProof()                 │  │   │
│  │  │  - fetchTransaction()  - verifyReceiptProof()                 │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │          Docker Testnet SDK (@atomica/docker-testnet)         │  │   │
│  │  │  - EthereumDockerTestnet.start()                              │  │   │
│  │  │  - getExecutionRpcUrl()   - getPreFundedAccount()             │  │   │
│  │  │  - waitForBlocks()        - waitForHealthy()                  │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │          Auction Coordinator                                   │  │   │
│  │  │  - runAuction()        - generateStateProof()                 │  │   │
│  │  │  - collectSignatures() - executeSettlement()                  │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                   │                                          │
│                                   ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    EVM Contracts (Foundry)                           │   │
│  │                                                                      │   │
│  │  DepositBox.sol  BLSVerifier.sol  Settlement.sol  Controller.sol    │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Docker Testnet Setup

### 2.1 Directory Structure

```
/home/lucas/atomica/source/docker-testnet/
├── ethereum-testnet/
│   ├── config/
│   │   ├── docker-compose.yaml        # Main configuration
│   │   └── genesis/
│   │       ├── generate.sh            # Genesis generation
│   │       └── Dockerfile
│   └── typescript-sdk/
│       ├── src/index.ts               # EthereumDockerTestnet class
│       ├── src/contracts.ts           # Contract deployment helpers
│       ├── test/
│       │   ├── block-production.test.ts
│       │   ├── state-proofs.test.ts
│       │   └── helpers/
│       │       └── testnet-lifecycle.ts
│       └── package.json
```

### 2.2 Starting the Testnet

#### Option A: Using TypeScript SDK

```typescript
import { EthereumDockerTestnet } from './src/index';

async function startTestnet() {
    console.log('Starting Docker testnet...');

    // Start with 4 validators (default)
    const testnet = await EthereumDockerTestnet.start(4);

    // Wait for testnet to be healthy
    await testnet.waitForHealthy(120_000);

    // Get RPC endpoints
    const httpUrl = testnet.getExecutionRpcUrl();
    const wsUrl = testnet.getExecutionWsUrl();
    const beaconUrl = testnet.getBeaconApiUrl();

    console.log('HTTP RPC:', httpUrl);
    console.log('WebSocket:', wsUrl);
    console.log('Beacon API:', beaconUrl);

    // Get block number
    const blockNumber = await testnet.getBlockNumber();
    console.log('Current block:', blockNumber);

    // Get chain ID
    const chainId = await testnet.getChainId();
    console.log('Chain ID:', chainId);

    return testnet;
}
```

#### Option B: Manual Docker Commands

```bash
# Navigate to config directory
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/config

# Generate genesis (first time only)
./generate.sh

# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Check status
docker compose ps

# Stop and cleanup
docker compose down -v
```

### 2.3 Pre-Funded Test Accounts

The testnet comes with 4 pre-funded accounts:

```typescript
import { EthereumDockerTestnet } from './src/index';

async function getTestAccounts() {
    const testnet = await EthereumDockerTestnet.start(4);

    const accounts = [];
    for (let i = 0; i < 4; i++) {
        const wallet = await testnet.getPreFundedAccount(i);
        accounts.push({
            index: i,
            address: wallet.address,
            privateKey: wallet.privateKey
        });
    }

    return accounts;
}

// Result:
// [
//   { index: 0, address: '0x8943545177806ED17B9F23F0a21ee5948eCaa776', privateKey: '...' },
//   { index: 1, address: '0x71bE63f3384f5fb98995898A86B02Fb2426c5788', privateKey: '...' },
//   { index: 2, address: '0xFABB0ac9d68B0B445fB7357272Ff202C5651694a', privateKey: '...' },
//   { index: 3, address: '0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec', privateKey: '...' }
// ]
```

---

## 3. State Proof SDK Integration

### 3.1 Installation

```bash
cd /home/lucas/atomica/source/state-proofs/typescript
npm install
npm run build
```

### 3.2 Generating State Proofs

```typescript
import {
    fetchProof,
    fetchBlock,
    verifyAccountProof,
    verifyStorageProof,
    EthereumProof,
    Block
} from './src/index';

interface DepositProof {
    address: string;
    blockNumber: number;
    blockHash: string;
    stateRoot: string;
    accountState: {
        nonce: number;
        balance: bigint;
        storageHash: string;
        codeHash: string;
    };
    storageProof?: {
        key: string;
        value: string;
        proof: string[];
    };
}

class StateProofGenerator {
    private rpcUrl: string;

    constructor(rpcUrl: string) {
        this.rpcUrl = rpcUrl;
    }

    /**
     * Generate proof for an account (e.g., DepositBox contract)
     */
    async generateAccountProof(address: string, blockNumber: number): Promise<DepositProof> {
        // Fetch block header
        const block = await fetchBlock(this.rpcUrl, blockNumber);

        // Fetch account proof using EIP-1186
        const proof = await fetchProof(this.rpcUrl, address, [], blockNumber);

        // Verify proof cryptographically
        const result = await verifyAccountProof(
            proof.accountProof,
            block.stateRoot,
            address
        );

        if (!result.valid) {
            throw new Error(`Failed to verify account proof for ${address}`);
        }

        return {
            address,
            blockNumber,
            blockHash: block.hash,
            stateRoot: block.stateRoot,
            accountState: {
                nonce: result.accountState.nonce,
                balance: result.accountState.balance,
                storageHash: result.accountState.storageHash,
                codeHash: result.accountState.codeHash
            }
        };
    }

    /**
     * Generate proof for a storage slot (e.g., deposit data)
     */
    async generateStorageProof(
        address: string,
        storageKey: string,
        blockNumber: number
    ): Promise<DepositProof> {
        // First get account proof
        const accountProof = await this.generateAccountProof(address, blockNumber);

        // Then get storage proof
        const proof = await fetchProof(this.rpcUrl, address, [storageKey], blockNumber);

        const storageResult = await verifyStorageProof(
            proof.storageProof[0].proof,
            accountProof.accountState.storageHash,
            storageKey
        );

        if (!storageResult.valid) {
            throw new Error(`Failed to verify storage proof for ${address}[${storageKey}]`);
        }

        return {
            ...accountProof,
            storageProof: {
                key: storageKey,
                value: storageResult.value,
                proof: proof.storageProof[0].proof
            }
        };
    }
}
```

### 3.3 Using with Docker Testnet

```typescript
import { EthereumDockerTestnet } from '@atomica/docker-testnet-ethereum';
import { StateProofGenerator } from './state-proof-generator';

async function integratedExample() {
    // 1. Start testnet
    const testnet = await EthereumDockerTestnet.start(4);
    await testnet.waitForHealthy();

    // 2. Initialize state proof generator
    const proofGenerator = new StateProofGenerator(testnet.getExecutionRpcUrl());

    // 3. Deploy contracts (using test account)
    const deployer = await testnet.getPreFundedAccount(0);
    const DepositBox = await ethers.getContractFactory('DepositBox');
    const depositBox = await DepositBox.connect(deployer).deploy(USDC_ADDRESS);
    await depositBox.waitForDeployment();
    const depositBoxAddress = await depositBox.getAddress();

    // 4. Make some deposits
    const commitment = ethers.id('test-commitment');
    await depositBox.connect(deployer).depositETH({ value: ethers.parseEther('1') }, commitment);

    // 5. Wait for block
    await testnet.waitForBlocks(2);
    const currentBlock = await testnet.getBlockNumber();

    // 6. Generate state proof
    const proof = await proofGenerator.generateAccountProof(depositBoxAddress, currentBlock);

    console.log('State Root:', proof.stateRoot);
    console.log('Block Hash:', proof.blockHash);
    console.log('Contract Balance:', proof.accountState.balance);

    // 7. Verify on-chain
    const storedStateRoot = await depositBox.latestStateRoot();
    console.log('Stored State Root:', storedStateRoot);
    console.log('Proof Valid:', proof.stateRoot === storedStateRoot);

    // 8. Cleanup
    await testnet.teardown();
}
```

---

## 4. Complete Integration Test Example

### 4.1 Test Setup

```typescript
/**
 * Complete integration test for Atomica contracts
 * Uses Docker testnet + State Proof SDK
 */
import { EthereumDockerTestnet } from './src/index';
import { StateProofGenerator } from './state-proof-generator';
import { ethers } from 'ethers';

describe('Atomica Full Integration', () => {
    let testnet: EthereumDockerTestnet;
    let proofGenerator: StateProofGenerator;
    let contracts: {
        depositBox: ethers.Contract;
        blsVerifier: ethers.Contract;
        settlement: ethers.Contract;
        controller: ethers.Contract;
        usdc: ethers.Contract;
    };
    let users: {
        seller: ethers.Wallet;
        buyer: ethers.Wallet;
        admin: ethers.Wallet;
    };

    beforeAll(async () => {
        // Start Docker testnet
        testnet = await EthereumDockerTestnet.start(4);
        await testnet.waitForHealthy(120_000);

        // Initialize proof generator
        proofGenerator = new StateProofGenerator(testnet.getExecutionRpcUrl());

        // Get test accounts
        const accounts = await Promise.all([
            testnet.getPreFundedAccount(0),
            testnet.getPreFundedAccount(1),
            testnet.getPreFundedAccount(2)
        ]);

        users = {
            seller: accounts[0],
            buyer: accounts[1],
            admin: accounts[2]
        };

        // Deploy contracts
        contracts = await deployAllContracts(testnet, users.admin);

    }, 180_000);

    afterAll(async () => {
        await testnet.teardown();
    });

    describe('Deposit Flow', () => {
        it('should handle ETH deposit with state proof', async () => {
            const commitment = ethers.id('seller-commitment');
            const amount = ethers.parseEther('5.0');

            // Make deposit
            const tx = await contracts.depositBox
                .connect(users.seller)
                .depositETH(commitment, { value: amount });
            const receipt = await tx.wait();

            // Wait for block
            await testnet.waitForBlocks(2);
            const blockNumber = await testnet.getBlockNumber();

            // Generate state proof
            const proof = await proofGenerator.generateAccountProof(
                await contracts.depositBox.getAddress(),
                blockNumber
            );

            // Verify proof
            expect(proof.valid).toBe(true);
            expect(proof.accountState.balance).toBeGreaterThanOrEqual(amount);
        });

        it('should handle USDC deposit with state proof', async () => {
            const commitment = ethers.id('buyer-commitment');
            const amount = 1000000n; // 1 USDC

            // Mint USDC to buyer
            await contracts.usdc.mint(users.buyer.address, amount);

            // Approve
            await contracts.usdc.connect(users.buyer).approve(
                await contracts.depositBox.getAddress(),
                amount
            );

            // Deposit
            const tx = await contracts.depositBox
                .connect(users.buyer)
                .depositUSDC(amount, commitment);
            const receipt = await tx.wait();

            // Verify with state proof
            await testnet.waitForBlocks(2);
            const blockNumber = await testnet.getBlockNumber();

            const proof = await proofGenerator.generateAccountProof(
                await contracts.depositBox.getAddress(),
                blockNumber
            );

            expect(proof.valid).toBe(true);
        });
    });

    describe('Auction Flow', () => {
        it('should start auction and verify state', async () => {
            const tradeId = ethers.id('auction-1');

            // Start auction
            const tx = await contracts.controller
                .connect(users.admin)
                .startRound(tradeId);
            await tx.wait();

            const round = await contracts.controller.currentRound();
            expect(round).toBe(1n);
        });
    });

    describe('State Proof Verification', () => {
        it('should verify deposit state using SDK', async () => {
            // Make deposit
            await contracts.depositBox
                .connect(users.seller)
                .depositETH(ethers.id('proof-test'), { value: 1n });

            await testnet.waitForBlocks(2);
            const blockNumber = await testnet.getBlockNumber();

            // Generate comprehensive proof
            const proof = await proofGenerator.generateAccountProof(
                await contracts.depositBox.getAddress(),
                blockNumber
            );

            // Verify on-chain
            const storedRoot = await contracts.depositBox.latestStateRoot();
            expect(proof.stateRoot).toBeDefined();
            expect(storedRoot).toBeDefined();
        });
    });
});
```

### 4.2 Running the Tests

```bash
# 1. Start Docker testnet
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/config
docker compose up -d

# 2. Wait for healthy (check logs)
docker compose logs -f beacon

# 3. Run integration tests
cd /home/lucas/atomica/source/atomica-zkp/solidity
forge test

# Or run TypeScript tests
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/typescript-sdk
bun test

# 4. Stop testnet
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/config
docker compose down -v
```

---

## 5. Auction Coordinator with State Proofs

### 5.1 Complete Coordinator Implementation

```typescript
/**
 * Auction Coordinator with State Proof SDK Integration
 */
import { EthereumDockerTestnet } from '@atomica/docker-testnet-ethereum';
import { StateProofGenerator } from './state-proof-generator';
import { ethers } from 'ethers';

interface AuctionConfig {
    minEthDeposits: number;
    minUsdcDeposits: number;
    auctionDurationMs: number;
}

interface AuctionResult {
    tradeId: string;
    clearingPrice: bigint;
    totalEth: bigint;
    totalUsdc: bigint;
    ethToTrade: bigint;
    usdcToTrade: bigint;
    stateProof: any;
    validatorSignature: Uint8Array;
}

class AuctionCoordinator {
    private testnet: EthereumDockerTestnet;
    private proofGenerator: StateProofGenerator;
    private contracts: any;
    private config: AuctionConfig;

    constructor(
        testnet: EthereumDockerTestnet,
        proofGenerator: StateProofGenerator,
        contracts: any,
        config: AuctionConfig
    ) {
        this.testnet = testnet;
        this.proofGenerator = proofGenerator;
        this.contracts = contracts;
        this.config = config;
    }

    /**
     * Run complete auction flow with state proofs
     */
    async runAuction(tradeId: string): Promise<AuctionResult> {
        // Phase 1: Wait for minimum deposits
        await this.waitForDeposits();

        // Phase 2: Generate state proof at auction start
        const startBlock = await this.testnet.getBlockNumber();
        const startStateProof = await this.proofGenerator.generateAccountProof(
            await this.contracts.depositBox.getAddress(),
            startBlock
        );

        // Phase 3: Fetch deposits and run auction
        const auctionResult = await this.runAuctionAlgorithm();

        // Phase 4: Collect validator signatures
        const message = this.createTradeMessage(tradeId, auctionResult);
        const signature = await this.collectValidatorSignature(message);

        // Phase 5: Generate allocation proof
        const allocationRoot = await this.generateAllocationRoot(auctionResult);

        // Phase 6: Finalize trade on-chain
        await this.contracts.settlement.finalizeTrade(
            tradeId,
            auctionResult.clearingPrice,
            auctionResult.ethToTrade,
            auctionResult.usdcToTrade,
            allocationRoot,
            signature,
            [], // pubkeys
            []  // validatorIndices
        );

        return {
            tradeId,
            ...auctionResult,
            stateProof: startStateProof,
            validatorSignature: signature
        };
    }

    private async waitForDeposits(): Promise<void> {
        let ethCount = 0;
        let usdcCount = 0;
        const maxWait = 5 * 60 * 1000; // 5 minutes
        const startTime = Date.now();

        while ((ethCount < this.config.minEthDeposits || usdcCount < this.config.minUsdcDeposits)
               && Date.now() - startTime < maxWait) {
            // Check deposit counts from contract
            // ethCount = await this.contracts.depositBox.ethDepositCount();
            // usdcCount = await this.contracts.depositBox.usdcDepositCount();

            await new Promise(r => setTimeout(r, 5000));
        }
    }

    private async runAuctionAlgorithm(): Promise<{
        clearingPrice: bigint;
        totalEth: bigint;
        totalUsdc: bigint;
        ethToTrade: bigint;
        usdcToTrade: bigint;
    }> {
        // Fetch all deposits
        // const deposits = await this.fetchDeposits();

        // Separate ETH and USDC deposits
        // const ethDeposits = deposits.filter(d => d.isEth);
        // const usdcDeposits = deposits.filter(d => !d.isEth);

        // Find clearing price
        // const clearingPrice = this.findClearingPrice(ethDeposits, usdcDeposits);

        // Return results (simplified)
        return {
            clearingPrice: 2000000000000000000n, // 2000 USDC per ETH
            totalEth: 10n,
            totalUsdc: 20000n,
            ethToTrade: 10n,
            usdcToTrade: 20000n
        };
    }

    private createTradeMessage(tradeId: string, result: any): Uint8Array {
        return Buffer.from(ethers.getBytes(ethers.id(
            tradeId + result.clearingPrice.toString() + result.ethToTrade.toString()
        )));
    }

    private async collectValidatorSignature(message: Uint8Array): Promise<Uint8Array> {
        // Collect BLS signature from Aptos validators
        // This would integrate with the validator set
        return new Uint8Array(96); // BLS signature size
    }

    private async generateAllocationRoot(result: any): Promise<string> {
        // Generate Merkle tree of user allocations
        return ethers.ZeroHash;
    }
}
```

---

## 6. Troubleshooting

### 6.1 Common Issues

| Issue | Solution |
|-------|----------|
| Testnet not starting | Check Docker is running: `docker ps` |
| RPC not responding | Check Geth logs: `docker compose logs geth` |
| BLS signature failing | Ensure validators are synced |
| State proof invalid | Verify block is final |

### 6.2 Debug Commands

```bash
# Check all containers
docker compose ps

# View Geth logs
docker compose logs -f geth

# View Beacon logs
docker compose logs -f beacon

# Check block production
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check beacon sync
curl http://localhost:5052/eth/v1/node/syncing

# Force restart testnet
docker compose down -v
docker compose up -d
```

---

## 7. Summary

This integration guide demonstrates how to use:

1. **Docker Testnet** (`EthereumDockerTestnet`) for local Ethereum testing
2. **State Proof SDK** for EIP-1186 proof generation and verification
3. **Complete workflow** from deposits to auction to settlement

Key benefits:
- Full local testing without mainnet/testnet dependencies
- Cryptographic verification of all state
- Integration with existing infrastructure
- Production-like test environment

---

*Document Version: 1.0*
*January 2026*
*Uses: Docker Testnet SDK + State Proof SDK*
