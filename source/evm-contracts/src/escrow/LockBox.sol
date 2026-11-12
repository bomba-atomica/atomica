// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAptosLightClient} from "../aptos/IAptosLightClient.sol";
import {OutcomeTree} from "./OutcomeTree.sol";

// SCOUT(#221) DOC: "Auction binding" in the comment below becomes `auctionKey(windowId, pairHash)`, and LockBox computes the deadline itself.
// SCOUT(#222) DOC: "Every lock ends in one of two ways" below gains `reclaimUnpayable`, and a leaf means "these payouts, the remainder to the depositor".
// SCOUT(#222) DOC: "All or nothing" below no longer holds for a short or unpayable leaf: that lock goes home while other locks of the auction still release.
// SCOUT(#242) DOC: "no admin, relayer, owner or upgrade key" below cites the decision record; say here too that a recorded outcome trusts the Aptos package upgrade key, if the owner names it (decision 30).
/**
 * @title LockBox
 * @notice Escrow for FakeETH and FakeUSD locked into Atomica auctions.
 * @dev Every lock ends in one of two ways, and anyone can trigger either:
 *      - `releaseByOutcome`: the Aptos `AuctionOutcome` of the lock's auction, proven through the
 *        Aptos light client and stored by `recordOutcome`, pays the lock out per its leaf.
 *      - `reclaim`: after the lock's deadline the whole amount goes back to its depositor, unless
 *        the auction's recorded outcome covers the lock.
 *      There is no admin, relayer, owner or upgrade key (docs/decisions/trustless-v0-1-unwinding.md).
 *
 *      Auction binding. A lock names its auction: `auctionKey(windowId, pairHash, deadline)`.
 *      Aptos accepts only `deadline == auction::eth_lock_deadline(windowId)`, so every registered
 *      lock of an auction shares one deadline.
 *
 *      All or nothing. If any lock of an auction is reclaimed before that auction has a recorded
 *      outcome, `auctionReclaimed` is set and no outcome can be recorded for it afterwards. So an
 *      auction settles on Ethereum fully or not at all.
 *
 *      Outcome tree. `OutcomeTree` (mirrored by `atomica::outcome_tree` and the SDK's
 *      settlement/outcome-tree.ts) commits to one leaf per lock, sorted by lock id. A lock outside
 *      the tree goes home after the deadline with a non-membership proof (its neighbours).
 *
 *      Storage layout. Aptos proves slot 0 (`commitments`) with eth_getProof, so it must stay
 *      first. Single-level mapping, see docs/technical/ethereum-state-proof-quirks.md.
 *      - Slot 0: commitments      mapping(bytes32 lockId => bytes32 commitment)
 *      - Slot 1: statuses         mapping(bytes32 lockId => Status)
 *      - Slot 2: outcomes         mapping(bytes32 auctionKey => Outcome)
 *      - Slot 3: auctionReclaimed mapping(bytes32 auctionKey => bool)
 *      - Slot 4: nextLockNonce    uint256
 *      - Slot 5: outcomeTypeTag   bytes
 */
contract LockBox {
    using SafeERC20 for IERC20;

    // ==================== Types ====================

    enum Status {
        None,
        Open,
        Released,
        Reclaimed
    }

    /// @notice The fields a lock commits to. `nonce` names the lock.
    struct Lock {
        address depositor;
        address token;
        uint256 nonce;
        uint256 amount;
        uint64 windowId;
        bytes32 pairHash;
        // SCOUT(#221) EDIT: the field stays, because the commitment binds it, but its only valid value becomes `lockDeadline(windowId)`.
        uint64 deadline;
    }

    /// @notice A recorded `AuctionOutcome`: its dispositions root and leaf count.
    struct Outcome {
        bytes32 root;
        uint64 leafCount;
    }

    // ==================== State ====================

    /// @notice Slot 0. lockId => keccak256(abi.encode(depositor, token, amount, windowId, pairHash, deadline)).
    mapping(bytes32 => bytes32) public commitments;

    /// @notice Slot 1. A lock leaves `Open` once.
    mapping(bytes32 => Status) public statuses;

    /// @notice Slot 2. auctionKey => recorded outcome (root zero means none).
    mapping(bytes32 => Outcome) public outcomes;

    /// @notice Slot 3. auctionKey => a lock was reclaimed before any outcome was recorded.
    mapping(bytes32 => bool) public auctionReclaimed;

    /// @notice Slot 4. Nonce the next `lock` takes.
    uint256 public nextLockNonce;

    /// @notice Slot 5. BCS `TypeTag` of `<atomica>::auction::AuctionOutcome`.
    bytes public outcomeTypeTag;

    IERC20 public immutable fakeETH;
    IERC20 public immutable fakeUSD;
    IAptosLightClient public immutable lightClient;

    /// @notice BCS length of an AuctionOutcome: u64, vector<u8>(32), u64, vector<u8>(32), u64.
    uint256 private constant OUTCOME_BCS_LEN = 8 + 1 + 32 + 8 + 1 + 32 + 8;

    // SCOUT(#221) ADD: the window clock this contract freezes at deploy; it must equal `eth_proof.move` and the SDK `lock-binding.ts`; the three constants become public.
    uint64 internal constant WINDOW_DAY_SECS = 86_400;
    uint64 internal constant MORNING_CLOSE_SECS = 27_900;
    uint64 internal constant AFTERNOON_CLOSE_SECS = 58_500;

    // SCOUT(#221) ADD: seconds from a window's close to its reclaim deadline, equal to `eth_proof::ETH_RECLAIM_DELAY_SECS`; the value waits for owner decision 36; becomes public.
    uint64 internal constant RECLAIM_DELAY = 259_200;

    // ==================== Events ====================

    event Locked(
        bytes32 indexed lockId,
        address indexed depositor,
        address indexed token,
        uint256 nonce,
        uint256 amount,
        uint64 windowId,
        bytes32 pairHash,
        uint64 deadline
    );

    // SCOUT(#221) EDIT: `deadline` is no longer part of the key; emit `lockDeadline(windowId)` here or drop the field (dropping it changes topic0 and the SDK ABI).
    event OutcomeRecorded(
        bytes32 indexed auctionKey,
        uint64 windowId,
        bytes32 pairHash,
        uint64 deadline,
        bytes32 root,
        uint64 leafCount,
        uint64 aptosVersion
    );

    // SCOUT(#222) EDIT: a release may now also send a remainder to the depositor; decide whether this event carries that amount.
    event LockReleased(bytes32 indexed lockId, bytes32 indexed auctionKey);

    event LockReclaimed(bytes32 indexed lockId, address indexed depositor, uint256 amount);

    // SCOUT(#222) ADD: emitted by `reclaimUnpayable`; or reuse `LockReclaimed` and delete this.
    event LockReclaimedUnpayable(
        bytes32 indexed lockId, bytes32 indexed auctionKey, address indexed depositor, uint256 amount
    );

    // ==================== Errors ====================

    error UnsupportedToken(address token);
    error ZeroAmount();
    // SCOUT(#221) REMOVE: no caller-supplied deadline is left to check.
    error DeadlinePassed(uint64 deadline);
    error LockMismatch(bytes32 lockId);
    error LockNotOpen(bytes32 lockId, Status status);
    error OutcomeAlreadyRecorded(bytes32 auctionKey);
    error AuctionWasReclaimed(bytes32 auctionKey);
    error BadOutcomeEvent();
    error NoOutcome(bytes32 auctionKey);
    error InvalidProof();
    // SCOUT(#222) EDIT: raised only when the payouts sum above the lock amount or overflow; a short sum is paid.
    error PayoutSumMismatch(uint256 sum, uint256 amount);
    error ZeroRecipient();
    error DeadlineNotReached(uint64 deadline);
    error LockInTree(bytes32 lockId);

    // SCOUT(#221) REMOVE: scout scaffolding; delete it with the last stub of this contract.
    // SCOUT(#222) REMOVE: scout scaffolding; delete it with the last stub of this contract.
    error NotImplemented();
    // SCOUT(#221) ADD: `lock` names a window below `currentWindowId()`.
    error WindowClosed(uint64 windowId, uint64 current);
    // SCOUT(#221) ADD: `lock` names a window above `currentWindowId() + 1`.
    error WindowTooFarAhead(uint64 windowId, uint64 current);
    // SCOUT(#222) ADD: `reclaimUnpayable` was called for a leaf that `releaseByOutcome` can pay.
    error LeafPayable(bytes32 lockId);

    // ==================== Constructor ====================

    /**
     * @param _fakeETH FakeETH token
     * @param _fakeUSD FakeUSD token
     * @param _lightClient Aptos light client that proves AuctionOutcome events
     * @param _outcomeTypeTag BCS TypeTag of `<atomica>::auction::AuctionOutcome`
     */
    constructor(address _fakeETH, address _fakeUSD, IAptosLightClient _lightClient, bytes memory _outcomeTypeTag) {
        require(_fakeETH != address(0), "Invalid FakeETH address");
        require(_fakeUSD != address(0), "Invalid FakeUSD address");
        require(address(_lightClient) != address(0), "Invalid light client");
        require(_outcomeTypeTag.length > 0, "Invalid type tag");
        fakeETH = IERC20(_fakeETH);
        fakeUSD = IERC20(_fakeUSD);
        lightClient = _lightClient;
        outcomeTypeTag = _outcomeTypeTag;
    }

    // ==================== Pure helpers ====================

    /// @notice Id of one lock, also its Aptos receipt id. Mirrored by `eth_proof::lock_id`.
    function getLockId(address depositor, address token, uint256 nonce) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(depositor, token, nonce));
    }

    // SCOUT(#221) EDIT: becomes `auctionKey(uint64 windowId, bytes32 pairHash)` = keccak256(abi.encode(windowId, pairHash)); `eth_proof::auction_key` and the SDK `auctionKey` change with it.
    /// @notice The auction a lock is bound to. Mirrored by `auction::auction_key`.
    function auctionKey(uint64 windowId, bytes32 pairHash, uint64 deadline) public pure returns (bytes32) {
        return keccak256(abi.encode(windowId, pairHash, deadline));
    }

    // SCOUT(#221) ADD: `currentWindowId()`, the window id at `block.timestamp` (mirror of `auction::current_window_id`); becomes `public view`, not virtual.
    function currentWindowId() internal view virtual returns (uint64) {
        revert NotImplemented();
    }

    // SCOUT(#221) ADD: `windowClose(uint64 windowId)`, the first second of window `windowId + 1` (mirror of `eth_proof::window_close_secs`); becomes `public pure`.
    function windowClose(uint64) internal pure returns (uint64) {
        revert NotImplemented();
    }

    // SCOUT(#221) ADD: `lockDeadline(uint64 windowId)` = `windowClose(windowId) + RECLAIM_DELAY` (mirror of `eth_proof::eth_lock_deadline`); becomes `public pure`.
    function lockDeadline(uint64) internal pure returns (uint64) {
        revert NotImplemented();
    }

    /// @notice The value stored at slot 0 for a lock. Mirrored by `eth_proof::lock_commitment`.
    function lockCommitment(
        address depositor,
        address token,
        uint256 amount,
        uint64 windowId,
        bytes32 pairHash,
        uint64 deadline
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(depositor, token, amount, windowId, pairHash, deadline));
    }

    /// @notice Storage key of `commitments[lockId]`, the slot Aptos proves: keccak256(abi.encode(lockId, 0)).
    function commitmentStorageKey(bytes32 lockId) external pure returns (bytes32) {
        return keccak256(abi.encode(lockId, uint256(0)));
    }

    // ==================== Lock ====================

    // SCOUT(#221) EDIT: becomes `lock(address token, uint256 amount, uint64 windowId, bytes32 pairHash)`; the commitment and `Locked` carry `lockDeadline(windowId)`.
    /**
     * @notice Lock `amount` of `token` into the auction (windowId, pairHash, deadline).
     * @dev The token must be approved first. Aptos registers the lock only when `deadline` equals
     *      `auction::eth_lock_deadline(windowId)`. A lock Aptos never registers still goes home
     *      by `reclaim` after `deadline`.
     * @return lockId The lock's id (its Aptos receipt id)
     */
    function lock(address token, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 deadline)
        external
        returns (bytes32 lockId)
    {
        if (token != address(fakeETH) && token != address(fakeUSD)) revert UnsupportedToken(token);
        if (amount == 0) revert ZeroAmount();
        // SCOUT(#221) EDIT: replace this check with the window bounds: revert `WindowClosed` below `currentWindowId()` and `WindowTooFarAhead` above `currentWindowId() + 1`.
        if (deadline <= block.timestamp) revert DeadlinePassed(deadline);

        uint256 nonce = nextLockNonce++;
        lockId = getLockId(msg.sender, token, nonce);
        commitments[lockId] = lockCommitment(msg.sender, token, amount, windowId, pairHash, deadline);
        statuses[lockId] = Status.Open;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Locked(lockId, msg.sender, token, nonce, amount, windowId, pairHash, deadline);
    }

    // ==================== Outcome ====================

    /**
     * @notice Record an auction's `AuctionOutcome`, proven final on Aptos. Permissionless.
     * @dev Reverts if the auction already has an outcome, or if a lock of it was reclaimed first.
     *      Light client errors (for example `StaleEpoch`) bubble up unchanged.
     */
    function recordOutcome(IAptosLightClient.EventProof calldata proof) external returns (bytes32 key) {
        (uint64 version, bytes memory data) = lightClient.verifyEvent(proof, outcomeTypeTag);
        (uint64 windowId, bytes32 pairHash, uint64 deadline, bytes32 root, uint64 leafCount) = _decodeOutcome(data);
        if (root == bytes32(0) || leafCount == 0) revert BadOutcomeEvent();

        // SCOUT(#221) EDIT: the key becomes `auctionKey(windowId, pairHash)`; the event's `eth_lock_deadline` is decoded and ignored (the golden vector pairs window 42 with a deadline no formula gives).
        key = auctionKey(windowId, pairHash, deadline);
        if (outcomes[key].root != bytes32(0)) revert OutcomeAlreadyRecorded(key);
        if (auctionReclaimed[key]) revert AuctionWasReclaimed(key);

        outcomes[key] = Outcome(root, leafCount);
        emit OutcomeRecorded(key, windowId, pairHash, deadline, root, leafCount, version);
    }

    // SCOUT(#222) EDIT: the `payouts` text below changes: the list may sum to less than the lock amount, and the remainder goes to the depositor.
    /**
     * @notice Pay a lock out per its leaf in the recorded outcome of its auction. Permissionless.
     * @param l The lock's fields (checked against its commitment)
     * @param payouts The leaf's (recipient, amount) list; it must sum to the lock amount
     * @param leaf The leaf's index and Merkle proof
     */
    function releaseByOutcome(
        Lock calldata l,
        OutcomeTree.Payout[] calldata payouts,
        OutcomeTree.LeafProof calldata leaf
    ) external {
        bytes32 lockId = _openLock(l);
        // SCOUT(#221) EDIT: the key becomes `auctionKey(l.windowId, l.pairHash)`.
        bytes32 key = auctionKey(l.windowId, l.pairHash, l.deadline);
        Outcome memory o = outcomes[key];
        if (o.root == bytes32(0)) revert NoOutcome(key);

        // SCOUT(#222) EDIT: replace this loop and the sum check with the shared unpayable test (`_leafUnpayable`): revert on a zero recipient, a sum above `l.amount` or an overflow, and accept a short sum.
        uint256 sum;
        for (uint256 i = 0; i < payouts.length; i++) {
            if (payouts[i].recipient == address(0)) revert ZeroRecipient();
            sum += payouts[i].amount;
        }
        if (sum != l.amount) revert PayoutSumMismatch(sum, l.amount);
        bytes32 leafHash = OutcomeTree.leafHash(lockId, OutcomeTree.payoutsHash(payouts));
        if (!OutcomeTree.verify(leafHash, leaf.index, o.leafCount, leaf.proof, o.root)) revert InvalidProof();

        statuses[lockId] = Status.Released;
        emit LockReleased(lockId, key);
        for (uint256 i = 0; i < payouts.length; i++) {
            if (payouts[i].amount > 0) IERC20(l.token).safeTransfer(payouts[i].recipient, payouts[i].amount);
        }
        // SCOUT(#222) ADD: after the payouts, send `l.amount - sum` to `l.depositor` when the sum is below the lock amount.
    }

    // ==================== Reclaim ====================

    /**
     * @notice Return a lock to its depositor after its deadline. Permissionless.
     * @param l The lock's fields (checked against its commitment)
     * @param neighbours Empty when the auction has no recorded outcome. Otherwise a proof that the
     *        lock id is not in the sorted tree: two adjacent leaves around it, or the first leaf
     *        (lock id below it) or the last leaf (lock id above it).
     * @dev Before any outcome, a reclaim marks the auction reclaimed, so no outcome can be
     *      recorded for it afterwards.
     */
    function reclaim(Lock calldata l, OutcomeTree.Neighbour[] calldata neighbours) external {
        bytes32 lockId = _openLock(l);
        if (block.timestamp < l.deadline) revert DeadlineNotReached(l.deadline);

        // SCOUT(#221) EDIT: the key becomes `auctionKey(l.windowId, l.pairHash)`.
        bytes32 key = auctionKey(l.windowId, l.pairHash, l.deadline);
        Outcome memory o = outcomes[key];
        if (o.root == bytes32(0)) {
            auctionReclaimed[key] = true;
        } else if (!OutcomeTree.verifyAbsent(lockId, neighbours, o.leafCount, o.root)) {
            revert LockInTree(lockId);
        }

        statuses[lockId] = Status.Reclaimed;
        emit LockReclaimed(lockId, l.depositor, l.amount);
        IERC20(l.token).safeTransfer(l.depositor, l.amount);
    }

    // SCOUT(#222) ADD: `reclaimUnpayable(Lock calldata l, OutcomeTree.Payout[] calldata payouts, OutcomeTree.LeafProof calldata leaf)`; becomes `external`, not virtual; proves the leaf against the recorded outcome, requires it to be unpayable, and returns the whole lock to its depositor with no deadline wait.
    function reclaimUnpayable(Lock calldata, OutcomeTree.Payout[] calldata, OutcomeTree.LeafProof calldata)
        internal
        virtual
    {
        revert NotImplemented();
    }

    // ==================== Internal ====================

    /// @dev The lock's id, after checking its fields against the commitment and its open status.
    function _openLock(Lock calldata l) private view returns (bytes32 lockId) {
        lockId = getLockId(l.depositor, l.token, l.nonce);
        bytes32 c = lockCommitment(l.depositor, l.token, l.amount, l.windowId, l.pairHash, l.deadline);
        if (commitments[lockId] != c) revert LockMismatch(lockId);
        Status s = statuses[lockId];
        if (s != Status.Open) revert LockNotOpen(lockId, s);
    }

    // SCOUT(#222) ADD: `_leafUnpayable(uint256 amount, OutcomeTree.Payout[] calldata payouts)` returns (unpayable, sum); unpayable means a zero recipient, a sum above `amount`, or a sum that overflows; it must not revert on overflow.
    function _leafUnpayable(uint256, OutcomeTree.Payout[] calldata) internal pure returns (bool, uint256) {
        revert NotImplemented();
    }

    // SCOUT(#221) EDIT: the BCS layout stays, because the fork golden vectors pin it; `deadline` at offset 41 is still decoded but no longer enters the auction key.
    /// @dev BCS of `AuctionOutcome { window_id: u64, pair_hash: vector<u8>, eth_lock_deadline: u64,
    ///      dispositions_root: vector<u8>, leaf_count: u64 }` with 32-byte vectors.
    function _decodeOutcome(bytes memory d)
        private
        pure
        returns (uint64 windowId, bytes32 pairHash, uint64 deadline, bytes32 root, uint64 leafCount)
    {
        if (d.length != OUTCOME_BCS_LEN || uint8(d[8]) != 32 || uint8(d[49]) != 32) revert BadOutcomeEvent();
        windowId = _le64(d, 0);
        pairHash = _word(d, 9);
        deadline = _le64(d, 41);
        root = _word(d, 50);
        leafCount = _le64(d, 82);
    }

    function _le64(bytes memory d, uint256 off) private pure returns (uint64 v) {
        for (uint256 i = 0; i < 8; i++) {
            v |= uint64(uint8(d[off + i])) << uint64(8 * i);
        }
    }

    function _word(bytes memory d, uint256 off) private pure returns (bytes32 w) {
        assembly {
            w := mload(add(add(d, 0x20), off))
        }
    }
}
