// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DepositTypes
 * @notice Core data structures for deposits using Ethereum native state proofs
 * @dev Deposits are verified via eth_getProof (EIP-1186) Merkle Patricia Trie proofs
 *
 * Architecture Change (January 2026):
 * - Removed commitment-based deposits in favor of native Ethereum state proofs
 * - eth_getProof provides cryptographic proof of any storage slot
 * - No separate Merkle tree needed - use Ethereum's state trie
 *
 * Trust Model:
 * - Ethereum stateRoot from block header is cryptographically authenticated
 * - BLS validators sign block headers for cross-chain verification
 * - MPT proof verifies storage slot against stateRoot
 */
library DepositTypes {
    /**
     * @notice Deposit status lifecycle
     */
    enum DepositStatus {
        PENDING,
        CONFIRMED,
        SETTLED,
        REFUNDED
    }

    /**
     * @notice Asset type for deposits
     */
    enum AssetType {
        ETH,
        USDC
    }

    /**
     * @notice Deposit structure with native storage proof support
     * @param auctionId Auction this deposit belongs to (REQUIRED)
     * @param depositor User's Ethereum address
     * @param assetType Type of asset deposited
     * @param amount Deposit amount (in wei for ETH, decimals for USDC)
     * @param nonce Unique deposit identifier (used as storage key)
     * @param status Current deposit status
     * @param timestamp Deposit creation time
     * @dev Storage key: keccak256(abi.encode(auctionId, depositor, nonce)) for eth_getProof
     */
    struct Deposit {
        uint64 auctionId;
        address depositor;
        AssetType assetType;
        uint256 amount;
        uint256 nonce;
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
     * @param stateRootHash Ethereum stateRoot containing this auction's deposits
     */
    struct AuctionMetadata {
        uint64 nonce;
        string description;
        uint64 deadline;
        uint256 scuttleBlock;
        bytes32 stateRootHash;
    }

    /**
     * @notice Auction configuration with deadline handling
     * @dev Deadline is specified in Unix microseconds, converted to seconds/block for EVM
     */
    struct AuctionConfig {
        uint64 nonce;
        string description;
        uint64 deadlineMicro;
        uint256 minPrice;
        uint256 maxPrice;
        uint256 minEthAmount;
        uint256 minUsdcAmount;
    }

    /**
     * @notice Auction deadline information
     * @dev Derived from AuctionConfig for on-chain deadline checking
     */
    struct AuctionDeadline {
        uint64 deadlineMicro;
        uint64 deadlineSeconds;
        uint256 scuttleBlock;
        bool deadlinePassed;
    }

    /**
     * @notice Auction state for deadline tracking
     */
    enum AuctionState {
        NONE,
        OPEN,
        CLOSING,
        SETTLED,
        SCUTTLED
    }

    /**
     * @notice Complete auction information
     */
    struct Auction {
        uint64 nonce;
        string description;
        AuctionDeadline deadline;
        AuctionState state;
        uint256 startNonce;
        uint256 endNonce;
        uint256 clearingPrice;
        uint256 totalEthDeposits;
        uint256 totalUsdcDeposits;
    }

    /**
     * @notice Trade execution results with state proof reference
     * @param clearingPrice Final ETH/USDC price
     * @param ethToTrade Amount of ETH to trade
     * @param usdcToTrade Amount of USDC to trade
     * @param ethStateRoot Ethereum stateRoot at settlement time
     * @param startNonce Starting deposit nonce for this auction
     * @param endNonce Ending deposit nonce for this auction
     */
    struct TradeResult {
        uint256 clearingPrice;
        uint256 ethToTrade;
        uint256 usdcToTrade;
        bytes32 ethStateRoot;
        uint256 startNonce;
        uint256 endNonce;
    }

    /**
     * @notice State proof data for deposit verification
     * @param stateRoot Ethereum stateRoot from block header
     * @param accountProof RLP-encoded Merkle-Patricia Trie proof for account
     * @param storageProofs Array of storage proofs for deposits
     * @param blockNumber Ethereum block number
     * @param blockHash Ethereum block hash (BLS-signed)
     */
    struct StateProof {
        bytes32 stateRoot;
        bytes[] accountProof;
        StorageProof[] storageProofs;
        uint256 blockNumber;
        bytes32 blockHash;
    }

    /**
     * @notice Individual storage proof for a deposit
     * @param key Storage key (depositor address + nonce hash)
     * @param value Encoded deposit data
     * @param proof RLP-encoded MPT proof nodes
     */
    struct StorageProof {
        bytes32 key;
        bytes value;
        bytes[] proof;
    }

    /**
     * @notice Get status string for debugging
     */
    function getStatusString(DepositStatus status) internal pure returns (string memory) {
        if (status == DepositStatus.PENDING) return "PENDING";
        if (status == DepositStatus.CONFIRMED) return "CONFIRMED";
        if (status == DepositStatus.SETTLED) return "SETTLED";
        if (status == DepositStatus.REFUNDED) return "REFUNDED";
        return "UNKNOWN";
    }

    /**
     * @notice Get asset type string for debugging
     */
    function getAssetTypeString(AssetType assetType) internal pure returns (string memory) {
        if (assetType == AssetType.ETH) return "ETH";
        if (assetType == AssetType.USDC) return "USDC";
        return "UNKNOWN";
    }

    /**
     * @notice Compute storage key for a deposit
     * @param auctionId Auction this deposit belongs to
     * @param depositor Address of depositor
     * @param nonce Unique deposit identifier
     * @return Storage key for eth_getProof
     * @dev Key format: keccak256(abi.encode(auctionId, depositor, nonce))
     */
    function computeStorageKey(uint64 auctionId, address depositor, uint256 nonce) 
        internal 
        pure 
        returns (bytes32) 
    {
        return keccak256(abi.encode(auctionId, depositor, nonce));
    }

    /**
     * @notice Convert microsecond deadline to AuctionDeadline
     * @param deadlineMicro Unix timestamp in microseconds
     * @param currentBlock Current block number
     * @return AuctionDeadline struct
     */
    function deadlineFromMicroseconds(uint64 deadlineMicro, uint256 currentBlock) 
        internal 
        view 
        returns (AuctionDeadline memory) 
    {
        // Convert microseconds to seconds
        uint64 deadlineSeconds = deadlineMicro / 1_000_000;
        
        // Calculate time remaining
        uint256 secondsRemaining = 0;
        if (block.timestamp < deadlineSeconds) {
            secondsRemaining = deadlineSeconds - block.timestamp;
        }
        
        // Estimate scuttle block (12s per block average + 10 block buffer)
        uint256 blocksRemaining = (secondsRemaining / 12) + 10;
        uint256 scuttleBlock = block.number + blocksRemaining;
        
        bool deadlinePassed = block.timestamp >= deadlineSeconds || block.number >= scuttleBlock;
        
        return AuctionDeadline({
            deadlineMicro: deadlineMicro,
            deadlineSeconds: deadlineSeconds,
            scuttleBlock: scuttleBlock,
            deadlinePassed: deadlinePassed
        });
    }

    /**
     * @notice Check if auction deadline has passed
     * @param deadline AuctionDeadline struct
     * @return True if deadline passed
     */
    function isDeadlinePassed(AuctionDeadline memory deadline) 
        internal 
        view 
        returns (bool) 
    {
        // Check wall clock time first
        if (block.timestamp >= deadline.deadlineSeconds) {
            return true;
        }
        
        // Check block-based scuttle as backup
        if (block.number >= deadline.scuttleBlock) {
            return true;
        }
        
        return false;
    }

    /**
     * @notice Get auction state string for debugging
     */
    function getAuctionStateString(AuctionState state) internal pure returns (string memory) {
        if (state == AuctionState.NONE) return "NONE";
        if (state == AuctionState.OPEN) return "OPEN";
        if (state == AuctionState.CLOSING) return "CLOSING";
        if (state == AuctionState.SETTLED) return "SETTLED";
        if (state == AuctionState.SCUTTLED) return "SCUTTLED";
        return "UNKNOWN";
    }
}
