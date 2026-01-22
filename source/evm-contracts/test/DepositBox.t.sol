// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/DepositBox.sol";
import "@openzeppelin/contracts/mocks/ERC20Mock.sol";

/**
 * @title DepositBoxTest
 * @notice Tests for the simplified DepositBox contract (no commitments)
 * @dev Updated January 2026 - uses native Ethereum state proofs
 */
contract DepositBoxTest is Test {
    DepositBox depositBox;
    ERC20Mock usdcMock;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address settlement = address(0xSETTLEMENT);

    function setUp() public {
        usdcMock = new ERC20Mock();
        depositBox = new DepositBox(address(usdcMock));
    }

    function testConstructor() public view {
        assertEq(address(depositBox.usdcToken()), address(usdcMock));
        assertEq(depositBox.depositNonceCounter(), 1);
    }

    function testDepositETH() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}();

        assertEq(address(depositBox).balance, 1 ether);
        assertEq(depositBox.totalDeposits(0), 1 ether);
    }

    function testDepositETHZeroAmount() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        vm.expectRevert("DepositBox: zero deposit");
        depositBox.depositETH{value: 0}();
    }

    function testDepositUSDC() public {
        usdcMock.mint(alice, 1000e6);

        vm.prank(alice);
        usdcMock.approve(address(depositBox), 500e6);
        depositBox.depositUSDC(500e6);

        assertEq(usdcMock.balanceOf(address(depositBox)), 500e6);
        assertEq(depositBox.totalDeposits(1), 500e6);
    }

    function testDepositUSDCZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("DepositBox: zero deposit");
        depositBox.depositUSDC(0);
    }

    function testSetSettlementContract() public {
        assertEq(depositBox.settlementContract(), address(0));

        vm.prank(address(this));
        depositBox.setSettlementContract(settlement);

        assertEq(depositBox.settlementContract(), settlement);
    }

    function testSetSettlementContractZeroAddress() public {
        vm.prank(address(this));
        vm.expectRevert("DepositBox: invalid settlement");
        depositBox.setSettlementContract(address(0));
    }

    function testConfirmDeposits() public {
        usdcMock.mint(alice, 1000e6);

        vm.prank(alice);
        usdcMock.approve(address(depositBox), 500e6);
        depositBox.depositUSDC(500e6);

        vm.prank(address(this));
        depositBox.setSettlementContract(settlement);

        address[] memory depositors = new address[](1);
        uint256[] memory nonces = new uint256[](1);
        depositors[0] = alice;
        nonces[0] = 1;

        bytes32 stateRoot = keccak256("new state root");

        vm.prank(settlement);
        depositBox.confirmDeposits(depositors, nonces, stateRoot);

        // Verify deposit is confirmed
        DepositTypes.Deposit memory deposit = depositBox.getDeposit(alice, 1);
        assertEq(uint256(deposit.status), 1); // CONFIRMED
    }

    function testConfirmDepositsOnlySettlement() public {
        address[] memory depositors = new address[](1);
        uint256[] memory nonces = new uint256[](1);
        bytes32 stateRoot = keccak256("root");

        vm.prank(alice);
        vm.expectRevert("DepositBox: only settlement");
        depositBox.confirmDeposits(depositors, nonces, stateRoot);
    }

    function testMarkSettled() public {
        usdcMock.mint(alice, 1000e6);

        vm.prank(alice);
        usdcMock.approve(address(depositBox), 500e6);
        depositBox.depositUSDC(500e6);

        vm.prank(address(this));
        depositBox.setSettlementContract(settlement);

        // Confirm deposit
        address[] memory depositors = new address[](1);
        uint256[] memory nonces = new uint256[](1);
        depositors[0] = alice;
        nonces[0] = 1;

        vm.prank(settlement);
        depositBox.confirmDeposits(depositors, nonces, keccak256("root"));

        // Mark as settled
        vm.prank(settlement);
        depositBox.markSettled(depositors, nonces);

        // Verify deposit is settled
        DepositTypes.Deposit memory deposit = depositBox.getDeposit(alice, 1);
        assertEq(uint256(deposit.status), 2); // SETTLED
    }

    function testRefundDeposit() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}();

        assertEq(address(depositBox).balance, 1 ether);

        vm.warp(block.timestamp + 8 days);

        vm.prank(alice);
        depositBox.refundDeposit(alice, 1);

        assertEq(address(alice).balance, 11 ether);
    }

    function testRefundDepositBeforeTimeout() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}();

        vm.warp(block.timestamp + 1 days);

        vm.prank(alice);
        vm.expectRevert("DepositBox: not timed out");
        depositBox.refundDeposit(alice, 1);
    }

    function testRefundDepositNotOwner() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}();

        vm.warp(block.timestamp + 8 days);

        vm.prank(bob);
        vm.expectRevert("DepositBox: not owner");
        depositBox.refundDeposit(alice, 1);
    }

    function testGetDeposit() public view {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}();

        DepositTypes.Deposit memory deposit = depositBox.getDeposit(alice, 1);

        assertEq(deposit.depositor, alice);
        assertEq(deposit.amount, 1 ether);
        assertEq(uint256(deposit.assetType), 0); // ETH
        assertEq(uint256(deposit.status), 0); // PENDING
    }

    function testGetStorageKey() public pure {
        bytes32 key = depositBox.getStorageKey(alice, 1);
        assertEq(key, keccak256(abi.encode(alice, 1)));
    }

    receive() external payable {}
}
