// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LockBox} from "../../src/escrow/LockBox.sol";
import {OutcomeTree} from "../../src/escrow/OutcomeTree.sol";
import {IAptosLightClient} from "../../src/aptos/IAptosLightClient.sol";
import {FakeETH} from "../../src/tokens/FakeETH.sol";
import {FakeUSD} from "../../src/tokens/FakeUSD.sol";
import {MockAptosLightClient} from "../utils/MockAptosLightClient.sol";
import {OutcomeTreeBuilder} from "../utils/OutcomeTreeBuilder.sol";
import {DeployLockBox} from "../../script/DeployLockBox.s.sol";

/**
 * @notice Proof-gated LockBox (issue 203): lock, recordOutcome, releaseByOutcome and reclaim,
 *         with MockAptosLightClient standing in for the Aptos light client.
 */
contract LockBoxTest is Test {
    LockBox internal lockBox;
    FakeETH internal fakeETH;
    FakeUSD internal fakeUSD;
    MockAptosLightClient internal client;

    bytes internal constant TYPE_TAG =
        hex"07000000000000000000000000000000000000000000000000000000000000cafe0761756374696f6e0e41756374696f6e4f7574636f6d6500";

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA401);
    address internal stranger = address(0x5157);

    uint64 internal constant WINDOW = 42;
    bytes32 internal constant PAIR = keccak256("pair");
    uint64 internal deadline;

    function setUp() public {
        vm.warp(1_700_000_000);
        deadline = uint64(block.timestamp + 3 days);
        fakeETH = new FakeETH();
        fakeUSD = new FakeUSD();
        client = new MockAptosLightClient(TYPE_TAG);
        lockBox = new LockBox(address(fakeETH), address(fakeUSD), client, TYPE_TAG);
        for (uint256 i = 0; i < 3; i++) {
            address who = [alice, bob, carol][i];
            fakeETH.mint(who, 1000 ether);
            fakeUSD.mint(who, 10_000e6);
            vm.startPrank(who);
            fakeETH.approve(address(lockBox), type(uint256).max);
            fakeUSD.approve(address(lockBox), type(uint256).max);
            vm.stopPrank();
        }
    }

    // ---------------------------------------------------------------- helpers

    function _lock(address who, address token, uint256 amount) internal returns (LockBox.Lock memory l) {
        return _lockInto(who, token, amount, WINDOW, PAIR, deadline);
    }

    function _lockInto(address who, address token, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 dl)
        internal
        returns (LockBox.Lock memory l)
    {
        uint256 nonce = lockBox.nextLockNonce();
        vm.prank(who);
        lockBox.lock(token, amount, windowId, pairHash, dl);
        l = LockBox.Lock(who, token, nonce, amount, windowId, pairHash, dl);
    }

    function _id(LockBox.Lock memory l) internal view returns (bytes32) {
        return lockBox.getLockId(l.depositor, l.token, l.nonce);
    }

    function _payouts1(address to, uint256 amount) internal pure returns (OutcomeTree.Payout[] memory p) {
        p = new OutcomeTree.Payout[](1);
        p[0] = OutcomeTree.Payout(to, amount);
    }

    function _payouts2(address to0, uint256 a0, address to1, uint256 a1)
        internal
        pure
        returns (OutcomeTree.Payout[] memory p)
    {
        p = new OutcomeTree.Payout[](2);
        p[0] = OutcomeTree.Payout(to0, a0);
        p[1] = OutcomeTree.Payout(to1, a1);
    }

    /// Sorted leaves of `ids` with their `payouts`; `pos[i]` is the tree index of `ids[i]`.
    function _tree(bytes32[] memory ids, OutcomeTree.Payout[][] memory payouts)
        internal
        pure
        returns (bytes32[] memory leaves, uint256[] memory pos, bytes32[] memory sortedIds, bytes32[] memory hashes)
    {
        uint256[] memory order = OutcomeTreeBuilder.sortedOrder(ids);
        leaves = new bytes32[](ids.length);
        pos = new uint256[](ids.length);
        sortedIds = new bytes32[](ids.length);
        hashes = new bytes32[](ids.length);
        for (uint256 k = 0; k < order.length; k++) {
            uint256 i = order[k];
            pos[i] = k;
            sortedIds[k] = ids[i];
            hashes[k] = OutcomeTreeBuilder.payoutsHash(payouts[i]);
            leaves[k] = OutcomeTreeBuilder.leafHash(ids[i], hashes[k]);
        }
    }

    function _outcomeProof(bytes memory data) internal pure returns (IAptosLightClient.EventProof memory p) {
        p.version = 77;
        p.contractEvent = data;
    }

    function _record(bytes32 root, uint64 count) internal returns (bytes32) {
        return lockBox.recordOutcome(_outcomeProof(OutcomeTreeBuilder.outcomeBcs(WINDOW, PAIR, deadline, root, count)));
    }

    function _leaf(bytes32[] memory leaves, uint256 index) internal pure returns (OutcomeTree.LeafProof memory) {
        return OutcomeTree.LeafProof(index, OutcomeTreeBuilder.proof(leaves, index));
    }

    function _neighbour(bytes32[] memory leaves, bytes32[] memory ids, bytes32[] memory hashes, uint256 index)
        internal
        pure
        returns (OutcomeTree.Neighbour memory)
    {
        return OutcomeTree.Neighbour(ids[index], hashes[index], index, OutcomeTreeBuilder.proof(leaves, index));
    }

    /// Seller alice locks 10 FakeETH; bob and carol each lock FakeUSD collateral. Bob wins all
    /// 10 FakeETH for 6_000 USD and gets 2_000 USD back. Carol loses. Alice is paid 6_000 USD.
    struct Settled {
        LockBox.Lock[] locks;
        OutcomeTree.Payout[][] payouts;
        bytes32[] leaves;
        uint256[] pos;
    }

    function _settledAuction() internal returns (Settled memory s) {
        s.locks = new LockBox.Lock[](3);
        s.locks[0] = _lock(alice, address(fakeETH), 10 ether);
        s.locks[1] = _lock(bob, address(fakeUSD), 8_000e6);
        s.locks[2] = _lock(carol, address(fakeUSD), 3_000e6);
        s.payouts = new OutcomeTree.Payout[][](3);
        s.payouts[0] = _payouts1(bob, 10 ether);
        s.payouts[1] = _payouts2(alice, 6_000e6, bob, 2_000e6);
        s.payouts[2] = _payouts1(carol, 3_000e6);
        bytes32[] memory ids = new bytes32[](3);
        for (uint256 i = 0; i < 3; i++) {
            ids[i] = _id(s.locks[i]);
        }
        (s.leaves, s.pos,,) = _tree(ids, s.payouts);
        _record(OutcomeTreeBuilder.root(s.leaves), 3);
    }

    // ---------------------------------------------------------------- constructor

    function test_constructorWiresLightClientAndTypeTag() public view {
        assertEq(address(lockBox.lightClient()), address(client));
        assertEq(lockBox.outcomeTypeTag(), TYPE_TAG);
        assertEq(address(lockBox.fakeETH()), address(fakeETH));
        assertEq(address(lockBox.fakeUSD()), address(fakeUSD));
    }

    /// The deploy script builds the BCS TypeTag of `0xcafe::auction::AuctionOutcome`.
    function test_deployScriptBuildsOutcomeTypeTag() public {
        assertEq(new DeployLockBox().outcomeTypeTag(bytes32(uint256(0xcafe))), TYPE_TAG);
    }

    function test_constructorRejectsZeroLightClient() public {
        vm.expectRevert("Invalid light client");
        new LockBox(address(fakeETH), address(fakeUSD), IAptosLightClient(address(0)), TYPE_TAG);
    }

    function test_constructorRejectsEmptyTypeTag() public {
        vm.expectRevert("Invalid type tag");
        new LockBox(address(fakeETH), address(fakeUSD), client, "");
    }

    // ---------------------------------------------------------------- lock

    function test_lockStoresCommitmentAtSlotZeroAndOpens() public {
        LockBox.Lock memory l = _lock(alice, address(fakeETH), 10 ether);
        bytes32 lockId = _id(l);
        bytes32 expected = keccak256(abi.encode(alice, address(fakeETH), uint256(10 ether), WINDOW, PAIR, deadline));
        bytes32 slot = keccak256(abi.encode(lockId, uint256(0)));
        assertEq(slot, lockBox.commitmentStorageKey(lockId));
        assertEq(vm.load(address(lockBox), slot), expected);
        assertEq(lockBox.commitments(lockId), expected);
        assertEq(uint8(lockBox.statuses(lockId)), uint8(LockBox.Status.Open));
        assertEq(lockId, keccak256(abi.encodePacked(alice, address(fakeETH), uint256(0))));
        assertEq(fakeETH.balanceOf(address(lockBox)), 10 ether);
        assertEq(lockBox.nextLockNonce(), 1);
    }

    function test_lockEmitsLocked() public {
        bytes32 lockId = lockBox.getLockId(alice, address(fakeUSD), 0);
        vm.expectEmit(address(lockBox));
        emit LockBox.Locked(lockId, alice, address(fakeUSD), 0, 5e6, WINDOW, PAIR, deadline);
        vm.prank(alice);
        lockBox.lock(address(fakeUSD), 5e6, WINDOW, PAIR, deadline);
    }

    function test_lockAuctionKeyDependsOnDeadline() public view {
        assertTrue(lockBox.auctionKey(WINDOW, PAIR, deadline) != lockBox.auctionKey(WINDOW, PAIR, deadline + 1));
        assertEq(lockBox.auctionKey(WINDOW, PAIR, deadline), keccak256(abi.encode(WINDOW, PAIR, deadline)));
    }

    function test_lockRevertsOnPastDeadline() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LockBox.DeadlinePassed.selector, uint64(block.timestamp - 1)));
        lockBox.lock(address(fakeETH), 1 ether, WINDOW, PAIR, uint64(block.timestamp - 1));
    }

    function test_lockRevertsOnDeadlineNow() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LockBox.DeadlinePassed.selector, uint64(block.timestamp)));
        lockBox.lock(address(fakeETH), 1 ether, WINDOW, PAIR, uint64(block.timestamp));
    }

    function test_lockRevertsOnUnsupportedToken() public {
        FakeETH other = new FakeETH();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LockBox.UnsupportedToken.selector, address(other)));
        lockBox.lock(address(other), 1 ether, WINDOW, PAIR, deadline);
    }

    function test_lockRevertsOnZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(LockBox.ZeroAmount.selector);
        lockBox.lock(address(fakeETH), 0, WINDOW, PAIR, deadline);
    }

    // ---------------------------------------------------------------- recordOutcome

    function test_recordOutcomeStoresRootAndLeafCount() public {
        bytes32 root = keccak256("root");
        bytes32 key = lockBox.auctionKey(WINDOW, PAIR, deadline);
        vm.expectEmit(address(lockBox));
        emit LockBox.OutcomeRecorded(key, WINDOW, PAIR, deadline, root, 4, 77);
        vm.prank(stranger);
        assertEq(_record(root, 4), key);
        (bytes32 storedRoot, uint64 count) = lockBox.outcomes(key);
        assertEq(storedRoot, root);
        assertEq(count, 4);
    }

    function test_recordOutcomeRevertsOnSecondRecord() public {
        _record(keccak256("root"), 4);
        bytes32 key = lockBox.auctionKey(WINDOW, PAIR, deadline);
        vm.expectRevert(abi.encodeWithSelector(LockBox.OutcomeAlreadyRecorded.selector, key));
        _record(keccak256("other root"), 4);
    }

    function test_recordOutcomeBubblesStaleEpochAndStoresNothing() public {
        client.setLatestEpoch(3);
        IAptosLightClient.EventProof memory p =
            _outcomeProof(OutcomeTreeBuilder.outcomeBcs(WINDOW, PAIR, deadline, keccak256("root"), 1));
        p.ledgerInfo.ledgerInfoWithSignatures = abi.encode(uint64(2));
        vm.expectRevert(abi.encodeWithSelector(IAptosLightClient.StaleEpoch.selector, uint64(2), uint64(3)));
        lockBox.recordOutcome(p);
        (bytes32 root, uint64 count) = lockBox.outcomes(lockBox.auctionKey(WINDOW, PAIR, deadline));
        assertEq(root, bytes32(0));
        assertEq(count, 0);
    }

    function test_recordOutcomeRevertsOnMalformedEvent() public {
        bytes memory data = OutcomeTreeBuilder.outcomeBcs(WINDOW, PAIR, deadline, keccak256("root"), 1);
        vm.expectRevert(LockBox.BadOutcomeEvent.selector);
        lockBox.recordOutcome(_outcomeProof(bytes.concat(data, hex"00")));
        data[8] = bytes1(uint8(31));
        vm.expectRevert(LockBox.BadOutcomeEvent.selector);
        lockBox.recordOutcome(_outcomeProof(data));
    }

    function test_recordOutcomeRevertsOnEmptyTree() public {
        vm.expectRevert(LockBox.BadOutcomeEvent.selector);
        _record(keccak256("root"), 0);
        vm.expectRevert(LockBox.BadOutcomeEvent.selector);
        _record(bytes32(0), 1);
    }

    // ---------------------------------------------------------------- releaseByOutcome

    function test_releaseByOutcomePaysEveryPayout() public {
        Settled memory s = _settledAuction();
        uint256 aliceUsd = fakeUSD.balanceOf(alice);
        uint256 bobEth = fakeETH.balanceOf(bob);
        uint256 bobUsd = fakeUSD.balanceOf(bob);
        uint256 carolUsd = fakeUSD.balanceOf(carol);

        for (uint256 i = 0; i < 3; i++) {
            vm.prank(stranger);
            lockBox.releaseByOutcome(s.locks[i], s.payouts[i], _leaf(s.leaves, s.pos[i]));
            assertEq(uint8(lockBox.statuses(_id(s.locks[i]))), uint8(LockBox.Status.Released));
        }

        assertEq(fakeETH.balanceOf(bob), bobEth + 10 ether);
        assertEq(fakeUSD.balanceOf(alice), aliceUsd + 6_000e6);
        assertEq(fakeUSD.balanceOf(bob), bobUsd + 2_000e6);
        assertEq(fakeUSD.balanceOf(carol), carolUsd + 3_000e6);
        assertEq(fakeETH.balanceOf(address(lockBox)), 0);
        assertEq(fakeUSD.balanceOf(address(lockBox)), 0);
    }

    function test_releaseByOutcomeWorksAfterDeadline() public {
        Settled memory s = _settledAuction();
        vm.warp(deadline + 30 days);
        lockBox.releaseByOutcome(s.locks[0], s.payouts[0], _leaf(s.leaves, s.pos[0]));
        assertEq(uint8(lockBox.statuses(_id(s.locks[0]))), uint8(LockBox.Status.Released));
    }

    function test_releaseByOutcomeRevertsOnWrongProof() public {
        Settled memory s = _settledAuction();
        OutcomeTree.LeafProof memory leaf = _leaf(s.leaves, s.pos[0]);
        leaf.proof[0] = keccak256("wrong");
        vm.expectRevert(LockBox.InvalidProof.selector);
        lockBox.releaseByOutcome(s.locks[0], s.payouts[0], leaf);
    }

    function test_releaseByOutcomeRevertsOnWrongIndex() public {
        Settled memory s = _settledAuction();
        OutcomeTree.LeafProof memory leaf = _leaf(s.leaves, s.pos[0]);
        leaf.index = (s.pos[0] + 1) % 3;
        vm.expectRevert(LockBox.InvalidProof.selector);
        lockBox.releaseByOutcome(s.locks[0], s.payouts[0], leaf);
    }

    function test_releaseByOutcomeRevertsOnOtherPayouts() public {
        Settled memory s = _settledAuction();
        // Same sum, other recipient: not the leaf Aptos signed.
        vm.expectRevert(LockBox.InvalidProof.selector);
        lockBox.releaseByOutcome(s.locks[0], _payouts1(stranger, 10 ether), _leaf(s.leaves, s.pos[0]));
    }

    function test_releaseByOutcomeRevertsOnPayoutSumMismatch() public {
        Settled memory s = _settledAuction();
        vm.expectRevert(abi.encodeWithSelector(LockBox.PayoutSumMismatch.selector, 9 ether, 10 ether));
        lockBox.releaseByOutcome(s.locks[0], _payouts1(bob, 9 ether), _leaf(s.leaves, s.pos[0]));
    }

    function test_releaseByOutcomeRevertsOnSecondRelease() public {
        Settled memory s = _settledAuction();
        lockBox.releaseByOutcome(s.locks[0], s.payouts[0], _leaf(s.leaves, s.pos[0]));
        vm.expectRevert(abi.encodeWithSelector(LockBox.LockNotOpen.selector, _id(s.locks[0]), LockBox.Status.Released));
        lockBox.releaseByOutcome(s.locks[0], s.payouts[0], _leaf(s.leaves, s.pos[0]));
    }

    function test_releaseByOutcomeRevertsOnWrongLockFields() public {
        Settled memory s = _settledAuction();
        LockBox.Lock memory l = s.locks[0];
        l.amount = 11 ether;
        vm.expectRevert(abi.encodeWithSelector(LockBox.LockMismatch.selector, _id(l)));
        lockBox.releaseByOutcome(l, _payouts1(bob, 11 ether), _leaf(s.leaves, s.pos[0]));
    }

    function test_releaseByOutcomeRevertsWithoutOutcome() public {
        LockBox.Lock memory l = _lock(alice, address(fakeETH), 1 ether);
        bytes32 key = lockBox.auctionKey(WINDOW, PAIR, deadline);
        vm.expectRevert(abi.encodeWithSelector(LockBox.NoOutcome.selector, key));
        lockBox.releaseByOutcome(l, _payouts1(alice, 1 ether), OutcomeTree.LeafProof(0, new bytes32[](0)));
    }

    function test_releaseByOutcomeRevertsOnZeroRecipient() public {
        LockBox.Lock memory l = _lock(alice, address(fakeETH), 1 ether);
        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = OutcomeTreeBuilder.leafHash(_id(l), OutcomeTreeBuilder.payoutsHash(_payouts1(address(0), 1 ether)));
        _record(leaves[0], 1);
        vm.expectRevert(LockBox.ZeroRecipient.selector);
        lockBox.releaseByOutcome(l, _payouts1(address(0), 1 ether), _leaf(leaves, 0));
    }

    /// A lock bound to another deadline is another auction: its outcome does not cover it.
    function test_releaseByOutcomeIgnoresOutcomeOfOtherAuction() public {
        LockBox.Lock memory l = _lockInto(alice, address(fakeETH), 1 ether, WINDOW, PAIR, deadline + 1);
        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = OutcomeTreeBuilder.leafHash(_id(l), OutcomeTreeBuilder.payoutsHash(_payouts1(bob, 1 ether)));
        _record(OutcomeTreeBuilder.root(leaves), 1); // recorded for `deadline`, not `deadline + 1`
        bytes32 key = lockBox.auctionKey(WINDOW, PAIR, deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(LockBox.NoOutcome.selector, key));
        lockBox.releaseByOutcome(l, _payouts1(bob, 1 ether), _leaf(leaves, 0));
    }

    // ---------------------------------------------------------------- reclaim

    function test_reclaimRevertsBeforeDeadline() public {
        LockBox.Lock memory l = _lock(alice, address(fakeETH), 10 ether);
        vm.warp(deadline - 1);
        vm.expectRevert(abi.encodeWithSelector(LockBox.DeadlineNotReached.selector, deadline));
        lockBox.reclaim(l, new OutcomeTree.Neighbour[](0));
    }

    function test_reclaimByThirdPartyReturnsFullAmountToDepositor() public {
        LockBox.Lock memory l = _lock(alice, address(fakeETH), 10 ether);
        uint256 before = fakeETH.balanceOf(alice);
        vm.warp(deadline);
        vm.expectEmit(address(lockBox));
        emit LockBox.LockReclaimed(_id(l), alice, 10 ether);
        vm.prank(stranger);
        lockBox.reclaim(l, new OutcomeTree.Neighbour[](0));
        assertEq(fakeETH.balanceOf(alice), before + 10 ether);
        assertEq(fakeETH.balanceOf(stranger), 0);
        assertEq(fakeETH.balanceOf(address(lockBox)), 0);
        assertEq(uint8(lockBox.statuses(_id(l))), uint8(LockBox.Status.Reclaimed));
        assertTrue(lockBox.auctionReclaimed(lockBox.auctionKey(WINDOW, PAIR, deadline)));
    }

    function test_reclaimTwiceReverts() public {
        LockBox.Lock memory l = _lock(alice, address(fakeETH), 10 ether);
        vm.warp(deadline);
        lockBox.reclaim(l, new OutcomeTree.Neighbour[](0));
        vm.expectRevert(abi.encodeWithSelector(LockBox.LockNotOpen.selector, _id(l), LockBox.Status.Reclaimed));
        lockBox.reclaim(l, new OutcomeTree.Neighbour[](0));
    }

    function test_reclaimRevertsOnWrongDepositor() public {
        LockBox.Lock memory l = _lock(alice, address(fakeETH), 10 ether);
        vm.warp(deadline);
        l.depositor = stranger;
        vm.expectRevert(abi.encodeWithSelector(LockBox.LockMismatch.selector, _id(l)));
        lockBox.reclaim(l, new OutcomeTree.Neighbour[](0));
    }

    function test_recordOutcomeRevertsAfterReclaim() public {
        LockBox.Lock memory l = _lock(alice, address(fakeETH), 10 ether);
        vm.warp(deadline);
        lockBox.reclaim(l, new OutcomeTree.Neighbour[](0));
        bytes32 key = lockBox.auctionKey(WINDOW, PAIR, deadline);
        vm.expectRevert(abi.encodeWithSelector(LockBox.AuctionWasReclaimed.selector, key));
        _record(keccak256("root"), 1);
    }

    function test_reclaimOfLockInTreeReverts() public {
        Settled memory s = _settledAuction();
        vm.warp(deadline);
        bytes32 lockId = _id(s.locks[0]);
        vm.expectRevert(abi.encodeWithSelector(LockBox.LockInTree.selector, lockId));
        lockBox.reclaim(s.locks[0], new OutcomeTree.Neighbour[](0));
    }

    /// The lock's own leaf cannot pose as a neighbour: neighbours must sit strictly around it.
    function test_reclaimOfLockInTreeRevertsWithItsOwnLeaf() public {
        Settled memory s = _settledAuction();
        vm.warp(deadline);
        bytes32 lockId = _id(s.locks[1]);
        OutcomeTree.Neighbour[] memory nb = new OutcomeTree.Neighbour[](1);
        nb[0] = OutcomeTree.Neighbour(
            lockId, OutcomeTreeBuilder.payoutsHash(s.payouts[1]), s.pos[1], OutcomeTreeBuilder.proof(s.leaves, s.pos[1])
        );
        vm.expectRevert(abi.encodeWithSelector(LockBox.LockInTree.selector, lockId));
        lockBox.reclaim(s.locks[1], nb);
    }

    /// Locks absent from a recorded tree go home with a non-membership proof, whether their id
    /// falls below the first leaf, between two leaves or above the last leaf.
    function test_reclaimOfLockOutsideTreeWithNonMembershipProof() public {
        LockBox.Lock[] memory inTree = new LockBox.Lock[](3);
        bytes32[] memory ids = new bytes32[](3);
        OutcomeTree.Payout[][] memory payouts = new OutcomeTree.Payout[][](3);
        for (uint256 i = 0; i < 3; i++) {
            inTree[i] = _lock(alice, address(fakeETH), 1 ether);
            ids[i] = _id(inTree[i]);
            payouts[i] = _payouts1(alice, 1 ether);
        }
        // Locks Aptos never saw: enough of them to land below, between and above the leaves.
        LockBox.Lock[] memory outside = new LockBox.Lock[](12);
        for (uint256 i = 0; i < outside.length; i++) {
            outside[i] = _lock(bob, address(fakeUSD), 1e6 + i);
        }
        (bytes32[] memory leaves,, bytes32[] memory sortedIds, bytes32[] memory hashes) = _tree(ids, payouts);
        _record(OutcomeTreeBuilder.root(leaves), 3);
        vm.warp(deadline);

        bool[3] memory seen;
        uint256 bobBefore = fakeUSD.balanceOf(bob);
        uint256 total;
        for (uint256 i = 0; i < outside.length; i++) {
            bytes32 id = _id(outside[i]);
            OutcomeTree.Neighbour[] memory nb;
            if (id < sortedIds[0]) {
                nb = new OutcomeTree.Neighbour[](1);
                nb[0] = _neighbour(leaves, sortedIds, hashes, 0);
                seen[0] = true;
            } else if (id > sortedIds[2]) {
                nb = new OutcomeTree.Neighbour[](1);
                nb[0] = _neighbour(leaves, sortedIds, hashes, 2);
                seen[2] = true;
            } else {
                uint256 r = id < sortedIds[1] ? 1 : 2;
                nb = new OutcomeTree.Neighbour[](2);
                nb[0] = _neighbour(leaves, sortedIds, hashes, r - 1);
                nb[1] = _neighbour(leaves, sortedIds, hashes, r);
                seen[1] = true;
            }
            vm.prank(stranger);
            lockBox.reclaim(outside[i], nb);
            total += outside[i].amount;
            assertEq(uint8(lockBox.statuses(id)), uint8(LockBox.Status.Reclaimed));
        }
        assertTrue(seen[0] && seen[1] && seen[2], "cases not all covered");
        assertEq(fakeUSD.balanceOf(bob), bobBefore + total);
        assertEq(fakeUSD.balanceOf(address(lockBox)), 0);
        // The tree's own locks are untouched and still release by outcome.
        assertEq(fakeETH.balanceOf(address(lockBox)), 3 ether);
    }

    function test_reclaimRevertsOnNonAdjacentNeighbours() public {
        LockBox.Lock[] memory inTree = new LockBox.Lock[](3);
        bytes32[] memory ids = new bytes32[](3);
        OutcomeTree.Payout[][] memory payouts = new OutcomeTree.Payout[][](3);
        for (uint256 i = 0; i < 3; i++) {
            inTree[i] = _lock(alice, address(fakeETH), 1 ether);
            ids[i] = _id(inTree[i]);
            payouts[i] = _payouts1(alice, 1 ether);
        }
        (bytes32[] memory leaves,, bytes32[] memory sortedIds, bytes32[] memory hashes) = _tree(ids, payouts);
        _record(OutcomeTreeBuilder.root(leaves), 3);
        vm.warp(deadline);
        // Claim the middle lock is absent by skipping over it with leaves 0 and 2.
        uint256 mid;
        for (uint256 i = 0; i < 3; i++) {
            if (ids[i] == sortedIds[1]) mid = i;
        }
        OutcomeTree.Neighbour[] memory nb = new OutcomeTree.Neighbour[](2);
        nb[0] = _neighbour(leaves, sortedIds, hashes, 0);
        nb[1] = _neighbour(leaves, sortedIds, hashes, 2);
        vm.expectRevert(abi.encodeWithSelector(LockBox.LockInTree.selector, ids[mid]));
        lockBox.reclaim(inTree[mid], nb);
    }

    function test_reclaimOutsideTreeRevertsWithWrongEdge() public {
        LockBox.Lock memory a = _lock(alice, address(fakeETH), 1 ether);
        LockBox.Lock memory b = _lock(alice, address(fakeETH), 1 ether);
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = _id(a);
        OutcomeTree.Payout[][] memory payouts = new OutcomeTree.Payout[][](1);
        payouts[0] = _payouts1(alice, 1 ether);
        (bytes32[] memory leaves,, bytes32[] memory sortedIds, bytes32[] memory hashes) = _tree(ids, payouts);
        _record(OutcomeTreeBuilder.root(leaves), 1);
        vm.warp(deadline);
        OutcomeTree.Neighbour[] memory nb = new OutcomeTree.Neighbour[](1);
        nb[0] = _neighbour(leaves, sortedIds, hashes, 0);
        nb[0].payoutsHash = keccak256("forged");
        vm.expectRevert(abi.encodeWithSelector(LockBox.LockInTree.selector, _id(b)));
        lockBox.reclaim(b, nb);
        // With the true leaf it goes home.
        nb[0] = _neighbour(leaves, sortedIds, hashes, 0);
        lockBox.reclaim(b, nb);
        assertEq(uint8(lockBox.statuses(_id(b))), uint8(LockBox.Status.Reclaimed));
    }

    /// A reclaim of one auction does not block the outcome of another.
    function test_reclaimOnlyVoidsItsOwnAuction() public {
        LockBox.Lock memory early = _lockInto(alice, address(fakeETH), 1 ether, WINDOW + 1, PAIR, deadline);
        vm.warp(deadline);
        lockBox.reclaim(early, new OutcomeTree.Neighbour[](0));
        bytes32 key = _record(keccak256("root"), 1);
        assertEq(key, lockBox.auctionKey(WINDOW, PAIR, deadline));
    }
}

/**
 * @notice The shared outcome tree fixture (source/atomica-sdk/tests/fixtures/outcome_tree_vectors.json):
 *         OutcomeTree.sol verifies every proof and the test builder gets the same root. The Move
 *         and TypeScript implementations check the same file.
 */
contract OutcomeTreeVectorsTest is Test {
    string internal vectors =
        vm.readFile(string.concat(vm.projectRoot(), "/../atomica-sdk/tests/fixtures/outcome_tree_vectors.json"));

    /// External so the proof reaches OutcomeTree.verify as calldata.
    function verifyLeaf(bytes32 leaf, uint256 index, uint256 count, bytes32[] calldata proof, bytes32 root)
        external
        pure
        returns (bool)
    {
        return OutcomeTree.verify(leaf, index, count, proof, root);
    }

    function payoutsHashOf(OutcomeTree.Payout[] calldata payouts) external pure returns (bytes32) {
        return OutcomeTree.payoutsHash(payouts);
    }

    function test_vectorsMatchSolidity() public view {
        uint256 cases;
        for (uint256 c = 0; vm.keyExistsJson(vectors, _case(c)); c++) {
            string memory base = _case(c);
            bytes32 root = vm.parseJsonBytes32(vectors, string.concat(base, ".root"));
            uint256 n;
            while (vm.keyExistsJson(vectors, _leafPath(base, n))) n++;
            bytes32[] memory leaves = new bytes32[](n);
            for (uint256 i = 0; i < n; i++) {
                string memory lp = _leafPath(base, i);
                bytes32 lockId = vm.parseJsonBytes32(vectors, string.concat(lp, ".lock_id"));
                bytes32 ph = vm.parseJsonBytes32(vectors, string.concat(lp, ".payouts_hash"));
                leaves[i] = OutcomeTree.leafHash(lockId, ph);
                assertEq(leaves[i], vm.parseJsonBytes32(vectors, string.concat(lp, ".leaf")));
                if (i > 0) {
                    assertGt(
                        uint256(lockId),
                        uint256(vm.parseJsonBytes32(vectors, string.concat(_leafPath(base, i - 1), ".lock_id")))
                    );
                }
                bytes32[] memory proof = vm.parseJsonBytes32Array(vectors, string.concat(lp, ".proof"));
                assertTrue(this.verifyLeaf(leaves[i], i, n, proof, root), "fixture proof rejected");
            }
            assertEq(OutcomeTreeBuilder.root(leaves), root);
            for (uint256 i = 0; i < n; i++) {
                bytes32[] memory proof = vm.parseJsonBytes32Array(vectors, string.concat(_leafPath(base, i), ".proof"));
                assertEq(keccak256(abi.encode(proof)), keccak256(abi.encode(OutcomeTreeBuilder.proof(leaves, i))));
            }
            _checkPayoutHashes(base, n);
            cases++;
        }
        assertEq(cases, 4);
    }

    /// Every entry's payouts hash, computed by OutcomeTree.payoutsHash, appears among the leaves.
    function _checkPayoutHashes(string memory base, uint256 n) internal view {
        for (uint256 i = 0; i < n; i++) {
            string memory ep = string.concat(base, ".entries[", vm.toString(i), "]");
            bytes32 lockId = vm.parseJsonBytes32(vectors, string.concat(ep, ".lock_id"));
            uint256 m;
            while (vm.keyExistsJson(vectors, string.concat(ep, ".payouts[", vm.toString(m), "]"))) m++;
            OutcomeTree.Payout[] memory payouts = new OutcomeTree.Payout[](m);
            for (uint256 j = 0; j < m; j++) {
                string memory pp = string.concat(ep, ".payouts[", vm.toString(j), "]");
                payouts[j] = OutcomeTree.Payout(
                    vm.parseJsonAddress(vectors, string.concat(pp, ".recipient")),
                    vm.parseUint(vm.parseJsonString(vectors, string.concat(pp, ".amount")))
                );
            }
            bytes32 ph = this.payoutsHashOf(payouts);
            bool found;
            for (uint256 k = 0; k < n; k++) {
                string memory lp = _leafPath(base, k);
                if (vm.parseJsonBytes32(vectors, string.concat(lp, ".lock_id")) == lockId) {
                    assertEq(ph, vm.parseJsonBytes32(vectors, string.concat(lp, ".payouts_hash")));
                    found = true;
                }
            }
            assertTrue(found, "entry missing from leaves");
        }
    }

    function _case(uint256 c) internal pure returns (string memory) {
        return string.concat(".cases[", vm.toString(c), "]");
    }

    function _leafPath(string memory base, uint256 i) internal pure returns (string memory) {
        return string.concat(base, ".leaves[", vm.toString(i), "]");
    }
}
