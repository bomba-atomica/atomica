// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/AuctionBox.sol";

contract AuctionBoxTest is Test {
    AuctionBox auctionBox;
    address admin = address(0xADMIN);

    function setUp() public {
        auctionBox = new AuctionBox();
    }

    function testScuttleTrueByDefault() public {
        vm.prank(admin);
        uint64 nonce = auctionBox.initializeAuction(
            0,
            uint64(block.timestamp + 24 hours),
            block.number + 10000
        );

        (bool scuttle, uint64 deadline, uint256 scuttleBlock) = auctionBox.getState(nonce);

        assertTrue(scuttle, "scuttle must be true by default");
        assertEq(deadline, block.timestamp + 24 hours);
        assertEq(scuttleBlock, block.number + 10000);
    }

    function testIsValidFalseWhenScuttled() public {
        vm.prank(admin);
        uint64 nonce = auctionBox.initializeAuction(
            0,
            uint64(block.timestamp + 24 hours),
            block.number + 10000
        );

        assertTrue(!auctionBox.isValid(nonce), "scuttled auction is not valid");
    }

    function testAutoScuttleOnDeadline() public {
        vm.prank(admin);
        uint64 nonce = auctionBox.initializeAuction(
            0,
            uint64(block.timestamp + 1 hours),
            block.number + 10000
        );

        vm.warp(block.timestamp + 2 hours);

        assertTrue(!auctionBox.isValid(nonce), "not valid after deadline");
    }

    function testAutoScuttleOnBlock() public {
        vm.prank(admin);
        uint64 nonce = auctionBox.initializeAuction(
            0,
            uint64(block.timestamp + 24 hours),
            block.number + 100
        );

        vm.roll(block.number + 200);

        assertTrue(!auctionBox.isValid(nonce), "not valid after scuttleBlock");
    }

    function testCannotReinitialize() public {
        vm.prank(admin);
        auctionBox.initializeAuction(0, uint64(block.timestamp + 24 hours), block.number + 1000);

        vm.prank(admin);
        vm.expectRevert("already initialized");
        auctionBox.initializeAuction(0, uint64(block.timestamp + 24 hours), block.number + 1000);
    }

    function testZeroScuttleBlockMeansNotInitialized() public {
        assertTrue(!auctionBox.isValid(999), "non-existent auction not valid");
    }

    function testCustomNonce() public {
        vm.prank(admin);
        uint64 nonce = auctionBox.initializeAuction(
            42,
            uint64(block.timestamp + 24 hours),
            block.number + 1000
        );

        assertEq(nonce, 42, "should use custom nonce");
        assertEq(auctionBox.nextNonce(), 1, "nextNonce unchanged");
    }
}
