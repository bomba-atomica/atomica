# Aptos-Ethereum Bridge Contracts

This directory contains Solidity smart contracts for cryptographically verifying Aptos blockchain state on Ethereum, enabling trustless cross-chain bridges and oracles.

## Architecture

```
AptosLightClient.sol       - Core light client maintaining trusted Aptos state
├── BLSVerifier.sol        - BLS12-381 signature verification library
├── MerkleVerifier.sol     - Merkle proof verification (accumulator + sparse)
└── AptosTokenBridge.sol   - Example token bridge application
```

## Contracts

### 1. AptosLightClient.sol

The main contract that maintains Aptos trusted state and verifies StateProofs.

**Key Features:**
- Stores trusted state (version, state root, accumulator, epoch)
- Manages validator sets per epoch
- Verifies BLS12-381 aggregate signatures
- Verifies Merkle proofs for state and transactions
- Handles epoch transitions with proof verification

**Gas Costs (estimated):**
- Initialize: ~500,000 gas (10 validators)
- Update state (no epoch change): ~300,000 gas
- Update state (with epoch change): ~800,000 gas
- Verify account state: ~100,000 gas
- Verify transaction: ~80,000 gas

### 2. BLSVerifier.sol

Library for BLS12-381 aggregate signature verification using EIP-2537 precompiles.

**Features:**
- Aggregate multiple BLS public keys
- Verify BLS signatures using pairing checks
- Hash-to-curve implementation
- Quorum validation (2f+1 voting power)

**Requirements:**
- EIP-2537 must be activated (available on Ethereum mainnet)
- Validators must use BLS12-381 signatures

### 3. MerkleVerifier.sol

Library for verifying Merkle proofs from Aptos.

**Proof Types:**
- **Accumulator Proof**: Verifies transaction inclusion in the binary Merkle accumulator
- **Sparse Merkle Proof**: Verifies account state in the 256-bit sparse Merkle tree
- **Range Proof**: Verifies consecutive ranges of transactions or state

### 4. AptosTokenBridge.sol

Example application demonstrating a cross-chain token bridge.

**Features:**
- Lock ERC20 tokens on Ethereum
- Unlock by proving burn on Aptos
- Replay protection
- Balance tracking

## Deployment

### Prerequisites

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
```

### Deploy Script

```javascript
// scripts/deploy.js
const hre = require("hardhat");

async function main() {
    // 1. Deploy AptosLightClient
    const AptosLightClient = await hre.ethers.getContractFactory("AptosLightClient");
    const lightClient = await AptosLightClient.deploy();
    await lightClient.waitForDeployment();

    console.log("AptosLightClient deployed to:", await lightClient.getAddress());

    // 2. Get initial waypoint from Aptos
    // Format: version:hash (e.g., "245000000:0x1234abcd...")
    const initialVersion = 245000000n;
    const stateRoot = "0x1234...";  // Get from Aptos full node
    const accumulator = "0x5678...";
    const timestamp = 1234567890n;
    const epoch = 1234n;

    // 3. Fetch validator set
    const validators = await fetchValidatorsFromAptos(epoch);

    // 4. Initialize light client
    await lightClient.initialize(
        initialVersion,
        stateRoot,
        accumulator,
        timestamp,
        epoch,
        validators
    );

    console.log("Light client initialized");

    // 5. Deploy bridge
    const AptosTokenBridge = await hre.ethers.getContractFactory("AptosTokenBridge");
    const bridge = await AptosTokenBridge.deploy(await lightClient.getAddress());
    await bridge.waitForDeployment();

    console.log("AptosTokenBridge deployed to:", await bridge.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
```

### Getting Initial Waypoint

```typescript
// Fetch from Aptos REST API
async function getWaypointFromAptos(): Promise<Waypoint> {
    const response = await fetch("https://fullnode.mainnet.aptoslabs.com/v1");
    const ledgerInfo = await response.json();

    return {
        version: BigInt(ledgerInfo.ledger_version),
        stateRoot: ledgerInfo.state_root_hash,
        accumulator: ledgerInfo.accumulator_root_hash,
        timestamp: BigInt(ledgerInfo.ledger_timestamp),
        epoch: BigInt(ledgerInfo.epoch)
    };
}

async function getValidatorSet(epoch: number): Promise<Validator[]> {
    const response = await fetch(
        `https://fullnode.mainnet.aptoslabs.com/v1/accounts/0x1/resource/0x1::stake::ValidatorSet`
    );
    const data = await response.json();

    return data.data.active_validators.map(v => ({
        publicKey: v.consensus_public_key,
        votingPower: BigInt(v.voting_power),
        aptosAddress: v.account_address
    }));
}
```

## Usage Examples

### 1. Update Light Client State

```solidity
// Relayer service updates the light client periodically
function updateLightClient(
    address lightClientAddr,
    bytes calldata stateProof
) external {
    AptosLightClient lightClient = AptosLightClient(lightClientAddr);

    // Decode proof components
    (
        bytes memory ledgerInfo,
        bytes memory signatures,
        uint256 signerBitmask,
        bytes memory epochChangeProof
    ) = decodeStateProof(stateProof);

    // Update state
    lightClient.updateState(
        ledgerInfo,
        signatures,
        signerBitmask,
        epochChangeProof
    );
}
```

### 2. Bridge Tokens from Ethereum to Aptos

```solidity
// Lock tokens on Ethereum
function lockTokens() external {
    IERC20 token = IERC20(tokenAddress);

    // Approve bridge
    token.approve(bridgeAddress, amount);

    // Lock tokens
    AptosTokenBridge bridge = AptosTokenBridge(bridgeAddress);
    bridge.lockTokens(
        tokenAddress,
        amount,
        aptosRecipientAddress  // 32-byte Aptos address
    );
}
```

### 3. Bridge Tokens from Aptos to Ethereum

```typescript
// On Aptos: Burn tokens
const txn = await aptosClient.transaction.submit({
    sender: account.address(),
    payload: {
        function: "0x1::bridge::burn_tokens",
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: [amount, ethereumRecipient]
    }
});

await aptosClient.waitForTransaction(txn.hash);

// Get proof of burn
const proof = await aptosClient.getAccountResourceWithProof(
    bridgeAddress,
    `0x1::bridge::BurnRegistry`,
    txn.version
);

// On Ethereum: Unlock tokens
await bridge.unlockTokens(
    tokenAddress,
    amount,
    ethereumRecipient,
    proof.siblings,
    proof.value
);
```

### 4. Verify Specific Account State

```solidity
// Verify account balance on Aptos from Ethereum
function verifyAptosBalance(
    address lightClientAddr,
    bytes32 accountKey,
    bytes calldata balanceData,
    bytes calldata proof
) external view returns (uint256) {
    AptosLightClient lightClient = AptosLightClient(lightClientAddr);

    require(
        lightClient.verifyAccountState(accountKey, balanceData, proof),
        "Invalid proof"
    );

    // Decode and return balance
    return abi.decode(balanceData, (uint256));
}
```

## Relayer Service

A relayer service should run continuously to update the light client:

```typescript
class AptosEthereumRelayer {
    constructor(
        private aptosClient: AptosClient,
        private ethereumProvider: Provider,
        private lightClient: Contract
    ) {}

    async start() {
        setInterval(() => this.syncState(), 60000); // Every minute
    }

    async syncState() {
        try {
            // 1. Get current state from Ethereum
            const currentVersion = await this.lightClient.trustedState().version;

            // 2. Request StateProof from Aptos
            const stateProof = await this.aptosClient.getStateProof(
                currentVersion
            );

            // 3. Encode for Ethereum
            const encoded = this.encodeStateProof(stateProof);

            // 4. Submit update
            const tx = await this.lightClient.updateState(
                encoded.ledgerInfo,
                encoded.signatures,
                encoded.signerBitmask,
                encoded.epochChangeProof
            );

            await tx.wait();
            console.log(`Updated to version ${stateProof.version}`);
        } catch (error) {
            console.error("Sync failed:", error);
        }
    }

    encodeStateProof(proof: StateProof) {
        // Encode LedgerInfoWithSignatures
        const ledgerInfo = this.encodeLedgerInfo(proof.latest_li);
        const signatures = proof.latest_li.signatures;
        const signerBitmask = this.computeSignerBitmask(proof.latest_li);
        const epochChangeProof = this.encodeEpochChangeProof(proof.epoch_changes);

        return { ledgerInfo, signatures, signerBitmask, epochChangeProof };
    }
}
```

## Security Considerations

### 1. Initial Waypoint Security

The initial waypoint must be obtained from a trusted source:
- Multiple independent full nodes
- Social consensus (official announcements)
- Hardware security modules
- Multi-party computation

### 2. Validator Set Updates

- Epoch changes must be verified with proper chain of custody
- Old epochs should remain accessible for historical verification
- Monitor for rapid validator set changes (potential attack)

### 3. Replay Protection

- Track processed proofs to prevent replay attacks
- Use nonces or version numbers in bridge operations
- Implement time locks for large transfers

### 4. Economic Security

- Relayers need incentives (fees or subsidies)
- Consider optimistic verification with fraud proofs for lower costs
- Implement rate limiting on bridge operations

### 5. Gas Cost Management

- Batch multiple proof verifications
- Use optimistic verification for routine updates
- Consider ZK-SNARKs for production systems

## Testing

```bash
# Install dependencies
npm install

# Run tests
npx hardhat test

# Run coverage
npx hardhat coverage

# Deploy to testnet
npx hardhat run scripts/deploy.js --network sepolia
```

### Test Cases

```javascript
describe("AptosLightClient", function() {
    it("Should initialize with waypoint", async function() {
        // Test initialization
    });

    it("Should update state with valid proof", async function() {
        // Test state update
    });

    it("Should reject stale updates", async function() {
        // Test staleness check
    });

    it("Should handle epoch changes", async function() {
        // Test epoch transition
    });

    it("Should verify account state proofs", async function() {
        // Test state proof verification
    });

    it("Should verify transaction proofs", async function() {
        // Test transaction proof verification
    });
});

describe("AptosTokenBridge", function() {
    it("Should lock tokens", async function() {
        // Test token locking
    });

    it("Should unlock with valid burn proof", async function() {
        // Test unlocking
    });

    it("Should prevent replay attacks", async function() {
        // Test replay protection
    });
});
```

## Optimization Strategies

### 1. Optimistic Verification (Lower Gas)

```solidity
// Challenge-response system
contract OptimisticAptosLightClient {
    uint256 constant CHALLENGE_PERIOD = 1 days;

    function proposeUpdate(bytes32 newStateRoot) external payable {
        // Propose update with bond
        // Wait for challenge period
        // Finalize if no challenges
    }

    function challengeUpdate(bytes calldata fraudProof) external {
        // Submit fraud proof
        // Slash proposer if valid
    }
}
```

### 2. ZK-SNARK Compression (Best Security + Gas)

```solidity
contract ZKAptosLightClient {
    function updateWithZKProof(
        bytes calldata zkProof,
        uint256[] calldata publicInputs
    ) external {
        // Verify ZK proof of signature verification
        // Much cheaper than direct BLS verification
    }
}
```

## License

Apache-2.0

## References

- [Aptos Documentation](https://aptos.dev)
- [EIP-2537: BLS12-381 Precompiles](https://eips.ethereum.org/EIPS/eip-2537)
- [BLS Signatures](https://crypto.stanford.edu/~dabo/pubs/papers/BLSmultisig.html)
- [Sparse Merkle Trees](https://eprint.iacr.org/2016/683.pdf)
