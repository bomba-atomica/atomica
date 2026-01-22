// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

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
 *
 * @see https://eips.ethereum.org/EIPS/eip-1186
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
     * @param depositor User's Ethereum address
     * @param assetType Type of asset deposited
     * @param amount Deposit amount (in wei for ETH, decimals for USDC)
     * @param nonce Unique deposit identifier (used as storage key)
     * @param status Current deposit status
     * @param timestamp Deposit creation time
     * @dev Storage key: keccak256(abi.encode(depositor, nonce)) for eth_getProof
     */
    struct Deposit {
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
     * @param depositor Address of depositor
     * @param nonce Unique deposit identifier
     * @return Storage key for eth_getProof
     * @dev Key format: keccak256(abi.encode(depositor, nonce))
     */
    function computeStorageKey(address depositor, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(depositor, nonce));
    }
}
