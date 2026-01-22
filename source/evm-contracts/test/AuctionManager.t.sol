// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/AuctionManager.sol";

contract AuctionManagerTest is Test {
    AuctionManager auctionManager;
    address admin = address(0xADMIN);

    function setUp() public {
        auctionManager = new AuctionManager();
    }

    function testScuttleTrueByDefault() public {
        vm.prank(admin);
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
        vm.prank(admin);
        uint64 nonce = auctionManager.initializeAuction(
            0,
            uint64(block.timestamp + 24 hours),
            block.number + 10000
        );

        assertTrue(!auctionManager.isValid(nonce), "scuttled auction is not valid");
    }

    function testAutoScuttleOnDeadline() public {
        vm.prank(admin);
        uint64 nonce = auctionManager.initializeAuction(
            0,
            uint64(block.timestamp + 1 hours),
            block.number + 10000
        );

        vm.warp(block.timestamp + 2 hours);

        assertTrue(!auctionManager.isValid(nonce), "not valid after deadline");
    }

    function testAutoScuttleOnBlock() public {
        vm.prank(admin);
        uint64 nonce = auctionManager.initializeAuction(
            0,
            uint64(block.timestamp + 24 hours),
            block.number + 100
        );

        vm.roll(block.number + 200);

        assertTrue(!auctionManager.isValid(nonce), "not valid after scuttleBlock");
    }

    function testCannotReinitialize() public {
        vm.prank(admin);
        auctionManager.initializeAuction(0, uint64(block.timestamp + 24 hours), block.number + 1000);

        vm.prank(admin);
        vm.expectRevert("already initialized");
        auctionManager.initializeAuction(0, uint64(block.timestamp + 24 hours), block.number + 1000);
    }

    function testZeroScuttleBlockMeansNotInitialized() public {
        assertTrue(!auctionManager.isValid(999), "non-existent auction not valid");
    }

    function testCustomNonce() public {
        vm.prank(admin);
        uint64 nonce = auctionManager.initializeAuction(
            42,
            uint64(block.timestamp + 24 hours),
            block.number + 1000
        );

        assertEq(nonce, 42, "should use custom nonce");
        assertEq(auctionManager.nextNonce(), 1, "nextNonce unchanged");
    }
}
