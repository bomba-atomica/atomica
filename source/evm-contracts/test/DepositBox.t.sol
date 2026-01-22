// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/DepositBox.sol";
import "../../src/AuctionRegistry.sol";
import "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract DepositBoxTest is Test {
    DepositBox depositBox;
    AuctionRegistry auctionRegistry;
    ERC20Mock usdcMock;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address settlement = makeAddr("settlement");

    function setUp() public {
        usdcMock = new ERC20Mock();
        auctionRegistry = new AuctionRegistry();
        depositBox = new DepositBox(address(usdcMock), address(auctionRegistry));

        // Register a test auction
        DepositTypes.AuctionConfig memory config = DepositTypes.AuctionConfig({
            nonce: 0,
            description: "test-auction",
            deadlineMicro: uint64(block.timestamp + 3600) * 1_000_000,
            minPrice: 0,
            maxPrice: 0,
            minEthAmount: 0,
            minUsdcAmount: 0
        });
        auctionRegistry.registerAuction(config);
    }

    function testConstructor() public view {
        assertEq(address(depositBox.usdcToken()), address(usdcMock));
        assertEq(address(depositBox.auctionRegistry()), address(auctionRegistry));
        assertEq(depositBox.depositNonceCounter(), 1);
    }

    function testDepositETH() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}(1, 1);

        assertEq(address(depositBox).balance, 1 ether);
        assertEq(depositBox.totalDeposits(DepositTypes.AssetType.ETH), 1 ether);
    }

    function testDepositETHZeroAmount() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        vm.expectRevert("DepositBox: zero deposit");
        depositBox.depositETH{value: 0}(1, 1);
    }

    function testDepositETHInvalidAuction() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        vm.expectRevert("DepositBox: invalid auction");
        depositBox.depositETH{value: 1 ether}(999, 1);
    }

    function testDepositUSDC() public {
        usdcMock.mint(alice, 1000e6);

        vm.startPrank(alice);
        usdcMock.approve(address(depositBox), 500e6);
        depositBox.depositUSDC(1, 1, 500e6);
        vm.stopPrank();

        assertEq(usdcMock.balanceOf(address(depositBox)), 500e6);
        assertEq(depositBox.totalDeposits(DepositTypes.AssetType.USDC), 500e6);
    }

    function testDepositUSDCZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("DepositBox: zero deposit");
        depositBox.depositUSDC(1, 1, 0);
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

        vm.startPrank(alice);
        usdcMock.approve(address(depositBox), 500e6);
        depositBox.depositUSDC(1, 1, 500e6);
        vm.stopPrank();

        vm.prank(address(this));
        depositBox.setSettlementContract(settlement);

        uint64[] memory auctionIds = new uint64[](1);
        address[] memory depositors = new address[](1);
        uint256[] memory nonces = new uint256[](1);
        auctionIds[0] = 1;
        depositors[0] = alice;
        nonces[0] = 1;

        bytes32 stateRoot = keccak256("new state root");

        vm.prank(settlement);
        depositBox.confirmDeposits(auctionIds, depositors, nonces, stateRoot);

        DepositTypes.Deposit memory deposit = depositBox.getDeposit(1, alice, 1);
        assertEq(uint256(deposit.status), 1);
    }

    function testConfirmDepositsOnlySettlement() public {
        uint64[] memory auctionIds = new uint64[](1);
        address[] memory depositors = new address[](1);
        uint256[] memory nonces = new uint256[](1);
        bytes32 stateRoot = keccak256("root");

        vm.prank(alice);
        vm.expectRevert("DepositBox: only settlement");
        depositBox.confirmDeposits(auctionIds, depositors, nonces, stateRoot);
    }

    function testMarkSettled() public {
        usdcMock.mint(alice, 1000e6);

        vm.startPrank(alice);
        usdcMock.approve(address(depositBox), 500e6);
        depositBox.depositUSDC(1, 1, 500e6);
        vm.stopPrank();

        vm.prank(address(this));
        depositBox.setSettlementContract(settlement);

        uint64[] memory auctionIds = new uint64[](1);
        address[] memory depositors = new address[](1);
        uint256[] memory nonces = new uint256[](1);
        auctionIds[0] = 1;
        depositors[0] = alice;
        nonces[0] = 1;

        vm.prank(settlement);
        depositBox.confirmDeposits(auctionIds, depositors, nonces, keccak256("root"));

        vm.prank(settlement);
        depositBox.markSettled(auctionIds, depositors, nonces);

        DepositTypes.Deposit memory deposit = depositBox.getDeposit(1, alice, 1);
        assertEq(uint256(deposit.status), 2);
    }

    function testRefundDeposit() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}(1, 1);

        assertEq(address(depositBox).balance, 1 ether);

        vm.warp(block.timestamp + 8 days);

        vm.prank(alice);
        depositBox.refundDeposit(1, alice, 1);

        assertEq(address(alice).balance, 10 ether);
    }

    function testRefundDepositBeforeTimeout() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}(1, 1);

        vm.warp(block.timestamp + 1 days);

        vm.prank(alice);
        vm.expectRevert("DepositBox: not timed out");
        depositBox.refundDeposit(1, alice, 1);
    }

    function testRefundDepositNotOwner() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}(1, 1);

        vm.warp(block.timestamp + 8 days);

        vm.prank(bob);
        vm.expectRevert("DepositBox: not owner");
        depositBox.refundDeposit(1, alice, 1);
    }

    function testGetDeposit() public {
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}(1, 1);

        DepositTypes.Deposit memory deposit = depositBox.getDeposit(1, alice, 1);

        assertEq(deposit.depositor, alice);
        assertEq(deposit.auctionId, 1);
        assertEq(deposit.amount, 1 ether);
        assertEq(uint256(deposit.assetType), 0);
        assertEq(uint256(deposit.status), 0);
    }

    function testGetStorageKey() public view {
        bytes32 key = depositBox.getStorageKey(1, alice, 1);
        assertEq(key, keccak256(abi.encode(1, alice, 1)));
    }

    receive() external payable {}
}
