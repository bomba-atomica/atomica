// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Settlement.sol unit tests — issue #132
//
// Covers all 7 acceptance-criteria test cases:
//   1. testSettle_validBLSSignature_succeeds       — happy path, emits SettlementVerified
//   2. testSettle_invalidBLSSignature_reverts      — tampered sig reverts
//   3. testSettle_replayProtection                 — second identical call reverts
//   4. testSettle_payoutDistribution               — ETH and USDC balances change exactly
//   5. testSettle_contractBalanceDecrements        — DepositBox balances reduced after settle
//   6. testSettle_mismatchedArrayLengths_reverts   — mismatched arrays revert
//   7. testIsTradeProcessed_returnsTrueAfterSettle — isTradeProcessed false → true
//
// Strategy
//   - Deploy real DepositBox + Settlement with a mock BLSVerifier
//   - Use vm.mockCall to control verifyBlockHash return value
//   - confirmDeposits is called as settlement contract (vm.prank) so deposits
//     are CONFIRMED before settleTransfers runs
//   - No external network; all state is local

import "forge-std/Test.sol";
import "../../src/Settlement.sol";
import "../../src/DepositBox.sol";
import "../../src/BLSVerifier.sol";
import "../../src/libraries/DepositTypes.sol";
import "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract SettlementUnitTest is Test {
    // ─── Contracts ────────────────────────────────────────────────────────────

    DepositBox  internal depositBox;
    Settlement  internal settlement;
    BLSVerifier internal blsVerifier;
    ERC20Mock   internal usdcMock;

    // ─── Actors ───────────────────────────────────────────────────────────────

    address internal owner   = address(this);
    address internal alice   = makeAddr("alice");   // ETH depositor / winner
    address internal bob     = makeAddr("bob");     // USDC depositor / winner

    // ─── Constants ────────────────────────────────────────────────────────────

    uint64  internal constant AUCTION_ID     = 1;
    uint256 internal constant ETH_DEPOSIT    = 2 ether;
    uint256 internal constant USDC_DEPOSIT   = 3000e6;
    uint256 internal constant ETH_PAYOUT     = 1 ether;
    uint256 internal constant USDC_PAYOUT    = 1500e6;

    // ─── Shared test fixtures ─────────────────────────────────────────────────

    bytes32  internal BLOCK_HASH  = keccak256("test-block-hash");
    bytes32  internal STATE_ROOT  = keccak256("test-state-root");
    bytes    internal BLS_SIG     = abi.encodePacked(BLOCK_HASH, bytes16(0));

    DepositTypes.TradeResult internal tradeResult;

    // ─── Setup ────────────────────────────────────────────────────────────────

    function setUp() public {
        usdcMock   = new ERC20Mock();
        depositBox = new DepositBox(address(usdcMock));
        blsVerifier = new BLSVerifier();
        settlement  = new Settlement(
            address(blsVerifier),
            address(depositBox),
            address(usdcMock)
        );

        // Initialise BLSVerifier with a dummy pubkey (1 validator)
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = hex"a8a5c53d9c0c34b9c7b3e3b5c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5";
        blsVerifier.initialize(pubkeys);

        // Wire settlement contract into deposit box
        depositBox.setSettlementContract(address(settlement));

        // Fund actors
        vm.deal(alice, 100 ether);
        vm.deal(bob,   100 ether);
        usdcMock.mint(alice, 100_000e6);
        usdcMock.mint(bob,   100_000e6);

        // Shared TradeResult
        tradeResult = DepositTypes.TradeResult({
            clearingPrice:  1500e6,
            ethToTrade:     ETH_PAYOUT,
            usdcToTrade:    USDC_PAYOUT,
            ethStateRoot:   STATE_ROOT,
            startNonce:     1,
            endNonce:       2
        });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * @dev Deposit ETH from alice and USDC from bob, then confirm both deposits
     *      so settleTransfers can execute (CONFIRMED → SETTLED transition).
     */
    function _depositAndConfirm() internal {
        // alice deposits ETH
        vm.prank(alice);
        depositBox.depositETH{value: ETH_DEPOSIT}(AUCTION_ID, 1);

        // bob deposits USDC
        vm.startPrank(bob);
        usdcMock.approve(address(depositBox), USDC_DEPOSIT);
        depositBox.depositUSDC(AUCTION_ID, 2, USDC_DEPOSIT);
        vm.stopPrank();

        // Confirm both deposits (only settlement contract may call confirmDeposits)
        uint64[]  memory aIds   = new uint64[](2);
        address[] memory deps   = new address[](2);
        uint256[] memory nonces = new uint256[](2);
        aIds[0]   = AUCTION_ID; aIds[1]   = AUCTION_ID;
        deps[0]   = alice;      deps[1]   = bob;
        nonces[0] = 1;          nonces[1] = 2;

        vm.prank(address(settlement));
        depositBox.confirmDeposits(aIds, deps, nonces, STATE_ROOT);
    }

    /**
     * @dev Build the standard per-winner arrays for settle().
     *      alice wins ETH_PAYOUT ETH; bob wins USDC_PAYOUT USDC.
     */
    function _buildSettleArgs()
        internal
        view
        returns (
            uint64[]  memory auctionIds,
            address[] memory winners,
            address[] memory depositors,
            uint256[] memory nonces,
            uint256[] memory ethAmounts,
            uint256[] memory usdcAmounts
        )
    {
        auctionIds = new uint64[](2);
        winners    = new address[](2);
        depositors = new address[](2);
        nonces     = new uint256[](2);
        ethAmounts = new uint256[](2);
        usdcAmounts= new uint256[](2);

        auctionIds[0] = AUCTION_ID; auctionIds[1] = AUCTION_ID;
        winners[0]    = alice;      winners[1]    = bob;
        depositors[0] = alice;      depositors[1] = bob;
        nonces[0]     = 1;          nonces[1]     = 2;
        ethAmounts[0] = ETH_PAYOUT; ethAmounts[1] = 0;
        usdcAmounts[0]= 0;          usdcAmounts[1]= USDC_PAYOUT;
    }

    /**
     * @dev Wire vm.mockCall so verifyBlockHash returns `result`.
     */
    function _mockBLS(bool result) internal {
        vm.mockCall(
            address(blsVerifier),
            abi.encodeWithSignature(
                "verifyBlockHash(bytes32,bytes)",
                BLOCK_HASH,
                BLS_SIG
            ),
            abi.encode(result)
        );
    }

    /**
     * @dev Standard validator indices (single validator).
     */
    function _validatorIndices() internal pure returns (uint256[] memory vi) {
        vi = new uint256[](1);
        vi[0] = 0;
    }

    // ─── Test 1: valid BLS signature — happy path ─────────────────────────────

    /**
     * @notice settle() with a valid BLS signature and correct state proof
     *         completes and emits SettlementVerified.
     */
    function testSettle_validBLSSignature_succeeds() public {
        _depositAndConfirm();
        _mockBLS(true);

        (
            uint64[]  memory aIds,
            address[] memory winners,
            address[] memory deps,
            uint256[] memory nonces,
            uint256[] memory ethAmts,
            uint256[] memory usdcAmts
        ) = _buildSettleArgs();

        vm.expectEmit(true, true, false, true);
        emit Settlement.SettlementVerified(BLOCK_HASH, STATE_ROOT, tradeResult.clearingPrice);

        vm.prank(owner);
        bool ok = settlement.settle(
            BLOCK_HASH,
            STATE_ROOT,
            tradeResult,
            BLS_SIG,
            _validatorIndices(),
            aIds,
            winners,
            deps,
            nonces,
            ethAmts,
            usdcAmts
        );
        assertTrue(ok, "settle should return true");
    }

    // ─── Test 2: invalid BLS signature — reverts ──────────────────────────────

    /**
     * @notice settle() with a tampered BLS signature reverts with
     *         "Settlement: BLS verification failed".
     */
    function testSettle_invalidBLSSignature_reverts() public {
        _depositAndConfirm();

        bytes memory badSig = abi.encodePacked(bytes32(0), bytes16(0));

        // Mock verifyBlockHash to return false for the bad signature
        vm.mockCall(
            address(blsVerifier),
            abi.encodeWithSignature(
                "verifyBlockHash(bytes32,bytes)",
                BLOCK_HASH,
                badSig
            ),
            abi.encode(false)
        );

        (
            uint64[]  memory aIds,
            address[] memory winners,
            address[] memory deps,
            uint256[] memory nonces,
            uint256[] memory ethAmts,
            uint256[] memory usdcAmts
        ) = _buildSettleArgs();

        vm.prank(owner);
        vm.expectRevert("Settlement: BLS verification failed");
        settlement.settle(
            BLOCK_HASH,
            STATE_ROOT,
            tradeResult,
            badSig,
            _validatorIndices(),
            aIds,
            winners,
            deps,
            nonces,
            ethAmts,
            usdcAmts
        );
    }

    // ─── Test 3: replay protection ────────────────────────────────────────────

    /**
     * @notice Calling settle() twice with identical (blockHash, stateRoot,
     *         clearingPrice) reverts on the second call via isTradeProcessed.
     */
    function testSettle_replayProtection() public {
        _depositAndConfirm();
        _mockBLS(true);

        (
            uint64[]  memory aIds,
            address[] memory winners,
            address[] memory deps,
            uint256[] memory nonces,
            uint256[] memory ethAmts,
            uint256[] memory usdcAmts
        ) = _buildSettleArgs();

        // First call succeeds
        vm.prank(owner);
        settlement.settle(
            BLOCK_HASH, STATE_ROOT, tradeResult, BLS_SIG, _validatorIndices(),
            aIds, winners, deps, nonces, ethAmts, usdcAmts
        );

        // Second identical call must revert
        vm.prank(owner);
        vm.expectRevert("Settlement: trade already processed");
        settlement.settle(
            BLOCK_HASH, STATE_ROOT, tradeResult, BLS_SIG, _validatorIndices(),
            aIds, winners, deps, nonces, ethAmts, usdcAmts
        );
    }

    // ─── Test 4: payout distribution ─────────────────────────────────────────

    /**
     * @notice ETH and USDC balances for each winner change by exactly the
     *         amounts specified in ethAmounts/usdcAmounts.
     */
    function testSettle_payoutDistribution() public {
        _depositAndConfirm();
        _mockBLS(true);

        uint256 aliceEthBefore  = alice.balance;
        uint256 bobUsdcBefore   = usdcMock.balanceOf(bob);

        (
            uint64[]  memory aIds,
            address[] memory winners,
            address[] memory deps,
            uint256[] memory nonces,
            uint256[] memory ethAmts,
            uint256[] memory usdcAmts
        ) = _buildSettleArgs();

        vm.prank(owner);
        settlement.settle(
            BLOCK_HASH, STATE_ROOT, tradeResult, BLS_SIG, _validatorIndices(),
            aIds, winners, deps, nonces, ethAmts, usdcAmts
        );

        assertEq(alice.balance,              aliceEthBefore  + ETH_PAYOUT,  "alice ETH delta");
        assertEq(usdcMock.balanceOf(bob),    bobUsdcBefore   + USDC_PAYOUT, "bob USDC delta");
    }

    // ─── Test 5: contract balance decrements ─────────────────────────────────

    /**
     * @notice DepositBox ETH and USDC balances are reduced by the payout
     *         amounts after a successful settle().
     *
     * Note: Settlement.getContractBalances() reads Settlement's own address
     * balance.  Funds held by depositors flow through DepositBox.  This test
     * therefore verifies that DepositBox balances (address(depositBox).balance
     * and usdcMock.balanceOf(depositBox)) decrement by exactly ETH_PAYOUT and
     * USDC_PAYOUT respectively, which is the observable balance-decrement
     * effect of a successful settle() call.
     */
    function testSettle_contractBalanceDecrements() public {
        _depositAndConfirm();
        _mockBLS(true);

        uint256 depositBoxEthBefore  = address(depositBox).balance;
        uint256 depositBoxUsdcBefore = usdcMock.balanceOf(address(depositBox));

        (
            uint64[]  memory aIds,
            address[] memory winners,
            address[] memory deps,
            uint256[] memory nonces,
            uint256[] memory ethAmts,
            uint256[] memory usdcAmts
        ) = _buildSettleArgs();

        vm.prank(owner);
        settlement.settle(
            BLOCK_HASH, STATE_ROOT, tradeResult, BLS_SIG, _validatorIndices(),
            aIds, winners, deps, nonces, ethAmts, usdcAmts
        );

        assertEq(
            address(depositBox).balance,
            depositBoxEthBefore  - ETH_PAYOUT,
            "depositBox ETH should decrease by ETH_PAYOUT"
        );
        assertEq(
            usdcMock.balanceOf(address(depositBox)),
            depositBoxUsdcBefore - USDC_PAYOUT,
            "depositBox USDC should decrease by USDC_PAYOUT"
        );

        // Settlement.getContractBalances() reflects Settlement's own holdings
        // (zero in this test — funds live in DepositBox, not Settlement).
        (uint256 sEth, uint256 sUsdc) = settlement.getContractBalances();
        assertEq(sEth,  0, "Settlement ETH balance should be zero");
        assertEq(sUsdc, 0, "Settlement USDC balance should be zero");
    }

    // ─── Test 6: mismatched array lengths — reverts ───────────────────────────

    /**
     * @notice Mismatched winners/nonces/ethAmounts/usdcAmounts arrays revert.
     */
    function testSettle_mismatchedArrayLengths_reverts() public {
        _mockBLS(true);

        uint64[]  memory aIds    = new uint64[](2);
        address[] memory winners = new address[](2);
        address[] memory deps    = new address[](2);
        uint256[] memory nonces  = new uint256[](2);
        // ethAmounts has wrong length (1 instead of 2)
        uint256[] memory ethAmts = new uint256[](1);
        uint256[] memory usdcAmts= new uint256[](2);

        aIds[0]    = AUCTION_ID; aIds[1]    = AUCTION_ID;
        winners[0] = alice;      winners[1] = bob;
        deps[0]    = alice;      deps[1]    = bob;
        nonces[0]  = 1;          nonces[1]  = 2;
        ethAmts[0] = ETH_PAYOUT;
        usdcAmts[0]= 0;          usdcAmts[1]= USDC_PAYOUT;

        vm.prank(owner);
        vm.expectRevert("Settlement: ETH amounts mismatch");
        settlement.settle(
            BLOCK_HASH, STATE_ROOT, tradeResult, BLS_SIG, _validatorIndices(),
            aIds, winners, deps, nonces, ethAmts, usdcAmts
        );
    }

    /**
     * @notice Mismatched auctionIds array reverts.
     */
    function testSettle_mismatchedAuctionIds_reverts() public {
        _mockBLS(true);

        // auctionIds length 1, winners length 2 → mismatch
        uint64[]  memory aIds    = new uint64[](1);
        address[] memory winners = new address[](2);
        address[] memory deps    = new address[](2);
        uint256[] memory nonces  = new uint256[](2);
        uint256[] memory ethAmts = new uint256[](2);
        uint256[] memory usdcAmts= new uint256[](2);

        aIds[0]    = AUCTION_ID;
        winners[0] = alice;      winners[1] = bob;
        deps[0]    = alice;      deps[1]    = bob;
        nonces[0]  = 1;          nonces[1]  = 2;

        vm.prank(owner);
        vm.expectRevert("Settlement: auctionIds mismatch");
        settlement.settle(
            BLOCK_HASH, STATE_ROOT, tradeResult, BLS_SIG, _validatorIndices(),
            aIds, winners, deps, nonces, ethAmts, usdcAmts
        );
    }

    // ─── Test 7: isTradeProcessed — false before, true after ─────────────────

    /**
     * @notice isTradeProcessed() returns false before and true after a
     *         successful settle().
     */
    function testIsTradeProcessed_returnsTrueAfterSettle() public {
        _depositAndConfirm();
        _mockBLS(true);

        // Before settle — should be false
        bool beforeSettle = settlement.isTradeProcessed(
            BLOCK_HASH, STATE_ROOT, tradeResult.clearingPrice
        );
        assertFalse(beforeSettle, "should not be processed before settle");

        (
            uint64[]  memory aIds,
            address[] memory winners,
            address[] memory deps,
            uint256[] memory nonces,
            uint256[] memory ethAmts,
            uint256[] memory usdcAmts
        ) = _buildSettleArgs();

        vm.prank(owner);
        settlement.settle(
            BLOCK_HASH, STATE_ROOT, tradeResult, BLS_SIG, _validatorIndices(),
            aIds, winners, deps, nonces, ethAmts, usdcAmts
        );

        // After settle — should be true
        bool afterSettle = settlement.isTradeProcessed(
            BLOCK_HASH, STATE_ROOT, tradeResult.clearingPrice
        );
        assertTrue(afterSettle, "should be processed after settle");
    }
}
