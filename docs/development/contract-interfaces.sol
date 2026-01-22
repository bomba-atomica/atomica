// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IAtomicaController
 * @notice Interface for the main Atomica controller
 */
interface IAtomicaController {
    function startRound(bytes32 tradeId) external;
    function completeRound(uint256 roundId) external;
    function setPaused(bool status) external;
    function withdrawFees(address token, uint256 amount) external;
    function currentRound() external view returns (uint256);
}

/**
 * @title IDepositBox
 * @notice Interface for deposit functionality
 */
interface IDepositBox {
    function depositETH(bytes32 commitment) external payable;
    function depositUSDC(uint256 amount, bytes32 commitment) external;
    function confirmDeposits(bytes32[] calldata commitments, bytes32 newStateRoot) external;
    function refundDeposit(address depositor, uint256 nonce) external;
    function totalDeposits(uint8 assetType) external view returns (uint256);
    function latestStateRoot() external view returns (bytes32);
}

/**
 * @title IBLSVerifier
 * @notice Interface for BLS verification
 */
interface IBLSVerifier {
    function verifyAggregatedSignature(
        bytes[] calldata pubkeys,
        bytes calldata signature,
        bytes32 messageHash,
        uint256[] calldata validatorIndices
    ) external returns (bool);
    
    function verifyStateProof(
        bytes32 stateRoot,
        bytes calldata signature,
        bytes[] calldata pubkeys,
        uint256[] calldata validatorIndices
    ) external returns (bool);
}

/**
 * @title ISettlement
 * @notice Interface for settlement functionality
 */
interface ISettlement {
    function finalizeTrade(
        bytes32 tradeId,
        uint256 clearingPrice,
        uint256 ethToTrade,
        uint256 usdcToTrade,
        bytes32 merkleRoot,
        bytes calldata signature,
        bytes[] calldata pubkeys,
        uint256[] calldata validatorIndices
    ) external returns (bool);
    
    function executeSettlement(
        bytes32 tradeId,
        bytes32[] calldata allocationProof,
        uint256 ethDeposited,
        uint256 usdcDeposited
    ) external;
}

/**
 * @title IStateCommitment
 * @notice Interface for state commitment
 */
interface IStateCommitment {
    function insert(bytes32 leaf) external returns (uint256 index, bytes32 newRoot);
    function batchInsert(bytes32[] calldata leaves) external;
    function verify(bytes32 leaf, bytes32[] calldata proof, bytes32 root) external pure returns (bool);
    function root() external view returns (bytes32);
    function leafCount() external view returns (uint256);
}
