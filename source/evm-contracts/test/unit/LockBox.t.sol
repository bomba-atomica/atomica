// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/escrow/LockBox.sol";
import "../../src/tokens/FakeETH.sol";
import "../../src/tokens/FakeUSD.sol";

contract LockBoxTest is Test {
    LockBox public lockBox;
    FakeETH public fakeETH;
    FakeUSD public fakeUSD;

    address public alice = address(0x1);
    address public bob = address(0x2);

    function setUp() public {
        // Deploy tokens
        fakeETH = new FakeETH();
        fakeUSD = new FakeUSD();

        // Deploy LockBox
        lockBox = new LockBox(address(fakeETH), address(fakeUSD));

        // Mint tokens to test users (within max mint limits)
        fakeETH.mint(alice, 1000 ether);
        fakeETH.mint(bob, 1000 ether);
        fakeUSD.mint(alice, 10_000 * 10**6);
        fakeUSD.mint(bob, 10_000 * 10**6);
    }

    function testConstructor() public view {
        assertEq(address(lockBox.fakeETH()), address(fakeETH));
        assertEq(address(lockBox.fakeUSD()), address(fakeUSD));
        assertEq(lockBox.MIN_LOCK_DURATION(), 1 hours);
    }

    function testLockFakeETH() public {
        uint256 lockAmount = 10 ether;

        vm.startPrank(alice);

        // Approve LockBox to spend FakeETH
        fakeETH.approve(address(lockBox), lockAmount);

        // Lock tokens
        lockBox.lock(address(fakeETH), lockAmount);

        vm.stopPrank();

        // Verify locked balance
        assertEq(lockBox.getLockedBalance(alice, address(fakeETH)), lockAmount);

        // Verify LockBox holds the tokens
        assertEq(fakeETH.balanceOf(address(lockBox)), lockAmount);

        // Verify alice's balance decreased
        assertEq(fakeETH.balanceOf(alice), 990 ether);
    }

    function testLockFakeUSD() public {
        uint256 lockAmount = 10_000 * 10**6;

        vm.startPrank(alice);

        // Approve and lock
        fakeUSD.approve(address(lockBox), lockAmount);
        lockBox.lock(address(fakeUSD), lockAmount);

        vm.stopPrank();

        // Verify locked balance
        assertEq(lockBox.getLockedBalance(alice, address(fakeUSD)), lockAmount);
        assertEq(fakeUSD.balanceOf(address(lockBox)), lockAmount);
    }

    function testLockMultipleTimes() public {
        vm.startPrank(alice);

        fakeETH.approve(address(lockBox), 50 ether);

        // Lock 10 ETH
        lockBox.lock(address(fakeETH), 10 ether);
        assertEq(lockBox.getLockedBalance(alice, address(fakeETH)), 10 ether);

        // Lock another 20 ETH
        lockBox.lock(address(fakeETH), 20 ether);
        assertEq(lockBox.getLockedBalance(alice, address(fakeETH)), 30 ether);

        // Lock another 10 ETH
        lockBox.lock(address(fakeETH), 10 ether);
        assertEq(lockBox.getLockedBalance(alice, address(fakeETH)), 40 ether);

        vm.stopPrank();
    }

    function testMultipleUsersCanLock() public {
        // Alice locks 10 ETH
        vm.startPrank(alice);
        fakeETH.approve(address(lockBox), 10 ether);
        lockBox.lock(address(fakeETH), 10 ether);
        vm.stopPrank();

        // Bob locks 20 ETH
        vm.startPrank(bob);
        fakeETH.approve(address(lockBox), 20 ether);
        lockBox.lock(address(fakeETH), 20 ether);
        vm.stopPrank();

        // Verify balances are separate
        assertEq(lockBox.getLockedBalance(alice, address(fakeETH)), 10 ether);
        assertEq(lockBox.getLockedBalance(bob, address(fakeETH)), 20 ether);
    }

    function testCannotLockInvalidToken() public {
        address invalidToken = address(0x9999);

        vm.startPrank(alice);
        vm.expectRevert("Invalid token");
        lockBox.lock(invalidToken, 10 ether);
        vm.stopPrank();
    }

    function testCannotLockZeroAmount() public {
        vm.startPrank(alice);
        fakeETH.approve(address(lockBox), 10 ether);

        vm.expectRevert("Amount must be > 0");
        lockBox.lock(address(fakeETH), 0);
        vm.stopPrank();
    }

    function testCannotLockWithoutApproval() public {
        vm.startPrank(alice);
        vm.expectRevert(); // ERC20: insufficient allowance
        lockBox.lock(address(fakeETH), 10 ether);
        vm.stopPrank();
    }

    function testUnlockTimeIsSet() public {
        vm.startPrank(alice);

        fakeETH.approve(address(lockBox), 10 ether);

        uint256 lockTime = block.timestamp;
        lockBox.lock(address(fakeETH), 10 ether);

        // Unlock time should be 1 hour from now
        uint256 unlockTime = lockBox.getUnlockTime(alice, address(fakeETH));
        assertEq(unlockTime, lockTime + 1 hours);

        // Should not be unlocked yet
        assertFalse(lockBox.isUnlocked(alice, address(fakeETH)));

        vm.stopPrank();
    }

    function testCannotWithdrawBeforeUnlockTime() public {
        vm.startPrank(alice);

        fakeETH.approve(address(lockBox), 10 ether);
        lockBox.lock(address(fakeETH), 10 ether);

        // Try to withdraw immediately
        vm.expectRevert("Tokens still locked");
        lockBox.withdraw(address(fakeETH), 10 ether);

        vm.stopPrank();
    }

    function testCanWithdrawAfterUnlockTime() public {
        vm.startPrank(alice);

        fakeETH.approve(address(lockBox), 10 ether);
        lockBox.lock(address(fakeETH), 10 ether);

        // Fast forward time by 1 hour + 1 second
        vm.warp(block.timestamp + 1 hours + 1);

        // Should be unlocked now
        assertTrue(lockBox.isUnlocked(alice, address(fakeETH)));

        // Withdraw tokens
        lockBox.withdraw(address(fakeETH), 10 ether);

        // Verify balance
        assertEq(lockBox.getLockedBalance(alice, address(fakeETH)), 0);
        assertEq(fakeETH.balanceOf(alice), 1000 ether); // Back to original

        vm.stopPrank();
    }

    function testCanWithdrawPartialAmount() public {
        vm.startPrank(alice);

        fakeETH.approve(address(lockBox), 10 ether);
        lockBox.lock(address(fakeETH), 10 ether);

        // Fast forward time
        vm.warp(block.timestamp + 1 hours + 1);

        // Withdraw only 6 ETH
        lockBox.withdraw(address(fakeETH), 6 ether);

        assertEq(lockBox.getLockedBalance(alice, address(fakeETH)), 4 ether);
        assertEq(fakeETH.balanceOf(alice), 996 ether);

        vm.stopPrank();
    }

    function testCannotWithdrawMoreThanLocked() public {
        vm.startPrank(alice);

        fakeETH.approve(address(lockBox), 10 ether);
        lockBox.lock(address(fakeETH), 10 ether);

        // Fast forward time
        vm.warp(block.timestamp + 1 hours + 1);

        // Try to withdraw more than locked
        vm.expectRevert("Insufficient balance");
        lockBox.withdraw(address(fakeETH), 11 ether);

        vm.stopPrank();
    }

    function testEmitsTokensLockedEvent() public {
        vm.startPrank(alice);

        fakeETH.approve(address(lockBox), 10 ether);

        uint256 expectedUnlockTime = block.timestamp + 1 hours;

        vm.expectEmit(true, true, false, true);
        emit LockBox.TokensLocked(alice, address(fakeETH), 10 ether, expectedUnlockTime);

        lockBox.lock(address(fakeETH), 10 ether);

        vm.stopPrank();
    }

    function testEmitsTokensWithdrawnEvent() public {
        vm.startPrank(alice);

        fakeETH.approve(address(lockBox), 10 ether);
        lockBox.lock(address(fakeETH), 10 ether);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.expectEmit(true, true, false, true);
        emit LockBox.TokensWithdrawn(alice, address(fakeETH), 10 ether);

        lockBox.withdraw(address(fakeETH), 10 ether);

        vm.stopPrank();
    }

    function testStorageSlotCalculation() public {
        // This test verifies that our storage key calculation is consistent
        // The actual storage location will be verified during proof generation integration

        // Test that the helper function produces consistent results
        bytes32 key1 = lockBox.calculateStorageKey(alice, address(fakeETH));
        bytes32 key2 = lockBox.calculateStorageKey(alice, address(fakeETH));

        // Same inputs should produce same output
        assertEq(key1, key2);

        // Different users should produce different keys
        bytes32 keyBob = lockBox.calculateStorageKey(bob, address(fakeETH));
        assertTrue(key1 != keyBob);

        // Different tokens should produce different keys
        bytes32 keyUSD = lockBox.calculateStorageKey(alice, address(fakeUSD));
        assertTrue(key1 != keyUSD);

        // Verify calculation matches Solidity's nested mapping layout
        // For mapping(address => mapping(address => uint256)) at slot 0:
        // key = keccak256(abi.encode(outerKey, keccak256(abi.encode(innerKey, slot))))
        bytes32 innerKey = keccak256(abi.encode(address(fakeETH), uint256(0)));
        bytes32 expectedKey = keccak256(abi.encode(alice, innerKey));

        assertEq(key1, expectedKey);
    }
}
