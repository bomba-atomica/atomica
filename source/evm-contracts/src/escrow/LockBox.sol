// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAptosLightClient} from "../aptos/IAptosLightClient.sol";
import {OutcomeTree} from "./OutcomeTree.sol";

// SCOUT(#242) DOC: "no admin, relayer, owner or upgrade key" below cites the decision record; say here too that a recorded outcome trusts the Aptos package upgrade key, if the owner names it (decision 30).
/**
 * @title LockBox
 * @notice Escrow for FakeETH and FakeUSD locked into Atomica auctions.
 * @dev Every lock ends in one of three ways, and anyone can trigger each:
 *      - `releaseByOutcome`: the Aptos `AuctionOutcome` of the lock's auction, proven through the
 *        Aptos light client and stored by `recordOutcome`, pays the lock out per its leaf.
 *      - `reclaim`: after the lock's deadline the whole amount goes back to its depositor, unless
 *        the auction's recorded outcome covers the lock.
 *      - `reclaimUnpayable`: the recorded outcome covers the lock with a leaf LockBox cannot pay,
 *        so the whole amount goes back to its depositor at once.
 *      A lock that cannot be paid as recorded goes home.
 *      There is no admin, relayer, owner or upgrade key (docs/decisions/trustless-v0-1-unwinding.md).
 *
 *      Auction binding. A lock names its auction: `auctionKey(windowId, pairHash)`. LockBox computes
 *      the lock's deadline itself, `lockDeadline(windowId)`, from the window clock frozen at deploy
 *      (equal to `eth_proof::eth_lock_deadline`). No caller supplies a deadline, so every lock of an
 *      auction shares one deadline, and no lock can be stranded behind a far-future one.
 *
 *      No outcome after a reclaim. If any lock of an auction is reclaimed before that auction has a
 *      recorded outcome, `auctionReclaimed` is set and no outcome can be recorded for it
 *      afterwards. Once an outcome is recorded, each lock in it closes on its own: a lock whose
 *      leaf is unpayable goes home by `reclaimUnpayable` while the other locks still release.
 *
 *      Leaf rule. A leaf means: these payouts, and the remainder to the depositor. Payouts that sum
 *      below the lock amount send `amount - sum` to the depositor; an empty list returns the whole
 *      lock. A leaf is unpayable when its payouts sum above the lock amount, when the sum
 *      overflows, or when a recipient is the zero address. The leaf hash binds the payout list,
 *      so nobody can shorten a certified leaf to steer a remainder.
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
        /// Always `lockDeadline(windowId)`; kept because the commitment binds it.
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

    /// @notice Seconds from a window's close to the deadline of its locks (72 hours). Equals
    ///         `eth_proof::ETH_RECLAIM_DELAY_SECS` and the SDK `ETH_RECLAIM_DELAY_SECS`.
    uint64 public constant RECLAIM_DELAY = 259_200;

    // Window clock, frozen at deploy (docs/specifications/auction-timing.md). Each day of
    // `windowDaySecs` seconds holds `windowCount` windows (one or two); window `w` closes at
    // `(w / windowCount) * windowDaySecs + closeOffset[w % windowCount]`. Mirrors
    // `eth_proof::window_close_secs` and `eth_proof::window_id_at`. Immutables cannot hold an
    // array, so the offsets are two scalars (`closeOffset1` is unused with one window a day).
    uint64 private immutable windowDaySecs;
    uint64 private immutable windowCount;
    uint64 private immutable closeOffset0;
    uint64 private immutable closeOffset1;

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

    /// @dev `deadline` is `lockDeadline(windowId)`, not the event's `eth_lock_deadline`.
    event OutcomeRecorded(
        bytes32 indexed auctionKey,
        uint64 windowId,
        bytes32 pairHash,
        uint64 deadline,
        bytes32 root,
        uint64 leafCount,
        uint64 aptosVersion
    );

    /// @dev A remainder sent to the depositor is not in the event; it is `amount` minus the leaf's sum.
    event LockReleased(bytes32 indexed lockId, bytes32 indexed auctionKey);

    event LockReclaimed(bytes32 indexed lockId, address indexed depositor, uint256 amount);

    /// @notice Emitted by `reclaimUnpayable`: the lock's leaf is unpayable, so `amount` went home.
    event LockReclaimedUnpayable(
        bytes32 indexed lockId, bytes32 indexed auctionKey, address indexed depositor, uint256 amount
    );

    // ==================== Errors ====================

    error UnsupportedToken(address token);
    error ZeroAmount();
    error LockMismatch(bytes32 lockId);
    error LockNotOpen(bytes32 lockId, Status status);
    error OutcomeAlreadyRecorded(bytes32 auctionKey);
    error AuctionWasReclaimed(bytes32 auctionKey);
    error BadOutcomeEvent();
    error NoOutcome(bytes32 auctionKey);
    error InvalidProof();
    /// @notice The leaf's payouts sum above the lock amount, or overflow (`sum` is then `type(uint256).max`).
    ///         A short sum is paid, with the remainder to the depositor.
    error PayoutSumMismatch(uint256 sum, uint256 amount);
    error ZeroRecipient();
    error DeadlineNotReached(uint64 deadline);
    error LockInTree(bytes32 lockId);

    /// @notice `lock` names a window below `currentWindowId()`.
    error WindowClosed(uint64 windowId, uint64 current);
    /// @notice `lock` names a window above `currentWindowId() + 1`.
    error WindowTooFarAhead(uint64 windowId, uint64 current);
    /// @notice The constructor's window schedule breaks the `eth_proof::set_window_schedule` rules.
    error InvalidWindowSchedule();
    /// @notice `reclaimUnpayable` was called for a leaf that `releaseByOutcome` can pay.
    error LeafPayable(bytes32 lockId);

    // ==================== Constructor ====================

    /**
     * @param _fakeETH FakeETH token
     * @param _fakeUSD FakeUSD token
     * @param _lightClient Aptos light client that proves AuctionOutcome events
     * @param _outcomeTypeTag BCS TypeTag of `<atomica>::auction::AuctionOutcome`
     * @param daySecs Seconds per window day (production: 86_400)
     * @param closeOffsetsSecs One or two window closes as seconds into the day, strictly
     *        increasing, the first above 0 and the last at most `daySecs`
     *        (production: [27_900, 58_500], 07:45 and 16:15 UTC). Reverts `InvalidWindowSchedule`.
     */
    constructor(
        address _fakeETH,
        address _fakeUSD,
        IAptosLightClient _lightClient,
        bytes memory _outcomeTypeTag,
        uint64 daySecs,
        uint64[] memory closeOffsetsSecs
    ) {
        require(_fakeETH != address(0), "Invalid FakeETH address");
        require(_fakeUSD != address(0), "Invalid FakeUSD address");
        require(address(_lightClient) != address(0), "Invalid light client");
        require(_outcomeTypeTag.length > 0, "Invalid type tag");
        uint256 n = closeOffsetsSecs.length;
        if (n == 0 || n > 2 || closeOffsetsSecs[0] == 0 || closeOffsetsSecs[n - 1] > daySecs) {
            revert InvalidWindowSchedule();
        }
        if (n == 2 && closeOffsetsSecs[1] <= closeOffsetsSecs[0]) revert InvalidWindowSchedule();
        fakeETH = IERC20(_fakeETH);
        fakeUSD = IERC20(_fakeUSD);
        lightClient = _lightClient;
        outcomeTypeTag = _outcomeTypeTag;
        windowDaySecs = daySecs;
        // forge-lint: disable-next-line(unsafe-typecast)
        windowCount = uint64(n); // n is 1 or 2
        closeOffset0 = closeOffsetsSecs[0];
        closeOffset1 = n == 2 ? closeOffsetsSecs[1] : 0;
    }

    // ==================== Pure helpers ====================

    /// @notice Id of one lock, also its Aptos receipt id. Mirrored by `eth_proof::lock_id`.
    function getLockId(address depositor, address token, uint256 nonce) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(depositor, token, nonce));
    }

    /// @notice The auction a lock is bound to: keccak256(abi.encode(windowId, pairHash)).
    ///         Mirrored by `auction::auction_key` and `eth_proof::auction_key`.
    function auctionKey(uint64 windowId, bytes32 pairHash) public pure returns (bytes32) {
        return keccak256(abi.encode(windowId, pairHash));
    }

    // ==================== Window clock ====================

    /// @notice The window id at `block.timestamp`. Mirrors `eth_proof::window_id_at`.
    function currentWindowId() public view returns (uint64) {
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 t = uint64(block.timestamp);
        // forge-lint: disable-next-line(divide-before-multiply)
        uint64 id = (t / windowDaySecs) * windowCount; // whole days, floored
        uint64 s = t % windowDaySecs;
        if (s >= closeOffset0) id++;
        if (windowCount == 2 && s >= closeOffset1) id++;
        return id;
    }

    /// @notice Unix second at which `windowId` closes, the first second of window `windowId + 1`.
    ///         Mirrors `eth_proof::window_close_secs`. Reverts on uint64 overflow (window ids near 2^64).
    function windowClose(uint64 windowId) public view returns (uint64) {
        uint64 offset = windowId % windowCount == 0 ? closeOffset0 : closeOffset1;
        // forge-lint: disable-next-line(divide-before-multiply)
        return (windowId / windowCount) * windowDaySecs + offset; // whole days, floored
    }

    /// @notice The deadline of every lock of `windowId`: `windowClose(windowId) + RECLAIM_DELAY`.
    ///         Mirrors `eth_proof::eth_lock_deadline`. Reverts on uint64 overflow.
    function lockDeadline(uint64 windowId) public view returns (uint64) {
        return windowClose(windowId) + RECLAIM_DELAY;
    }

    /// @notice The window clock frozen at deploy: seconds per day and the close offsets.
    function windowSchedule() external view returns (uint64 daySecs, uint64[] memory closeOffsetsSecs) {
        daySecs = windowDaySecs;
        closeOffsetsSecs = new uint64[](windowCount);
        closeOffsetsSecs[0] = closeOffset0;
        if (windowCount == 2) closeOffsetsSecs[1] = closeOffset1;
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

    /**
     * @notice Lock `amount` of `token` into the auction (windowId, pairHash).
     * @dev The token must be approved first. `windowId` must be the current window or the next
     *      one, the two windows Aptos `create_auction` accepts. The commitment and `Locked` carry
     *      the computed `lockDeadline(windowId)`. A lock Aptos never registers still goes home by
     *      `reclaim` after that deadline. A lock sent in a window's last seconds may be mined in
     *      the next window and revert `WindowClosed`; clients should target the next window near
     *      a close.
     * @return lockId The lock's id (its Aptos receipt id)
     */
    function lock(address token, uint256 amount, uint64 windowId, bytes32 pairHash) external returns (bytes32 lockId) {
        if (token != address(fakeETH) && token != address(fakeUSD)) revert UnsupportedToken(token);
        if (amount == 0) revert ZeroAmount();
        uint64 current = currentWindowId();
        if (windowId < current) revert WindowClosed(windowId, current);
        if (windowId > current + 1) revert WindowTooFarAhead(windowId, current);
        uint64 deadline = lockDeadline(windowId);

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
        (uint64 windowId, bytes32 pairHash,, bytes32 root, uint64 leafCount) = _decodeOutcome(data);
        if (root == bytes32(0) || leafCount == 0) revert BadOutcomeEvent();

        // The event's `eth_lock_deadline` is ignored: the deadline is a function of the window id.
        key = auctionKey(windowId, pairHash);
        if (outcomes[key].root != bytes32(0)) revert OutcomeAlreadyRecorded(key);
        if (auctionReclaimed[key]) revert AuctionWasReclaimed(key);

        outcomes[key] = Outcome(root, leafCount);
        emit OutcomeRecorded(key, windowId, pairHash, lockDeadline(windowId), root, leafCount, version);
    }

    /**
     * @notice Pay a lock out per its leaf in the recorded outcome of its auction. Permissionless.
     * @dev Reverts `ZeroRecipient` or `PayoutSumMismatch` on an unpayable leaf; that lock goes home
     *      by `reclaimUnpayable`.
     * @param l The lock's fields (checked against its commitment)
     * @param payouts The leaf's (recipient, amount) list. It may sum below the lock amount: the
     *        remainder goes to the depositor after the payouts. An empty list returns the whole lock.
     * @param leaf The leaf's index and Merkle proof
     */
    function releaseByOutcome(
        Lock calldata l,
        OutcomeTree.Payout[] calldata payouts,
        OutcomeTree.LeafProof calldata leaf
    ) external {
        bytes32 lockId = _openLock(l);
        bytes32 key = auctionKey(l.windowId, l.pairHash);
        Outcome memory o = outcomes[key];
        if (o.root == bytes32(0)) revert NoOutcome(key);

        (bool unpayable, uint256 sum) = _leafUnpayable(l.amount, payouts);
        if (unpayable) {
            for (uint256 i = 0; i < payouts.length; i++) {
                if (payouts[i].recipient == address(0)) revert ZeroRecipient();
            }
            revert PayoutSumMismatch(sum, l.amount);
        }
        bytes32 leafHash = OutcomeTree.leafHash(lockId, OutcomeTree.payoutsHash(payouts));
        if (!OutcomeTree.verify(leafHash, leaf.index, o.leafCount, leaf.proof, o.root)) revert InvalidProof();

        statuses[lockId] = Status.Released;
        emit LockReleased(lockId, key);
        for (uint256 i = 0; i < payouts.length; i++) {
            if (payouts[i].amount > 0) IERC20(l.token).safeTransfer(payouts[i].recipient, payouts[i].amount);
        }
        if (sum < l.amount) IERC20(l.token).safeTransfer(l.depositor, l.amount - sum);
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

        bytes32 key = auctionKey(l.windowId, l.pairHash);
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

    /**
     * @notice Return a lock to its depositor when its leaf in the recorded outcome is unpayable.
     *         Permissionless, with no deadline wait: a recorded outcome is final, so that leaf can
     *         never be released.
     * @dev Checks in order: the lock is open, its auction has a recorded outcome (`NoOutcome`), the
     *      leaf's proof holds (`InvalidProof`), and the leaf is unpayable (`LeafPayable`). It does
     *      not set `auctionReclaimed`: the other locks of the auction still release.
     * @param l The lock's fields (checked against its commitment)
     * @param payouts The leaf's (recipient, amount) list
     * @param leaf The leaf's index and Merkle proof
     */
    function reclaimUnpayable(
        Lock calldata l,
        OutcomeTree.Payout[] calldata payouts,
        OutcomeTree.LeafProof calldata leaf
    ) external {
        bytes32 lockId = _openLock(l);
        bytes32 key = auctionKey(l.windowId, l.pairHash);
        Outcome memory o = outcomes[key];
        if (o.root == bytes32(0)) revert NoOutcome(key);
        bytes32 leafHash = OutcomeTree.leafHash(lockId, OutcomeTree.payoutsHash(payouts));
        if (!OutcomeTree.verify(leafHash, leaf.index, o.leafCount, leaf.proof, o.root)) revert InvalidProof();
        (bool unpayable,) = _leafUnpayable(l.amount, payouts);
        if (!unpayable) revert LeafPayable(lockId);

        statuses[lockId] = Status.Reclaimed;
        emit LockReclaimedUnpayable(lockId, key, l.depositor, l.amount);
        IERC20(l.token).safeTransfer(l.depositor, l.amount);
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

    /// @dev Whether a leaf is unpayable for a lock of `amount`, and the sum of its payouts. Unpayable
    ///      means a zero recipient, a sum above `amount`, or a sum that overflows. It never reverts:
    ///      a panic here would freeze the lock. On overflow `sum` is `type(uint256).max`.
    function _leafUnpayable(uint256 amount, OutcomeTree.Payout[] calldata payouts)
        internal
        pure
        returns (bool unpayable, uint256 sum)
    {
        for (uint256 i = 0; i < payouts.length; i++) {
            if (payouts[i].recipient == address(0)) unpayable = true;
            unchecked {
                uint256 next = sum + payouts[i].amount;
                // forge-lint: disable-next-line(boolean-cst)
                if (next < sum) return (true, type(uint256).max); // overflow: unpayable
                sum = next;
            }
        }
        if (sum > amount) unpayable = true;
    }

    /// @dev BCS of `AuctionOutcome { window_id: u64, pair_hash: vector<u8>, eth_lock_deadline: u64,
    ///      dispositions_root: vector<u8>, leaf_count: u64 }` with 32-byte vectors. The fork golden
    ///      vectors pin this layout. `eth_lock_deadline` (offset 41) is decoded, and `recordOutcome` ignores it.
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
