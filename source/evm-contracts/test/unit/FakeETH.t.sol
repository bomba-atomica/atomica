// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/tokens/FakeETH.sol";

contract FakeETHTest is Test {
    FakeETH public token;
    address public user1 = address(0x1);
    address public user2 = address(0x2);

    function setUp() public {
        token = new FakeETH();
    }

    function testConstructor() public view {
        assertEq(token.name(), "Fake Ethereum");
        assertEq(token.symbol(), "FAKETH");
        assertEq(token.decimals(), 18);
    }

    function testMintSuccess() public {
        uint256 mintAmount = 10 ether; // 10 FAKETH

        vm.prank(user1);
        token.mint(user1, mintAmount);

        assertEq(token.balanceOf(user1), mintAmount);
        assertEq(token.totalSupply(), mintAmount);
    }

    function testMintMaxLimit() public {
        uint256 maxMint = 10_000 ether; // Exactly 10,000 FAKETH

        vm.prank(user1);
        token.mint(user1, maxMint);

        assertEq(token.balanceOf(user1), maxMint);
    }

    function testMintExceedsLimit() public {
        uint256 overLimit = 10_001 ether; // 10,001 FAKETH (over limit)

        vm.prank(user1);
        vm.expectRevert("Mint amount exceeds maximum limit");
        token.mint(user1, overLimit);
    }

    function testBalanceAfterMint() public {
        uint256 firstMint = 100 ether;
        uint256 secondMint = 200 ether;

        vm.prank(user1);
        token.mint(user1, firstMint);

        vm.prank(user1);
        token.mint(user1, secondMint);

        assertEq(token.balanceOf(user1), firstMint + secondMint);
    }

    function testMultipleMints() public {
        uint256 amount = 50 ether;

        // Mint to user1
        vm.prank(user1);
        token.mint(user1, amount);

        // Mint to user2
        vm.prank(user2);
        token.mint(user2, amount * 2);

        // Mint to user1 again
        vm.prank(user1);
        token.mint(user1, amount);

        assertEq(token.balanceOf(user1), amount * 2);
        assertEq(token.balanceOf(user2), amount * 2);
        assertEq(token.totalSupply(), amount * 4);
    }

    function testTransfer() public {
        uint256 mintAmount = 100 ether;
        uint256 transferAmount = 30 ether;

        // Mint to user1
        vm.prank(user1);
        token.mint(user1, mintAmount);

        // Transfer from user1 to user2
        vm.prank(user1);
        token.transfer(user2, transferAmount);

        assertEq(token.balanceOf(user1), mintAmount - transferAmount);
        assertEq(token.balanceOf(user2), transferAmount);
    }

    function testMintToZeroAddress() public {
        vm.expectRevert();
        token.mint(address(0), 1 ether);
    }

    function testMintZeroAmount() public {
        vm.prank(user1);
        token.mint(user1, 0);

        assertEq(token.balanceOf(user1), 0);
    }
}
