// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/tokens/FakeUSD.sol";

contract FakeUSDTest is Test {
    FakeUSD public token;
    address public user1 = address(0x1);
    address public user2 = address(0x2);

    function setUp() public {
        token = new FakeUSD();
    }

    function testConstructor() public view {
        assertEq(token.name(), "Fake USD");
        assertEq(token.symbol(), "FAKEUSD");
        assertEq(token.decimals(), 6);
    }

    function testMintSuccess() public {
        uint256 mintAmount = 10_000 * 10**6; // 10,000 FAKEUSD (6 decimals)

        vm.prank(user1);
        token.mint(user1, mintAmount);

        assertEq(token.balanceOf(user1), mintAmount);
        assertEq(token.totalSupply(), mintAmount);
    }

    function testMintMaxLimit() public {
        uint256 maxMint = 10_000 * 10**6; // Exactly 10,000 FAKEUSD

        vm.prank(user1);
        token.mint(user1, maxMint);

        assertEq(token.balanceOf(user1), maxMint);
    }

    function testMintExceedsLimit() public {
        uint256 overLimit = 10_001 * 10**6; // 10,001 FAKEUSD (over limit)

        vm.prank(user1);
        vm.expectRevert("Mint amount exceeds maximum limit");
        token.mint(user1, overLimit);
    }

    function testBalanceAfterMint() public {
        uint256 firstMint = 1_000 * 10**6;  // 1,000 USD
        uint256 secondMint = 2_000 * 10**6; // 2,000 USD

        vm.prank(user1);
        token.mint(user1, firstMint);

        vm.prank(user1);
        token.mint(user1, secondMint);

        assertEq(token.balanceOf(user1), firstMint + secondMint);
    }

    function testDecimalsPrecision() public view {
        // Verify 6 decimals (USDC standard)
        assertEq(token.decimals(), 6);

        // 1 USD = 1_000_000 smallest units
        uint256 oneUSD = 1 * 10**6;
        assertEq(oneUSD, 1_000_000);
    }

    function testMultipleMints() public {
        uint256 amount = 5_000 * 10**6; // 5,000 USD

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
        uint256 mintAmount = 1_000 * 10**6;  // 1,000 USD
        uint256 transferAmount = 300 * 10**6; // 300 USD

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
        token.mint(address(0), 1 * 10**6);
    }

    function testMintZeroAmount() public {
        vm.prank(user1);
        token.mint(user1, 0);

        assertEq(token.balanceOf(user1), 0);
    }

    function testSmallAmountPrecision() public {
        // Test smallest unit (1 micro-dollar = 0.000001 USD)
        uint256 smallAmount = 1; // 0.000001 USD

        vm.prank(user1);
        token.mint(user1, smallAmount);

        assertEq(token.balanceOf(user1), smallAmount);
    }
}
