// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/DepositTypes.sol";

/**
 * @title AuctionRegistry
 * @notice Registry for auction configuration and deadline tracking
 * @dev All deposits must reference a registered auction
 *
 * Architecture:
 * - Ownable: Only owner can register auctions
 * - Immutable links: auctionRegistry set in constructor, never changes
 * - Orthogonal: No dependencies on other Atomica contracts
 *
 * Deposit Flow:
 * 1. Owner registers auction with registerAuction()
 * 2. Auction receives unique nonce (auto-incremented)
 * 3. Users deposit via DepositBox.depositETH/USDC(auctionId, nonce)
 * 4. DepositBox validates against this registry
 *
 * @author Atomica
 */
contract AuctionRegistry is Ownable {
    using DepositTypes for DepositTypes.AuctionConfig;
    using DepositTypes for DepositTypes.AuctionDeadline;
    using DepositTypes for DepositTypes.AuctionState;

    /**
     * @notice Auction configuration with deadline handling
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
     */
    struct AuctionDeadline {
        uint64 deadlineMicro;
        uint64 deadlineSeconds;
        uint256 scuttleBlock;
        bool deadlinePassed;
    }

    /**
     * @notice Complete auction information
     */
    struct Auction {
        uint64 nonce;
        string description;
        uint64 deadline;
        uint256 scuttleBlock;
        DepositTypes.AuctionState state;
    }

    /**
     * @notice Time window for deposits after deadline (grace period)
     */
    uint64 public constant DEPOSIT_GRACE_PERIOD = 0 seconds;

    /**
     * @notice Time window for registering auction before its deadline
     */
    uint64 public constant REGISTRATION_BUFFER = 1 hours;

    /**
     * @notice Maps auction nonce to auction data
     */
    mapping(uint64 => Auction) public auctions;

    /**
     * @notice Counter for assigning unique auction nonces
     */
    uint64 public nextAuctionNonce;

    /**
     * @notice Emitted when a new auction is registered
     * @param nonce Unique auction identifier
     * @param description Human-readable auction description
     * @param deadline Auction deadline (seconds since epoch)
     * @param scuttleBlock Block number where auction auto-terminates
     */
    event AuctionRegistered(
        uint64 indexed nonce,
        string description,
        uint64 deadline,
        uint256 scuttleBlock
    );

    /**
     * @notice Emitted when auction state changes
     * @param nonce Auction identifier
     * @param previousState Previous state
     * @param newState New state
     */
    event AuctionStateChanged(
        uint64 indexed nonce,
        DepositTypes.AuctionState previousState,
        DepositTypes.AuctionState newState
    );

    /**
     * @notice Constructor
     */
    constructor() Ownable(msg.sender) {
        nextAuctionNonce = 1; // Start from 1, 0 is invalid
    }

    /**
     * @notice Register a new auction
     * @param config AuctionConfig with description and deadline
     * @return nonce The assigned auction ID
     *
     * Requirements:
     * - Caller must be owner
     * - deadlineMicro must be in the future
     * - Registration must happen before deadline (with buffer)
     *
     * Effects:
     * - Assigns unique nonce to auction
     * - Sets state to OPEN
     * - Calculates scuttleBlock
     * - Emits AuctionRegistered event
     */
    function registerAuction(DepositTypes.AuctionConfig calldata config)
        external
        onlyOwner
        returns (uint64 nonce)
    {
        require(bytes(config.description).length > 0, "AuctionRegistry: empty description");
        require(config.deadlineMicro > 0, "AuctionRegistry: zero deadline");

        // Convert microseconds to seconds
        uint64 deadlineSeconds = config.deadlineMicro / 1_000_000;
        
        // Require registration before deadline (with buffer)
        require(
            block.timestamp + REGISTRATION_BUFFER <= deadlineSeconds,
            "AuctionRegistry: registration too late"
        );

        nonce = nextAuctionNonce++;

        // Calculate scuttle block estimate
        uint256 secondsRemaining = deadlineSeconds > block.timestamp 
            ? deadlineSeconds - block.timestamp 
            : 0;
        uint256 scuttleBlock = block.number + (secondsRemaining / 12) + 10; // 12s/block + 10 block buffer

        auctions[nonce] = Auction({
            nonce: nonce,
            description: config.description,
            deadline: deadlineSeconds,
            scuttleBlock: scuttleBlock,
            state: DepositTypes.AuctionState.OPEN
        });

        emit AuctionRegistered(nonce, config.description, deadlineSeconds, scuttleBlock);
    }

    /**
     * @notice Validate if deposit is allowed for an auction
     * @param auctionId The auction to deposit into
     * @return True if deposit is allowed
     *
     * Checks:
     * - Auction exists (nonce < nextAuctionNonce)
     * - Auction is in OPEN state
     * - Current time is before deadline
     */
    function validateDeposit(uint64 auctionId) external view returns (bool) {
        require(auctionId < nextAuctionNonce, "AuctionRegistry: invalid auction");
        
        Auction storage auction = auctions[auctionId];
        require(auction.state == DepositTypes.AuctionState.OPEN, "AuctionRegistry: auction not open");
        
        // Check deadline (with grace period)
        require(
            block.timestamp < uint256(auction.deadline) + uint256(DEPOSIT_GRACE_PERIOD),
            "AuctionRegistry: deadline passed"
        );
        
        return true;
    }

    /**
     * @notice Get auction deadline in seconds
     * @param auctionId The auction ID
     * @return deadline Deadline timestamp (seconds since epoch)
     */
    function getDeadline(uint64 auctionId) external view returns (uint64 deadline) {
        require(auctionId < nextAuctionNonce, "AuctionRegistry: invalid auction");
        return auctions[auctionId].deadline;
    }

    /**
     * @notice Get auction state
     * @param auctionId The auction ID
     * @return state Current auction state
     */
    function getAuctionState(uint64 auctionId) external view returns (DepositTypes.AuctionState state) {
        require(auctionId < nextAuctionNonce, "AuctionRegistry: invalid auction");
        return auctions[auctionId].state;
    }

    /**
     * @notice Transition auction to a new state
     * @param auctionId The auction ID
     * @param newState Desired new state
     *
     * Valid transitions:
     * - OPEN → CLOSING (deadline passed, waiting for settlement)
     * - OPEN → SCUTTLED (deadline passed without settlement)
     * - CLOSING → SETTLED (settlement complete)
     * - CLOSING → SCUTTLED (settlement failed)
     */
    function transitionState(uint64 auctionId, DepositTypes.AuctionState newState) external onlyOwner {
        require(auctionId < nextAuctionNonce, "AuctionRegistry: invalid auction");
        
        Auction storage auction = auctions[auctionId];
        DepositTypes.AuctionState previousState = auction.state;
        
        // Validate state transition
        require(previousState != DepositTypes.AuctionState.NONE, "AuctionRegistry: auction not found");
        require(previousState != newState, "AuctionRegistry: same state");
        
        // Validate transition rules
        if (previousState == DepositTypes.AuctionState.OPEN) {
            require(
                newState == DepositTypes.AuctionState.CLOSING || newState == DepositTypes.AuctionState.SCUTTLED,
                "AuctionRegistry: invalid transition from OPEN"
            );
        } else if (previousState == DepositTypes.AuctionState.CLOSING) {
            require(
                newState == DepositTypes.AuctionState.SETTLED || newState == DepositTypes.AuctionState.SCUTTLED,
                "AuctionRegistry: invalid transition from CLOSING"
            );
        } else {
            require(false, "AuctionRegistry: cannot transition from terminal state");
        }
        
        auction.state = newState;
        emit AuctionStateChanged(auctionId, previousState, newState);
    }

    /**
     * @notice Get auction info
     * @param auctionId The auction ID
     * @return Auction struct
     */
    function getAuction(uint64 auctionId) external view returns (Auction memory) {
        require(auctionId < nextAuctionNonce, "AuctionRegistry: invalid auction");
        return auctions[auctionId];
    }

    /**
     * @notice Check if deadline has passed
     * @param auctionId The auction ID
     * @return True if deadline has passed (including grace period)
     */
    function isDeadlinePassed(uint64 auctionId) external view returns (bool) {
        require(auctionId < nextAuctionNonce, "AuctionRegistry: invalid auction");
        Auction storage auction = auctions[auctionId];
        return block.timestamp >= uint256(auction.deadline) + uint256(DEPOSIT_GRACE_PERIOD);
    }

    /**
     * @notice Get total number of registered auctions
     * @return count Number of auctions registered
     */
    function getAuctionCount() external view returns (uint64 count) {
        return nextAuctionNonce - 1;
    }
}
