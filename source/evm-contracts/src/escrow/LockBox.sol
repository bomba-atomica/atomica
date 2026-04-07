// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title LockBox
 * @notice Escrow contract for locking FAKETH and FAKEUSD tokens for auction participation
 * @dev Storage layout uses single-level mappings for reliable eth_getProof support
 *
 * IMPORTANT: Nested mappings (mapping(address => mapping(address => uint256))) do not work
 * reliably with eth_getProof on Geth. We use single-level mappings with composite keys instead.
 * See: docs/development/ethereum-storage-proof-quirks.md
 *
 * Storage Layout (immutable variables don't use storage slots):
 * - Slot 0: lockedBalances mapping(bytes32 => uint256)
 * - Slot 1: unlockTimes mapping(bytes32 => uint256)
 *
 * To calculate storage key for lockedBalances[getLockKey(user, token)]:
 * compositeKey = keccak256(abi.encodePacked(user, token))
 * storageKey = keccak256(abi.encode(compositeKey, uint256(0)))
 *
 * TODO: Future enhancement - implement event-based proofs as alternative
 * Events are more reliable for cross-chain verification and don't have storage layout constraints.
 */
contract LockBox {
    // ==================== State Variables ====================

    /// @notice FakeETH token contract
    IERC20 public immutable fakeETH;

    /// @notice FakeUSD token contract
    IERC20 public immutable fakeUSD;

    /// @notice Minimum lock duration (1 hour for testnet, longer for mainnet)
    uint256 public constant MIN_LOCK_DURATION = 1 hours;

    /// @notice User locked balances: lockKey => amount
    /// @dev Slot 0 - Single-level mapping for reliable eth_getProof support
    /// @dev Key is keccak256(abi.encodePacked(user, token))
    mapping(bytes32 => uint256) public lockedBalances;

    /// @notice Unlock times: lockKey => timestamp
    /// @dev Slot 1 - Single-level mapping
    /// @dev Key is keccak256(abi.encodePacked(user, token))
    mapping(bytes32 => uint256) public unlockTimes;

    // ==================== Events ====================

    /// @notice Emitted when tokens are locked
    event TokensLocked(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 unlockTime
    );

    /// @notice Emitted when tokens are withdrawn
    event TokensWithdrawn(
        address indexed user,
        address indexed token,
        uint256 amount
    );

    // ==================== Constructor ====================

    /**
     * @notice Initialize LockBox with token addresses
     * @param _fakeETH Address of FakeETH token
     * @param _fakeUSD Address of FakeUSD token
     */
    constructor(address _fakeETH, address _fakeUSD) {
        require(_fakeETH != address(0), "Invalid FakeETH address");
        require(_fakeUSD != address(0), "Invalid FakeUSD address");

        fakeETH = IERC20(_fakeETH);
        fakeUSD = IERC20(_fakeUSD);
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
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        // Get composite key for this user+token combination
        bytes32 key = getLockKey(msg.sender, token);

        // Update locked balance
        lockedBalances[key] += amount;

        // Set/extend unlock time
        uint256 newUnlockTime = block.timestamp + MIN_LOCK_DURATION;
        if (newUnlockTime > unlockTimes[key]) {
            unlockTimes[key] = newUnlockTime;
        }

        emit TokensLocked(
            msg.sender,
            token,
            amount,
            unlockTimes[key]
        );
    }

    /**
     * @notice Withdraw unlocked tokens
     * @param token Address of token to withdraw
     * @param amount Amount to withdraw
     * @dev Can only withdraw after unlock time has passed
     */
    function withdraw(address token, uint256 amount) external {
        bytes32 key = getLockKey(msg.sender, token);

        require(
            block.timestamp >= unlockTimes[key],
            "Tokens still locked"
        );
        require(
            lockedBalances[key] >= amount,
            "Insufficient balance"
        );

        // Update balance
        lockedBalances[key] -= amount;

        // Transfer tokens back to user
        IERC20(token).transfer(msg.sender, amount);

        emit TokensWithdrawn(msg.sender, token, amount);
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
     * @notice Check if user's tokens are unlocked
     * @param user User address
     * @param token Token address
     * @return True if tokens are unlocked and can be withdrawn
     */
    function isUnlocked(address user, address token) external view returns (bool) {
        bytes32 key = getLockKey(user, token);
        return block.timestamp >= unlockTimes[key];
    }

    /**
     * @notice Get unlock time for user's tokens
     * @param user User address
     * @param token Token address
     * @return Timestamp when tokens will be unlocked
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
