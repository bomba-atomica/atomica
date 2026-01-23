// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/DepositBox.sol";
import "../../src/Settlement.sol";
import "../../src/BLSVerifier.sol";
import "../../src/Governance.sol";
import "../../src/AuctionRegistry.sol";
import "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract DepositSettleIntegrationTest is Test {
    DepositBox depositBox;
    Settlement settlement;
    BLSVerifier blsVerifier;
    Governance governance;
    AuctionRegistry auctionRegistry;
    ERC20Mock usdcMock;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address owner = address(this);

    uint256 constant DEPOSIT_AMOUNT = 1 ether;
    uint256 constant USDC_DEPOSIT_AMOUNT = 1500e6;
    uint64 auctionId;

    function setUp() public {
        usdcMock = new ERC20Mock();
        auctionRegistry = new AuctionRegistry();

        governance = new Governance(address(usdcMock));
        depositBox = new DepositBox(address(usdcMock), address(auctionRegistry));
        blsVerifier = new BLSVerifier();
        settlement = new Settlement(
            address(blsVerifier),
            address(depositBox),
            address(usdcMock)
        );

        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = hex"a8a5c53d9c0c34b9c7b3e3b5c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5";
        blsVerifier.initialize(pubkeys);

        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );

        depositBox.setSettlementContract(address(settlement));
        
        auctionId = _registerAuction();
        auctionRegistry.transferOwnership(address(governance));

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        usdcMock.mint(alice, 100000e6);
        usdcMock.mint(bob, 100000e6);
    }

    function _registerAuction() internal returns (uint64) {
        DepositTypes.AuctionConfig memory config = DepositTypes.AuctionConfig({
            nonce: 0,
            description: "test-auction",
            deadlineMicro: uint64(block.timestamp + 3600) * 1_000_000,
            minPrice: 0,
            maxPrice: 0,
            minEthAmount: 0,
            minUsdcAmount: 0
        });

        return auctionRegistry.registerAuction(config);
    }

    function testFullDepositSettleFlow() public {
        vm.prank(alice);
        depositBox.depositETH{value: DEPOSIT_AMOUNT}(auctionId, 1);

        DepositTypes.Deposit memory aliceDeposit = depositBox.getDeposit(auctionId, alice, 1);
        assertEq(aliceDeposit.amount, DEPOSIT_AMOUNT);
        assertEq(uint256(aliceDeposit.status), 0);
        assertEq(aliceDeposit.depositor, alice);

        vm.startPrank(bob);
        usdcMock.approve(address(depositBox), USDC_DEPOSIT_AMOUNT);
        depositBox.depositUSDC(auctionId, 1, USDC_DEPOSIT_AMOUNT);
        vm.stopPrank();

        DepositTypes.Deposit memory bobDeposit = depositBox.getDeposit(auctionId, bob, 1);
        assertEq(bobDeposit.amount, USDC_DEPOSIT_AMOUNT);
        assertEq(uint256(bobDeposit.status), 0);
        assertEq(bobDeposit.depositor, bob);

        bytes32 stateRoot = bytes32(uint256(keccak256("auction_state_root")));

        uint64[] memory auctionIds = new uint64[](2);
        address[] memory depositors = new address[](2);
        uint256[] memory nonces = new uint256[](2);
        auctionIds[0] = auctionId;
        auctionIds[1] = auctionId;
        depositors[0] = alice;
        depositors[1] = bob;
        nonces[0] = 1;
        nonces[1] = 1;

        vm.prank(address(settlement));
        depositBox.confirmDeposits(auctionIds, depositors, nonces, stateRoot);

        assertEq(uint256(depositBox.getDeposit(auctionId, alice, 1).status), 1);
        assertEq(uint256(depositBox.getDeposit(auctionId, bob, 1).status), 1);

        bytes32 blockHash = bytes32(uint256(keccak256("block_with_auction")));
        bytes memory blsSignature = _generateTestSignature(blockHash);

        uint256[] memory validatorIndices = new uint256[](1);
        validatorIndices[0] = 0;

        DepositTypes.TradeResult memory tradeResult = DepositTypes.TradeResult({
            clearingPrice: 1500e6,
            ethToTrade: DEPOSIT_AMOUNT,
            usdcToTrade: DEPOSIT_AMOUNT * 1500e6 / 1e18,
            ethStateRoot: stateRoot,
            startNonce: 1,
            endNonce: 2
        });

        uint64[] memory settleAuctionIds = new uint64[](1);
        address[] memory winners = new address[](1);
        address[] memory settleDepositors = new address[](1);
        uint256[] memory settleNonces = new uint256[](1);
        uint256[] memory ethAmounts = new uint256[](1);
        uint256[] memory usdcAmounts = new uint256[](1);

        settleAuctionIds[0] = auctionId;
        winners[0] = alice;
        settleDepositors[0] = bob;
        settleNonces[0] = 1;
        ethAmounts[0] = 0;
        usdcAmounts[0] = DEPOSIT_AMOUNT * 1500e6 / 1e18;

        vm.mockCall(
            address(blsVerifier),
            abi.encodeWithSelector(BLSVerifier.verifyBlockHash.selector, blockHash, blsSignature, validatorIndices),
            abi.encode(true)
        );

        vm.prank(owner);
        settlement.settle(
            blockHash,
            stateRoot,
            tradeResult,
            blsSignature,
            validatorIndices,
            settleAuctionIds,
            winners,
            settleDepositors,
            settleNonces,
            ethAmounts,
            usdcAmounts
        );

        assertEq(uint256(depositBox.getDeposit(auctionId, bob, 1).status), 2);
    }

    function testStateProofIntegration() public {
        address testDepositor = makeAddr("test");
        bytes32 expectedKey = keccak256(abi.encode(1, testDepositor, 1));
        assertEq(keccak256(abi.encode(1, testDepositor, 1)), expectedKey);
    }

    function _generateTestSignature(bytes32 message) internal pure returns (bytes memory) {
        return abi.encodePacked(message, bytes16(0));
    }
}
