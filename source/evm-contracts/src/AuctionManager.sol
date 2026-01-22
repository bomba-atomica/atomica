// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Atomica AuctionManager Contract
 * @notice Manages auction lifecycle with fail-only design
 * @dev Part of Atomica's cross-chain atomic deposit system
 *
 * Design Principle: Fail-Only
 * - Auctions default to scuttle = true (will fail)
 * - Many checks required to flip scuttle to false
 * - No recovery attempts - simple and obvious
 *
 * Auction Flow:
 * 1. initializeAuction() -> scuttle = true (DEFAULT)
 * 2. isValid() checks all conditions:
 *    - Not scuttled
 *    - Deadline not passed
 *    - ScuttleBlock not passed
 * 3. If all pass, auction can succeed
 *
 * @see docs/plan/evm-contracts-implementation-plan.md
 */
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AuctionManager
 * @notice Fail-only auction management contract
 * @dev Auctions default to scuttle=true, require all checks to succeed
 *
 * Key Properties:
 * - scuttle = true by default
 * - isValid() = false until all conditions met
 * - No public scuttle function - private cleanup only
 * - Automatic scuttle on deadline/scuttleBlock expiry
 *
 * @author Atomica
 */
contract AuctionManager is Ownable {
    /**
     * @notice Auction state structure
     * @param scuttle Whether auction is scuttled (true = fail)
     * @param deadline Unix timestamp when auction ends
     * @param scuttleBlock Block number when auction auto-scuttles
     */
    struct Auction {
        bool scuttle;
        uint64 deadline;
        uint256 scuttleBlock;
    }

    /**
     * @notice Maps auction nonce to auction state
     * @dev Primary lookup for auction information
     */
    mapping(uint64 => Auction) public auctions;

    /**
     * @notice Counter for generating sequential auction nonces
     * @dev Starts at 1, increments on each auto-nonce auction
     */
    uint64 public nextNonce;

    /**
     * @notice Emitted when new auction is initialized
     * @param nonce Unique auction identifier
     * @param deadline When auction ends
     * @param scuttleBlock When auction auto-scuttles
     */
    event AuctionInitialized(uint64 indexed nonce, uint64 deadline, uint256 scuttleBlock);

    /**
     * @notice Constructor
     * @dev Initializes nonce counter to 1
     */
    constructor() Ownable(msg.sender) {
        nextNonce = 1;
    }

    /**
     * @notice Initialize new auction
     * @param nonce Custom nonce (0 = auto-generate)
     * @param deadline Unix timestamp when auction ends
     * @param scuttleBlock Block number for auto-scuttle
     * @return actualNonce The nonce assigned to this auction
     *
     * Creates auction with:
     * - scuttle = true (WILL FAIL by default)
     * - deadline = provided value
     * - scuttleBlock = provided value
     *
     * Requirements:
     * - deadline must be in the future
     * - scuttleBlock must be in the future
     * - Auction with nonce must not already exist
     *
     * Emits:
     * - AuctionInitialized event
     */
    function initializeAuction(
        uint64 nonce,
        uint64 deadline,
        uint256 scuttleBlock
    ) external onlyOwner returns (uint64 actualNonce) {
        require(deadline > block.timestamp, "deadline must be future");
        require(scuttleBlock > block.number, "scuttleBlock must be future");

        uint64 useNonce = nonce == 0 ? nextNonce : nonce;

        Auction storage auction = auctions[useNonce];
        require(auction.scuttleBlock == 0, "already initialized");

        auction.scuttle = true;
        auction.deadline = deadline;
        auction.scuttleBlock = scuttleBlock;

        emit AuctionInitialized(useNonce, deadline, scuttleBlock);

        if (nonce == 0) nextNonce++;

        return useNonce;
    }

    /**
     * @notice Check if auction is valid and can proceed
     * @param nonce Auction identifier
     * @return true if auction can succeed
     *
     * Checks:
     * 1. Auction exists (scuttleBlock != 0)
     * 2. Not scuttled (scuttle == false)
     * 3. Deadline not passed
     * 4. ScuttleBlock not passed
     *
     * Note: This only checks the AuctionManager state.
     * Full validation also requires:
     * - BLS signature verification
     * - State proof verification
     * - Merkle proof verification
     */
    function isValid(uint64 nonce) external view returns (bool) {
        Auction storage auction = auctions[nonce];
        if (auction.scuttleBlock == 0) return false;
        if (auction.scuttle) return false;
        if (block.timestamp > auction.deadline) return false;
        if (block.number > auction.scuttleBlock) return false;
        return true;
    }

    /**
     * @notice Get full auction state
     * @param nonce Auction identifier
     * @return scuttle Whether auction is scuttled
     * @return deadline Auction end timestamp
     * @return scuttleBlock Auction auto-scuttle block
     */
    function getState(uint64 nonce)
        external
        view
        returns (
            bool scuttle,
            uint64 deadline,
            uint256 scuttleBlock
        )
    {
        Auction storage auction = auctions[nonce];
        return (auction.scuttle, auction.deadline, auction.scuttleBlock);
    }
}
