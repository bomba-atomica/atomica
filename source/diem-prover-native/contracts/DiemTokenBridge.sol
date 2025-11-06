// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./AptosLightClient.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title AptosTokenBridge
 * @notice Cross-chain token bridge between Ethereum and Aptos
 * @dev Locks tokens on Ethereum, releases on proof of burn from Aptos
 */
contract AptosTokenBridge {
    AptosLightClient public immutable lightClient;

    // Mapping of locked tokens
    mapping(address => uint256) public lockedBalance;

    // Track processed burn proofs to prevent replay
    mapping(bytes32 => bool) public processedBurns;

    // Events
    event TokensLocked(
        address indexed token,
        address indexed sender,
        uint256 amount,
        bytes32 indexed aptosRecipient
    );

    event TokensUnlocked(
        address indexed token,
        address indexed recipient,
        uint256 amount,
        bytes32 burnProofHash
    );

    // Errors
    error InvalidProof();
    error AlreadyProcessed();
    error InsufficientBalance();
    error TransferFailed();

    constructor(address _lightClient) {
        lightClient = AptosLightClient(_lightClient);
    }

    /**
     * @notice Lock tokens on Ethereum to bridge to Aptos
     * @param token ERC20 token address
     * @param amount Amount to lock
     * @param aptosRecipient Recipient address on Aptos (32 bytes)
     */
    function lockTokens(
        address token,
        uint256 amount,
        bytes32 aptosRecipient
    ) external {
        require(amount > 0, "Amount must be positive");

        // Transfer tokens to bridge contract
        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        lockedBalance[token] += amount;

        emit TokensLocked(token, msg.sender, amount, aptosRecipient);
    }

    /**
     * @notice Unlock tokens by proving burn on Aptos
     * @param token Token address to unlock
     * @param amount Amount to unlock
     * @param recipient Ethereum recipient address
     * @param burnProof Sparse Merkle proof of burn event on Aptos
     * @param burnEventData Encoded burn event data
     */
    function unlockTokens(
        address token,
        uint256 amount,
        address recipient,
        bytes32[] calldata burnProof,
        bytes calldata burnEventData
    ) external {
        // 1. Verify burn event hasn't been processed
        bytes32 burnHash = keccak256(burnEventData);
        if (processedBurns[burnHash]) revert AlreadyProcessed();

        // 2. Decode burn event data
        (
            address burnedToken,
            uint256 burnedAmount,
            address ethRecipient,
            uint64 burnVersion
        ) = _decodeBurnEvent(burnEventData);

        // 3. Verify parameters match
        require(burnedToken == token, "Token mismatch");
        require(burnedAmount == amount, "Amount mismatch");
        require(ethRecipient == recipient, "Recipient mismatch");

        // 4. Construct state key for burn registry
        // On Aptos: account::resource<BurnRegistry>(BRIDGE_ADDRESS)
        bytes32 stateKey = _computeBurnRegistryKey(burnHash);

        // 5. Verify state proof against light client
        bool valid = lightClient.verifyAccountState(
            stateKey,
            burnEventData,
            abi.encodePacked(burnProof)
        );

        if (!valid) revert InvalidProof();

        // 6. Check sufficient locked balance
        if (lockedBalance[token] < amount) revert InsufficientBalance();

        // 7. Mark as processed
        processedBurns[burnHash] = true;

        // 8. Update locked balance
        lockedBalance[token] -= amount;

        // 9. Transfer tokens to recipient
        bool success = IERC20(token).transfer(recipient, amount);
        if (!success) revert TransferFailed();

        emit TokensUnlocked(token, recipient, amount, burnHash);
    }

    /**
     * @notice Get locked balance for a token
     */
    function getLockedBalance(address token) external view returns (uint256) {
        return lockedBalance[token];
    }

    /**
     * @notice Check if a burn proof has been processed
     */
    function isBurnProcessed(bytes32 burnHash) external view returns (bool) {
        return processedBurns[burnHash];
    }

    // Internal functions

    function _decodeBurnEvent(bytes calldata data)
        internal pure returns (
            address token,
            uint256 amount,
            address recipient,
            uint64 version
        )
    {
        // Simplified decoding - production would use proper BCS deserialization
        require(data.length >= 72, "Invalid burn event data");

        token = address(bytes20(data[0:20]));
        amount = uint256(bytes32(data[20:52]));
        recipient = address(bytes20(data[52:72]));
        version = data.length >= 80 ? uint64(bytes8(data[72:80])) : 0;
    }

    function _computeBurnRegistryKey(bytes32 burnHash)
        internal pure returns (bytes32)
    {
        // Compute Aptos state key: hash(address || struct_tag || burnHash)
        // This is a simplified version - production needs proper Aptos state key generation
        return keccak256(abi.encodePacked(
            "BurnRegistry",
            burnHash
        ));
    }
}
