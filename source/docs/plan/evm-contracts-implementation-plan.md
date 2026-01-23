# Atomica EVM Contracts Implementation Plan
## Cross-Chain Atomic Deposits with BLS State Proofs

---

## 1. Executive Summary

This document outlines a comprehensive implementation plan for EVM smart contracts that will power Atomica's cross-chain deposit system. The system enables users to deposit ETH and USDC, participate in an offline auction mechanism, and execute atomic trades based on BLS-aggregated state proofs verified on Ethereum.

### Key Components:
- **Deposit Contract**: Handles ETH/USDC deposits with commitment trees
- **State Commitment System**: Merkle tree-based state commitments for deposits
- **BLS Proof Verifier**: On-chain verification using EIP-2537 precompiles
- **Settlement Contract**: Atomic execution of transfers based on verified proofs
- **Off-Chain Services**: Auction execution and proof generation infrastructure

### Technology Stack:
- **Solidity 0.8.x** with Foundry for testing
- **BLS12-381** with **EIP-2537** precompiles for signature aggregation
- **Merkle Patricia Trees** for state commitments
- **OpenZeppelin** contracts for standard components

---

## 2. Architecture Overview

### 2.1 High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ATOMICA DEPOSIT SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │   ETH Depositors│    │  USDC Depositors│    │   Off-Chain Auction     │  │
│  │   (Sellers)     │    │   (Buyers)      │    │   Coordinator           │  │
│  └────────┬────────┘    └────────┬────────┘    └────────────┬────────────┘  │
│           │                      │                           │                │
│           └──────────────────────┼───────────────────────────┘                │
│                                  │                                          │
│                                  ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    EVM SMART CONTRACTS                               │   │
│  │                                                                      │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │  DepositBox    StateRoot    BLSVerifier    Settlement         │  │   │
│  │  │  (ETH/USDC)    (Merkle)    (EIP-2537)     (Trades)            │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │                    GOVERNANCE (Orthogonal)                    │  │   │
│  │  │                                                               │  │   │
│  │  │  ┌─────────────┐    ┌─────────────────────────────────────┐  │  │   │
│  │  │  │  genesis()  │    │  brick()                            │  │  │   │
│  │  │  │  - Initialize│    │  - Emergency shutdown               │  │  │   │
│  │  │  │  - Link addrs│    │  - Refund depositors                │  │  │   │
│  │  │  └─────────────┘    │  - One-way, cannot be undone        │  │  │   │
│  │  │                      └─────────────────────────────────────┘  │  │   │
│  │  │                                                               │  │   │
│  │  │  NOTE: BLSVerifier has NO knowledge of governance            │  │   │
│  │  │        Governance is ORTHOGONAL to core contracts             │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │                                                                      │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
│                                     │                                        │
│  ┌──────────────────────────────────┼───────────────────────────────────┐   │
│  │                                  ▼                                     │   │
│  │  ┌────────────────────────────────────────────────────────────────┐  │   │
│  │  │              EPOCH BOUNDARY PROOF FLOW                         │  │   │
│  │  │                                                             │  │   │
│  │  │   Atomica Validators ──sign(epoch+N, newKeys)──► BLSVerifier │  │   │
│  │  │                                                             │  │   │
│  │  └────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  IMPORTANT: Contracts are NOT upgradeable                                    │
│  - NO proxy patterns                                                        │
│  - NO governance that changes logic                                          │
│  - ONLY brick() for emergency fund recovery                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Contract Hierarchy

```
AtomicaController (Facade)
├── DepositBox (ETH + USDC deposits)
│   ├── ETHVault
│   └── USDCVault
├── StateCommitment (Merkle tree management)
│   └── IncrementalMerkleTree
├── BLSVerifier (EIP-2537 BLS verification)
│   └── Uses 0x09 (G1MultiExp) + 0x0c (pairing)
├── Settlement (Proof verification + transfers)
│   └── TransferManager
└── Governance (Emergency fail-safe, orthogonal to core contracts)
    ├── genesis() - Initialize system (one-time)
    └── brick() - Emergency shutdown (one-way)
```

---

## 3. Deposit Contract Design

### 3.1 Core Data Structures

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DepositTypes
 * @notice Core data structures for deposits and commitments
 */
library DepositTypes {
    /**
     * @notice Deposit status lifecycle
     */
    enum DepositStatus {
        PENDING,      // Deposit made, waiting for auction start
        CONFIRMED,    // Deposit confirmed by validators
        TRADING,      // Auction in progress
        SETTLED,      // Trade executed successfully
        REFUNDED      // Trade failed, deposit returned
    }

    /**
     * @notice Asset type for deposits
     */
    enum AssetType {
        ETH,
        USDC
    }

    /**
     * @notice Core deposit structure
     * @param depositor User's Ethereum address
     * @param assetType Type of asset deposited
     * @param amount Deposit amount (in wei for ETH, decimals for USDC)
     * @param nonce Unique deposit identifier
     * @param commitment Hash commitment for privacy
     * @param status Current deposit status
     * @param timestamp Deposit creation time
     */
    struct Deposit {
        address depositor;
        AssetType assetType;
        uint256 amount;
        uint256 nonce;
        bytes32 commitment;
        DepositStatus status;
        uint256 timestamp;
    }

    /**
     * @notice Auction parameters
     * @param startTime When auction begins
     * @param duration How long auction runs
     * @param minPrice Minimum acceptable ETH/USDC ratio
     * @param maxPrice Maximum acceptable ETH/USDC ratio
     * @param totalEthDeposits Sum of ETH deposits
     * @param totalUsdcDeposits Sum of USDC deposits
      * @param finalized Whether auction results are finalized
     */
    struct AuctionParams {
        uint256 startTime;
        uint256 duration;
        uint256 minPrice;
        uint256 maxPrice;
        uint256 totalEthDeposits;
        uint256 totalUsdcDeposits;
        bool finalized;
    }

    /**
     * @notice Auction metadata for identification and deadlines
     * @param nonce Monotonically increasing auction identifier
     * @param description Human-readable auction description (e.g., "west-daily-btc-eth")
     * @param deadline Unix timestamp in microseconds when auction ends
     * @param scuttleBlock Ethereum block height where auction automatically scuttles
     * @param stateRootHash BLS-signed state root containing this metadata
     */
    struct AuctionMetadata {
        uint64 nonce;
        string description;
        uint64 deadline;      // Unix microseconds
        uint256 scuttleBlock; // Ethereum block height
        bytes32 stateRootHash; // BLS-signed state proof
    }

    /**
     * @notice Trade execution results
     * @param clearingPrice Final ETH/USDC price
     * @param ethToTrade Amount of ETH to trade
     * @param usdcToTrade Amount of USDC to trade
     * @param merkleRoot Root of the trade allocation tree
     */
    struct TradeResult {
        uint256 clearingPrice;
        uint256 ethToTrade;
        uint256 usdcToTrade;
        bytes32 merkleRoot;
    }
}
```

### 3.2 DepositBox Contract

```solidity
/**
 * @title DepositBox
 * @notice Main contract for handling ETH and USDC deposits
 * @dev Implements commitment-based deposits with Merkle tree integration
 */
contract DepositBox is ReentrancyGuard, Ownable {
    using DepositTypes for DepositTypes.Deposit;
    using DepositTypes for DepositTypes.DepositStatus;
    using DepositTypes for DepositTypes.AssetType;

    // State variables
    IERC20 public immutable usdcToken;
    uint256 public constant DEPOSIT_TIMEOUT = 7 days;
    uint256 public constant AUCTION_BUFFER = 1 hours;
    
    mapping(bytes32 => DepositTypes.Deposit) public deposits;
    mapping(address => uint256[]) public depositorNonces;
    mapping(DepositTypes.AssetType => uint256) public totalDeposits;
    mapping(bytes32 => bool) public commitmentUsed;
    
    uint256 public depositNonceCounter;
    bytes32 public latestStateRoot;
    uint256 public lastDepositBlock;
    
    // Events
    event ETHDeposited(
        address indexed depositor,
        uint256 amount,
        bytes32 indexed commitment,
        uint256 nonce
    );
    
    event USDCDeposited(
        address indexed depositor,
        uint256 amount,
        bytes32 indexed commitment,
        uint256 nonce
    );
    
    event DepositConfirmed(
        bytes32 indexed commitment,
        bytes32 stateRoot
    );
    
    event DepositRefunded(
        address indexed depositor,
        uint256 amount,
        DepositTypes.AssetType assetType,
        uint256 nonce
    );

    /**
     * @notice Constructor
     * @param usdcTokenAddress USDC token contract address
     */
    constructor(address usdcTokenAddress) {
        require(usdcTokenAddress != address(0), "Invalid USDC address");
        usdcToken = IERC20(usdcTokenAddress);
        depositNonceCounter = 1;
    }

    /**
     * @notice Deposit ETH with commitment
     * @param commitment Hash commitment for privacy (blinded deposit info)
     */
    function depositETH(bytes32 commitment) external payable nonReentrant {
        require(msg.value > 0, "Must deposit positive amount");
        require(commitment != bytes32(0), "Invalid commitment");
        require(!commitmentUsed[commitment], "Commitment already used");
        
        uint256 nonce = _generateNonce();
        bytes32 depositHash = _computeDepositHash(
            msg.sender,
            DepositTypes.AssetType.ETH,
            msg.value,
            nonce,
            commitment
        );
        
        deposits[depositHash] = DepositTypes.Deposit({
            depositor: msg.sender,
            assetType: DepositTypes.AssetType.ETH,
            amount: msg.value,
            nonce: nonce,
            commitment: commitment,
            status: DepositTypes.DepositStatus.PENDING,
            timestamp: block.timestamp
        });
        
        depositorNonces[msg.sender].push(nonce);
        commitmentUsed[commitment] = true;
        totalDeposits[DepositTypes.AssetType.ETH] += msg.value;
        
        emit ETHDeposited(msg.sender, msg.value, commitment, nonce);
    }

    /**
     * @notice Deposit USDC with commitment
     * @param amount Amount of USDC to deposit
     * @param commitment Hash commitment for privacy
     */
    function depositUSDC(uint256 amount, bytes32 commitment) 
        external 
        nonReentrant 
    {
        require(amount > 0, "Must deposit positive amount");
        require(commitment != bytes32(0), "Invalid commitment");
        require(!commitmentUsed[commitment], "Commitment already used");
        
        uint256 nonce = _generateNonce();
        bytes32 depositHash = _computeDepositHash(
            msg.sender,
            DepositTypes.AssetType.USDC,
            amount,
            nonce,
            commitment
        );
        
        deposits[depositHash] = DepositTypes.Deposit({
            depositor: msg.sender,
            assetType: DepositTypes.AssetType.USDC,
            amount: amount,
            nonce: nonce,
            commitment: commitment,
            status: DepositTypes.DepositStatus.PENDING,
            timestamp: block.timestamp
        });
        
        depositorNonces[msg.sender].push(nonce);
        commitmentUsed[commitment] = true;
        totalDeposits[DepositTypes.AssetType.USUC] += amount;
        
        require(
            usdcToken.transferFrom(msg.sender, address(this), amount),
            "USDC transfer failed"
        );
        
        emit USDCDeposited(msg.sender, amount, commitment, nonce);
    }

    /**
     * @notice Batch confirm deposits (called by validator coordinator)
     * @param commitments Array of deposit commitments to confirm
     * @param newStateRoot New Merkle root after deposits
     */
    function confirmDeposits(
        bytes32[] calldata commitments,
        bytes32 newStateRoot
    ) external onlyOwner {
        for (uint256 i = 0; i < commitments.length; i++) {
            bytes32 commitment = commitments[i];
            require(commitmentUsed[commitment], "Unknown commitment");
            
            DepositTypes.Deposit storage deposit = deposits[
                _computeDepositHashFromCommitment(commitment)
            ];
            
            require(
                deposit.status == DepositTypes.DepositStatus.PENDING,
                "Deposit not pending"
            );
            
            deposit.status = DepositTypes.DepositStatus.CONFIRMED;
            
            emit DepositConfirmed(commitment, newStateRoot);
        }
        
        latestStateRoot = newStateRoot;
        lastDepositBlock = block.number;
    }

    /**
     * @notice Refund deposit after timeout
     * @param depositor Depositor address
     * @param nonce Deposit nonce
     */
    function refundDeposit(address depositor, uint256 nonce) external nonReentrant {
        bytes32 depositHash = _computeDepositHash(
            depositor,
            DepositTypes.AssetType.ETH, // Will be looked up
            0,
            nonce,
            bytes32(0)
        );
        
        DepositTypes.Deposit storage deposit = deposits[depositHash];
        require(
            deposit.depositor == msg.sender,
            "Not deposit owner"
        );
        require(
            deposit.status == DepositTypes.DepositStatus.PENDING,
            "Deposit not pending"
        );
        require(
            block.timestamp > deposit.timestamp + DEPOSIT_TIMEOUT,
            "Deposit not timed out"
        );
        
        deposit.status = DepositTypes.DepositStatus.REFUNDED;
        
        if (deposit.assetType == DepositTypes.AssetType.ETH) {
            (bool success, ) = msg.sender.call{value: deposit.amount}("");
            require(success, "ETH refund failed");
        } else {
            require(
                usdcToken.transfer(msg.sender, deposit.amount),
                "USDC refund failed"
            );
        }
        
        emit RefundDeposited(
            msg.sender,
            deposit.amount,
            deposit.assetType,
            nonce
        );
    }

    // Internal helper functions
    function _generateNonce() internal returns (uint256) {
        return depositNonceCounter++;
    }

    function _computeDepositHash(
        address depositor,
        DepositTypes.AssetType assetType,
        uint256 amount,
        uint256 nonce,
        bytes32 commitment
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            depositor,
            assetType,
            amount,
            nonce,
            commitment
        ));
    }

    function _computeDepositHashFromCommitment(bytes32 commitment) 
        internal pure returns (bytes32) 
    {
        // Implementation depends on commitment scheme
        return keccak256(abi.encodePacked(commitment));
    }
}
```

### 3.3 ETH Vault Implementation

```solidity
/**
 * @title ETHVault
 * @notice Secure vault for handling ETH deposits with reentrancy protection
 */
contract ETHVault is ReentrancyGuard {
    receive() external payable {
        require(msg.sender == address(0), "No direct ETH");
    }

    /**
     * @notice Withdraw ETH to a recipient
     * @param recipient Address to receive ETH
     * @param amount Amount to withdraw
     */
    function withdraw(address recipient, uint256 amount) 
        internal 
        nonReentrant 
    {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be positive");
        
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal failed");
    }

    /**
     * @notice Get contract ETH balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
```

---

## 4. State Commitment System

### 4.1 Merkle Tree Implementation

```solidity
/**
 * @title IncrementalMerkleTree
 * @notice Incremental Merkle tree for efficient deposit commitment
 */
contract IncrementalMerkleTree is Ownable {
    uint8 public constant TREE_HEIGHT = 32;
    uint256 public constant MAX_LEAVES = 2**TREE_HEIGHT;
    
    bytes32[TREE_HEIGHT] public branch;
    uint256 public leafCount;
    bytes32 public root;
    uint256 public lastUpdatedBlock;

    event LeafAdded(bytes32 leaf, uint256 index, bytes32 newRoot);
    event TreeReset(bytes32 newRoot);

    constructor() {
        branch[TREE_HEIGHT - 1] = bytes32(0);
        root = bytes32(0);
        leafCount = 0;
    }

    /**
     * @notice Insert a new leaf into the Merkle tree
     * @param leaf The leaf value to insert
     * @return index The index of the inserted leaf
     * @return newRoot The new Merkle root after insertion
     */
    function insert(bytes32 leaf) external onlyOwner returns (uint256 index, bytes32 newRoot) {
        require(leafCount < MAX_LEAVES, "Tree is full");
        require(leaf != bytes32(0), "Leaf cannot be zero");
        
        index = leafCount;
        bytes32 currentHash = leaf;
        
        // Update leaf
        for (uint8 i = 0; i < TREE_HEIGHT; i++) {
            uint256 branchBit = (index >> i) & 1;
            bytes32 siblingHash = branch[i];
            
            if (branchBit == 0) {
                currentHash = _hashPair(currentHash, siblingHash);
            } else {
                currentHash = _hashPair(siblingHash, currentHash);
            }
            
            branch[i] = currentHash;
        }
        
        root = currentHash;
        leafCount++;
        lastUpdatedBlock = block.number;
        
        emit LeafAdded(leaf, index, newRoot);
    }

    /**
     * @notice Insert multiple leaves in batch
     * @param leaves Array of leaves to insert
     */
    function batchInsert(bytes32[] calldata leaves) external onlyOwner {
        for (uint256 i = 0; i < leaves.length; i++) {
            insert(leaves[i]);
        }
    }

    /**
     * @notice Verify a Merkle proof
     * @param leaf The leaf to verify
     * @param proof The Merkle proof
     * @param root The expected root
     * @return Whether the proof is valid
     */
    function verify(
        bytes32 leaf,
        bytes32[] calldata proof,
        bytes32 root
    ) external pure returns (bool) {
        bytes32 computedHash = leaf;
        
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            
            if (computedHash < proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        
        return computedHash == root;
    }

    /**
     * @notice Get current tree state for proof generation
     */
    function getState() external view returns (
        bytes32 currentRoot,
        uint256 currentLeafCount,
        bytes32[TREE_HEIGHT] memory currentBranch
    ) {
        return (root, leafCount, branch);
    }

    /**
     * @notice Compute hash pair for Merkle tree
     */
    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        if (a < b) {
            return keccak256(abi.encodePacked(a, b));
        }
        return keccak256(abi.encodePacked(b, a));
    }
}
```

### 4.2 StateRoot Contract

```solidity
/**
 * @title StateRoot
 * @notice Manages state roots and their lifecycle
 */
contract StateRoot is Ownable {
    bytes32 public currentStateRoot;
    uint256 public stateRootBlockNumber;
    uint256 public constant STATE_ROOT_TIMEOUT = 1 hours;
    
    mapping(bytes32 => bool) public validStateRoots;
    bytes32[] public stateRootHistory;

    event StateRootUpdated(bytes32 indexed oldRoot, bytes32 indexed newRoot, uint256 blockNumber);
    event StateRootExpired(bytes32 indexed root);

    /**
     * @notice Update the current state root
     * @param newRoot The new state root
     */
    function updateStateRoot(bytes32 newRoot) external onlyOwner {
        require(newRoot != bytes32(0), "Invalid state root");
        
        bytes32 oldRoot = currentStateRoot;
        currentStateRoot = newRoot;
        stateRootBlockNumber = block.number;
        
        validStateRoots[newRoot] = true;
        stateRootHistory.push(newRoot);
        
        emit StateRootUpdated(oldRoot, newRoot, block.number);
    }

    /**
     * @notice Check if a state root is valid and recent
     * @param root The state root to check
     * @return Whether the state root is valid
     */
    function isValidStateRoot(bytes32 root) external view returns (bool) {
        return validStateRoots[root] && 
               block.number - stateRootBlockNumber < STATE_ROOT_TIMEOUT;
    }

    /**
     * @notice Get state root history length
     */
    function getHistoryLength() external view returns (uint256) {
        return stateRootHistory.length;
    }
}
```

---

## 5. BLS Proof Verification Contract

### 5.1 EIP-2537 Precompiles

The BLSVerifier uses Ethereum's native EIP-2537 precompiles for efficient BLS signature verification:

| Address | Precompile | Purpose |
|---------|------------|---------|
| `0x09` | `bls12381G1MultiExp` | Aggregate public keys |
| `0x0c` | `bls12381Pairing` | Verify pairing equation |

This approach avoids implementing elliptic curve math in Solidity, using battle-tested native code instead.

### 5.2 BLS Verifier Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title BLSVerifier
 * @notice Verifies BLS aggregated signatures for state proofs
 * @dev Uses EIP-2537 precompiles (0x09 for aggregation, 0x0c for pairing)
 */
contract BLSVerifier {
    bytes[] public trustedPubkeys;
    uint64 public currentEpoch;
    uint256 public constant SIGNATURE_EXPIRY = 1 hours;
    mapping(bytes32 => bool) public verifiedStateRoots;
    mapping(bytes32 => uint256) public stateRootExpiry;

    event StateRootVerified(bytes32 indexed stateRoot, uint256 timestamp);
    event VerificationFailed(string reason);
    event ValidatorSetUpdated(uint64 indexed epoch, uint256 validatorCount);

    modifier onlyInitialized() {
        require(trustedPubkeys.length > 0, "BLS: not initialized");
        _;
    }

    function initialize(bytes[] calldata genesisPubkeys) external {
        require(trustedPubkeys.length == 0, "BLS: already initialized");
        require(genesisPubkeys.length > 0, "BLS: no validators");
        trustedPubkeys = genesisPubkeys;
        currentEpoch = 0;
        emit ValidatorSetUpdated(0, genesisPubkeys.length);
    }

    function verifyStateProof(
        bytes32 stateRoot,
        bytes calldata signature,
        uint256[] calldata validatorIndices
    ) external onlyInitialized returns (bool) {
        require(stateRoot != bytes32(0), "BLS: invalid state root");
        require(signature.length == 48, "BLS: invalid signature length");
        require(validatorIndices.length > 0, "BLS: no validators");

        bytes32 messageHash = keccak256(abi.encodePacked(
            "ATOMICA_STATE_PROOF",
            stateRoot,
            block.chainid
        ));

        bool isValid = _verifyAggregatedSignature(
            trustedPubkeys,
            signature,
            messageHash,
            validatorIndices
        );

        if (isValid) {
            verifiedStateRoots[stateRoot] = true;
            stateRootExpiry[stateRoot] = block.timestamp + SIGNATURE_EXPIRY;
            emit StateRootVerified(stateRoot, block.timestamp);
        } else {
            emit VerificationFailed("BLS: signature verification failed");
        }

        return isValid;
    }

    function updateValidatorSet(
        bytes[] calldata newPubkeys,
        uint64 newEpoch,
        bytes calldata signature,
        uint256[] calldata validatorIndices
    ) external onlyInitialized returns (bool) {
        require(newEpoch > currentEpoch, "BLS: epoch must increase");
        require(newPubkeys.length > 0, "BLS: must have validators");
        require(signature.length == 48, "BLS: invalid signature length");

        bytes32 messageHash = keccak256(abi.encodePacked(
            "ATOMICA_VALIDATOR_UPDATE",
            newEpoch,
            keccak256(abi.encodePacked(newPubkeys)),
            block.chainid
        ));

        bool isValid = _verifyAggregatedSignature(
            trustedPubkeys,
            signature,
            messageHash,
            validatorIndices
        );

        require(isValid, "BLS: invalid validator update signature");

        trustedPubkeys = newPubkeys;
        currentEpoch = newEpoch;
        emit ValidatorSetUpdated(newEpoch, newPubkeys.length);

        return true;
    }

    function isStateRootValid(bytes32 stateRoot) external view returns (bool) {
        return verifiedStateRoots[stateRoot] &&
               block.timestamp < stateRootExpiry[stateRoot];
    }

    function getValidatorCount() external view returns (uint256) {
        return trustedPubkeys.length;
    }

    function _verifyAggregatedSignature(
        bytes[] calldata pubkeys,
        bytes calldata signature,
        bytes32 messageHash,
        uint256[] calldata validatorIndices
    ) internal view returns (bool) {
        require(validatorIndices.length <= pubkeys.length, "BLS: too many validators");

        bytes memory aggPubkey = _aggregatePublicKeys(pubkeys, validatorIndices);

        (bool success, bytes memory result) = address(0x0c).staticcall(
            abi.encodePacked(signature, aggPubkey, messageHash)
        );

        return success && result.length == 32 && result[31] != 0;
    }

    function _aggregatePublicKeys(
        bytes[] calldata pubkeys,
        uint256[] calldata indices
    ) internal pure returns (bytes memory) {
        require(indices.length > 0, "BLS: no validators");
        bytes memory agg = pubkeys[indices[0]];
        
        for (uint256 i = 1; i < indices.length; i++) {
            require(indices[i] < pubkeys.length, "BLS: invalid validator index");
            (bool success, bytes memory result) = address(0x09).staticcall(
                abi.encodePacked(agg, pubkeys[indices[i]])
            );
            require(success, "BLS: pubkey aggregation failed");
            agg = result;
        }
        
        return agg;
    }
}

### 5.3 Validator Set Management

Atomica chain validators sign epoch boundaries containing the new validator set. This allows the EVM contract to trustlessly update its trusted validator keys.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VALIDATOR SET UPDATE FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. INITIAL DEPLOYMENT                                                       │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Deploy BLSVerifier with initial trusted validator set          │     │
│     │  Genesis proof verified OFF-CHAIN (trusted at deployment)       │     │
│     │  = Trusted setup                                                  │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                          │
│                                    ▼                                          │
│  2. EPOCH CHANGE (On-Chain Update)                                           │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Atomica validators sign:                                        │     │
│     │  - Epoch N state root                                            │     │
│     │  - Epoch N+1 validator set (new BLS public keys)                 │     │
│     │  - Aggregated BLS signature                                      │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                          │
│                                    ▼                                          │
│  3. PROOF SUBMISSION                                                         │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  submitValidatorUpdate(                                         │     │
│     │      newPubkeys,        // Incoming validator BLS keys           │     │
│     │      signature,         // BLS signature from current validators │     │
│     │      validatorIndices   // Which validators signed               │     │
│     │  )                                                                 │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                          │
│                                    ▼                                          │
│  4. ON-CHAIN VERIFICATION                                                    │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  verifyAggregatedSignature(                                     │     │
│     │      trustedPubkeys,       // CURRENT trusted keys              │     │
│     │      signature,             // Signature over new set            │     │
│     │      messageHash,           // Hash of new validator set         │     │
│     │      validatorIndices       // Signers of the update             │     │
│     │  )                                                                 │     │
│     │                                                                    │     │
│     │  IF valid: Update trustedPubkeys = newPubkeys                   │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Trust Model:**
- Genesis validator set: Trusted at deployment (off-chain verification required)
- Subsequent updates: Cryptographically verified using CURRENT trusted keys

```

The BLSVerifier contract is implemented at `source/evm-contracts/src/BLSVerifier.sol`.

### 5.4 Governance and Emergency Bricking

**IMPORTANT: Contracts are NOT upgradeable**

The Atomica system has NO:
- Proxy patterns or delegatecall-based upgrades
- Governance that can modify contract logic
- Admin keys that can change critical parameters

The ONLY exception is the **Governance** contract which provides emergency fail-safe capabilities.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GOVERNANCE & BRICKING ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        GOVERNANCE CONTRACT                            │   │
│  │                                                                       │   │
│  │  ┌─────────────────┐                                                 │   │
│  │  │  genesis()      │  ← Initialize with assumed-good state          │   │
│  │  │                 │    - Links to all system contracts              │   │
│  │  │  - Validates    │    - Sets up proper initial state              │   │
│  │  │    initial params│                                                 │   │
│  │  └─────────────────┘                                                 │   │
│  │                                                                       │   │
│  │  ┌─────────────────┐                                                 │   │
│  │  │  brick()        │  ← Emergency shutdown (ONE-WAY)                │   │
│  │  │                 │    - Terminates all contracts                   │   │
│  │  │  - Refunds all  │    - Returns funds to depositors               │   │
│  │  │    depositors   │    - Neuters contract state                     │   │
│  │  │  - Neuters      │    - Cannot be undone                          │   │
│  │  │    contract     │                                                 │   │
│  │  └─────────────────┘                                                 │   │
│  │                                                                       │   │
│  │  Once brick() is called:                                             │   │
│  │  - No new deposits accepted                                          │   │
│  │  - All pending deposits refunded                                     │   │
│  │  - Contract state neutralized                                        │   │
│  │  - Migration path: new contract at different address                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    SYSTEM CONTRACTS (ORTHOGONAL)                     │   │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ DepositBox  │  │ BLSVerifier │  │ Settlement  │  │ TransferMgr │  │   │
│  │  │             │  │             │  │             │  │             │  │   │
│  │  │  - Receive  │  │  - Verify   │  │  - Execute  │  │  - Handle   │  │   │
│  │  │    deposits │  │    BLS sigs │  │    trades   │  │    transfers│  │   │
│  │  │             │  │             │  │             │  │             │  │   │
│  │  │  NO upgrade │  │  NO upgrade │  │  NO upgrade │  │  NO upgrade │  │   │
│  │  │  NO admin   │  │  NO admin   │  │  NO admin   │  │  NO admin   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │                                                                       │   │
│  │  These contracts:                                                     │   │
│  │  - Have NO knowledge of governance                                    │   │
│  │  - Run their own logic independently                                  │   │
│  │  - Can check with Governance for brick state                          │   │
│  │  - Cannot be upgraded                                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why Bricking is Separate:**
1. **Orthogonality**: BLS verification has nothing to do with fund recovery
2. **Separation of concerns**: Signature verification ≠ emergency shutdown
3. **Simplicity**: Each contract has a single responsibility
4. **Safety**: Governance is the only entry point for emergency actions

```solidity
/**
 * @title Governance
 * @notice Emergency governance contract for Atomica system
 * @dev ONLY has genesis() and brick() functions. No other governance.
 */
contract Governance {
    // System contracts
    address public depositBox;
    address public blsVerifier;
    address public settlement;
    address public transferManager;
    
    // State
    bool public initialized;
    bool public bricked;
    
    // Admin
    address public admin;
    
    // Events
    event Initialized(
        address depositBox,
        address blsVerifier,
        address settlement,
        address transferManager
    );
    
    event ContractBricked(uint256 timestamp);
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }
    
    modifier notBricked() {
        require(!bricked, "Contract is bricked");
        _;
    }
    
    /**
     * @notice Initialize the system with assumed-good state
     * @dev Called once to link all system contracts
     * @param _depositBox DepositBox contract address
     * @param _blsVerifier BLSVerifier contract address
     * @param _settlement Settlement contract address
     * @param _transferManager TransferManager contract address
     */
    function genesis(
        address _depositBox,
        address _blsVerifier,
        address _settlement,
        address _transferManager
    ) external onlyAdmin {
        require(!initialized, "Already initialized");
        require(!bricked, "Contract is bricked");
        require(_depositBox != address(0), "Invalid DepositBox");
        require(_blsVerifier != address(0), "Invalid BLSVerifier");
        require(_settlement != address(0), "Invalid Settlement");
        require(_transferManager != address(0), "Invalid TransferManager");
        
        depositBox = _depositBox;
        blsVerifier = _blsVerifier;
        settlement = _settlement;
        transferManager = _transferManager;
        
        initialized = true;
        
        emit Initialized(
            _depositBox,
            _blsVerifier,
            _settlement,
            _transferManager
        );
    }
    
    /**
     * @notice BRICK the contract - emergency shutdown (ONE-WAY OPERATION)
     * @dev This function:
     *      - Terminates all contract functionality
     *      - Refunds all depositors
     *      - Neutralizes the contract state
     *      - CANNOT be undone
     *      - Used when migrating to a new contract deployment
     */
    function brick() external onlyAdmin {
        require(!bricked, "Already bricked");
        require(initialized, "Not initialized");
        
        bricked = true;
        
        // 1. Refund all pending deposits
        IDepositBox(depositBox).refundAllDeposits();
        
        // 2. Settlement contracts can no longer execute trades
        ISettlement(settlement).neutralize();
        
        // 3. Any remaining funds in system are handled per design
        
        emit ContractBricked(block.timestamp);
    }
    
    /**
     * @notice Check if system is operational
     */
    function isOperational() external view returns (bool) {
        return initialized && !bricked;
    }
}
```

**Contract Interactions After Bricking:**
```solidity
// Example: DepositBox checks Governance before accepting deposits
contract DepositBox {
    address public governance;
    
    function depositETH(bytes32 commitment) external payable notPaused {
        require(IGovernance(governance).isOperational(), "System not operational");
        // ... normal deposit logic
    }
}
```

**Bricking Workflow:**
1. Critical issue discovered in contract logic
2. Admin calls `Governance.brick()`
3. All depositors refunded via `DepositBox.refundAllDeposits()`
4. Settlement contract neutralized (no more trades)
5. System is now "dead"
6. Users migrate to NEW contract at different address
7. NO attempt to upgrade old contract (immutable!)

**Key Points:**
- **NO upgradability** - Code is immutable after deployment
- **NO governance** - Authors cannot change contract behavior
- **genesis()** - One-time initialization linking all contracts
- **brick()** - One-way emergency shutdown for fund recovery
- **Migration path** - New contract deployment at different address
- **Orthogonal design** - BLSVerifier has no knowledge of governance
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VALIDATOR SET UPDATE FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. INITIAL DEPLOYMENT                                                       │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Deploy BLSVerifier with initial trusted validator set          │     │
│     │  Genesis proof verified OFF-CHAIN (trusted at deployment)       │     │
│     │  = Trusted setup                                                  │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                          │
│                                    ▼                                          │
│  2. EPOCH CHANGE (On-Chain Update)                                           │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Atomica validators sign:                                        │     │
│     │  - Epoch N state root                                            │     │
│     │  - Epoch N+1 validator set (new BLS public keys)                 │     │
│     │  - Aggregated BLS signature                                      │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                          │
│                                    ▼                                          │
│  3. PROOF SUBMISSION                                                         │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  submitValidatorUpdate(                                         │     │
│     │      newPubkeys,        // Incoming validator BLS keys           │     │
│     │      signature,         // BLS signature from current validators │     │
│     │      validatorIndices   // Which validators signed               │     │
│     │  )                                                                 │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                          │
│                                    ▼                                          │
│  4. ON-CHAIN VERIFICATION                                                    │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  verifyAggregatedSignature(                                     │     │
│     │      trustedPubkeys,       // CURRENT trusted keys              │     │
│     │      signature,             // Signature over new set            │     │
│     │      messageHash,           // Hash of new validator set         │     │
│     │      validatorIndices       // Signers of the update             │     │
│     │  )                                                                 │     │
│     │                                                                    │     │
│     │  IF valid: Update trustedPubkeys = newPubkeys                   │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Trust Model:**
- Genesis validator set: Trusted at deployment (off-chain verification required)
- Subsequent updates: Cryptographically verified using CURRENT trusted keys
- No governance or admin can modify contract logic
- NO upgradability - code is immutable after deployment

**Bricking (Emergency Fail-Safe):**
- Only mechanism to "change" contract behavior
- One-way operation that BREAKS the contract
- Returns all locked assets to depositors
- Used when a critical issue requires contract migration to new address
- No shared code paths with normal operation
- After bricking, all deposits are refunded and contract is disabled

```solidity
/**
 * @title BLSVerifier
 * @notice Verifies BLS aggregated signatures for state proofs
 * @dev Orthogonal to governance. Pure signature verification logic.
 */
contract BLSVerifier {
    // Trusted validator BLS public keys (G2 points)
    bytes[] public trustedPubkeys;
    
    // Epoch tracking
    uint64 public currentEpoch;
    
    // Brick state
    bool public isBricked;
    
    // Bricking admin (single address, no multisig for simplicity)
    address public brickAdmin;
    
    event ValidatorSetUpdated(uint64 indexed epoch, uint256 validatorCount);
    event ContractBricked(uint256 timestamp, uint256 ethBalance, uint256 usdcBalance);
    
    /**
     * @notice Initialize with genesis validator set
     * @param genesisPubkeys Initial trusted validator BLS public keys
     * @param _brickAdmin Admin who can brick the contract
     */
    function initialize(
        bytes[] calldata genesisPubkeys,
        address _brickAdmin
    ) external {
        require(trustedPubkeys.length == 0, "Already initialized");
        require(_brickAdmin != address(0), "Invalid admin");
        
        trustedPubkeys = genesisPubkeys;
        brickAdmin = _brickAdmin;
        currentEpoch = 0;
        isBricked = false;
        
        emit ValidatorSetUpdated(0, genesisPubkeys.length);
    }
    
    /**
     * @notice Update validator set for new epoch
     * @dev Verifies current validators signed the new validator set
     * @param newPubkeys New validator BLS public keys
     * @param newEpoch The epoch these keys become active
     * @param signature BLS signature over the new validator set
     * @param validatorIndices Indices of validators who signed
     */
    function updateValidatorSet(
        bytes[] calldata newPubkeys,
        uint64 newEpoch,
        bytes calldata signature,
        uint256[] calldata validatorIndices
    ) external {
        require(!isBricked, "Contract is bricked");
        require(newEpoch > currentEpoch, "Epoch must increase");
        require(newPubkeys.length > 0, "Must have validators");
        require(signature.length == 48, "Invalid signature length");
        
        // Create message: new epoch + hash of new pubkeys
        bytes32 messageHash = keccak256(abi.encodePacked(
            "ATOMICA_VALIDATOR_UPDATE",
            newEpoch,
            keccak256(abi.encodePacked(newPubkeys)),
            block.chainid
        ));
        
        // Verify signature from CURRENT trusted validators
        bool isValid = verifyAggregatedSignature(
            trustedPubkeys,
            signature,
            messageHash,
            validatorIndices
        );
        
        require(isValid, "Invalid validator update signature");
        
        // Update trusted keys
        trustedPubkeys = newPubkeys;
        currentEpoch = newEpoch;
        
        emit ValidatorSetUpdated(newEpoch, newPubkeys.length);
    }
    
    /**
     * @notice Get current validator count
     */
    function getValidatorCount() external view returns (uint256) {
        return trustedPubkeys.length;
    }
}
```

**Validator Public Key Format:**
- BLS12-381 G2 point compressed format (48 bytes)
- First byte: sign bit (0x80 for positive y)
- Remaining 47 bytes: x-coordinate big-endian

**Update Message Format:**
```
keccak256(
    "ATOMICA_VALIDATOR_UPDATE" ||
    newEpoch (uint64) ||
    keccak256(newPubkeys) (bytes32) ||
    chainId (uint256)
)
```

---

### 5.4 Simplified Governance

Governance has a single responsibility: initialize the system with the correct starting nonce from Atomica, and provide emergency bricking capability. BLS public keys are trusted at genesis.

```solidity
/**
 * @title Governance
 * @notice Simple governance for initialization and emergency shutdown
 * @dev BLS public keys are TRUSTED at genesis. Only nonce is verified.
 */
contract Governance {
    // System contracts
    address public depositBox;
    address public blsVerifier;
    address public settlement;
    address public auctionRegistry;
    
    // State
    bool public initialized;
    bool public bricked;
    
    // Admin for bricking
    address public admin;
    
    // Initial nonce from Atomica (proven at genesis)
    uint64 public initialAuctionNonce;
    
    // Events
    event Initialized(
        uint64 initialNonce,
        address depositBox,
        address blsVerifier,
        address settlement,
        address auctionRegistry
    );
    event ContractBricked(uint256 timestamp);
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }
    
    modifier notInitialized() {
        require(!initialized, "Already initialized");
        _;
    }
    
    /**
     * @notice Initialize system with trusted BLS keys and starting nonce
     * @dev BLS public keys are TRUSTED at deployment. Only nonce comes from proof.
     * @param _blsVerifier BLSVerifier with trusted public keys already set
     * @param _initialNonce Starting auction nonce from Atomica state proof
     */
    function genesis(
        address _blsVerifier,
        uint64 _initialNonce
    ) external notInitialized {
        require(_blsVerifier != address(0), "Invalid BLSVerifier");
        require(_initialNonce > 0, "Invalid initial nonce");
        
        // BLS keys in BLSVerifier are TRUSTED at genesis
        // We only verify the starting nonce came from Atomica
        // This is done OFF-CHAIN: verify Atomica state proof contains _initialNonce
        
        blsVerifier = _blsVerifier;
        initialAuctionNonce = _initialNonce;
        initialized = true;
        
        emit Initialized(
            _initialNonce,
            depositBox,
            _blsVerifier,
            settlement,
            auctionRegistry
        );
    }
    
    /**
     * @notice Set system contracts (after genesis)
     */
    function setSystemContracts(
        address _depositBox,
        address _settlement,
        address _auctionRegistry
    ) external onlyAdmin notInitialized {
        require(_depositBox != address(0), "Invalid DepositBox");
        require(_settlement != address(0), "Invalid Settlement");
        require(_auctionRegistry != address(0), "Invalid AuctionRegistry");
        
        depositBox = _depositBox;
        settlement = _settlement;
        auctionRegistry = _auctionRegistry;
    }
    
    /**
     * @notice BRICK the contract - emergency shutdown (ONE-WAY)
     * @dev Refunds all depositors and disables contract permanently
     */
    function brick() external onlyAdmin {
        require(!bricked, "Already bricked");
        require(initialized, "Not initialized");
        
        bricked = true;
        
        // Refund all deposits
        IDepositBox(depositBox).refundAllDeposits();
        
        // Neutralize settlement
        ISettlement(settlement).neutralize();
        
        emit ContractBricked(block.timestamp);
    }
    
    /**
     * @notice Check if system is operational
     */
    function isOperational() external view returns (bool) {
        return initialized && !bricked;
    }
    
    /**
     * @notice Get initial auction nonce
     */
    function getInitialNonce() external view returns (uint64) {
        return initialAuctionNonce;
    }
}
```

**Key Points:**
1. **BLS keys trusted at genesis** - No verification, just trust the deployment
2. **Nonce from state proof** - Only the starting auction nonce is proven via Atomica state
3. **Simple governance** - Just `genesis()` and `brick()`
4. **No upgrade path** - New contract on new address after brick
5. **Orthogonal to core contracts** - BLSVerifier has no governance knowledge

---

## 6. Settlement Contract Design

### 6.1 Settlement Core Contract

```solidity
/**
 * @title Settlement
 * @notice Handles atomic settlement of trades based on verified proofs
 */
contract Settlement is Ownable, ReentrancyGuard {
    using DepositTypes for DepositTypes.Deposit;
    using DepositTypes for DepositTypes.AssetType;
    using DepositTypes for DepositTypes.TradeResult;
    
    BLSVerifier public blsVerifier;
    address public depositBoxAddress;
    
    // Settlement data
    mapping(bytes32 => DepositTypes.TradeResult) public tradeResults;
    mapping(bytes32 => bool) public settlementExecuted;
    mapping(address => uint256) public userSettledAmount;
    
    // Constants
    uint256 public constant PROOF_VALIDITY_PERIOD = 1 hours;
    uint256 public constant MIN_TRADE_THRESHOLD = 0.01 ether;

    events TradeFinalized(
        bytes32 indexed tradeId,
        uint256 clearingPrice,
        uint256 ethAmount,
        uint256 usdcAmount
    );
    
    events SettlementExecuted(
        address indexed user,
        uint256 ethReceived,
        uint256 usdcReceived,
        bytes32 indexed tradeId
    );
    
    event SettlementFailed(
        address indexed user,
        string reason,
        bytes32 indexed tradeId
    );

    /**
     * @notice Constructor
     * @param blsVerifierAddress BLS verifier contract address
     * @param depositBoxAddress Deposit box contract address
     */
    constructor(address blsVerifierAddress, address depositBoxAddress) {
        blsVerifier = BLSVerifier(blsVerifierAddress);
        depositBoxAddress = depositBoxAddress;
    }

    /**
     * @notice Finalize trade results (called by off-chain coordinator)
     * @param tradeId Unique trade identifier
     * @param clearingPrice Final ETH/USDC price
     * @param ethToTrade Total ETH amount being traded
     * @param usdcToTrade Total USDC amount being traded
     * @param merkleRoot Root of trade allocation tree
     * @param signature BLS signature over trade data
     * @param pubkeys Validator public keys
     * @param validatorIndices Signing validator indices
     */
    function finalizeTrade(
        bytes32 tradeId,
        uint256 clearingPrice,
        uint256 ethToTrade,
        uint256 usdcToTrade,
        bytes32 merkleRoot,
        bytes calldata signature,
        bytes[] calldata pubkeys,
        uint256[] calldata validatorIndices
    ) external onlyOwner returns (bool) {
        require(tradeResults[tradeId].clearingPrice == 0, "Trade already finalized");
        require(
            ethToTrade > 0 && usdcToTrade > 0,
            "Trade amounts must be positive"
        );
        
        // Verify BLS signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            "ATOMICA_TRADE_FINALIZATION",
            tradeId,
            clearingPrice,
            ethToTrade,
            usdcToTrade,
            merkleRoot,
            block.chainid
        ));
        
        bool isValid = blsVerifier.verifyAggregatedSignature(
            pubkeys,
            signature,
            messageHash,
            validatorIndices
        );
        
        require(isValid, "Invalid trade signature");
        
        tradeResults[tradeId] = DepositTypes.TradeResult({
            clearingPrice: clearingPrice,
            ethToTrade: ethToTrade,
            usdcToTrade: usdcToTrade,
            merkleRoot: merkleRoot
        });
        
        emit TradeFinalized(tradeId, clearingPrice, ethToTrade, usdcToTrade);
        
        return true;
    }

    /**
     * @notice Execute settlement for a user
     * @param tradeId The trade to settle
     * @param allocationProof Merkle proof showing user's allocation
     * @param ethDeposited Amount of ETH user deposited
     * @param usdcDeposited Amount of USDC user deposited
     */
    function executeSettlement(
        bytes32 tradeId,
        bytes32[] calldata allocationProof,
        uint256 ethDeposited,
        uint256 usdcDeposited
    ) external nonReentrant {
        require(!settlementExecuted[msg.sender], "Already settled");
        
        DepositTypes.TradeResult memory trade = tradeResults[tradeId];
        require(trade.clearingPrice != 0, "Trade not finalized");
        require(!settlementExecuted[tradeId], "Trade already settled");
        
        // Verify allocation proof
        bytes32 leaf = keccak256(abi.encodePacked(
            msg.sender,
            ethDeposited,
            usdcDeposited
        ));
        
        bool isValid = _verifyAllocationProof(
            leaf,
            allocationProof,
            trade.merkleRoot
        );
        
        require(isValid, "Invalid allocation proof");
        
        // Calculate settlement amounts
        (uint256 ethToReceive, uint256 usdcToReceive) = _calculateSettlement(
            trade,
            ethDeposited,
            usdcDeposited
        );
        
        // Execute transfers
        settlementExecuted[msg.sender] = true;
        settlementExecuted[tradeId] = true;
        
        _executeTransfers(msg.sender, ethToReceive, usdcToReceive);
        
        emit SettlementExecuted(
            msg.sender,
            ethToReceive,
            usdcToReceive,
            tradeId
        );
    }

    /**
     * @notice Batch execute settlements
     * @param tradeId The trade to settle
     * @param users Array of users to settle
     * @param allocations Array of allocation data
     * @param proofs Array of merkle proofs for each user
     */
    function batchExecuteSettlement(
        bytes32 tradeId,
        address[] calldata users,
        uint256[][] calldata allocations,
        bytes32[][][] calldata proofs
    ) external nonReentrant {
        require(
            users.length == allocations.length &&
            users.length == proofs.length,
            "Array length mismatch"
        );
        
        DepositTypes.TradeResult memory trade = tradeResults[tradeId];
        require(trade.clearingPrice != 0, "Trade not finalized");
        
        for (uint256 i = 0; i < users.length; i++) {
            if (settlementExecuted[users[i]]) continue;
            
            address user = users[i];
            uint256 ethDeposited = allocations[i][0];
            uint256 usdcDeposited = allocations[i][1];
            
            bytes32 leaf = keccak256(abi.encodePacked(
                user,
                ethDeposited,
                usdcDeposited
            ));
            
            bool isValid = _verifyAllocationProof(
                leaf,
                proofs[i],
                trade.merkleRoot
            );
            
            if (isValid) {
                (uint256 ethToReceive, uint256 usdcToReceive) = _calculateSettlement(
                    trade,
                    ethDeposited,
                    usdcDeposited
                );
                
                settlementExecuted[user] = true;
                _executeTransfers(user, ethToReceive, usdcToReceive);
            }
        }
    }

    /**
     * @notice Verify allocation Merkle proof
     */
    function _verifyAllocationProof(
        bytes32 leaf,
        bytes32[] calldata proof,
        bytes32 root
    ) internal pure returns (bool) {
        bytes32 computedHash = leaf;
        
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            
            if (computedHash < proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        
        return computedHash == root;
    }

    /**
     * @notice Calculate settlement amounts based on trade parameters
     */
    function _calculateSettlement(
        DepositTypes.TradeResult memory trade,
        uint256 ethDeposited,
        uint256 usdcDeposited
    ) internal pure returns (uint256 ethToReceive, uint256 usdcToReceive) {
        // If user deposited ETH, they receive USDC
        if (ethDeposited > 0) {
            // USDC received = ETH deposited * clearing price
            usdcToReceive = (ethDeposited * trade.clearingPrice) / 1e18;
            ethToReceive = 0;
        }
        // If user deposited USDC, they receive ETH
        else if (usdcDeposited > 0) {
            // ETH received = USDC deposited / clearing price
            ethToReceive = (usdcDeposited * 1e18) / trade.clearingPrice;
            usdcToReceive = 0;
        }
        
        return (ethToReceive, usdcToReceive);
    }

    /**
     * @notice Execute transfers to user
     */
    function _executeTransfers(
        address user,
        uint256 ethAmount,
        uint256 usdcAmount
    ) internal {
        if (ethAmount > 0) {
            (bool success, ) = user.call{value: ethAmount}("");
            require(success, "ETH transfer failed");
        }
        
        if (usdcAmount > 0) {
            require(
                IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48).transfer(user, usdcAmount),
                "USDC transfer failed"
            );
        }
    }

    /**
     * @notice Emergency function to revert settlement
     */
    function revertSettlement(bytes32 tradeId) external onlyOwner {
        require(!settlementExecuted[tradeId], "Trade already settled");
        tradeResults[tradeId].clearingPrice = 0;
    }
}
```

### 6.2 Transfer Manager

```solidity
/**
 * @title TransferManager
 * @notice Handles complex transfer operations for settlements
 */
contract TransferManager {
    mapping(address => bool) public whitelistedTokens;
    mapping(address => mapping(address => uint256)) public allowances;
    
    event TokenWhitelisted(address indexed token, bool indexed status);
    event TransferCompleted(
        address indexed from,
        address indexed to,
        address indexed token,
        uint256 amount
    );

    /**
     * @notice Add or remove a token from whitelist
     */
    function setTokenWhitelist(address token, bool status) external {
        whitelistedTokens[token] = status;
        emit TokenWhitelisted(token, status);
    }

    /**
     * @notice Execute multiple transfers atomically
     */
    function batchTransfer(
        address[] calldata tokens,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external returns (bool) {
        require(
            tokens.length == recipients.length &&
            tokens.length == amounts.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < tokens.length; i++) {
            require(whitelistedTokens[tokens[i]], "Token not whitelisted");
            
            if (tokens[i] == address(0)) {
                // ETH transfer
                (bool success, ) = recipients[i].call{value: amounts[i]}("");
                require(success, "ETH transfer failed");
            } else {
                // ERC20 transfer
                require(
                    IERC20(tokens[i]).transfer(recipients[i], amounts[i]),
                    "ERC20 transfer failed"
                );
            }
            
            emit TransferCompleted(
                address(this),
                recipients[i],
                tokens[i],
                amounts[i]
            );
        }
        
        return true;
    }

    /**
     * @notice Transfer from user (for gasless transactions)
     */
    function transferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        require(whitelistedTokens[token], "Token not whitelisted");
        
        uint256 currentAllowance = allowances[msg.sender][from];
        require(currentAllowance >= amount, "Insufficient allowance");
        
        allowances[msg.sender][from] = currentAllowance - amount;
        
        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            require(
                IERC20(token).transferFrom(from, to, amount),
                "Transfer failed"
            );
        }
        
        return true;
    }

    /**
     * @notice Approve spender for token transfers
     */
    function approve(address token, address spender, uint256 amount) external {
        allowances[msg.sender][spender] = amount;
    }
}
```

---

### 6.5 Auction Lifecycle and Validator-Governed Starts

Each auction is identified by a monotonically increasing nonce and includes metadata for venue, deadline, and scuttle block. Atomica validators govern when new auctions start by submitting BLS-signed state proofs.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUCTION LIFECYCLE AND VALIDATOR GOVERNANCE                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. VALIDATOR GOVERNANCE                                                     │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Atomica validators agree on auction parameters:                │     │
│     │  - nonce: monotonically increasing identifier                   │     │
│     │  - description: "west-daily-btc-eth" (human-readable)          │     │
│     │  - deadline: Unix timestamp in microseconds                     │     │
│     │  - scuttleBlock: Ethereum block height for auto-terminate       │     │
│     │                                                                 │     │
│     │  Validators sign: nonce || description || deadline || scuttle   │     │
│     │  and include in Atomica state root                              │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                          │
│                                    ▼                                          │
│  2. STATE PROOF SUBMISSION                                                   │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  submitAuctionStart(                                           │     │
│     │      metadata,          // AuctionMetadata struct               │     │
│     │      stateProof,       // BLS proof of metadata in state       │     │
│     │      validatorIndices   // Which validators signed              │     │
│     │  )                                                                 │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                          │
│                                    ▼                                          │
│  3. ON-CHAIN VERIFICATION                                                    │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Verify BLS signature over:                                     │     │
│     │  - metadata.nonce                                               │     │
│     │  - metadata.description                                         │     │
│     │  - metadata.deadline                                            │     │
│     │  - metadata.scuttleBlock                                        │     │
│     │                                                                  │     │
│     │  If valid: Create auction with nonce = metadata.nonce          │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                          │
│                                    ▼                                          │
│  4. AUCTION EXECUTION                                                        │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  - Deposits accepted during auction window                      │     │
│     │  - Auction runs until deadline (microseconds)                  │     │
│     │  - Auto-scuttles if reaching scuttleBlock without settlement   │     │
│     │  - Settlement after auction completes                           │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Auction State Machine:**
```
┌─────────────┐
│   CREATED   │ ← BLS-signed metadata submitted
└──────┬──────┘
       │ startAuction()
       ▼
┌─────────────┐
│    OPEN     │ ← Deposits accepted
└──────┬──────┘
       │ deadline passed OR scuttleBlock reached
       ▼
┌─────────────┐
│  CLOSING    │ ← Auction ended, settlement in progress
└──────┬──────┘
       │ settlement complete
       ▼
┌─────────────┐
│  SETTLED    │ ← All trades executed
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   SCUTTLED  │ ← Auto-terminated (scuttleBlock reached)
└─────────────┘
```

```solidity
/**
 * @title AuctionRegistry
 * @notice Manages auction metadata and validator-governed auction starts
 */
contract AuctionRegistry {
    using DepositTypes for DepositTypes.AssetType;
    
    // Auction state
    enum AuctionState {
        NONE,
        CREATED,
        OPEN,
        CLOSING,
        SETTLED,
        SCUTTLED
    }
    
    // Auction information
    struct Auction {
        uint64 nonce;              // Monotonically increasing identifier
        string description;        // Human-readable (e.g., "west-daily-btc-eth")
        uint64 deadline;           // Unix microseconds
        uint256 scuttleBlock;      // Ethereum block for auto-termination
        AuctionState state;
        uint256 openBlock;         // Block when auction opened
        uint256 totalEthDeposits;
        uint256 totalUsdcDeposits;
    }
    
    // Storage
    mapping(uint64 => Auction) public auctions;
    uint64 public nextNonce;
    
    // BLS Verifier for validator signatures
    BLSVerifier public blsVerifier;
    
    // Events
    event AuctionCreated(
        uint64 indexed nonce,
        string description,
        uint64 deadline,
        uint256 scuttleBlock
    );
    event AuctionOpened(uint64 indexed nonce);
    event AuctionSettled(uint64 indexed nonce);
    event AuctionScuttled(uint64 indexed nonce);
    
    /**
     * @notice Start a new auction with validator-signed metadata
     * @dev Validators govern auction creation via BLS-signed state proof
     * @param nonce Monotonically increasing auction identifier
     * @param description Human-readable auction description
     * @param deadline Unix timestamp in microseconds for auction end
     * @param scuttleBlock Ethereum block height for auto-termination
     * @param signature BLS signature over auction parameters
     * @param validatorIndices Indices of validators who signed
     */
    function startAuction(
        uint64 nonce,
        string calldata description,
        uint64 deadline,
        uint256 scuttleBlock,
        bytes calldata signature,
        uint256[] calldata validatorIndices
    ) external {
        require(auctions[nonce].state == AuctionState.NONE, "Auction exists");
        require(nonce == nextNonce, "Invalid nonce order");
        require(bytes(description).length > 0, "Empty description");
        require(deadline > block.timestamp * 1_000_000, "Deadline in past");
        require(scuttleBlock > block.number, "ScuttleBlock in past");
        require(signature.length == 48, "Invalid signature");
        
        // Verify BLS signature over auction parameters
        bytes32 messageHash = keccak256(abi.encodePacked(
            "ATOMICA_AUCTION_START",
            nonce,
            keccak256(bytes(description)),
            deadline,
            scuttleBlock,
            block.chainid
        ));
        
        bool isValid = blsVerifier.verifyAggregatedSignature(
            blsVerifier.trustedPubkeys(),
            signature,
            messageHash,
            validatorIndices
        );
        
        require(isValid, "Invalid validator signature");
        
        // Create auction
        Auction storage auction = auctions[nonce];
        auction.nonce = nonce;
        auction.description = description;
        auction.deadline = deadline;
        auction.scuttleBlock = scuttleBlock;
        auction.state = AuctionState.CREATED;
        auction.openBlock = 0;
        auction.totalEthDeposits = 0;
        auction.totalUsdcDeposits = 0;
        
        nextNonce = nonce + 1;
        
        emit AuctionCreated(nonce, description, deadline, scuttleBlock);
    }
    
    /**
     * @notice Open auction for deposits
     */
    function openAuction(uint64 nonce) external {
        Auction storage auction = auctions[nonce];
        require(auction.state == AuctionState.CREATED, "Not in CREATED state");
        
        auction.state = AuctionState.OPEN;
        auction.openBlock = block.number;
        
        emit AuctionOpened(nonce);
    }
    
    /**
     * @notice Check if auction is still open
     */
    function isAuctionOpen(uint64 nonce) external view returns (bool) {
        Auction storage auction = auctions[nonce];
        if (auction.state != AuctionState.OPEN) return false;
        if (block.timestamp * 1_000_000 > auction.deadline) return false;
        if (block.number >= auction.scuttleBlock) return false;
        return true;
    }
    
    /**
     * @notice Auto-scuttle auction at scuttleBlock
     */
    function scuttle(uint64 nonce) external {
        Auction storage auction = auctions[nonce];
        require(auction.state == AuctionState.OPEN, "Not open");
        require(block.number >= auction.scuttleBlock, "Not at scuttleBlock");
        
        auction.state = AuctionState.SCUTTLED;
        
        emit AuctionScuttled(nonce);
    }
    
    /**
     * @notice Get auction deadline in seconds (for compatibility)
     */
    function getDeadlineSeconds(uint64 nonce) external view returns (uint256) {
        return auctions[nonce].deadline / 1_000_000;
    }
}
```

**Message Format for Validator Signing:**
```
keccak256(
    "ATOMICA_AUCTION_START" ||
    nonce (uint64) ||
    keccak256(description) (bytes32) ||
    deadline (uint64 microseconds) ||
    scuttleBlock (uint256) ||
    chainId (uint256)
)
```

**Key Properties:**
- **Monotonic Nonce**: Each auction has a unique, sequentially increasing identifier
- **Human-Readable Description**: Enables market identification (e.g., "west-daily-btc-eth")
- **Microsecond Precision**: Deadline uses microseconds for precise timing
- **Auto-Scuttle**: Auction terminates at specified Ethereum block height
- **Validator Governance**: Only validators can initiate new auctions via BLS signatures

---

## 7. Controller Contract

```solidity
/**
 * @title AtomicaController
 * @notice Main controller contract coordinating all Atomica contracts
 * @dev Uses auction nonces for auction identification (monotonically increasing)
 */
contract AtomicaController is Ownable {
    DepositBox public depositBox;
    StateRoot public stateRoot;
    BLSVerifier public blsVerifier;
    Settlement public settlement;
    TransferManager public transferManager;
    AuctionRegistry public auctionRegistry;
    
    bool public paused;
    uint64 public currentAuctionNonce;
    
    mapping(uint64 => bytes32) public auctionTradeIds;
    mapping(uint64 => bool) public auctionSettled;
    
    event AuctionStarted(uint64 indexed nonce, string description, uint64 deadline);
    event AuctionSettled(uint64 indexed nonce);
    event AuctionScuttled(uint64 indexed nonce);
    
    /**
     * @notice Constructor
     */
    constructor(
        address depositBoxAddress,
        address stateRootAddress,
        address blsVerifierAddress,
        address settlementAddress,
        address transferManagerAddress,
        address auctionRegistryAddress
    ) {
        depositBox = DepositBox(depositBoxAddress);
        stateRoot = StateRoot(stateRootAddress);
        blsVerifier = BLSVerifier(blsVerifierAddress);
        settlement = Settlement(settlementAddress);
        transferManager = TransferManager(transferManagerAddress);
        auctionRegistry = AuctionRegistry(auctionRegistryAddress);
    }

    /**
     * @notice Start a new auction (proxies to AuctionRegistry with BLS verification)
     */
    function startAuction(
        uint64 nonce,
        string calldata description,
        uint64 deadline,
        uint256 scuttleBlock,
        bytes calldata signature,
        uint256[] calldata validatorIndices
    ) external onlyOwner {
        require(!paused, "System paused");
        
        // Delegate to AuctionRegistry for validator signature verification
        auctionRegistry.startAuction(
            nonce,
            description,
            deadline,
            scuttleBlock,
            signature,
            validatorIndices
        );
        
        emit AuctionStarted(nonce, description, deadline);
    }

    /**
     * @notice Complete settlement for an auction
     */
    function settleAuction(uint64 nonce) external {
        require(nonce <= currentAuctionNonce, "Invalid nonce");
        require(!auctionSettled[nonce], "Already settled");
        
        auctionSettled[nonce] = true;
        
        emit AuctionSettled(nonce);
    }

    /**
     * @notice Scuttle an auction (auto-terminate at scuttleBlock)
     */
    function scuttleAuction(uint64 nonce) external {
        require(!auctionSettled[nonce], "Already settled");
        
        auctionRegistry.scuttle(nonce);
        
        emit AuctionScuttled(nonce);
    }
    
    /**
     * @notice Emergency pause
     */
    function setPaused(bool status) external onlyOwner {
        paused = status;
    }
    
    /**
     * @notice Withdraw protocol fees
     */
    function withdrawFees(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = owner().call{value: amount}("");
            require(success, "ETH withdrawal failed");
        } else {
            require(
                IERC20(token).transfer(owner(), amount),
                "Token withdrawal failed"
            );
        }
    }
}
```

---

---

## 8. Off-Chain Specification

### 8.1 Architecture Overview

The off-chain services leverage our existing infrastructure:
- **Docker Testnet**: Local Ethereum+validator cluster for testing
- **State Proof SDK**: EIP-1186 proof verification and BLS light client

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OFF-CHAIN COORDINATION LAYER                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────┐  │
│  │  Docker Testnet     │    │   State Proof SDK   │    │   Auction       │  │
│  │  Cluster            │    │                     │    │   Coordinator   │  │
│  │  - Geth (EL)        │    │  - eth_getProof     │    │                 │  │
│  │  - Lighthouse (CL)  │    │  - BLS verification │    │  - Double auction│ │
│  │  - 4 Validators     │    │  - Light client     │    │  - Price finding│ │
│  └─────────────────────┘    └─────────────────────┘    └─────────────────┘  │
│           │                          │                         │              │
│           └──────────────────────────┼─────────────────────────┘              │
│                                      ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    Auction Coordinator Service                          │  │
│  │  1. Monitor deposits via DepositBox events                             │  │
│  │  2. Generate state proofs using State Proof SDK                        │  │
│  │  3. Run auction algorithm                                              │  │
│  │  4. Collect BLS signatures from validators                             │  │
│  │  5. Submit settlement transactions                                     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Docker Testnet Integration

We use our existing Docker testnet infrastructure for local testing:

```typescript
/**
 * Docker Testnet Integration
 * Uses @atomica/docker-testnet-ethereum package
 */
import { EthereumDockerTestnet } from '@atomica/docker-testnet-ethereum';

interface TestnetConfig {
    numValidators: number;
    enableFaucet: boolean;
    chainId: number;
}

class AtomicaTestnet {
    private testnet: EthereumDockerTestnet;
    private deployedContracts: Map<string, string> = new Map();

    static async start(config: TestnetConfig): Promise<AtomicaTestnet> {
        const testnet = await EthereumDockerTestnet.start(config.numValidators);
        await testnet.waitForHealthy(60_000);
        return new AtomicaTestnet(testnet, config);
    }

    async deployContracts(): Promise<void> {
        // Deploy all Atomica contracts
        const DepositBox = await this.deploy('DepositBox', [USDC_TOKEN_ADDRESS]);
        const BLSVerifier = await this.deploy('BLSVerifier', []);
        const Settlement = await this.deploy('Settlement', [BLSVerifier.address, DepositBox.address]);
        const Controller = await this.deploy('AtomicaController', [
            DepositBox.address,
            MERKLE_TREE_ADDRESS,
            BLSVerifier.address,
            Settlement.address,
            TRANSFER_MANAGER_ADDRESS
        ]);

        this.deployedContracts.set('DepositBox', DepositBox.address);
        this.deployedContracts.set('BLSVerifier', BLSVerifier.address);
        this.deployedContracts.set('Settlement', Settlement.address);
        this.deployedContracts.set('Controller', Controller.address);
    }

    getRpcUrl(): string {
        return this.testnet.getExecutionRpcUrl();
    }

    getBeaconApiUrl(): string {
        return this.testnet.getBeaconApiUrl();
    }

    async getPreFundedAccount(index: number): Promise<Wallet> {
        // Uses pre-funded accounts from genesis
        const accounts = [
            '0x8943545177806ED17B9F23F0a21ee5948eCaa776', // 1000 ETH
            '0x71bE63f3384f5fb98995898A86B02Fb2426c5788', // 1000 ETH
            '0xFABB0ac9d68B0B445fB7357272Ff202C5651694a', // 1000 ETH
            '0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec'  // 1000 ETH
        ];
        return new Wallet(accounts[index], this.testnet.getProvider());
    }

    async waitForBlocks(count: number): Promise<number> {
        return this.testnet.waitForBlocks(count);
    }

    async teardown(): Promise<void> {
        await this.testnet.teardown();
    }
}
```

### 8.3 State Proof SDK Integration

We use our existing state-proofs SDK for proving deposit state:

```typescript
/**
 * State Proof Generator
 * Uses @atomica/state-proof-verifier package
 */
import {
    fetchProof,
    fetchBlock,
    verifyAccountProof,
    verifyStorageProof,
    EthereumProof,
    Block
} from '@atomica/state-proof-verifier';

interface DepositProof {
    depositHash: string;
    blockNumber: number;
    blockHash: string;
    stateRoot: string;
    accountProof: string[];
    storageProof?: string[];
    verified: boolean;
}

class StateProofGenerator {
    private rpcUrl: string;

    constructor(rpcUrl: string) {
        this.rpcUrl = rpcUrl;
    }

    /**
     * Generate proof for a deposit transaction
     */
    async generateDepositProof(
        depositContractAddress: string,
        depositSlot: bigint,
        blockNumber: number
    ): Promise<DepositProof> {
        // 1. Fetch block header
        const block = await fetchBlock(this.rpcUrl, blockNumber);

        // 2. Calculate storage slot for the deposit
        const storageKey = this.calculateStorageSlot(depositSlot);

        // 3. Fetch account and storage proof using EIP-1186
        const proof = await fetchProof(
            this.rpcUrl,
            depositContractAddress,
            [storageKey],
            blockNumber
        );

        // 4. Verify the proof cryptographically
        const accountResult = await verifyAccountProof(
            proof.accountProof,
            block.stateRoot,
            depositContractAddress
        );

        if (!accountResult.valid || !accountResult.accountState) {
            throw new Error('Failed to verify deposit contract account');
        }

        // 5. Verify storage proof
        const storageResult = await verifyStorageProof(
            proof.storageProof[0].proof,
            accountResult.accountState.storageHash,
            storageKey
        );

        if (!storageResult.valid) {
            throw new Error('Failed to verify deposit storage proof');
        }

        return {
            depositHash: storageResult.value,
            blockNumber,
            blockHash: block.hash,
            stateRoot: block.stateRoot,
            accountProof: proof.accountProof,
            storageProof: proof.storageProof.map(p => p.proof),
            verified: true
        };
    }

    /**
     * Generate state root proof for the deposit tree
     */
    async generateStateRootProof(
        depositBoxAddress: string,
        blockNumber: number
    ): Promise<{ stateRoot: string; blockHash: string; proof: string[] }> {
        const block = await fetchBlock(this.rpcUrl, blockNumber);

        const proof = await fetchProof(
            this.rpcUrl,
            depositBoxAddress,
            [], // No storage keys needed for account state
            blockNumber
        );

        const result = await verifyAccountProof(
            proof.accountProof,
            block.stateRoot,
            depositBoxAddress
        );

        if (!result.valid) {
            throw new Error('Failed to verify state root');
        }

        return {
            stateRoot: result.accountState.storageHash,
            blockHash: block.hash,
            proof: proof.accountProof
        };
    }

    /**
     * Calculate storage slot for deposit
     */
    private calculateStorageSlot(depositIndex: bigint): string {
        // Storage slot = keccak256(depositIndex . 0x0)
        const indexHex = '0x' + depositIndex.toString(16).padStart(64, '0');
        return keccak256(Buffer.from(indexHex.slice(2), 'hex')).toString('hex');
    }
}
```

### 8.4 BLS Signature Collection

```typescript
/**
 * BLS Signature Collector
 * Collects and aggregates signatures from Aptos validators
 */
import { BlsSigner } from '@noble/bls12-381';

interface ValidatorBLSKey {
    validatorAddress: string;
    blsPublicKey: Uint8Array;
}

interface SignedMessage {
    message: Uint8Array;
    signature: Uint8Array;
    signerIndex: number;
}

class BLSSignatureCollector {
    private validators: ValidatorBLSKey[];
    private threshold: number;

    constructor(validators: ValidatorBLSKey[], threshold: number = 2) {
        this.validators = validators;
        this.threshold = Math.ceil(validators.length * 2 / 3); // 2/3 quorum
    }

    /**
     * Collect signatures from validators
     */
    async collectSignatures(
        message: Uint8Array,
        timeoutMs: number = 30000
    ): Promise<SignedMessage[]> {
        const signatures: SignedMessage[] = [];

        const signaturePromises = this.validators.map(async (validator, index) => {
            try {
                const signer = await this.getValidatorSigner(validator.validatorAddress);
                const signature = await signer.sign(message);
                return {
                    message,
                    signature,
                    signerIndex: index
                };
            } catch (error) {
                console.error(`Validator ${index} failed to sign:`, error);
                return null;
            }
        });

        const results = await Promise.allSettled(signaturePromises);

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                signatures.push(result.value);
            }
        }

        if (signatures.length < this.threshold) {
            throw new Error(`Insufficient signatures: ${signatures.length}/${this.threshold}`);
        }

        return signatures;
    }

    /**
     * Aggregate signatures into a single signature
     */
    aggregateSignatures(signatures: SignedMessage[]): Uint8Array {
        if (signatures.length === 0) {
            throw new Error('No signatures to aggregate');
        }

        // Aggregate using BLS library
        const sigs = signatures.map(s => s.signature);
        return BlsSigner.aggregateSignatures(sigs);
    }

    /**
     * Get the public key aggregation for verification
     */
    getAggregatedPublicKey(indices: number[]): Uint8Array {
        const pubkeys = indices.map(i => this.validators[i].blsPublicKey);
        return BlsSigner.aggregatePublicKeys(pubkeys);
    }

    private async getValidatorSigner(address: string): Promise<BlsSigner> {
        // Implementation would retrieve the validator's BLS private key
        // This should be done securely (e.g., from HSM or KMS)
        throw new Error('Not implemented');
    }
}
```

### 8.5 Auction Coordinator

The auction coordinator ties together the testnet, state proofs, and BLS signatures:

```typescript
/**
 * Auction Coordinator Service
 * Orchestrates the complete deposit -> auction -> settlement flow
 */
import { EthereumDockerTestnet } from '@atomica/docker-testnet-ethereum';
import { StateProofGenerator } from './state-proof-generator';
import { BLSSignatureCollector } from './bls-collector';

interface AuctionConfig {
    minDeposits: number;
    auctionDurationMs: number;
    maxPriceDeviation: number;
}

interface AuctionResult {
    tradeId: string;
    clearingPrice: bigint;
    ethDeposited: bigint;
    usdcDeposited: bigint;
    ethTraded: bigint;
    usdcTraded: bigint;
    allocations: UserAllocation[];
    stateProof: DepositProof;
    validatorSignature: Uint8Array;
    finalizedAt: Date;
}

interface UserAllocation {
    user: string;
    ethAmount: bigint;
    usdcAmount: bigint;
    allocationProof: string[];
}

interface AuctionMetadata {
    nonce: uint64;
    description: string;
    deadline: uint64;       // Unix microseconds
    scuttleBlock: uint256;
}

class AuctionCoordinator {
    private testnet: EthereumDockerTestnet;
    private proofGenerator: StateProofGenerator;
    private signatureCollector: BLSSignatureCollector;
    private config: AuctionConfig;
    private auctionNonce: uint64 = 0;

    constructor(
        testnet: EthereumDockerTestnet,
        proofGenerator: StateProofGenerator,
        signatureCollector: BLSSignatureCollector,
        config: AuctionConfig
    ) {
        this.testnet = testnet;
        this.proofGenerator = proofGenerator;
        this.signatureCollector = signatureCollector;
        this.config = config;
    }

    /**
     * Create auction metadata (called by validators off-chain)
     */
    createAuctionMetadata(
        description: string,
        deadlineMicroseconds: uint64,
        scuttleBlock: uint256
    ): AuctionMetadata {
        this.auctionNonce++;
        
        return {
            nonce: this.auctionNonce,
            description: description,
            deadline: deadlineMicroseconds,
            scuttleBlock: scuttleBlock
        };
    }

    /**
     * Run complete auction flow with validator-signed metadata
     */
    async runAuction(
        depositBoxAddress: string,
        metadata: AuctionMetadata,
        validatorIndices: number[]
    ): Promise<AuctionResult> {
        // Phase 1: Submit auction metadata (validators already signed this)
        // On-chain: Controller.startAuction(metadata, signature, validatorIndices)
        
        // Phase 2: Wait for minimum deposits during auction window
        await this.waitForDeposits(depositBoxAddress, this.config.minDeposits);

        // Phase 3: Check auction deadline
        if (await this.isPastDeadline(metadata.deadline)) {
            throw new Error("Auction deadline passed");
        }

        // Phase 4: Run auction algorithm
        const auctionResult = await this.runAuctionAlgorithm(
            depositBoxAddress,
            metadata.nonce
        );

        // Phase 5: Collect validator signatures for trade finalization
        const tradeMessage = this.createTradeMessage(auctionResult);
        const signatures = await this.signatureCollector.collectSignatures(tradeMessage);
        const aggregatedSignature = this.signatureCollector.aggregateSignatures(signatures);

        // Phase 6: Generate allocation Merkle tree
        const allocationResult = this.generateAllocationTree(auctionResult);

        return {
            nonce: metadata.nonce,
            tradeId: ethers.utils.id(`${metadata.description}-${metadata.nonce}`),
            clearingPrice: auctionResult.clearingPrice,
            ethDeposited: auctionResult.totalEth,
            usdcDeposited: auctionResult.totalUsdc,
            ethTraded: auctionResult.ethToTrade,
            usdcTraded: auctionResult.usdcToTrade,
            allocations: allocationResult.allocations,
            stateProof,
            validatorSignature: aggregatedSignature,
            finalizedAt: new Date()
        };
    }

    /**
     * Wait for minimum number of deposits
     */
    private async waitForDeposits(
        depositBoxAddress: string,
        minCount: number
    ): Promise<void> {
        let currentDeposits = 0;
        const maxWaitTime = 5 * 60 * 1000; // 5 minutes
        const startTime = Date.now();

        while (currentDeposits < minCount && Date.now() - startTime < maxWaitTime) {
            const depositCount = await this.getDepositCount(depositBoxAddress);
            currentDeposits = depositCount;

            if (currentDeposits < minCount) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        if (currentDeposits < minCount) {
            throw new Error(`Timeout waiting for deposits: ${currentDeposits}/${minCount}`);
        }
    }

    /**
     * Run the double auction algorithm
     */
    private async runAuctionAlgorithm(
        depositBoxAddress: string,
        auctionId: string
    ): Promise<{
        clearingPrice: bigint;
        totalEth: bigint;
        totalUsdc: bigint;
        ethToTrade: bigint;
        usdcToTrade: bigint;
    }> {
        // Fetch all deposits from the contract
        const deposits = await this.fetchDeposits(depositBoxAddress);

        // Separate ETH sellers and USDC buyers
        const ethDeposits = deposits.filter(d => d.assetType === 'ETH');
        const usdcDeposits = deposits.filter(d => d.assetType === 'USDC');

        // Sort for price discovery
        ethDeposits.sort((a, b) => Number(b.minPrice - a.minPrice));
        usdcDeposits.sort((a, b) => Number(a.maxPrice - b.maxPrice));

        // Find clearing price using binary search
        const clearingPrice = await this.findClearingPrice(ethDeposits, usdcDeposits);

        // Calculate trade amounts
        const ethToTrade = ethDeposits
            .filter(d => d.minPrice <= clearingPrice)
            .reduce((sum, d) => sum + d.amount, 0n);

        const usdcToTrade = usdcDeposits
            .filter(d => d.maxPrice >= clearingPrice)
            .reduce((sum, d) => sum + d.amount, 0n);

        return {
            clearingPrice,
            totalEth: ethDeposits.reduce((sum, d) => sum + d.amount, 0n),
            totalUsdc: usdcDeposits.reduce((sum, d) => sum + d.amount, 0n),
            ethToTrade,
            usdcToTrade
        };
    }

    /**
     * Find equilibrium clearing price
     */
    private async findClearingPrice(
        ethDeposits: Deposit[],
        usdcDeposits: Deposit[]
    ): Promise<bigint> {
        // Binary search between min and max prices
        let low = 0n;
        let high = 10n ** 36n; // 1 ETH = 1M USDC (with 18 decimals)

        while (high - low > 1n) {
            const mid = (low + high) / 2n;

            const ethSupply = ethDeposits
                .filter(d => d.minPrice <= mid)
                .reduce((sum, d) => sum + d.amount, 0n);

            const usdcDemand = usdcDeposits
                .filter(d => d.maxPrice >= mid)
                .reduce((sum, d) => sum + d.amount, 0n);

            if (ethSupply > usdcDemand) {
                high = mid;
            } else {
                low = mid;
            }
        }

        return low;
    }

    /**
     * Generate allocation Merkle tree
     */
    private generateAllocationTree(
        auctionResult: any
    ): { root: string; allocations: UserAllocation[] } {
        const allocations: UserAllocation[] = [];

        // Generate allocations for each depositor
        // ... allocation logic

        return {
            root: '', // Merkle root
            allocations
        };
    }

    /**
     * Create signed message for trade finalization
     */
    private createTradeMessage(auctionResult: any): Uint8Array {
        return Buffer.from(keccak256(
            ethers.utils.defaultAbiCoder.encode(
                ['bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
                [
                    auctionResult.tradeId,
                    auctionResult.clearingPrice,
                    auctionResult.ethToTrade,
                    auctionResult.usdcToTrade,
                    auctionResult.allocationRoot,
                    this.testnet.getChainId()
                ]
            ).slice(2),
            'hex'
        ));
    }

    private async getDepositCount(address: string): Promise<number> {
        throw new Error('Not implemented');
    }

    private async fetchDeposits(address: string): Promise<Deposit[]> {
        throw new Error('Not implemented');
    }
}
```

### 8.2 Auction Algorithm

```
Double Auction Mechanism:

1. Sort ETH deposits by price (ascending - sellers want higher price)
2. Sort USDC deposits by price (descending - buyers want lower price)
3. Find equilibrium price where supply = demand

Algorithm:
- Binary search for clearing price P
- For each candidate price P:
  - ETH sellers willing to sell at P: Σ(amount where minPrice ≤ P)
  - USDC buyers willing to buy at P: Σ(amount where maxPrice ≥ P)
- Find P where supply and demand are closest
- Allocate proportionally based on position in order book
```

### 8.3 BLS Proof Generation

```typescript
/**
 * BLS Proof Generation Service
 */
class BLSProofGenerator {
  async generateStateProof(
    stateRoot: string,
    validatorSet: ValidatorSet
  ): Promise<StateProof> {
    // 1. Get current validator BLS public keys
    const pubkeys = await this.getValidatorPubkeys(validatorSet);
    
    // 2. Create message to sign
    const message = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['string', 'bytes32', 'uint256'],
        ['ATOMICA_STATE_PROOF', stateRoot, CHAIN_ID]
      )
    );
    
    // 3. Collect signatures from validators
    const signatures = await this.collectValidatorSignatures(
      validatorSet,
      message
    );
    
    // 4. Aggregate signatures
    const aggregatedSignature = this.aggregateSignatures(signatures);
    const validatorIndices = signatures.map((_, i) => i);
    
    return {
      stateRoot,
      blsSignature: aggregatedSignature,
      validatorPubkeys: pubkeys,
      validatorIndices
    };
  }
  
  private aggregateSignatures(signatures: BLS.Signature[]): string {
    // Use BLS library to aggregate G1 points
    return bls.aggregateSignatures(signatures);
  }
}
```

---

## 9. Data Flow and Lifecycle

### 9.1 Complete Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          DEPOSIT PHASE                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User calls depositETH() or depositUSDC()                                 │
│  2. Contract stores deposit with commitment                                  │
│  3. Deposit added to Merkle tree                                             │
│  4. State root updated (off-chain)                                           │
│                                                                              │
│  User -> DepositBox -> MerkleTree -> StateRoot                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                         CONFIRMATION PHASE                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Off-chain coordinator confirms deposits                                  │
│  2. Aggregates validator BLS signatures                                      │
│  3. Generates state proof                                                    │
│  4. Submits proof to chain                                                   │
│                                                                              │
│  Coordinator -> BLSVerifier -> StateRoot.updateStateRoot()                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                          AUCTION PHASE                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Auction coordinator runs double auction                                  │
│  2. Calculates clearing price                                                │
│  3. Generates allocations tree                                               │
│  4. BLS signs auction results                                                │
│                                                                              │
│  Coordinator -> AuctionAlgorithm -> BLS Signing                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                        SETTLEMENT PHASE                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Submit finalization tx with proof                                        │
│  2. Contract verifies BLS signature                                          │
│  3. User calls executeSettlement() with allocation proof                     │
│  4. Contract executes transfers                                              │
│                                                                              │
│  User -> Settlement.executeSettlement() -> TransferManager                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Data Structures for Proofs

```solidity
/**
 * @notice Proof data structure for verification
 */
struct StateProof {
    bytes32 stateRoot;
    bytes signature;           // Aggregated BLS signature (48 bytes)
    bytes[] publicKeys;        // Validator BLS public keys (48 bytes each)
    uint256[] validatorIndices; // Which validators signed
    bytes32[] merkleProof;     // Proof of state root in consensus
}

struct AuctionProof {
    bytes32 tradeId;
    bytes32 merkleRoot;        // Allocation tree root
    bytes signature;           // Trade finalization signature
    bytes[] publicKeys;
    uint256[] validatorIndices;
}

struct AllocationProof {
    bytes32 leaf;              // Hash(user, ethAmount, usdcAmount)
    bytes32[] path;            // Path from leaf to root
    uint256 leafIndex;         // Position in tree
}
```

---

## 10. Security Considerations

### 10.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| Reentrancy | ReentrancyGuard on all external functions |
| Front-running | Use commit-reveal scheme for deposits |
| Signature replay | Include chainId and timestamp in signed messages |
| BLS key theft | Multi-sig for validator key management |
| Oracle manipulation | Use multiple data sources and time-weighted averages |
| MEV extraction | Implement flashbots protection |

### 10.2 Access Control

```solidity
/**
 * @title AccessControl
 * @notice Role-based access control for the Atomica system
 */
abstract contract AccessControl is Ownable {
    mapping(address => bool) public admins;
    mapping(address => bool) public coordinators;
    mapping(address => bool) public verifiers;
    
    modifier onlyAdmin() {
        require(admins[msg.sender], "Not admin");
        _;
    }
    
    modifier onlyCoordinator() {
        require(coordinators[msg.sender], "Not coordinator");
        _;
    }
    
    modifier onlyVerifier() {
        require(verifiers[msg.sender], "Not verifier");
        _;
    }
    
    function addAdmin(address account) external onlyOwner {
        admins[account] = true;
    }
    
    function addCoordinator(address account) external onlyOwner {
        coordinators[account] = true;
    }
}
```

### 10.3 Circuit Breakers

```solidity
/**
 * @title CircuitBreaker
 * @notice Emergency stop mechanism
 */
contract CircuitBreaker is Ownable {
    bool public stopped;
    uint256 public lastStopBlock;
    uint256 public constant COOLDOWN_PERIOD = 100 blocks;
    
    modifier whenNotStopped() {
        require(!stopped, "System stopped");
        _;
    }
    
    function emergencyStop() external onlyOwner {
        require(!stopped, "Already stopped");
        stopped = true;
        lastStopBlock = block.number;
    }
    
    function resume() external onlyOwner {
        require(stopped, "Not stopped");
        require(
            block.number > lastStopBlock + COOLDOWN_PERIOD,
            "Cooldown active"
        );
        stopped = false;
    }
}
```

---

## 11. Testing Strategy

### 11.1 Docker Testnet-Based Testing

We use our existing Docker testnet infrastructure for comprehensive testing:

```typescript
/**
 * Integration tests using Docker testnet
 */
import { EthereumDockerTestnet } from '@atomica/docker-testnet-ethereum';
import { StateProofGenerator } from './state-proof-generator';
import { ethers } from 'ethers';

describe('Atomica Contract Integration Tests', () => {
    let testnet: EthereumDockerTestnet;
    let stateProofGenerator: StateProofGenerator;
    let contracts: {
        depositBox: ethers.Contract;
        blsVerifier: ethers.Contract;
        settlement: ethers.Contract;
        controller: ethers.Contract;
    };
    let user: ethers.Wallet;

    beforeAll(async () => {
        // Start docker testnet with 4 validators
        testnet = await EthereumDockerTestnet.start(4);
        await testnet.waitForHealthy();

        // Initialize state proof generator
        stateProofGenerator = new StateProofGenerator(testnet.getExecutionRpcUrl());

        // Get pre-funded test account
        user = await testnet.getPreFundedAccount(0);

        // Deploy contracts
        contracts = await deployContracts(testnet, user);
    }, 120_000);

    afterAll(async () => {
        await testnet.teardown();
    });

    describe('Deposit Flow', () => {
        it('should handle ETH deposit', async () => {
            const commitment = ethers.utils.id('user-commitment-1');
            const depositAmount = ethers.utils.parseEther('1.0');

            const tx = await contracts.depositBox
                .connect(user)
                .depositETH(commitment, { value: depositAmount });

            const receipt = await tx.wait();

            // Verify deposit event
            const depositEvent = receipt.events?.find(
                e => e.event === 'ETHDeposited'
            );
            expect(depositEvent).toBeDefined();
            expect(depositEvent?.args?.depositor).toBe(user.address);
            expect(depositEvent?.args?.amount).toBe(depositAmount);
        });

        it('should handle USDC deposit', async () => {
            const commitment = ethers.utils.id('user-commitment-2');

            // First approve
            await contracts.usdcToken
                .connect(user)
                .approve(contracts.depositBox.address, 1000000n);

            const tx = await contracts.depositBox
                .connect(user)
                .depositUSDC(1000000n, commitment);

            const receipt = await tx.wait();

            const depositEvent = receipt.events?.find(
                e => e.event === 'USDCDeposited'
            );
            expect(depositEvent).toBeDefined();
        });

        it('should prevent double commitment', async () => {
            const commitment = ethers.utils.id('duplicate-commitment');

            await expect(
                contracts.depositBox
                    .connect(user)
                    .depositETH({ value: 1n }, commitment)
            ).rejects.toThrow('Commitment already used');
        });
    });

    describe('State Proof Verification', () => {
        it('should generate valid state proof', async () => {
            // Make some deposits first
            await contracts.depositBox
                .connect(user)
                .depositETH({ value: ethers.utils.parseEther('1') }, ethers.utils.id('proof-test'));

            // Wait for block
            await testnet.waitForBlocks(2);

            // Generate state proof
            const proof = await stateProofGenerator.generateStateRootProof(
                contracts.depositBox.address,
                await testnet.getBlockNumber()
            );

            expect(proof.stateRoot).toBeDefined();
            expect(proof.blockHash).toBeDefined();
            expect(proof.proof.length).toBeGreaterThan(0);
        });

        it('should verify account state', async () => {
            const proof = await stateProofGenerator.generateStateRootProof(
                contracts.depositBox.address,
                await testnet.getBlockNumber()
            );

            // Verify on-chain that the state root matches
            const storedRoot = await contracts.depositBox.latestStateRoot();
            expect(storedRoot).toBeTruthy();
        });
    });

    describe('Auction Flow', () => {
        it('should start auction round', async () => {
            const tradeId = ethers.utils.id('auction-1');

            const tx = await contracts.controller
                .connect(user)
                .startRound(tradeId);

            await tx.wait();

            const round = await contracts.controller.currentRound();
            expect(round).toBe(1);
        });

        it('should finalize trade with BLS proof', async () => {
            // This would involve the full auction flow
            // with BLS signature collection and verification
        });
    });

    describe('Settlement Flow', () => {
        it('should execute settlement', async () => {
            // Settlement tests would go here
        });
    });
});
```

### 11.2 State Proof SDK Tests

```typescript
/**
 * State Proof SDK Integration Tests
 */
import { fetchProof, fetchBlock, verifyAccountProof } from '@atomica/state-proof-verifier';

describe('State Proof SDK', () => {
    const rpcUrl = 'http://localhost:8545';

    it('should fetch and verify account proof', async () => {
        // Use pre-funded test account
        const testAccount = '0x8943545177806ED17B9F23F0a21ee5948eCaa776';

        // Fetch block
        const blockNumber = await fetchBlock(rpcUrl, 'latest').then(b => b.number);

        // Fetch proof
        const proof = await fetchProof(rpcUrl, testAccount, [], blockNumber);

        // Verify proof
        const block = await fetchBlock(rpcUrl, blockNumber);
        const result = await verifyAccountProof(
            proof.accountProof,
            block.stateRoot,
            testAccount
        );

        expect(result.valid).toBe(true);
        expect(result.accountState).toBeDefined();
        expect(result.accountState?.balance).toBeGreaterThan(0n);
    });

    it('should verify storage proof', async () => {
        const contractAddress = '0x...'; // Deployed contract
        const storageKey = '0x...';

        const blockNumber = await fetchBlock(rpcUrl, 'latest').then(b => b.number);
        const proof = await fetchProof(rpcUrl, contractAddress, [storageKey], blockNumber);

        expect(proof.storageProof.length).toBe(1);
        expect(proof.storageProof[0].key).toBe(storageKey);
    });
});
```

### 11.3 Docker Testnet Lifecycle Tests

```typescript
/**
 * Docker Testnet Lifecycle Tests
 */
import { EthereumDockerTestnet } from '@atomica/docker-testnet-ethereum';

describe('Docker Testnet Lifecycle', () => {
    let testnet: EthereumDockerTestnet;

    beforeEach(async () => {
        testnet = await EthereumDockerTestnet.start(4);
    });

    afterEach(async () => {
        await testnet.teardown();
    });

    it('should start and be healthy', async () => {
        const healthy = await testnet.waitForHealthy(60_000);
        expect(healthy).toBe(true);
    });

    it('should have correct chain configuration', async () => {
        const chainId = await testnet.getChainId();
        expect(chainId).toBe(32382); // Local testnet chain ID
    });

    it('should produce blocks', async () => {
        const startBlock = await testnet.getBlockNumber();

        await testnet.waitForBlocks(3);

        const endBlock = await testnet.getBlockNumber();
        expect(endBlock).toBeGreaterThan(startBlock + 2);
    });

    it('should have working RPC endpoints', async () => {
        const blockNumber = await testnet.getBlockNumber();
        expect(blockNumber).toBeGreaterThanOrEqual(0);

        // Test WebSocket
        const wsBlockNumber = await testnet.getBlockNumber();
        expect(wsBlockNumber).toBe(blockNumber);
    });

    it('should have working beacon API', async () => {
        const header = await testnet.getBeaconHeader('head');
        expect(header.blockRoot).toBeDefined();
    });
});
```

### 11.4 BLS Verification Tests

```typescript
/**
 * BLS Signature Verification Tests
 */
import { ethers } from 'ethers';

describe('BLS Verification', () => {
    it('should aggregate BLS signatures', async () => {
        // Test signature aggregation
    });

    it('should verify aggregated signature on-chain', async () => {
        // Test on-chain verification
    });
});
```

### 11.5 Fuzz Testing

```solidity
/**
 * Foundry fuzz tests for edge cases
 */
contract FuzzTest is Test {
    DepositBox public depositBox;

    function setUp() public {
        depositBox = new DepositBox(address(0));
    }

    function testFuzzDepositAmounts(uint256 amount) public {
        vm.assume(amount > 0 && amount < 1_000_000_000 ether);

        address user = address(uint160(uint256(keccak256(abi.encodePacked(amount)))));
        vm.deal(user, amount);

        bytes32 commitment = keccak256(abi.encodePacked(amount));

        vm.prank(user);
        depositBox.depositETH{value: amount}(commitment);

        assertEq(address(depositBox).balance, amount);
    }
}
```

---

## 12. Deployment Configuration

### 12.1 Local Testing with Docker Testnet

We use our existing Docker testnet infrastructure for local testing and development:

```typescript
/**
 * Local Deployment Script
 * Deploys contracts to local Docker testnet
 */
import { EthereumDockerTestnet } from '@atomica/docker-testnet-ethereum';
import { ethers } from 'ethers';

interface DeploymentResult {
    depositBox: string;
    blsVerifier: string;
    settlement: string;
    controller: string;
    usdcToken: string;
}

async function deployToLocalTestnet(): Promise<DeploymentResult> {
    // 1. Start Docker testnet
    console.log('Starting Docker testnet...');
    const testnet = await EthereumDockerTestnet.start(4);
    await testnet.waitForHealthy(120_000);
    console.log('Testnet started successfully');

    const rpcUrl = testnet.getExecutionRpcUrl();
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // 2. Get deployer account (pre-funded)
    const deployer = await testnet.getPreFundedAccount(0);
    console.log('Deploying with account:', deployer.address);

    // 3. Deploy mock USDC token
    console.log('Deploying mock USDC...');
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const usdcToken = await MockERC20.connect(deployer).deploy(
        'USD Coin',
        'USDC',
        6
    );
    await usdcToken.waitForDeployment();
    const usdcAddress = await usdcToken.getAddress();
    console.log('USDC deployed to:', usdcAddress);

    // 4. Deploy BLS Verifier
    console.log('Deploying BLS Verifier...');
    const BLSVerifier = await ethers.getContractFactory('BLSVerifier');
    const blsVerifier = await BLSVerifier.connect(deployer).deploy();
    await blsVerifier.waitForDeployment();
    const blsAddress = await blsVerifier.getAddress();
    console.log('BLS Verifier deployed to:', blsAddress);

    // 5. Deploy DepositBox
    console.log('Deploying DepositBox...');
    const DepositBox = await ethers.getContractFactory('DepositBox');
    const depositBox = await DepositBox.connect(deployer).deploy(usdcAddress);
    await depositBox.waitForDeployment();
    const depositBoxAddress = await depositBox.getAddress();
    console.log('DepositBox deployed to:', depositBoxAddress);

    // 6. Deploy Transfer Manager
    console.log('Deploying Transfer Manager...');
    const TransferManager = await ethers.getContractFactory('TransferManager');
    const transferManager = await TransferManager.connect(deployer).deploy();
    await transferManager.waitForDeployment();
    const transferManagerAddress = await transferManager.getAddress();
    console.log('Transfer Manager deployed to:', transferManagerAddress);

    // 7. Deploy Settlement
    console.log('Deploying Settlement...');
    const Settlement = await ethers.getContractFactory('Settlement');
    const settlement = await Settlement.connect(deployer).deploy(
        blsAddress,
        depositBoxAddress
    );
    await settlement.waitForDeployment();
    const settlementAddress = await settlement.getAddress();
    console.log('Settlement deployed to:', settlementAddress);

    // 8. Deploy Merkle Tree
    console.log('Deploying Incremental Merkle Tree...');
    const IncrementalMerkleTree = await ethers.getContractFactory('IncrementalMerkleTree');
    const merkleTree = await IncrementalMerkleTree.connect(deployer).deploy();
    await merkleTree.waitForDeployment();
    const merkleTreeAddress = await merkleTree.getAddress();
    console.log('Merkle Tree deployed to:', merkleTreeAddress);

    // 9. Deploy Controller
    console.log('Deploying Atomica Controller...');
    const AtomicaController = await ethers.getContractFactory('AtomicaController');
    const controller = await AtomicaController.connect(deployer).deploy(
        depositBoxAddress,
        merkleTreeAddress,
        blsAddress,
        settlementAddress,
        transferManagerAddress
    );
    await controller.waitForDeployment();
    const controllerAddress = await controller.getAddress();
    console.log('Controller deployed to:', controllerAddress);

    // 10. Configure contracts
    console.log('Configuring contracts...');
    await transferManager.setTokenWhitelist(usdcAddress, true);
    await transferManager.setTokenWhitelist(ethers.ZeroAddress, true); // ETH

    // 11. Fund test accounts
    console.log('Funding test accounts...');
    const testAccounts = [
        await testnet.getPreFundedAccount(1),
        await testnet.getPreFundedAccount(2),
        await testnet.getPreFundedAccount(3)
    ];

    for (const account of testAccounts) {
        // Mint USDC to test accounts
        await usdcToken.mint(account.address, 1_000_000n);
    }

    // 12. Save deployment info
    const deploymentInfo: DeploymentResult = {
        depositBox: depositBoxAddress,
        blsVerifier: blsAddress,
        settlement: settlementAddress,
        controller: controllerAddress,
        usdcToken: usdcAddress
    };

    console.log('\n=== Deployment Complete ===');
    console.log(JSON.stringify(deploymentInfo, null, 2));

    // Keep testnet running for interaction
    console.log('\nTestnet RPC:', rpcUrl);
    console.log('Press Ctrl+C to stop...');

    // Keep the process running
    await new Promise(() => {});

    return deploymentInfo;
}

deployToLocalTestnet().catch(console.error);
```

### 12.2 Sepolia Testnet Configuration

```
Sepolia Testnet:
- Chain ID: 11155111
- RPC: https://rpc.sepolia.org
- Beacon API: https://checkpoint-sync.sepolia.beaconcha.in

Contract Addresses (Sepolia):
- USDC (test): 0x... (Sepolia USDC faucet)
- DepositBox: [TO BE DEPLOYED]
- BLSVerifier: [TO BE DEPLOYED]
- Settlement: [TO BE DEPLOYED]
- Controller: [TO BE DEPLOYED]
```

### 12.3 Mainnet Configuration

```
Mainnet:
- Chain ID: 1
- RPC: https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
- Beacon API: https://checkpoint-sync.mainnet.beaconcha.in

Contract Addresses (Mainnet):
- USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
- BLSVerifier: [TO BE DEPLOYED]
- DepositBox: [TO BE DEPLOYED]
- Settlement: [TO BE DEPLOYED]
- Controller: [TO BE DEPLOYED]
```

### 12.4 Docker Testnet Commands

```bash
# Start testnet manually
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/config
docker compose up -d

# Check status
docker compose ps
docker compose logs -f beacon

# View block production
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Teardown
docker compose down -v
```

### 12.5 Deployment Verification

```typescript
/**
 * Deployment verification script
 */
async function verifyDeployment(
    testnet: EthereumDockerTestnet,
    contracts: DeploymentResult
) {
    const provider = testnet.getProvider();
    const blockNumber = await provider.getBlockNumber();

    console.log('\n=== Deployment Verification ===');
    console.log('Block Number:', blockNumber);

    // Verify DepositBox
    const depositBox = await ethers.getContractAt('DepositBox', contracts.depositBox);
    console.log('DepositBox owner:', await depositBox.owner());
    console.log('Total ETH deposits:', await depositBox.totalDeposits(0));

    // Verify BLS Verifier
    const blsVerifier = await ethers.getContractAt('BLSVerifier', contracts.blsVerifier);
    console.log('BLS Verifier deployed:', await blsVerifier.getAddress() !== ethers.ZeroAddress);

    // Verify Settlement
    const settlement = await ethers.getContractAt('Settlement', contracts.settlement);
    console.log('Settlement controller:', await settlement.depositBoxAddress());

    console.log('\n=== All contracts verified ===');
}
```

---

## 13. Implementation Roadmap

### Phase 1: Core Contracts (Weeks 1-2)

**Goals:**
- Implement and test DepositBox contract
- Implement Incremental Merkle Tree
- Create basic test infrastructure with Docker testnet

**Deliverables:**
- [ ] DepositBox.sol with ETH/USDC deposit functionality
- [ ] IncrementalMerkleTree.sol for commitment storage
- [ ] Unit tests (90%+ coverage)
- [ ] Local deployment to Docker testnet

**Testing:**
```bash
# Start Docker testnet
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/config
docker compose up -d

# Run tests
cd /home/lucas/atomica/source/atomica-zkp/solidity
forge test
```

**Key Milestones:**
- [ ] Week 1: DepositBox implementation
- [ ] Week 2: Merkle tree + integration with testnet

### Phase 2: BLS Verification (Weeks 3-4)

**Goals:**
- Integrate EIP-2537 precompiles for BLS verification
- Deploy BLSVerifier contract
- Integrate with Docker testnet validators

**Deliverables:**
- [x] BLSVerifier contract using EIP-2537 (0x09, 0x0c)
- [ ] BLS signature collection from testnet validators
- [ ] Integration tests

**Testing:**
```typescript
// Test BLS signature collection from testnet
import { EthereumDockerTestnet } from '@atomica/docker-testnet-ethereum';

const testnet = await EthereumDockerTestnet.start(4);
// Collect BLS signatures from 4 validators
```

**Key Milestones:**
- [x] Week 3: BLSVerifier with EIP-2537 precompiles
- [ ] Week 4: Validator signature integration

### Phase 3: State Proof SDK Integration (Weeks 5-6)

**Goals:**
- Integrate State Proof SDK for deposit verification
- Implement EIP-1186 proof generation
- Create auction coordinator service

**Deliverables:**
- [ ] StateProofGenerator class using @atomica/state-proof-verifier
- [ ] AuctionCoordinator service
- [ ] Complete deposit → proof → auction flow

**Testing:**
```typescript
import { fetchProof, verifyAccountProof } from '@atomica/state-proof-verifier';

// Generate and verify state proof
const proof = await fetchProof(rpcUrl, address, [], blockNumber);
const result = await verifyAccountProof(proof.accountProof, stateRoot, address);
```

**Key Milestones:**
- [ ] Week 5: StateProofGenerator implementation
- [ ] Week 6: Auction coordinator + end-to-end flow

### Phase 4: Settlement Contract (Weeks 7-8)

**Goals:**
- Implement Settlement contract
- Create TransferManager
- Integrate with auction coordinator

**Deliverables:**
- [ ] Settlement.sol with atomic trade execution
- [ ] TransferManager for multi-token transfers
- [ ] Batch settlement functionality
- [ ] Full integration tests

**Testing:**
```typescript
// Test settlement flow
const result = await auctionCoordinator.runAuction(
    depositBoxAddress,
    tradeId
);
await settlement.finalizeTrade(result);
await settlement.executeSettlement(tradeId, proof, ethAmount, usdcAmount);
```

**Key Milestones:**
- [ ] Week 7: Settlement contract implementation
- [ ] Week 8: Integration with coordinator

### Phase 5: Security Audit (Weeks 9-12)

**Goals:**
- Comprehensive security review
- Third-party audit
- Mainnet deployment

**Deliverables:**
- [ ] Internal security review report
- [ ] Third-party audit (Trail of Bits / OpenZeppelin)
- [ ] Mainnet deployment
- [ ] Bug bounty program launch

**Security Checklist:**
- [ ] Reentrancy protection verified
- [ ] Access control audit
- [ ] BLS signature replay protection
- [ ] MEV protection mechanisms
- [ ] Emergency pause functionality
- [ ] Upgradeability review

### Testing Workflow

```bash
# 1. Start Docker testnet
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/config
docker compose up -d

# 2. Run Foundry unit tests
cd /home/lucas/atomica/source/atomica-zkp/solidity
forge test

# 3. Run TypeScript integration tests
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/typescript-sdk
bun test

# 4. Run state proof SDK tests
cd /home/lucas/atomica/source/state-proofs/typescript
bun test

# 5. Run end-to-end tests
cd /home/lucas/atomica/source/atomica-zkp/solidity
npm run test:e2e

# 6. Stop testnet
cd /home/lucas/atomica/source/docker-testnet/ethereum-testnet/config
docker compose down -v
```

### CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Docker
        run: docker compose up -d
      
      - name: Wait for testnet
        run: sleep 30
      
      - name: Run Foundry tests
        run: |
          cd atomica-zkp/solidity
          forge test
      
      - name: Run TypeScript tests
        run: |
          cd docker-testnet/ethereum-testnet/typescript-sdk
          bun test
      
      - name: Run State Proof tests
        run: |
          cd state-proofs/typescript
          bun test
      
      - name: Teardown Docker
        if: always()
        run: docker compose down -v
```

---

## 14. Gas Optimization Strategies

### 14.1 Storage Optimization

```solidity
// Use packing for frequently accessed data
struct PackedDeposit {
    uint128 amount;      // 128 bits
    uint64 timestamp;    // 64 bits
    uint64 nonce;        // 64 bits
    AssetType assetType; // 8 bits (enum)
    DepositStatus status; // 8 bits (enum)
}
```

### 14.2 Batch Operations

```solidity
// Batch deposits to reduce per-transaction overhead
function batchDepositETH(bytes32[] calldata commitments) external payable {
    uint256 count = commitments.length;
    require(msg.value == count * DEPOSIT_AMOUNT, "Invalid total amount");
    
    for (uint256 i = 0; i < count; i++) {
        _depositETH(commitments[i]);
    }
}
```

### 14.3 Calldata Usage

```solidity
// Use calldata for read-only parameters to save gas
function batchConfirm(bytes32[] calldata commitments) external onlyOwner {
    // calldata is cheaper than memory
}
```

---

## 14. Existing Infrastructure Utilization

### 14.1 Docker Testnet Cluster

We leverage our existing Docker testnet infrastructure located at `/home/lucas/atomica/source/docker-testnet/`:

**Architecture:**
```
docker-testnet/
├── ethereum-testnet/              # Ethereum PoS testnet
│   ├── config/
│   │   ├── docker-compose.yaml    # Geth + Lighthouse setup
│   │   └── genesis/              # Genesis configuration
│   └── typescript-sdk/           # Testnet SDK
│       ├── src/index.ts          # EthereumDockerTestnet class
│       └── test/                 # Integration tests
├── typescript-sdk/               # Aptos testnet SDK
├── rust-sdk/                     # Rust SDK
└── config/                       # Aptos configuration
```

**Key Features:**
- 4-validator setup with Geth (EL) + Lighthouse (CL)
- Pre-funded test accounts (1000 ETH each)
- Full RPC/WebSocket access
- Beacon API for light client integration
- Support for all forks at genesis (Altair, Bellatrix, Capella, Deneb)

**Usage:**
```typescript
import { EthereumDockerTestnet } from './src/index';

const testnet = await EthereumDockerTestnet.start(4);
await testnet.waitForHealthy();

// Get RPC endpoints
const rpcUrl = testnet.getExecutionRpcUrl();
const wsUrl = testnet.getExecutionWsUrl();
const beaconUrl = testnet.getBeaconApiUrl();

// Get test accounts
const account = await testnet.getPreFundedAccount(0);

// Wait for blocks
await testnet.waitForBlocks(10);

// Cleanup
await testnet.teardown();
```

### 14.2 State Proof SDK

We leverage our existing state-proofs SDK located at `/home/lucas/atomica/source/state-proofs/typescript/`:

**Architecture:**
```
state-proofs/typescript/
├── src/
│   ├── index.ts              # Main exports
│   ├── fetcher.ts            # RPC fetching (eth_getProof)
│   ├── verifier.ts           # High-level proof verification
│   ├── mpt.ts                # MPT verification
│   ├── beacon/               # Light client module
│   │   ├── sync.ts           # BLS/sync committee
│   │   ├── fetch.ts          # Beacon API
│   │   └── ssz.ts            # SSZ encoding
│   └── cli.ts                # CLI tool
└── test/                     # Tests
```

**Key Capabilities:**
- EIP-1186 proof verification (account, storage, transaction, receipt)
- BLS signature verification for sync committees
- Light client integration
- Trustless block header verification

**Usage:**
```typescript
import {
    fetchProof,
    fetchBlock,
    verifyAccountProof,
    verifyStorageProof
} from '@atomica/state-proof-verifier';

// Fetch and verify account state
const proof = await fetchProof(rpcUrl, address, [], blockNumber);
const block = await fetchBlock(rpcUrl, blockNumber);
const result = await verifyAccountProof(proof.accountProof, block.stateRoot, address);
```

### 14.3 Integration Points

The contracts integrate with existing infrastructure as follows:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ATOMICA EVM CONTRACTS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DepositBox ◄────────┬──────────► State Proof SDK                          │
│       │              │             (EIP-1186 proofs)                        │
│       │              │                                                       │
│       ▼              ▼                                                       │
│  Settlement ◄──────► BLSVerifier                                            │
│       │              │                                                       │
│       │              ▼                                                       │
│       └────────────► Docker Testnet                                         │
│                        (Local testing, 4 validators)                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.4 SDK Package Integration

```typescript
/**
 * Full integration with existing SDKs
 */
import { EthereumDockerTestnet } from '@atomica/docker-testnet-ethereum';
import {
    fetchProof,
    fetchBlock,
    verifyAccountProof
} from '@atomica/state-proof-verifier';

class AtomicaIntegration {
    private testnet: EthereumDockerTestnet;
    private provider: ethers.JsonRpcProvider;

    async initialize(): Promise<void> {
        // Start Docker testnet
        this.testnet = await EthereumDockerTestnet.start(4);
        await this.testnet.waitForHealthy();

        // Setup provider
        this.provider = new ethers.JsonRpcProvider(this.testnet.getExecutionRpcUrl());
    }

    async verifyDepositProof(
        depositBoxAddress: string,
        blockNumber: number
    ): Promise<{ valid: boolean; stateRoot: string }> {
        // Use State Proof SDK to verify
        const proof = await fetchProof(
            this.testnet.getExecutionRpcUrl(),
            depositBoxAddress,
            [],
            blockNumber
        );

        const block = await fetchBlock(
            this.testnet.getExecutionRpcUrl(),
            blockNumber
        );

        const result = await verifyAccountProof(
            proof.accountProof,
            block.stateRoot,
            depositBoxAddress
        );

        return {
            valid: result.valid,
            stateRoot: block.stateRoot
        };
    }

    async cleanup(): Promise<void> {
        await this.testnet.teardown();
    }
}
```

---

## 15. Conclusion

This implementation plan provides a comprehensive blueprint for building Atomica's EVM deposit infrastructure, leveraging our existing **Docker testnet** and **State Proof SDK** infrastructure.

### Key Components

1. **DepositBox Contract** - Handles ETH/USDC deposits with commitment-based privacy and Merkle tree integration

2. **BLSVerifier Contract** - Implements BLS12-381 signature verification using Ethereum's EIP-2537 precompiles (0x09, 0x0c)

3. **Settlement Contract** - Executes atomic trades based on verified BLS proofs with allocation Merkle trees

4. **AtomicaController** - Coordinates all contracts and manages the trading round lifecycle

5. **Off-Chain Services** - Auction coordinator, state proof generation, BLS signature collection using existing SDKs

### Architecture Highlights

- **Commitment-based deposits** for privacy
- **Incremental Merkle trees** for efficient state commitments
- **BLS signature aggregation** from validators
- **State Proof SDK integration** for EIP-1186 proof verification
- **Docker testnet** for comprehensive local testing
- **Atomic settlement** ensuring trustless cross-chain trading
- **Circuit breakers and access control** for security

### Infrastructure Utilization

We leverage existing infrastructure:
- **`docker-testnet/`**: Local Ethereum PoS testnet with 4 validators
- **`state-proofs/typescript/`**: EIP-1186 proof verification SDK
- **Pre-funded test accounts**: 4 accounts with 1000 ETH each
- **Full RPC/WebSocket access**: For all testing scenarios
- **Beacon API integration**: For light client verification

### Implementation Roadmap

- **Phase 1 (Weeks 1-2)**: Core Contracts - DepositBox, Merkle tree
- **Phase 2 (Weeks 3-4)**: BLS Verification - BLS12-381 library
- **Phase 3 (Weeks 5-6)**: State Proof SDK Integration
- **Phase 4 (Weeks 7-8)**: Settlement - Trade finalization
- **Phase 5 (Weeks 9-12)**: Security Audit and Mainnet Deployment

### Protocol Evolution

This EVM implementation plan covers the v0.1 Beta phase. See [Plan Evolution](docs/PLAN-EVOLUTION.md) for the full roadmap:

| Phase | Focus | This Document |
|-------|-------|---------------|
| **v0.1 Beta** | Trusted validator set | ✅ Core contracts |
| **v1.0** | ZK auction verification | 📋 Future update |
| **v2.0** | Cross-chain + BitVM | 📋 Future design |

### Future: Fraud Proofs (v3+)

**Investigational - Not Yet Implemented**

Future versions (v3+) may incorporate **interactive fraud proofs** to allow anyone to challenge incorrect state transitions off-chain, with on-chain verification of the challenge.

This is currently **investigational** because:
- Complex to implement correctly
- Requires careful game-theoretic analysis
- May not be necessary with ZK verification in v1/v2

See [Cannon/AMM fraud proof research](https://github.com/ethereum-optimism/cannon) for reference implementations.

### Created Files

- `/home/lucas/atomica/docs/plan/evm-contracts-implementation-plan.md` - Complete implementation plan (updated with SDK integration)
- `/home/lucas/atomica/docs/development/docker-testnet-sdk-integration.md` - Comprehensive Docker and SDK integration guide
- `/home/lucas/atomica/docs/development/quick-reference.md` - Quick reference guide
- `/home/lucas/atomica/docs/development/contract-interfaces.sol` - Solidity interfaces for all contracts
- `/home/lucas/atomica/docs/PLAN-EVOLUTION.md` - Protocol evolution roadmap (v0 → v1 → v2)

### Next Steps

1. Review and finalize contract interfaces
2. Begin Phase 1 implementation (DepositBox)
3. Set up Docker testnet for local testing
4. Integrate State Proof SDK for proof verification
5. Plan v1.0 ZK circuit development
6. Engage security auditors for Phase 5

---

*Document Version: 2.0*
*Last Updated: January 2026*
*Uses: Docker Testnet SDK + State Proof SDK*
*See also: [Plan Evolution](docs/PLAN-EVOLUTION.md) for v0 → v1 → v2 roadmap*
