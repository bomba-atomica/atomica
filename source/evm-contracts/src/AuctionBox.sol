// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AuctionBox is Ownable {
    struct Auction {
        bool scuttle;
        uint64 deadline;
        uint256 scuttleBlock;
    }

    mapping(uint64 => Auction) public auctions;
    uint64 public nextNonce;

    bool public systemScuttled;

    event AuctionInitialized(uint64 indexed nonce, uint64 deadline, uint256 scuttleBlock);
    event SystemScuttled();

    constructor() {
        nextNonce = 1;
        systemScuttled = false;
    }

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

    function isValid(uint64 nonce) external view returns (bool) {
        Auction storage auction = auctions[nonce];
        if (auction.scuttleBlock == 0) return false;
        if (systemScuttled) return false;
        if (auction.scuttle) return false;
        if (block.timestamp > auction.deadline) return false;
        if (block.number > auction.scuttleBlock) return false;
        return true;
    }

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
