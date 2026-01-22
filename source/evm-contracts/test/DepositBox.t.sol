// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/DepositBox.sol";
import "@openzeppelin/contracts/mocks/ERC20Mock.sol";

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

        bytes32 commitment = keccak256("test commitment");

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}(commitment);

        assertEq(address(depositBox).balance, 1 ether);
        assertEq(depositBox.totalDeposits(0), 1 ether);
    }

    function testDepositETHZeroAmount() public {
        vm.deal(alice, 10 ether);
        bytes32 commitment = keccak256("test");

        vm.prank(alice);
        vm.expectRevert("DepositBox: zero deposit");
        depositBox.depositETH{value: 0}(commitment);
    }

    function testDepositETHZeroCommitment() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        vm.expectRevert("DepositBox: zero commitment");
        depositBox.depositETH{value: 1 ether}(bytes32(0));
    }

    function testDepositUSDC() public {
        usdcMock.mint(alice, 1000e6);

        bytes32 commitment = keccak256("test commitment");

        vm.prank(alice);
        usdcMock.approve(address(depositBox), 500e6);
        depositBox.depositUSDC(500e6, commitment);

        assertEq(usdcMock.balanceOf(address(depositBox)), 500e6);
        assertEq(depositBox.totalDeposits(1), 500e6);
    }

    function testDepositUSDCZeroAmount() public {
        bytes32 commitment = keccak256("test");

        vm.prank(alice);
        vm.expectRevert("DepositBox: zero deposit");
        depositBox.depositUSDC(0, commitment);
    }

    function testCommitmentsCannotBeReused() public {
        usdcMock.mint(alice, 1000e6);
        bytes32 commitment = keccak256("test commitment");

        vm.prank(alice);
        usdcMock.approve(address(depositBox), 500e6);
        depositBox.depositUSDC(500e6, commitment);

        vm.prank(alice);
        usdcMock.approve(address(depositBox), 500e6);
        vm.expectRevert("DepositBox: commitment used");
        depositBox.depositUSDC(500e6, commitment);
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
        bytes32 commitment = keccak256("test commitment");

        vm.prank(alice);
        usdcMock.approve(address(depositBox), 500e6);
        depositBox.depositUSDC(500e6, commitment);

        vm.prank(address(this));
        depositBox.setSettlementContract(settlement);

        bytes32 newStateRoot = keccak256("new state root");

        vm.prank(settlement);
        depositBox.confirmDeposits(commitment, newStateRoot);

        assertEq(depositBox.latestStateRoot(), newStateRoot);
    }

    function testConfirmDepositsOnlySettlement() public {
        bytes32 commitment = keccak256("test");
        bytes32 newStateRoot = keccak256("root");

        vm.prank(alice);
        vm.expectRevert("DepositBox: only settlement");
        depositBox.confirmDeposits(commitment, newStateRoot);
    }

    function testRefundDeposit() public {
        vm.deal(alice, 10 ether);
        bytes32 commitment = keccak256("test commitment");

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}(commitment);

        assertEq(address(depositBox).balance, 1 ether);

        vm.warp(block.timestamp + 8 days);

        vm.prank(alice);
        depositBox.refundDeposit(alice, 1);

        assertEq(address(alice).balance, 11 ether);
    }

    function testRefundDepositBeforeTimeout() public {
        vm.deal(alice, 10 ether);
        bytes32 commitment = keccak256("test commitment");

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}(commitment);

        vm.warp(block.timestamp + 1 days);

        vm.prank(alice);
        vm.expectRevert("DepositBox: not timed out");
        depositBox.refundDeposit(alice, 1);
    }

    function testRefundDepositNotOwner() public {
        vm.deal(alice, 10 ether);
        bytes32 commitment = keccak256("test commitment");

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}(commitment);

        vm.warp(block.timestamp + 8 days);

        vm.prank(bob);
        vm.expectRevert("DepositBox: not owner");
        depositBox.refundDeposit(alice, 1);
    }

    function testGetDeposit() public view {
        vm.deal(alice, 10 ether);
        bytes32 commitment = keccak256("test commitment");

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}(commitment);

        DepositTypes.Deposit memory deposit = depositBox.getDeposit(alice, 1);

        assertEq(deposit.depositor, alice);
        assertEq(deposit.amount, 1 ether);
        assertEq(uint256(deposit.assetType), 0);
        assertEq(uint256(deposit.status), 0);
    }

    receive() external payable {}
}
