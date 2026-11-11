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

/**
 * @notice Drives random lock, recordOutcome, releaseByOutcome and reclaim sequences. Every call it
 *         makes is valid by construction, so a revert is a bug (fail-on-revert). It tracks the
 *         open amount per token and every status change.
 */
contract LockBoxHandler is Test {
    LockBox public lockBox;
    FakeETH public fakeETH;
    FakeUSD public fakeUSD;

    address[3] internal actors = [address(0xA11CE), address(0xB0B), address(0xCA401)];
    uint64[2] internal windows = [uint64(10), uint64(11)];
    bytes32 internal constant PAIR = keccak256("pair");
    uint64 public deadline;

    LockBox.Lock[] internal locks;
    /// Open amount per token, as the handler sees it.
    mapping(address => uint256) public openAmount;
    /// Number of times each lock left Open.
    mapping(bytes32 => uint256) public exits;

    // Recorded tree per window: lock indexes, their leaves and payouts.
    mapping(uint256 => uint256[]) internal treeLocks;
    mapping(uint256 => bytes32[]) internal treeLeaves;
    mapping(uint256 => bytes32[]) internal treeIds;
    mapping(uint256 => bytes32[]) internal treeHashes;
    mapping(uint256 => mapping(uint256 => OutcomeTree.Payout[])) internal payoutsOf;
    mapping(uint256 => mapping(uint256 => uint256)) internal posOf; // window => lock index => tree index + 1
    mapping(uint256 => bool) public recorded;

    uint256 public calls;

    constructor(LockBox _lockBox, FakeETH _fakeETH, FakeUSD _fakeUSD, uint64 _deadline) {
        lockBox = _lockBox;
        fakeETH = _fakeETH;
        fakeUSD = _fakeUSD;
        deadline = _deadline;
    }

    function lockCount() external view returns (uint256) {
        return locks.length;
    }

    function lockAt(uint256 i) external view returns (LockBox.Lock memory) {
        return locks[i];
    }

    function lock(uint256 actorSeed, uint256 tokenSeed, uint256 amount, uint256 windowSeed) external {
        if (block.timestamp >= deadline || locks.length >= 40) return;
        address who = actors[actorSeed % 3];
        address token = tokenSeed % 2 == 0 ? address(fakeETH) : address(fakeUSD);
        amount = bound(amount, 1, token == address(fakeETH) ? 50 ether : 500e6);
        uint64 windowId = windows[windowSeed % 2];
        uint256 nonce = lockBox.nextLockNonce();
        vm.prank(who);
        lockBox.lock(token, amount, windowId, PAIR, deadline);
        locks.push(LockBox.Lock(who, token, nonce, amount, windowId, PAIR, deadline));
        openAmount[token] += amount;
        calls++;
    }

    /// Records an outcome over every open lock of a window. Each lock pays part to another actor
    /// and the rest to its depositor.
    function recordOutcome(uint256 windowSeed, uint256 splitSeed) external {
        uint256 w = windowSeed % 2;
        if (recorded[w] || lockBox.auctionReclaimed(_key(w))) return;
        uint256[] memory members = new uint256[](locks.length);
        uint256 n;
        for (uint256 i = 0; i < locks.length; i++) {
            if (locks[i].windowId == windows[w] && lockBox.statuses(_id(i)) == LockBox.Status.Open) {
                members[n++] = i;
            }
        }
        if (n == 0) return;
        bytes32[] memory ids = new bytes32[](n);
        for (uint256 k = 0; k < n; k++) {
            uint256 i = members[k];
            ids[k] = _id(i);
            uint256 part = uint256(keccak256(abi.encode(splitSeed, i))) % (locks[i].amount + 1);
            address other = actors[(uint256(keccak256(abi.encode(splitSeed, i, "to"))) % 3)];
            payoutsOf[w][i].push(OutcomeTree.Payout(other, part));
            payoutsOf[w][i].push(OutcomeTree.Payout(locks[i].depositor, locks[i].amount - part));
        }
        uint256[] memory order = OutcomeTreeBuilder.sortedOrder(ids);
        bytes32[] memory leaves = new bytes32[](n);
        for (uint256 k = 0; k < n; k++) {
            uint256 i = members[order[k]];
            bytes32 ph = OutcomeTreeBuilder.payoutsHash(payoutsOf[w][i]);
            leaves[k] = OutcomeTreeBuilder.leafHash(ids[order[k]], ph);
            treeLocks[w].push(i);
            treeIds[w].push(ids[order[k]]);
            treeHashes[w].push(ph);
            treeLeaves[w].push(leaves[k]);
            posOf[w][i] = k + 1;
        }
        IAptosLightClient.EventProof memory p;
        p.contractEvent =
            OutcomeTreeBuilder.outcomeBcs(windows[w], PAIR, deadline, OutcomeTreeBuilder.root(leaves), uint64(n));
        lockBox.recordOutcome(p);
        recorded[w] = true;
        calls++;
    }

    function releaseByOutcome(uint256 lockSeed) external {
        if (locks.length == 0) return;
        uint256 i = lockSeed % locks.length;
        uint256 w = locks[i].windowId == windows[0] ? 0 : 1;
        uint256 pos = posOf[w][i];
        if (pos == 0 || lockBox.statuses(_id(i)) != LockBox.Status.Open) return;
        bytes32[] memory leaves = treeLeaves[w];
        lockBox.releaseByOutcome(
            locks[i], payoutsOf[w][i], OutcomeTree.LeafProof(pos - 1, OutcomeTreeBuilder.proof(leaves, pos - 1))
        );
        _exit(i);
    }

    function reclaim(uint256 lockSeed) external {
        if (locks.length == 0) return;
        uint256 i = lockSeed % locks.length;
        uint256 w = locks[i].windowId == windows[0] ? 0 : 1;
        if (posOf[w][i] != 0 || lockBox.statuses(_id(i)) != LockBox.Status.Open) return;
        if (block.timestamp < deadline) vm.warp(deadline);
        OutcomeTree.Neighbour[] memory nb;
        if (recorded[w]) nb = _absence(w, _id(i));
        lockBox.reclaim(locks[i], nb);
        _exit(i);
    }

    function _absence(uint256 w, bytes32 id) internal view returns (OutcomeTree.Neighbour[] memory nb) {
        bytes32[] memory ids = treeIds[w];
        uint256 r;
        while (r < ids.length && ids[r] < id) r++;
        if (r == 0 || r == ids.length) {
            nb = new OutcomeTree.Neighbour[](1);
            nb[0] = _neighbour(w, r == 0 ? 0 : ids.length - 1);
        } else {
            nb = new OutcomeTree.Neighbour[](2);
            nb[0] = _neighbour(w, r - 1);
            nb[1] = _neighbour(w, r);
        }
    }

    function _neighbour(uint256 w, uint256 k) internal view returns (OutcomeTree.Neighbour memory) {
        return OutcomeTree.Neighbour(treeIds[w][k], treeHashes[w][k], k, OutcomeTreeBuilder.proof(treeLeaves[w], k));
    }

    uint256 public releases;
    uint256 public reclaims;

    function _exit(uint256 i) internal {
        if (lockBox.statuses(_id(i)) == LockBox.Status.Released) releases++;
        else reclaims++;
        bytes32 id = _id(i);
        exits[id]++;
        openAmount[locks[i].token] -= locks[i].amount;
        calls++;
    }

    function _id(uint256 i) internal view returns (bytes32) {
        return lockBox.getLockId(locks[i].depositor, locks[i].token, locks[i].nonce);
    }

    function _key(uint256 w) internal view returns (bytes32) {
        return lockBox.auctionKey(windows[w], PAIR, deadline);
    }
}

/// forge-config: default.invariant.fail-on-revert = true
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 60
contract LockBoxInvariantTest is Test {
    bytes internal constant TYPE_TAG = hex"07cafe";

    LockBox internal lockBox;
    FakeETH internal fakeETH;
    FakeUSD internal fakeUSD;
    LockBoxHandler internal handler;

    function setUp() public {
        vm.warp(1_700_000_000);
        fakeETH = new FakeETH();
        fakeUSD = new FakeUSD();
        lockBox = new LockBox(address(fakeETH), address(fakeUSD), new MockAptosLightClient(TYPE_TAG), TYPE_TAG);
        handler = new LockBoxHandler(lockBox, fakeETH, fakeUSD, uint64(block.timestamp + 3 days));
        address[3] memory actors = [address(0xA11CE), address(0xB0B), address(0xCA401)];
        for (uint256 i = 0; i < 3; i++) {
            for (uint256 m = 0; m < 10; m++) {
                fakeETH.mint(actors[i], 10_000 ether);
            }
            for (uint256 m = 0; m < 3; m++) {
                fakeUSD.mint(actors[i], 10_000e6);
            }
            vm.startPrank(actors[i]);
            fakeETH.approve(address(lockBox), type(uint256).max);
            fakeUSD.approve(address(lockBox), type(uint256).max);
            vm.stopPrank();
        }
        targetContract(address(handler));
    }

    /// Guards against a vacuous run: once locks exist, the sequence ends some of them.
    function afterInvariant() public view {
        if (handler.lockCount() > 5) assertGt(handler.releases() + handler.reclaims(), 0);
    }

    /// The LockBox token balance equals the sum of open lock amounts.
    function invariant_balanceEqualsOpenLocks() public view {
        assertEq(fakeETH.balanceOf(address(lockBox)), handler.openAmount(address(fakeETH)));
        assertEq(fakeUSD.balanceOf(address(lockBox)), handler.openAmount(address(fakeUSD)));
        uint256 ethOpen;
        uint256 usdOpen;
        for (uint256 i = 0; i < handler.lockCount(); i++) {
            LockBox.Lock memory l = handler.lockAt(i);
            if (lockBox.statuses(lockBox.getLockId(l.depositor, l.token, l.nonce)) == LockBox.Status.Open) {
                if (l.token == address(fakeETH)) ethOpen += l.amount;
                else usdOpen += l.amount;
            }
        }
        assertEq(fakeETH.balanceOf(address(lockBox)), ethOpen);
        assertEq(fakeUSD.balanceOf(address(lockBox)), usdOpen);
    }

    /// A lock leaves Open once, and a lock that left Open stays out.
    function invariant_lockLeavesOpenOnce() public view {
        for (uint256 i = 0; i < handler.lockCount(); i++) {
            LockBox.Lock memory l = handler.lockAt(i);
            bytes32 id = lockBox.getLockId(l.depositor, l.token, l.nonce);
            uint256 exits = handler.exits(id);
            assertLe(exits, 1);
            assertEq(lockBox.statuses(id) == LockBox.Status.Open, exits == 0);
        }
    }

    /// Value is conserved: tokens held by actors plus LockBox never change.
    function invariant_supplyConserved() public view {
        uint256 eth = fakeETH.balanceOf(address(lockBox));
        uint256 usd = fakeUSD.balanceOf(address(lockBox));
        address[3] memory actors = [address(0xA11CE), address(0xB0B), address(0xCA401)];
        for (uint256 i = 0; i < 3; i++) {
            eth += fakeETH.balanceOf(actors[i]);
            usd += fakeUSD.balanceOf(actors[i]);
        }
        assertEq(eth, 3 * 10 * 10_000 ether);
        assertEq(usd, 3 * 3 * 10_000e6);
    }
}
