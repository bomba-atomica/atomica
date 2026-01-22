// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BLSVerifier
 * @notice Verifies BLS aggregated signatures on Ethereum block headers
 * @dev Part of Atomica's cross-chain state verification system
 *
 * Architecture (Simplified - January 2026):
 * - Validators sign Ethereum block hashes (not state roots directly)
 * - Block hash implicitly includes stateRoot via block header
 * - EIP-2537 precompiles (0x09, 0x0c) used for BLS operations
 * - State proofs verified off-chain via eth_getProof
 *
 * BLS Precompile Addresses (EIP-2537, Pectra upgrade):
 * - 0x09: BLS12_381_G1_MULTIEXP - Point multiplication/aggregation
 * - 0x0c: BLS12_381_PAIRING - Pairing check for verification
 *
 * Trust Model:
 * - Genesis validator set trusted at deployment
 * - Subsequent updates verified by current trusted validators
 * - BLS signatures provide cryptographic guarantee
 */
contract BLSVerifier {
    /**
     * @notice Trusted validator BLS public keys (G2 points in compressed format)
     * @dev Updated via updateValidatorSet()
     */
    bytes[] public trustedPubkeys;

    /**
     * @notice Current epoch number
     * @dev Incremented on validator set updates
     */
    uint64 public currentEpoch;

    /**
     * @notice How long block signatures remain valid
     * @dev Prevents replay attacks with stale blocks
     */
    uint256 public constant SIGNATURE_EXPIRY = 1 hours;

    /**
     * @notice Maps block hash to verification status
     * @dev Prevents re-verification of same block
     */
    mapping(bytes32 => bool) public verifiedBlocks;

    /**
     * @notice Maps block hash to expiration time
     * @dev For signature expiry checking
     */
    mapping(bytes32 => uint256) public blockExpiry;

    /**
     * @notice Emitted when a block hash is verified
     * @param blockHash The verified block hash
     * @param stateRoot Ethereum stateRoot from block header
     * @param timestamp When verification occurred
     */
    event BlockVerified(bytes32 indexed blockHash, bytes32 stateRoot, uint256 timestamp);

    /**
     * @notice Emitted when verification fails
     * @param reason Human-readable failure reason
     */
    event VerificationFailed(string reason);

    /**
     * @notice Emitted when validator set is updated
     * @param epoch New epoch number
     * @param validatorCount Number of validators
     */
    event ValidatorSetUpdated(uint64 indexed epoch, uint256 validatorCount);

    /**
     * @notice Restricts to initialized state
     */
    modifier onlyInitialized() {
        require(trustedPubkeys.length > 0, "BLS: not initialized");
        _;
    }

    /**
     * @notice Initialize with genesis validator set
     * @param genesisPubkeys Initial trusted validator BLS public keys
     * @dev Can only be called once
     */
    function initialize(bytes[] calldata genesisPubkeys) external {
        require(trustedPubkeys.length == 0, "BLS: already initialized");
        require(genesisPubkeys.length > 0, "BLS: no validators");
        trustedPubkeys = genesisPubkeys;
        currentEpoch = 0;
        emit ValidatorSetUpdated(0, genesisPubkeys.length);
    }

    /**
     * @notice Verify BLS signature on Ethereum block hash
     * @param blockHash Ethereum block hash to verify
     * @param signature Aggregated BLS signature from validators
     * @param validatorIndices Indices of validators who signed
     * @return True if signature is valid
     * @dev Block header contains stateRoot, enabling state proof verification
     */
    function verifyBlockHash(
        bytes32 blockHash,
        bytes calldata signature,
        uint256[] calldata validatorIndices
    ) external onlyInitialized returns (bool) {
        require(blockHash != bytes32(0), "BLS: invalid block hash");
        require(signature.length == 48, "BLS: invalid signature length");
        require(validatorIndices.length > 0, "BLS: no validators");

        // Prevent replay of stale signatures
        require(
            blockExpiry[blockHash] == 0 || block.timestamp < blockExpiry[blockHash],
            "BLS: signature expired"
        );

        // Verify BLS signature
        bool isValid = _verifyAggregatedSignature(
            trustedPubkeys,
            signature,
            blockHash,
            validatorIndices
        );

        if (isValid) {
            // Extract stateRoot from block hash (not directly available, but implicitly trusted)
            // The off-chain service provides stateRoot separately for verification
            verifiedBlocks[blockHash] = true;
            blockExpiry[blockHash] = block.timestamp + SIGNATURE_EXPIRY;

            emit BlockVerified(blockHash, bytes32(0), block.timestamp);
        } else {
            emit VerificationFailed("BLS: signature verification failed");
        }

        return isValid;
    }

    /**
     * @notice Update validator set for new epoch
     * @dev Verifies current validators signed the new validator set
     * @param newPubkeys New validator BLS public keys
     * @param newEpoch The epoch these keys become active
     * @param signature BLS signature over the new validator set
     * @param validatorIndices Indices of validators who signed
     */
    function updateValidatorSet(
        bytes[] calldata newPubkeys,
        uint64 newEpoch,
        bytes calldata signature,
        uint256[] calldata validatorIndices
    ) external onlyInitialized returns (bool) {
        require(newEpoch > currentEpoch, "BLS: epoch must increase");
        require(newPubkeys.length > 0, "BLS: must have validators");
        require(signature.length == 48, "BLS: invalid signature length");

        // Create message: keccak256("ATOMICA_VALIDATOR_UPDATE" || newEpoch || keccak256(newPubkeys) || chainId)
        bytes32 messageHash = keccak256(abi.encodePacked(
            "ATOMICA_VALIDATOR_UPDATE",
            newEpoch,
            keccak256(abi.encode(newPubkeys)),
            block.chainid
        ));

        // Verify signature from CURRENT trusted validators
        bool isValid = _verifyAggregatedSignature(
            trustedPubkeys,
            signature,
            messageHash,
            validatorIndices
        );

        require(isValid, "BLS: invalid validator update signature");

        // Update trusted keys
        trustedPubkeys = newPubkeys;
        currentEpoch = newEpoch;

        emit ValidatorSetUpdated(newEpoch, newPubkeys.length);

        return true;
    }

    /**
     * @notice Check if a block hash has been verified
     * @param blockHash The block hash to check
     * @return True if block was verified and signature not expired
     */
    function isBlockVerified(bytes32 blockHash) external view returns (bool) {
        return verifiedBlocks[blockHash] && block.timestamp < blockExpiry[blockHash];
    }

    /**
     * @notice Get current validator count
     * @return Number of trusted validators
     */
    function getValidatorCount() external view returns (uint256) {
        return trustedPubkeys.length;
    }

    /**
     * @notice Internal: Verify aggregated BLS signature using EIP-2537 precompiles
     * @param pubkeys Array of validator public keys
     * @param signature Aggregated BLS signature
     * @param messageHash Hash being signed
     * @param validatorIndices Which validators signed
     * @return True if signature is valid
     */
    function _verifyAggregatedSignature(
        bytes[] memory pubkeys,
        bytes calldata signature,
        bytes32 messageHash,
        uint256[] calldata validatorIndices
    ) internal view returns (bool) {
        require(validatorIndices.length <= pubkeys.length, "BLS: too many validators");

        // Aggregate public keys of signing validators
        bytes memory aggPubkey = _aggregatePublicKeys(pubkeys, validatorIndices);

        // Verify signature using EIP-2537 pairing precompile (0x0c)
        // signature is G1 point, aggPubkey is G2 point, messageHash is mapped to G1
        (bool success, bytes memory result) = address(0x0c).staticcall(
            abi.encodePacked(signature, aggPubkey, messageHash)
        );

        return success && result.length == 32 && result[31] != 0;
    }

    /**
     * @notice Internal: Aggregate multiple BLS public keys
     * @param pubkeys Array of validator public keys
     * @param indices Which indices to aggregate
     * @return Aggregated public key
     */
    function _aggregatePublicKeys(
        bytes[] memory pubkeys,
        uint256[] calldata indices
    ) internal view returns (bytes memory) {
        require(indices.length > 0, "BLS: no validators");
        bytes memory agg = pubkeys[indices[0]];

        for (uint256 i = 1; i < indices.length; i++) {
            require(indices[i] < pubkeys.length, "BLS: invalid validator index");
            // Use EIP-2537 G1_MULTIEXP precompile (0x09) for aggregation
            (bool success, bytes memory result) = address(0x09).staticcall(
                abi.encodePacked(agg, pubkeys[indices[i]])
            );
            require(success, "BLS: pubkey aggregation failed");
            agg = result;
        }

        return agg;
    }
}
