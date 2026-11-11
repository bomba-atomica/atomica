// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LockBox} from "../../src/escrow/LockBox.sol";
import {OutcomeTree} from "../../src/escrow/OutcomeTree.sol";
import {AptosLightClient} from "../../src/aptos/AptosLightClient.sol";
import {AptosHash} from "../../src/aptos/AptosHash.sol";
import {IAptosLightClient} from "../../src/aptos/IAptosLightClient.sol";
import {FakeETH} from "../../src/tokens/FakeETH.sol";
import {FakeUSD} from "../../src/tokens/FakeUSD.sol";
import {AptosVectors} from "../unit/aptos/AptosVectors.sol";
import {AptosTestChain} from "../unit/aptos/AptosTestChain.sol";
import {OutcomeTreeBuilder} from "../utils/OutcomeTreeBuilder.sol";

/**
 * @notice LockBox with the real AptosLightClient (no mock).
 *         1. The golden AuctionOutcome vector from atomica-aptos (issue 201) records its root.
 *            Its dispositions root is a placeholder hash with no leaves behind it, so nothing can
 *            be released from it; a lock of that auction still cannot be reclaimed without a
 *            non-membership proof.
 *         2. An AuctionOutcome over real locks, signed with real BLS keys by a synthetic validator
 *            set (AptosTestChain), records through the same client and releaseByOutcome pays
 *            every payout per its root.
 */
contract LockBoxAptosOutcomeTest is AptosVectors, AptosTestChain {
    bytes internal tag = structTag(bytes32(uint256(0xcafe)), "auction", "AuctionOutcome");

    FakeETH internal fakeETH;
    FakeUSD internal fakeUSD;

    address internal seller = address(0x5E11);
    address internal winner = address(0x3133);
    address internal loser = address(0x1050);

    function setUp() public {
        fakeETH = new FakeETH();
        fakeUSD = new FakeUSD();
        for (uint256 i = 0; i < 3; i++) {
            address who = [seller, winner, loser][i];
            fakeETH.mint(who, 100 ether);
            fakeUSD.mint(who, 10_000e6);
        }
    }

    function _approveAll(LockBox lockBox) internal {
        for (uint256 i = 0; i < 3; i++) {
            address who = [seller, winner, loser][i];
            vm.startPrank(who);
            fakeETH.approve(address(lockBox), type(uint256).max);
            fakeUSD.approve(address(lockBox), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _lock(LockBox lockBox, address who, address token, uint256 amount, uint64 w, bytes32 p, uint64 d)
        internal
        returns (LockBox.Lock memory l)
    {
        uint256 nonce = lockBox.nextLockNonce();
        vm.prank(who);
        lockBox.lock(token, amount, w, p, d);
        l = LockBox.Lock(who, token, nonce, amount, w, p, d);
    }

    // ---------------------------------------------------------------- golden vector

    function test_realClientAcceptsGoldenAuctionOutcome() public {
        AptosLightClient client = new AptosLightClient(
            _hex(".genesis.ledger_info_with_signatures"),
            uint64(vm.parseJsonUint(vectors, ".genesis.waypoint_version")),
            _b32(".genesis.waypoint_value")
        );
        client.advanceEpoch(_goldenEpochChange());
        assertEq(
            keccak256(tag),
            keccak256(
                abi.encodePacked(
                    hex"07", bytes32(uint256(0xcafe)), hex"0761756374696f6e0e41756374696f6e4f7574636f6d6500"
                )
            )
        );

        LockBox lockBox = new LockBox(address(fakeETH), address(fakeUSD), client, tag);
        _approveAll(lockBox);

        uint64 windowId = uint64(vm.parseJsonUint(vectors, ".event.auction_outcome.window_id"));
        bytes32 pairHash = _b32(".event.auction_outcome.pair_hash");
        uint64 deadline = uint64(vm.parseJsonUint(vectors, ".event.auction_outcome.eth_lock_deadline"));
        bytes32 root = _b32(".event.auction_outcome.dispositions_root");
        uint64 leafCount = uint64(vm.parseJsonUint(vectors, ".event.auction_outcome.leaf_count"));
        // The event payload is the BCS this LockBox decodes.
        assertEq(
            _hex(".event.event_data"), OutcomeTreeBuilder.outcomeBcs(windowId, pairHash, deadline, root, leafCount)
        );

        LockBox.Lock memory l = _lock(lockBox, seller, address(fakeETH), 1 ether, windowId, pairHash, deadline);

        bytes32 key = lockBox.auctionKey(windowId, pairHash, deadline);
        vm.expectEmit(address(lockBox));
        emit LockBox.OutcomeRecorded(
            key,
            windowId,
            pairHash,
            deadline,
            root,
            leafCount,
            uint64(vm.parseJsonUint(vectors, ".transaction.version"))
        );
        vm.prank(winner); // anyone may carry the proof
        assertEq(lockBox.recordOutcome(_goldenEventProof()), key);
        (bytes32 storedRoot, uint64 storedCount) = lockBox.outcomes(key);
        assertEq(storedRoot, root);
        assertEq(storedCount, leafCount);

        vm.expectRevert(abi.encodeWithSelector(LockBox.OutcomeAlreadyRecorded.selector, key));
        lockBox.recordOutcome(_goldenEventProof());

        // The placeholder root names no real lock: release and plain reclaim both fail.
        bytes32[] memory proof = new bytes32[](2);
        vm.expectRevert(LockBox.InvalidProof.selector);
        lockBox.releaseByOutcome(l, _one(winner, 1 ether), OutcomeTree.LeafProof(0, proof));
        vm.warp(deadline);
        vm.expectRevert(
            abi.encodeWithSelector(LockBox.LockInTree.selector, lockBox.getLockId(seller, address(fakeETH), 0))
        );
        lockBox.reclaim(l, new OutcomeTree.Neighbour[](0));
    }

    function test_realClientRejectsGoldenBelowQuorumOutcome() public {
        AptosLightClient client = new AptosLightClient(
            _hex(".genesis.ledger_info_with_signatures"),
            uint64(vm.parseJsonUint(vectors, ".genesis.waypoint_version")),
            _b32(".genesis.waypoint_value")
        );
        client.advanceEpoch(_goldenEpochChange());
        LockBox lockBox = new LockBox(address(fakeETH), address(fakeUSD), client, tag);
        IAptosLightClient.EventProof memory p = _goldenEventProof();
        p.ledgerInfo = _goldenOutcomeLedgerInfo(1); // validators 0 and 2: 7 of 11, quorum 8
        vm.expectRevert(abi.encodeWithSelector(IAptosLightClient.InsufficientVotingPower.selector, 7, 8));
        lockBox.recordOutcome(p);
        (bytes32 root,) = lockBox.outcomes(
            lockBox.auctionKey(
                uint64(vm.parseJsonUint(vectors, ".event.auction_outcome.window_id")),
                _b32(".event.auction_outcome.pair_hash"),
                uint64(vm.parseJsonUint(vectors, ".event.auction_outcome.eth_lock_deadline"))
            )
        );
        assertEq(root, bytes32(0));
    }

    // ---------------------------------------------------------------- signed synthetic outcome

    function test_releaseByOutcomePaysPerSignedRoot() public {
        ValidatorSet memory set1 = makeSet(1, 4, 1, 1);
        (bytes memory liws, uint64 wpVersion, bytes32 wpHash) = genesis(set1);
        AptosLightClient client = new AptosLightClient(liws, wpVersion, wpHash);
        LockBox lockBox = new LockBox(address(fakeETH), address(fakeUSD), client, tag);
        _approveAll(lockBox);

        vm.warp(1_700_000_000);
        uint64 windowId = 7;
        bytes32 pairHash = keccak256("pair bcs");
        uint64 deadline = uint64(block.timestamp + 3 days);

        // Seller sells 2 FakeETH to the winner for 3_000 USD. The winner gets 1_000 USD of excess
        // collateral back. The loser's collateral goes home.
        LockBox.Lock[] memory locks = new LockBox.Lock[](3);
        locks[0] = _lock(lockBox, seller, address(fakeETH), 2 ether, windowId, pairHash, deadline);
        locks[1] = _lock(lockBox, winner, address(fakeUSD), 4_000e6, windowId, pairHash, deadline);
        locks[2] = _lock(lockBox, loser, address(fakeUSD), 2_500e6, windowId, pairHash, deadline);
        OutcomeTree.Payout[][] memory payouts = new OutcomeTree.Payout[][](3);
        payouts[0] = _one(winner, 2 ether);
        payouts[1] = new OutcomeTree.Payout[](2);
        payouts[1][0] = OutcomeTree.Payout(seller, 3_000e6);
        payouts[1][1] = OutcomeTree.Payout(winner, 1_000e6);
        payouts[2] = _one(loser, 2_500e6);

        bytes32[] memory ids = new bytes32[](3);
        for (uint256 i = 0; i < 3; i++) {
            ids[i] = lockBox.getLockId(locks[i].depositor, locks[i].token, locks[i].nonce);
        }
        uint256[] memory order = OutcomeTreeBuilder.sortedOrder(ids);
        bytes32[] memory leaves = new bytes32[](3);
        uint256[] memory pos = new uint256[](3);
        for (uint256 k = 0; k < 3; k++) {
            uint256 i = order[k];
            pos[i] = k;
            leaves[k] = OutcomeTreeBuilder.leafHash(ids[i], OutcomeTreeBuilder.payoutsHash(payouts[i]));
        }
        bytes memory data =
            OutcomeTreeBuilder.outcomeBcs(windowId, pairHash, deadline, OutcomeTreeBuilder.root(leaves), 3);

        vm.prank(loser);
        lockBox.recordOutcome(_signedEventProof(set1, data));

        uint256 sellerUsd = fakeUSD.balanceOf(seller);
        uint256 winnerEth = fakeETH.balanceOf(winner);
        uint256 winnerUsd = fakeUSD.balanceOf(winner);
        uint256 loserUsd = fakeUSD.balanceOf(loser);
        for (uint256 i = 0; i < 3; i++) {
            lockBox.releaseByOutcome(
                locks[i], payouts[i], OutcomeTree.LeafProof(pos[i], OutcomeTreeBuilder.proof(leaves, pos[i]))
            );
        }
        assertEq(fakeUSD.balanceOf(seller), sellerUsd + 3_000e6);
        assertEq(fakeETH.balanceOf(winner), winnerEth + 2 ether);
        assertEq(fakeUSD.balanceOf(winner), winnerUsd + 1_000e6);
        assertEq(fakeUSD.balanceOf(loser), loserUsd + 2_500e6);
        assertEq(fakeETH.balanceOf(address(lockBox)), 0);
        assertEq(fakeUSD.balanceOf(address(lockBox)), 0);
    }

    // ---------------------------------------------------------------- helpers

    function _one(address to, uint256 amount) internal pure returns (OutcomeTree.Payout[] memory p) {
        p = new OutcomeTree.Payout[](1);
        p[0] = OutcomeTree.Payout(to, amount);
    }

    /// The AuctionOutcome `data` as event 1 of a successful transaction, under an epoch 1
    /// LedgerInfo signed by 3 of the 4 validators of `set1`.
    function _signedEventProof(ValidatorSet memory set1, bytes memory data)
        internal
        view
        returns (IAptosLightClient.EventProof memory p)
    {
        p.contractEvent = eventV2(tag, data);
        p.eventIndex = 1;
        bytes32 eventRoot;
        (p.eventAccumulatorProof, eventRoot) = accumulator(
            AptosHash.EVENT_ACCUMULATOR_SEED,
            AptosHash.hashWithSeed(AptosHash.CONTRACT_EVENT_SEED, p.contractEvent),
            1,
            2
        );
        p.transactionInfo = transactionInfo(eventRoot, true);
        p.version = 9;
        bytes32 root;
        (p.transactionAccumulatorProof, root) = accumulator(
            AptosHash.TRANSACTION_ACCUMULATOR_SEED,
            AptosHash.hashWithSeed(AptosHash.TRANSACTION_INFO_SEED, p.transactionInfo),
            p.version,
            4
        );
        LedgerInfoFields memory f;
        f.epoch = 1;
        f.round = 3;
        f.executedStateId = root;
        f.version = p.version;
        f.timestampUsecs = 1_700_000_000_000_000;
        p.ledgerInfo = signLedgerInfo(set1, firstSigners(4, 3), f);
    }

    function _goldenEpochChange() internal view returns (IAptosLightClient.SignedLedgerInfo memory s) {
        s.ledgerInfoWithSignatures = _hex(".epoch_change.ledger_info_with_signatures");
        s.epochState = _hex(".validator_sets[0].epoch_state_bcs");
        s.signerPublicKeys = _signerKeys(".validator_sets[0]", ".epoch_change.signing");
        s.signature = _hex(".epoch_change.signing.signature_eip2537");
    }

    function _goldenOutcomeLedgerInfo(uint256 i) internal view returns (IAptosLightClient.SignedLedgerInfo memory s) {
        string memory c = string.concat(".outcome_ledger_infos[", vm.toString(i), "]");
        s.ledgerInfoWithSignatures = _hex(string.concat(c, ".ledger_info_with_signatures"));
        s.epochState = _hex(".validator_sets[1].epoch_state_bcs");
        s.signerPublicKeys = _signerKeys(".validator_sets[1]", string.concat(c, ".signing"));
        s.signature = _hex(string.concat(c, ".signing.signature_eip2537"));
    }

    function _goldenEventProof() internal view returns (IAptosLightClient.EventProof memory p) {
        p.ledgerInfo = _goldenOutcomeLedgerInfo(0);
        p.version = uint64(vm.parseJsonUint(vectors, ".transaction.version"));
        p.transactionInfo = _hex(".transaction.transaction_info");
        p.transactionAccumulatorProof = _hex(".transaction.transaction_accumulator_proof");
        p.eventIndex = uint64(vm.parseJsonUint(vectors, ".event.index"));
        p.contractEvent = _hex(".event.event");
        p.eventAccumulatorProof = _hex(".event.event_accumulator_proof");
    }

    function _signerKeys(string memory set, string memory signing) internal view returns (bytes memory keys) {
        uint256[] memory idx = vm.parseJsonUintArray(vectors, string.concat(signing, ".signer_indexes"));
        for (uint256 i = 0; i < idx.length; i++) {
            keys = abi.encodePacked(
                keys, _hex(string.concat(set, ".validators[", vm.toString(idx[i]), "].public_key_eip2537"))
            );
        }
    }
}
