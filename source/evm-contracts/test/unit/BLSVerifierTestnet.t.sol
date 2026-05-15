// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// BLSVerifierTestnet unit tests — Phase 3d (#89)
//
// Covers:
//   - accept path: trustedRelayer can call verifyBlockHash and authorizeSettlement
//   - reject path: non-relayer cannot call verifyBlockHash (returns false) or
//     authorizeSettlement (reverts NotTrustedRelayer)
//   - array-length mismatch guard on authorizeSettlement

import "forge-std/Test.sol";
import "../../src/settlement/BLSVerifierTestnet.sol";

contract BLSVerifierTestnetTest is Test {
    // ─── Fixtures ─────────────────────────────────────────────────────────────

    address internal relayer  = makeAddr("trustedRelayer");
    address internal attacker = makeAddr("attacker");

    BLSVerifierTestnet internal verifier;

    // Dummy data
    bytes32  internal constant BLOCK_HASH    = keccak256("block0");
    bytes    internal constant EMPTY_SIG     = "";
    uint64   internal constant WINDOW_ID     = 42;
    bytes32  internal constant PAIR_HASH     = keccak256("FakeETH/FakeUSD");
    uint64   internal constant CLEARING_PRICE = 1000;

    address[] internal winners;
    uint256[] internal fills;

    // ─── Setup ────────────────────────────────────────────────────────────────

    function setUp() public {
        verifier = new BLSVerifierTestnet(relayer);

        winners.push(makeAddr("winner1"));
        winners.push(makeAddr("winner2"));
        fills.push(1 ether);
        fills.push(2 ether);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function testConstructorSetsRelayer() public view {
        assertEq(verifier.trustedRelayer(), relayer);
    }

    function testConstructorRejectsZeroRelayer() public {
        vm.expectRevert("BLSVerifierTestnet: zero relayer");
        new BLSVerifierTestnet(address(0));
    }

    // ─── verifyBlockHash — accept path ────────────────────────────────────────

    /**
     * @dev The trusted relayer calling verifyBlockHash returns true.
     */
    function testVerifyBlockHash_acceptsRelayer() public {
        vm.prank(relayer);
        bool result = verifier.verifyBlockHash(BLOCK_HASH, EMPTY_SIG);
        assertTrue(result, "trusted relayer should be accepted");
    }

    /**
     * @dev Any non-relayer calling verifyBlockHash returns false (no revert).
     */
    function testVerifyBlockHash_rejectsNonRelayer() public {
        vm.prank(attacker);
        bool result = verifier.verifyBlockHash(BLOCK_HASH, EMPTY_SIG);
        assertFalse(result, "non-relayer should be rejected");
    }

    /**
     * @dev verifyBlockHash is purely a view function: same block hash can be
     *      called multiple times without state change.
     */
    function testVerifyBlockHash_isIdempotent() public {
        vm.startPrank(relayer);
        bool r1 = verifier.verifyBlockHash(BLOCK_HASH, EMPTY_SIG);
        bool r2 = verifier.verifyBlockHash(BLOCK_HASH, EMPTY_SIG);
        vm.stopPrank();
        assertTrue(r1);
        assertTrue(r2);
    }

    // ─── authorizeSettlement — accept path ───────────────────────────────────

    /**
     * @dev The trusted relayer can call authorizeSettlement and it emits
     *      SettlementAuthorized.
     */
    function testAuthorizeSettlement_relayerSucceeds() public {
        vm.expectEmit(true, true, false, true);
        emit BLSVerifierTestnet.SettlementAuthorized(
            WINDOW_ID,
            PAIR_HASH,
            CLEARING_PRICE,
            winners,
            fills
        );

        vm.prank(relayer);
        verifier.authorizeSettlement(WINDOW_ID, PAIR_HASH, CLEARING_PRICE, winners, fills);
    }

    // ─── authorizeSettlement — reject paths ──────────────────────────────────

    /**
     * @dev Non-relayer callers must be reverted with NotTrustedRelayer.
     */
    function testAuthorizeSettlement_nonRelayerReverts() public {
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(BLSVerifierTestnet.NotTrustedRelayer.selector, attacker)
        );
        verifier.authorizeSettlement(WINDOW_ID, PAIR_HASH, CLEARING_PRICE, winners, fills);
    }

    /**
     * @dev Mismatched winners/fills arrays must revert with WinnersFillesMismatch.
     */
    function testAuthorizeSettlement_mismatchedArraysReverts() public {
        uint256[] memory shortFills = new uint256[](1);
        shortFills[0] = 1 ether;

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(
                BLSVerifierTestnet.WinnersFillesMismatch.selector,
                winners.length,
                shortFills.length
            )
        );
        verifier.authorizeSettlement(WINDOW_ID, PAIR_HASH, CLEARING_PRICE, winners, shortFills);
    }

    /**
     * @dev Empty winners array is valid (zero-winner settlement is allowed at
     *      the contract level; higher-level guards exist in Settlement.sol).
     */
    function testAuthorizeSettlement_emptyArraysSucceeds() public {
        address[] memory emptyWinners = new address[](0);
        uint256[] memory emptyFills   = new uint256[](0);

        vm.prank(relayer);
        verifier.authorizeSettlement(WINDOW_ID, PAIR_HASH, CLEARING_PRICE, emptyWinners, emptyFills);
        // No revert = pass
    }

    // ─── Fuzz ─────────────────────────────────────────────────────────────────

    /**
     * @dev Any non-relayer address should never be accepted by verifyBlockHash.
     */
    function testFuzz_nonRelayerAlwaysRejected(address nonRelayer) public {
        vm.assume(nonRelayer != relayer);
        vm.prank(nonRelayer);
        assertFalse(verifier.verifyBlockHash(BLOCK_HASH, EMPTY_SIG));
    }
}
