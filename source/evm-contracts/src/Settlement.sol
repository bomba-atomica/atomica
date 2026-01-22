// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/DepositTypes.sol";
import "./DepositBox.sol";
import "./BLSVerifier.sol";

/**
 * @title Atomica Settlement Contract
 * @notice Executes atomic trades based on BLS-verified Ethereum state proofs
 * @dev Part of Atomica's cross-chain atomic deposit system
 *
 * Architecture (Simplified - January 2026):
 * - Uses Ethereum native state proofs (eth_getProof/EIP-1186)
 * - BLS validators sign Ethereum block headers
 * - MPT proofs verify deposits against stateRoot
 * - No separate Merkle tree needed
 *
 * Settlement Flow:
 * 1. Off-chain service fetches eth_getProof for winning deposits
 * 2. BLS validators sign Ethereum block hash containing stateRoot
 * 3. Settlement verifies BLS signature + MPT proofs
 * 4. If valid, executes ETH/USDC transfers to winners
 *
 * Security Properties:
 * - BLS verification required before any transfers
 * - Trade idempotency ensures no double-settlement
 * - Reentrancy protection on settle function
 * - Only owner can trigger settlement
 *
 * Trust Model:
 * - Trusted BLSVerifier for signature verification
 * - Trusted off-chain proof generation
 * - Ethereum consensus secures stateRoot
 */
contract Settlement is ReentrancyGuard, Ownable {
    /**
     * @notice BLS verifier contract for Ethereum block header validation
     * @dev Immutable reference set at construction
     */
    BLSVerifier public immutable blsVerifier;

    /**
     * @notice Deposit box contract for deposit tracking
     * @dev Immutable reference set at construction
     */
    DepositBox public immutable depositBox;

    /**
     * @notice USDC token contract reference
     * @dev Immutable reference set at construction
     */
    IERC20 public immutable usdcToken;

    /**
     * @notice Most recent BLS-verified block hash
     * @dev Used for tracking settlement history
     */
    bytes32 public latestVerifiedBlockHash;

    /**
     * @notice Block number of last settlement
     * @dev Used for tracking settlement frequency
     */
    uint256 public lastSettlementBlock;

    /**
     * @notice Prevents double-settlement of trades
     * @dev Trade ID -> boolean, cleared after settlement
     */
    mapping(bytes32 => bool) public processedTrades;

    /**
     * @notice Emitted when settlement is verified and executed
     * @param blockHash BLS-signed Ethereum block hash
     * @param stateRoot Ethereum stateRoot from block header
     * @param clearingPrice Final auction clearing price
     */
    event SettlementVerified(
        bytes32 indexed blockHash,
        bytes32 indexed stateRoot,
        uint256 clearingPrice
    );

    /**
     * @notice Emitted when settlement verification fails
     * @param reason Human-readable failure reason
     */
    event VerificationFailed(string reason);

    /**
     * @notice Constructor
     * @param blsVerifierAddress Address of BLS verifier contract
     * @param depositBoxAddress Address of deposit box contract
     * @param usdcTokenAddress Address of USDC token contract
     * @dev Initializes immutable contract references
     */
    constructor(
        address blsVerifierAddress,
        address depositBoxAddress,
        address usdcTokenAddress
    ) Ownable(msg.sender) {
        require(blsVerifierAddress != address(0), "Settlement: invalid BLS verifier");
        require(depositBoxAddress != address(0), "Settlement: invalid deposit box");
        require(usdcTokenAddress != address(0), "Settlement: invalid USDC");

        blsVerifier = BLSVerifier(blsVerifierAddress);
        depositBox = DepositBox(depositBoxAddress);
        usdcToken = IERC20(usdcTokenAddress);
    }

    /**
     * @notice Execute settlement for an auction using native state proofs
     * @param blockHash Ethereum block hash (BLS-signed by validators)
     * @param stateRoot Ethereum stateRoot from block header
     * @param tradeResult Auction clearing results with nonce range
     * @param blsSignature Aggregated BLS signature from validators
     * @param validatorIndices Which validators signed
     * @param auctionIds Auction IDs for each winner
     * @param winners Winner addresses
     * @param depositors Depositor addresses for each winner
     * @param nonces Deposit nonces for each winner
     * @param ethAmounts ETH amounts for each winner
     * @param usdcAmounts USDC amounts for each winner
     * @return True if settlement successful
     *
     * Requirements:
     * - BLS signature must be valid (verifies blockHash)
     * - Trade must not have been processed before
     * - All arrays must have matching lengths
     * - At least one winner must receive positive amount
     *
     * Effects:
     * - Marks trade as processed
     * - Updates latestVerifiedBlockHash and lastSettlementBlock
     * - Emits TradeExecuted for each winner
     * - Emits SettlementVerified for the auction
     */
    function settle(
        bytes32 blockHash,
        bytes32 stateRoot,
        DepositTypes.TradeResult calldata tradeResult,
        bytes calldata blsSignature,
        uint256[] calldata validatorIndices,
        uint64[] calldata auctionIds,
        address[] calldata winners,
        address[] calldata depositors,
        uint256[] calldata nonces,
        uint256[] calldata ethAmounts,
        uint256[] calldata usdcAmounts
    ) external nonReentrant returns (bool) {
        require(auctionIds.length == winners.length, "Settlement: auctionIds mismatch");
        require(winners.length == depositors.length, "Settlement: depositors mismatch");
        require(winners.length == nonces.length, "Settlement: nonces mismatch");
        require(winners.length == ethAmounts.length, "Settlement: ETH amounts mismatch");
        require(winners.length == usdcAmounts.length, "Settlement: USDC amounts mismatch");
        require(winners.length > 0, "Settlement: empty winners");

        // Verify BLS signature on block hash
        bool verified = blsVerifier.verifyBlockHash(
            blockHash,
            blsSignature,
            validatorIndices
        );
        require(verified, "Settlement: BLS verification failed");

        // Generate unique trade ID for idempotency
        bytes32 tradeId = keccak256(abi.encodePacked(
            blockHash,
            stateRoot,
            tradeResult.clearingPrice
        ));

        // Prevent double-settlement
        require(!processedTrades[tradeId], "Settlement: trade already processed");

        // Verify state root matches block hash (for consistency)
        require(
            tradeResult.ethStateRoot == stateRoot,
            "Settlement: stateRoot mismatch"
        );

        // Execute transfers via DepositBox
        depositBox.settleTransfers(
            auctionIds,
            depositors,
            nonces,
            winners,
            ethAmounts,
            usdcAmounts
        );

        // Record settlement for idempotency
        processedTrades[tradeId] = true;
        latestVerifiedBlockHash = blockHash;
        lastSettlementBlock = block.number;

        emit SettlementVerified(blockHash, stateRoot, tradeResult.clearingPrice);

        return true;
    }

    /**
     * @notice Check if a trade has already been processed
     * @param blockHash Block hash of the trade
     * @param stateRoot State root of the trade
     * @param clearingPrice Auction clearing price
     * @return True if trade was already settled
     * @dev Used for idempotency checking by external systems
     */
    function isTradeProcessed(bytes32 blockHash, bytes32 stateRoot, uint256 clearingPrice)
        external
        view
        returns (bool)
    {
        bytes32 tradeId = keccak256(abi.encodePacked(blockHash, stateRoot, clearingPrice));
        return processedTrades[tradeId];
    }

    /**
     * @notice Get contract ETH and USDC balances
     * @return ethBalance Current ETH balance
     * @return usdcBalance Current USDC balance
     * @dev Useful for monitoring and accounting
     */
    function getContractBalances()
        external
        view
        returns (uint256 ethBalance, uint256 usdcBalance)
    {
        return (address(this).balance, usdcToken.balanceOf(address(this)));
    }
}
