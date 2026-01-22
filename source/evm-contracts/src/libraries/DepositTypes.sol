// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library DepositTypes {
    enum DepositStatus {
        PENDING,
        CONFIRMED,
        TRADING,
        SETTLED,
        REFUNDED
    }

    enum AssetType {
        ETH,
        USDC
    }

    struct Deposit {
        address depositor;
        AssetType assetType;
        uint256 amount;
        uint256 nonce;
        bytes32 commitment;
        DepositStatus status;
        uint256 timestamp;
    }

    struct AuctionParams {
        uint256 startTime;
        uint256 duration;
        uint256 minPrice;
        uint256 maxPrice;
        uint256 totalEthDeposits;
        uint256 totalUsdcDeposits;
        bool finalized;
    }

    struct AuctionMetadata {
        uint64 nonce;
        string description;
        uint64 deadline;
        uint256 scuttleBlock;
        bytes32 stateRootHash;
    }

    struct TradeResult {
        uint256 clearingPrice;
        uint256 ethToTrade;
        uint256 usdcToTrade;
        bytes32 merkleRoot;
    }

    struct SettlementProof {
        bytes32 stateRoot;
        bytes32[] merkleProof;
        bytes32 leaf;
        TradeResult tradeResult;
        bytes blsSignature;
        uint256[] validatorIndices;
    }

    function getStatusString(DepositStatus status) internal pure returns (string memory) {
        if (status == DepositStatus.PENDING) return "PENDING";
        if (status == DepositStatus.CONFIRMED) return "CONFIRMED";
        if (status == DepositStatus.TRADING) return "TRADING";
        if (status == DepositStatus.SETTLED) return "SETTLED";
        if (status == DepositStatus.REFUNDED) return "REFUNDED";
        return "UNKNOWN";
    }

    function getAssetTypeString(AssetType assetType) internal pure returns (string memory) {
        if (assetType == AssetType.ETH) return "ETH";
        if (assetType == AssetType.USDC) return "USDC";
        return "UNKNOWN";
    }
}
