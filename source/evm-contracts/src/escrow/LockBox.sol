// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title LockBox
 * @notice Escrow contract for locking FAKETH and FAKEUSD tokens for auction participation
 * @dev Storage layout uses single-level mappings for reliable eth_getProof support
 *
 * RELEASE RULE: locked tokens leave LockBox only on an Aptos auction outcome.
 * The `settlementAuthority` (the v0.1 trusted relayer, see
 * docs/architecture/v0-architecture.md §3.5) relays each outcome:
 * - `refund` returns a lock to its owner (AuctionRefunded, a losing or
 *   unopened bid, unsold seller supply).
 * - `settleFill` swaps a seller's FakeETH for a winner's FakeUSD at the
 *   clearing price (AuctionSettled).
 * Both only credit `withdrawable` balances. Users then pull them with
 * `withdrawWinnings`. Each outcome id is processed once. Time alone never
 * releases a lock.
 *
 * IMPORTANT: Nested mappings (mapping(address => mapping(address => uint256))) do not work
 * reliably with eth_getProof on Geth. We use single-level mappings with composite keys instead.
 * See: docs/development/ethereum-storage-proof-quirks.md
 *
 * Storage Layout (immutable variables don't use storage slots):
 * - Slot 0: lockedBalances mapping(bytes32 => uint256)
 * - Slot 1: unlockTimes mapping(bytes32 => uint256)
 * - Slot 2: withdrawable mapping(bytes32 => uint256)
 * - Slot 3: processedOutcomes mapping(bytes32 => bool)
 * - Slot 4: lockAmounts mapping(bytes32 => uint256)
 * - Slot 5: nextLockNonce uint256
 *
 * To calculate storage key for lockedBalances[getLockKey(user, token)]:
 * compositeKey = keccak256(abi.encodePacked(user, token))
 * storageKey = keccak256(abi.encode(compositeKey, uint256(0)))
 *
 * PER-LOCK PROOFS: every `lock` call takes a fresh nonce and records its own
 * amount in `lockAmounts[getLockId(user, token, nonce)]`. Aptos proves that
 * slot (`calculateLockStorageKey`) and uses the lock id as its receipt id, so
 * one lock gives exactly one receipt however many blocks it is proven at.
 * The record is never cleared: it states what was locked, not what is left.
 *
 * TODO: Future enhancement - implement event-based proofs as alternative
 * Events are more reliable for cross-chain verification and don't have storage layout constraints.
 */
contract LockBox {
    using SafeERC20 for IERC20;

    // ==================== State Variables ====================

    /// @notice FakeETH token contract
    IERC20 public immutable fakeETH;

    /// @notice FakeUSD token contract
    IERC20 public immutable fakeUSD;

    /// @notice Only address allowed to relay Aptos outcomes (v0.1: the trusted relayer EOA)
    address public immutable settlementAuthority;

    /// @notice Lock age recorded in `unlockTimes`. Informational only: it does not release funds.
    uint256 public constant MIN_LOCK_DURATION = 1 hours;

    /// @notice User locked balances: lockKey => amount
    /// @dev Slot 0 - Single-level mapping for reliable eth_getProof support
    /// @dev Key is keccak256(abi.encodePacked(user, token))
    mapping(bytes32 => uint256) public lockedBalances;

    /// @notice Unlock times: lockKey => timestamp
    /// @dev Slot 1 - Single-level mapping
    /// @dev Key is keccak256(abi.encodePacked(user, token))
    mapping(bytes32 => uint256) public unlockTimes;

    /// @notice Released balances a user can pull with withdrawWinnings: lockKey => amount
    /// @dev Slot 2. Credited only by refund or settleFill.
    mapping(bytes32 => uint256) public withdrawable;

    /// @notice Aptos outcome ids already relayed (replay guard)
    /// @dev Slot 3
    mapping(bytes32 => bool) public processedOutcomes;

    /// @notice Amount of each single lock: getLockId(user, token, nonce) => amount
    /// @dev Slot 4. Written once by `lock`, never changed. Aptos proves this slot.
    mapping(bytes32 => uint256) public lockAmounts;

    /// @notice Nonce the next `lock` call takes
    /// @dev Slot 5
    uint256 public nextLockNonce;

    // ==================== Events ====================

    /// @notice Emitted when tokens are locked
    /// @param nonce The lock's nonce: its Aptos lock id is getLockId(user, token, nonce)
    event TokensLocked(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 unlockTime,
        uint256 nonce
    );

    /// @notice Emitted when an Aptos refund returns a lock to its owner
    event LockRefunded(
        bytes32 indexed outcomeId,
        address indexed user,
        address indexed token,
        uint256 amount
    );

    /// @notice Emitted when an Aptos settlement swaps a seller's FakeETH for a winner's FakeUSD
    event FillSettled(
        bytes32 indexed outcomeId,
        address indexed seller,
        address indexed winner,
        uint256 baseAmount,
        uint256 quoteAmount
    );

    /// @notice Emitted when a user pulls credited tokens (architecture §3.5)
    event WithdrawWinnings(
        address indexed winner,
        address indexed token,
        uint256 amount
    );

    // ==================== Errors ====================

    error NotSettlementAuthority(address caller);
    error OutcomeAlreadyProcessed(bytes32 outcomeId);
    error InsufficientLocked(address user, address token, uint256 locked, uint256 amount);
    error NothingToWithdraw(address user, address token);

    // ==================== Constructor ====================

    /**
     * @notice Initialize LockBox with token addresses
     * @param _fakeETH Address of FakeETH token
     * @param _fakeUSD Address of FakeUSD token
     * @param _settlementAuthority Address allowed to relay Aptos outcomes
     */
    constructor(address _fakeETH, address _fakeUSD, address _settlementAuthority) {
        require(_fakeETH != address(0), "Invalid FakeETH address");
        require(_fakeUSD != address(0), "Invalid FakeUSD address");
        require(_settlementAuthority != address(0), "Invalid settlement authority");

        fakeETH = IERC20(_fakeETH);
        fakeUSD = IERC20(_fakeUSD);
        settlementAuthority = _settlementAuthority;
    }

    modifier onlySettlementAuthority() {
        if (msg.sender != settlementAuthority) revert NotSettlementAuthority(msg.sender);
        _;
    }

    // ==================== Internal Functions ====================

    /**
     * @notice Generate composite key for lock mappings
     * @param user User address
     * @param token Token address
     * @return Composite key for accessing lock data
     * @dev Uses keccak256(abi.encodePacked(user, token)) for gas efficiency
     */
    function getLockKey(address user, address token) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, token));
    }

    /**
     * @notice Id of one lock, also its Aptos receipt id
     * @dev keccak256(abi.encodePacked(user, token, nonce)). Mirrored by
     *      eth_proof::lock_id in source/atomica-move-contracts.
     */
    function getLockId(address user, address token, uint256 nonce) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, token, nonce));
    }

    /// @dev Mark an outcome processed. Reverts if it was relayed before.
    function _useOutcome(bytes32 outcomeId) private {
        if (processedOutcomes[outcomeId]) revert OutcomeAlreadyProcessed(outcomeId);
        processedOutcomes[outcomeId] = true;
    }

    /// @dev Move `amount` of `from`'s locked `token` to `to`'s withdrawable balance.
    function _release(address from, address to, address token, uint256 amount) private {
        bytes32 fromKey = getLockKey(from, token);
        uint256 locked = lockedBalances[fromKey];
        if (locked < amount) revert InsufficientLocked(from, token, locked, amount);
        lockedBalances[fromKey] = locked - amount;
        withdrawable[getLockKey(to, token)] += amount;
    }

    // ==================== External Functions ====================

    /**
     * @notice Lock tokens for auction participation
     * @param token Address of token to lock (must be fakeETH or fakeUSD)
     * @param amount Amount of tokens to lock
     * @dev Tokens must be approved before calling this function.
     * @dev See docs/architecture/v0-architecture.md#§3-cross-chain-settlement-v01-bls-relayer-flow
     */
    function lock(address token, uint256 amount) external {
        require(
            token == address(fakeETH) || token == address(fakeUSD),
            "Invalid token"
        );
        require(amount > 0, "Amount must be > 0");

        // Transfer tokens from user to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Get composite key for this user+token combination
        bytes32 key = getLockKey(msg.sender, token);

        // Update locked balance
        lockedBalances[key] += amount;

        // Record this lock on its own, under a fresh nonce
        uint256 nonce = nextLockNonce++;
        lockAmounts[getLockId(msg.sender, token, nonce)] = amount;

        // Set/extend unlock time
        uint256 newUnlockTime = block.timestamp + MIN_LOCK_DURATION;
        if (newUnlockTime > unlockTimes[key]) {
            unlockTimes[key] = newUnlockTime;
        }

        emit TokensLocked(
            msg.sender,
            token,
            amount,
            unlockTimes[key],
            nonce
        );
    }

    /**
     * @notice Return a lock to its owner after an Aptos refund or release
     * @param outcomeId Unique id of the Aptos outcome being relayed (replay guard)
     * @param user Lock owner; receives the refund
     * @param token fakeETH or fakeUSD
     * @param amount Amount to return
     * @dev Relays AuctionRefunded, a losing bid's released collateral, a BidUnopened
     *      collateral, a winner's excess collateral, or a seller's unsold supply.
     */
    function refund(
        bytes32 outcomeId,
        address user,
        address token,
        uint256 amount
    ) external onlySettlementAuthority {
        _useOutcome(outcomeId);
        _release(user, user, token, amount);
        emit LockRefunded(outcomeId, user, token, amount);
    }

    /**
     * @notice Settle one fill of an Aptos AuctionSettled outcome
     * @param outcomeId Unique id of the fill being relayed (replay guard)
     * @param seller Seller whose locked FakeETH is sold
     * @param winner Winning bidder whose locked FakeUSD pays
     * @param baseAmount FakeETH wei the winner receives
     * @param quoteAmount FakeUSD units the seller receives (fill x clearing price)
     * @dev Both legs move in one transaction, so a fill is atomic.
     */
    function settleFill(
        bytes32 outcomeId,
        address seller,
        address winner,
        uint256 baseAmount,
        uint256 quoteAmount
    ) external onlySettlementAuthority {
        _useOutcome(outcomeId);
        _release(seller, winner, address(fakeETH), baseAmount);
        _release(winner, seller, address(fakeUSD), quoteAmount);
        emit FillSettled(outcomeId, seller, winner, baseAmount, quoteAmount);
    }

    /**
     * @notice Withdraw every credited balance of `token`
     * @param token fakeETH or fakeUSD
     * @dev Pull pattern from docs/architecture/v0-architecture.md §3.5.
     */
    function withdrawWinnings(address token) external {
        bytes32 key = getLockKey(msg.sender, token);
        uint256 amount = withdrawable[key];
        if (amount == 0) revert NothingToWithdraw(msg.sender, token);
        withdrawable[key] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit WithdrawWinnings(msg.sender, token, amount);
    }

    // ==================== View Functions ====================

    /**
     * @notice Get user's locked balance for a token
     * @param user User address
     * @param token Token address
     * @return Locked amount
     */
    function getLockedBalance(
        address user,
        address token
    ) external view returns (uint256) {
        bytes32 key = getLockKey(user, token);
        return lockedBalances[key];
    }

    /**
     * @notice Get the balance a user can pull with withdrawWinnings
     * @param user User address
     * @param token Token address
     * @return Withdrawable amount
     */
    function getWithdrawable(address user, address token) external view returns (uint256) {
        return withdrawable[getLockKey(user, token)];
    }

    /**
     * @notice Check if the user's lock is older than MIN_LOCK_DURATION
     * @param user User address
     * @param token Token address
     * @return True once the lock age passed. Informational only: it does not release funds.
     */
    function isUnlocked(address user, address token) external view returns (bool) {
        bytes32 key = getLockKey(user, token);
        return block.timestamp >= unlockTimes[key];
    }

    /**
     * @notice Get the lock-age timestamp for user's tokens
     * @param user User address
     * @param token Token address
     * @return Timestamp when the lock passes MIN_LOCK_DURATION. Informational only.
     */
    function getUnlockTime(
        address user,
        address token
    ) external view returns (uint256) {
        bytes32 key = getLockKey(user, token);
        return unlockTimes[key];
    }

    /**
     * @notice Calculate storage key for lockedBalances[getLockKey(user, token)]
     * @param user User address
     * @param token Token address
     * @return Storage key that can be used in eth_getProof
     * @dev This is a helper function for off-chain proof generation
     *
     * For single-level mapping at slot 0:
     * 1. compositeKey = keccak256(abi.encodePacked(user, token))
     * 2. storageKey = keccak256(abi.encode(compositeKey, uint256(0)))
     */
    function calculateStorageKey(
        address user,
        address token
    ) external pure returns (bytes32) {
        // lockedBalances is at slot 0 (immutable variables don't use storage)
        // For single-level mappings: keccak256(abi.encode(key, slot))
        bytes32 compositeKey = getLockKey(user, token);
        bytes32 storageKey = keccak256(abi.encode(compositeKey, uint256(0)));
        return storageKey;
    }

    /**
     * @notice Calculate storage key for lockAmounts[getLockId(user, token, nonce)]
     * @dev The slot Aptos proves (eth_proof::lock_storage_key):
     *      keccak256(abi.encode(getLockId(user, token, nonce), uint256(4)))
     */
    function calculateLockStorageKey(
        address user,
        address token,
        uint256 nonce
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(getLockId(user, token, nonce), uint256(4)));
    }

    /**
     * @notice Calculate storage key for unlockTimes[getLockKey(user, token)]
     * @param user User address
     * @param token Token address
     * @return Storage key that can be used in eth_getProof
     * @dev Helper for off-chain proof generation (slot 1)
     */
    function calculateUnlockTimeStorageKey(
        address user,
        address token
    ) external pure returns (bytes32) {
        // unlockTimes is at slot 1
        bytes32 compositeKey = getLockKey(user, token);
        bytes32 storageKey = keccak256(abi.encode(compositeKey, uint256(1)));
        return storageKey;
    }
}
