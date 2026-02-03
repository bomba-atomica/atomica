// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title LockBox
 * @notice Escrow contract for locking FAKETH and FAKEUSD tokens for auction participation
 * @dev Storage layout is designed for easy state proof generation on Aptos
 *
 * Storage Layout (immutable variables don't use storage slots):
 * - Slot 0: lockedBalances mapping(address => mapping(address => uint256))
 * - Slot 1: unlockTimes mapping(address => mapping(address => uint256))
 *
 * To calculate storage key for lockedBalances[user][token]:
 * innerKey = keccak256(token || 0)
 * storageKey = keccak256(user || innerKey)
 */
contract LockBox {
    // ==================== State Variables ====================

    /// @notice FakeETH token contract
    IERC20 public immutable fakeETH;

    /// @notice FakeUSD token contract
    IERC20 public immutable fakeUSD;

    /// @notice Minimum lock duration (1 hour for testnet, longer for mainnet)
    uint256 public constant MIN_LOCK_DURATION = 1 hours;

    /// @notice User locked balances: user => token => amount
    /// @dev Slot 0 - used for state proof generation
    mapping(address => mapping(address => uint256)) public lockedBalances;

    /// @notice Unlock times: user => token => timestamp
    /// @dev Slot 1
    mapping(address => mapping(address => uint256)) public unlockTimes;

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

    // ==================== External Functions ====================

    /**
     * @notice Lock tokens for auction participation
     * @param token Address of token to lock (must be fakeETH or fakeUSD)
     * @param amount Amount of tokens to lock
     * @dev Tokens must be approved before calling this function
     */
    function lock(address token, uint256 amount) external {
        require(
            token == address(fakeETH) || token == address(fakeUSD),
            "Invalid token"
        );
        require(amount > 0, "Amount must be > 0");

        // Transfer tokens from user to this contract
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        // Update locked balance
        lockedBalances[msg.sender][token] += amount;

        // Set/extend unlock time
        uint256 newUnlockTime = block.timestamp + MIN_LOCK_DURATION;
        if (newUnlockTime > unlockTimes[msg.sender][token]) {
            unlockTimes[msg.sender][token] = newUnlockTime;
        }

        emit TokensLocked(
            msg.sender,
            token,
            amount,
            unlockTimes[msg.sender][token]
        );
    }

    /**
     * @notice Withdraw unlocked tokens
     * @param token Address of token to withdraw
     * @param amount Amount to withdraw
     * @dev Can only withdraw after unlock time has passed
     */
    function withdraw(address token, uint256 amount) external {
        require(
            block.timestamp >= unlockTimes[msg.sender][token],
            "Tokens still locked"
        );
        require(
            lockedBalances[msg.sender][token] >= amount,
            "Insufficient balance"
        );

        // Update balance
        lockedBalances[msg.sender][token] -= amount;

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
        return lockedBalances[user][token];
    }

    /**
     * @notice Check if user's tokens are unlocked
     * @param user User address
     * @param token Token address
     * @return True if tokens are unlocked and can be withdrawn
     */
    function isUnlocked(address user, address token) external view returns (bool) {
        return block.timestamp >= unlockTimes[user][token];
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
        return unlockTimes[user][token];
    }

    /**
     * @notice Calculate storage key for lockedBalances[user][token]
     * @param user User address
     * @param token Token address
     * @return Storage key that can be used in eth_getProof
     * @dev This is a helper function for off-chain proof generation
     */
    function calculateStorageKey(
        address user,
        address token
    ) external pure returns (bytes32) {
        // lockedBalances is at slot 0 (immutable variables don't use storage)
        // For nested mappings, Solidity uses: keccak256(h(k2) || keccak256(h(k1) || p))
        // where h() pads to 32 bytes, k2=user, k1=token, p=slot
        bytes32 innerKey = keccak256(abi.encode(token, uint256(0)));
        bytes32 storageKey = keccak256(abi.encode(user, innerKey));
        return storageKey;
    }
}
