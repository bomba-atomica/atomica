// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/DepositBox.sol";
import "../../src/Settlement.sol";
import "../../src/BLSVerifier.sol";
import "../../src/Governance.sol";
import "@openzeppelin/contracts/mocks/ERC20Mock.sol";

/**
 * @title DepositSettleIntegrationTest
 * @notice Integration test for deposit → confirm → settle flow
 * @dev Tests the complete lifecycle using a forked testnet
 *
 * Test Flow:
 * 1. Setup: Deploy all contracts, link via Governance
 * 2. Alice deposits ETH
 * 3. Bob deposits USDC
 * 4. Simulate auction results (off-chain)
 * 5. Settlement executes trades based on BLS-verified state
 */
contract DepositSettleIntegrationTest is Test {
    DepositBox depositBox;
    Settlement settlement;
    BLSVerifier blsVerifier;
    Governance governance;
    ERC20Mock usdcMock;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address charlie = address(0xCHARLIE);
    address owner = address(this);

    uint256 constant DEPOSIT_AMOUNT = 1 ether;

    function setUp() public {
        usdcMock = new ERC20Mock();

        // Deploy contracts
        governance = new Governance(address(usdcMock));
        depositBox = new DepositBox(address(usdcMock));
        blsVerifier = new BLSVerifier();
        settlement = new Settlement(
            address(blsVerifier),
            address(depositBox),
            address(usdcToken())
        );

        // Initialize BLS verifier with test validator key
        bytes[] memory pubkeys = new bytes[](1);
        // BLS pubkey for test (G2 point in compressed format)
        pubkeys[0] = hex"a8a5c53d9c0c34b9c7b3e3b5c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5";
        blsVerifier.initialize(pubkeys);

        // Setup governance (link all contracts)
        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );

        // Setup settlement contract in deposit box
        depositBox.setSettlementContract(address(settlement));

        // Fund test accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
        usdcMock.mint(alice, 100000e6);
        usdcMock.mint(bob, 100000e6);
        usdcMock.mint(charlie, 100000e6);
    }

    function testFullDepositSettleFlow() public {
        // Step 1: Alice deposits ETH
        vm.prank(alice);
        depositBox.depositETH{value: DEPOSIT_AMOUNT}();

        // Verify deposit
        DepositTypes.Deposit memory aliceDeposit = depositBox.getDeposit(alice, 1);
        assertEq(aliceDeposit.amount, DEPOSIT_AMOUNT);
        assertEq(uint256(aliceDeposit.status), 0); // PENDING
        assertEq(aliceDeposit.depositor, alice);

        // Step 2: Bob deposits USDC
        vm.prank(bob);
        usdcMock.approve(address(depositBox), DEPOSIT_AMOUNT);
        depositBox.depositUSDC(DEPOSIT_AMOUNT);

        // Verify deposit
        DepositTypes.Deposit memory bobDeposit = depositBox.getDeposit(bob, 1);
        assertEq(bobDeposit.amount, DEPOSIT_AMOUNT);
        assertEq(uint256(bobDeposit.status), 0); // PENDING
        assertEq(bobDeposit.depositor, bob);

        // Step 3: Simulate auction and confirm deposits
        bytes32 stateRoot = bytes32(uint256(keccak256("auction_state_root")));

        address[] memory depositors = new address[](2);
        uint256[] memory nonces = new uint256[](2);
        depositors[0] = alice;
        depositors[1] = bob;
        nonces[0] = 1;
        nonces[1] = 1;

        vm.prank(address(settlement));
        depositBox.confirmDeposits(depositors, nonces, stateRoot);

        // Verify confirmed
        assertEq(uint256(depositBox.getDeposit(alice, 1).status), 1); // CONFIRMED
        assertEq(uint256(depositBox.getDeposit(bob, 1).status), 1); // CONFIRMED

        // Step 4: Simulate BLS signature on block hash
        // In real system, validators sign the block hash containing stateRoot
        bytes32 blockHash = bytes32(uint256(keccak256("block_with_auction")));
        bytes memory blsSignature = this._generateTestSignature(blockHash);

        uint256[] memory validatorIndices = new uint256[](1);
        validatorIndices[0] = 0;

        // Step 5: Execute settlement
        DepositTypes.TradeResult memory tradeResult = DepositTypes.TradeResult({
            clearingPrice: 1500e6, // 1500 USDC per ETH
            ethToTrade: DEPOSIT_AMOUNT,
            usdcToTrade: DEPOSIT_AMOUNT * 1500e6 / 1e18,
            ethStateRoot: stateRoot,
            startNonce: 1,
            endNonce: 2
        });

        address[] memory winners = new address[](1);
        address[] memory settleDepositors = new address[](1);
        uint256[] memory settleNonces = new uint256[](1);
        uint256[] memory ethAmounts = new uint256[](1);
        uint256[] memory usdcAmounts = new uint256[](1);

        winners[0] = alice;
        settleDepositors[0] = bob; // Bob's USDC goes to Alice
        settleNonces[0] = 1;
        ethAmounts[0] = 0;
        usdcAmounts[0] = DEPOSIT_AMOUNT * 1500e6 / 1e18;

        // Mock BLS verification to succeed
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
            winners,
            settleDepositors,
            settleNonces,
            ethAmounts,
            usdcAmounts
        );

        // Verify settlement
        assertEq(uint256(depositBox.getDeposit(bob, 1).status), 2); // SETTLED
    }

    function testMultipleDepositsAndSettlement() public {
        // Alice makes 3 deposits
        vm.prank(alice);
        depositBox.depositETH{value: 1 ether}();
        vm.prank(alice);
        depositBox.depositETH{value: 2 ether}();
        vm.prank(alice);
        depositBox.depositETH{value: 3 ether}();

        assertEq(depositBox.totalDeposits(0), 6 ether);
        assertEq(depositBox.depositNonceCounter(), 4); // 3 deposits + 1 initial

        // Verify nonces are sequential
        for (uint256 i = 1; i <= 3; i++) {
            DepositTypes.Deposit memory d = depositBox.getDeposit(alice, i);
            assertEq(d.amount, i * 1 ether);
            assertEq(uint256(d.status), 0);
        }
    }

    function testStateProofIntegration() public view {
        // Test that storage key computation matches off-chain expectations
        bytes32 expectedKey = keccak256(abi.encode(alice, 1));
        assertEq(depositBox.getStorageKey(alice, 1), expectedKey);
    }

    function _generateTestSignature(bytes32 message) internal pure returns (bytes memory) {
        // For testing, return a dummy 48-byte signature
        // In production, this would be a real BLS signature
        return abi.encodePacked(message, bytes16(0));
    }

    function usdcToken() internal view returns (IERC20) {
        return IERC20(address(usdcMock));
    }
}
