// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/AuctionManager.sol";

contract AuctionManagerTest is Test {
    AuctionManager auctionManager;
    address admin = makeAddr("admin");

    function setUp() public {
        vm.prank(admin);
        auctionManager = new AuctionManager();
    }

    function testScuttleTrueByDefault() public {
        vm.prank(admin); // vm.prank(admin) sets the msg.sender for the next call to admin, who is the owner
        uint64 nonce = auctionManager.initializeAuction(
            0,
            uint64(block.timestamp + 24 hours),
            block.number + 10000
        );

        (bool scuttle, uint64 deadline, uint256 scuttleBlock) = auctionManager.getState(nonce);

        assertTrue(scuttle, "scuttle must be true by default");
        assertEq(deadline, block.timestamp + 24 hours);
        assertEq(scuttleBlock, block.number + 10000);
    }

    function testIsValidFalseWhenScuttled() public {
        vm.prank(admin); // vm.prank(admin) ensures the initializeAuction call is made by the owner
        uint64 nonce = auctionManager.initializeAuction(
            0,
            uint64(block.timestamp + 24 hours),
            block.number + 10000
        );

        assertTrue(!auctionManager.isValid(nonce), "scuttled auction is not valid");
    }

    function testAutoScuttleOnDeadline() public {
        vm.prank(admin); // vm.prank(admin) allows calling onlyOwner function initializeAuction
        uint64 nonce = auctionManager.initializeAuction(
            0,
            uint64(block.timestamp + 1 hours),
            block.number + 10000
        );

        vm.warp(block.timestamp + 2 hours);

        assertTrue(!auctionManager.isValid(nonce), "not valid after deadline");
    }

    function testAutoScuttleOnBlock() public {
        vm.prank(admin); // vm.prank(admin) sets msg.sender to admin for the initializeAuction call
        uint64 nonce = auctionManager.initializeAuction(
            0,
            uint64(block.timestamp + 24 hours),
            block.number + 100
        );

        vm.roll(block.number + 200);

        assertTrue(!auctionManager.isValid(nonce), "not valid after scuttleBlock");
    }

    function testCannotReinitialize() public {
        vm.prank(admin); // vm.prank(admin) makes the next call execute as if sent by the admin address, which is the owner
        auctionManager.initializeAuction(42, uint64(block.timestamp + 24 hours), block.number + 1000);

        vm.prank(admin); // Again, prank to admin to call as owner
        vm.expectRevert("already initialized");
        auctionManager.initializeAuction(42, uint64(block.timestamp + 24 hours), block.number + 1000);
    }

    function testZeroScuttleBlockMeansNotInitialized() public {
        assertTrue(!auctionManager.isValid(999), "non-existent auction not valid");
    }

    function testCustomNonce() public {
        vm.prank(admin); // vm.prank(admin) is used to call initializeAuction as the contract owner
        uint64 nonce = auctionManager.initializeAuction(
            42,
            uint64(block.timestamp + 24 hours),
            block.number + 1000
        );

        assertEq(nonce, 42, "should use custom nonce");
        assertEq(auctionManager.nextNonce(), 1, "nextNonce unchanged");
    }
}
