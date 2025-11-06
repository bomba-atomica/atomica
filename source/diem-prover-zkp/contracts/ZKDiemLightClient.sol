// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./Groth16Verifier.sol";
import "../../../contracts/aptos-bridge/MerkleVerifier.sol";

/**
 * @title ZKDiemLightClient
 * @notice Zero-knowledge Ethereum light client for Aptos/Diem blockchain
 * @dev Uses ZK-SNARKs to verify BLS signatures off-chain, dramatically reducing gas costs
 *
 * Architecture:
 * - Off-chain prover verifies BLS signatures and generates ZK proof
 * - On-chain contract only verifies the ZK proof (~250K gas single, ~4K batched)
 * - Batching amortizes proving costs across multiple updates
 * - Signatures remain private (never revealed on-chain)
 */
contract ZKDiemLightClient {
    using MerkleVerifier for *;

    /// @notice Current trusted state of Aptos blockchain
    struct TrustedState {
        uint64 version;          // Aptos blockchain version
        bytes32 stateRoot;       // State tree root hash
        bytes32 accumulator;     // Transaction accumulator root
        uint64 timestamp;        // Block timestamp
        uint64 epoch;            // Current epoch
    }

    /// @notice Batch update data structure
    struct BatchUpdate {
        uint64[] versions;
        bytes32[] stateRoots;
        bytes32[] accumulators;
        uint64[] timestamps;
        uint64 targetEpoch;
    }

    /// @notice Current trusted state
    TrustedState public trustedState;

    /// @notice Current epoch
    uint64 public currentEpoch;

    /// @notice Groth16 verifier contract
    Groth16Verifier public immutable verifier;

    /// @notice Validator set hash for each epoch
    mapping(uint64 => bytes32) public epochValidatorHash;

    /// @notice Quorum voting power for each epoch
    mapping(uint64 => uint128) public epochQuorumVotingPower;

    /// @notice Owner/admin address
    address public owner;

    /// @notice Whether contract is initialized
    bool public initialized;

    /// @notice Batch processing enabled
    bool public batchingEnabled;

    /// @notice Minimum batch size for gas efficiency
    uint256 public minBatchSize = 10;

    // Events
    event StateUpdated(
        uint64 indexed version,
        bytes32 stateRoot,
        bytes32 accumulator,
        uint64 epoch,
        uint64 timestamp
    );

    event BatchStateUpdated(
        uint64 indexed startVersion,
        uint64 indexed endVersion,
        uint256 batchSize,
        uint64 epoch
    );

    event EpochChanged(
        uint64 indexed oldEpoch,
        uint64 indexed newEpoch,
        bytes32 validatorHash
    );

    event Initialized(
        uint64 version,
        uint64 epoch,
        bytes32 stateRoot
    );

    event BatchingToggled(bool enabled);

    // Errors
    error AlreadyInitialized();
    error NotInitialized();
    error Unauthorized();
    error InvalidProof();
    error StaleUpdate();
    error InvalidEpoch();
    error BatchTooSmall();
    error InvalidBatchSize();
    error InconsistentBatchData();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenInitialized() {
        if (!initialized) revert NotInitialized();
        _;
    }

    constructor(address _verifier) {
        owner = msg.sender;
        verifier = Groth16Verifier(_verifier);
        batchingEnabled = true;
    }

    /**
     * @notice Initialize light client with a trusted waypoint
     * @param version Initial Aptos version
     * @param stateRoot Initial state root hash
     * @param accumulator Initial transaction accumulator root
     * @param timestamp Initial timestamp
     * @param epoch Initial epoch
     * @param validatorHash Hash of validator set
     * @param quorumVotingPower Required voting power for quorum (2f+1)
     */
    function initialize(
        uint64 version,
        bytes32 stateRoot,
        bytes32 accumulator,
        uint64 timestamp,
        uint64 epoch,
        bytes32 validatorHash,
        uint128 quorumVotingPower
    ) external onlyOwner {
        if (initialized) revert AlreadyInitialized();

        trustedState = TrustedState({
            version: version,
            stateRoot: stateRoot,
            accumulator: accumulator,
            timestamp: timestamp,
            epoch: epoch
        });

        currentEpoch = epoch;
        epochValidatorHash[epoch] = validatorHash;
        epochQuorumVotingPower[epoch] = quorumVotingPower;

        initialized = true;

        emit Initialized(version, epoch, stateRoot);
    }

    /**
     * @notice Update trusted state with a ZK proof of BLS signature verification
     * @param proof Groth16 proof (8 uint256 values: [a.x, a.y, b.x[0], b.x[1], b.y[0], b.y[1], c.x, c.y])
     * @param newVersion New Aptos version
     * @param newStateRoot New state root
     * @param newAccumulator New accumulator root
     * @param newTimestamp New timestamp
     * @param newEpoch New epoch
     * @param messageHash Hash of LedgerInfo that was signed
     * @param validatorSetHash Hash of validator set (proves we used correct validators)
     *
     * @dev The ZK proof attests to:
     *      - BLS signatures were correctly verified off-chain
     *      - Signatures were from validators in the specified set
     *      - Quorum voting power threshold was met
     *      - Message hash matches the LedgerInfo
     */
    function updateStateWithZKProof(
        uint256[8] calldata proof,
        uint64 newVersion,
        bytes32 newStateRoot,
        bytes32 newAccumulator,
        uint64 newTimestamp,
        uint64 newEpoch,
        bytes32 messageHash,
        bytes32 validatorSetHash
    ) external whenInitialized {
        // 1. Check not stale
        if (newVersion <= trustedState.version) revert StaleUpdate();

        // 2. Verify we're using the correct validator set
        if (validatorSetHash != epochValidatorHash[newEpoch]) {
            revert InvalidProof();
        }

        // 3. Handle epoch change if needed
        if (newEpoch > currentEpoch) {
            // In production, would verify epoch change proof
            // For now, simplified
            if (newEpoch != currentEpoch + 1) revert InvalidEpoch();
            currentEpoch = newEpoch;
            emit EpochChanged(currentEpoch - 1, currentEpoch, validatorSetHash);
        }

        // 4. Prepare public inputs for ZK verification
        // Public inputs must match circuit's public signal order
        uint256[7] memory publicInputs;
        publicInputs[0] = uint256(messageHash);
        publicInputs[1] = uint256(validatorSetHash);
        publicInputs[2] = uint256(epochQuorumVotingPower[newEpoch]);
        publicInputs[3] = uint256(bytes32(uint256(trustedState.version)));
        publicInputs[4] = uint256(trustedState.stateRoot);
        publicInputs[5] = uint256(bytes32(uint256(newVersion)));
        publicInputs[6] = uint256(newStateRoot);

        // 5. Verify the ZK proof
        bool valid = verifier.verifyProof(
            [proof[0], proof[1]], // a
            [[proof[2], proof[3]], [proof[4], proof[5]]], // b
            [proof[6], proof[7]], // c
            publicInputs
        );

        if (!valid) revert InvalidProof();

        // 6. Update trusted state
        trustedState = TrustedState({
            version: newVersion,
            stateRoot: newStateRoot,
            accumulator: newAccumulator,
            timestamp: newTimestamp,
            epoch: newEpoch
        });

        emit StateUpdated(
            newVersion,
            newStateRoot,
            newAccumulator,
            newEpoch,
            newTimestamp
        );
    }

    /**
     * @notice Update state with a batched ZK proof covering multiple updates
     * @param proof Groth16 proof
     * @param batchUpdate Batch of state updates
     * @param messageHashes Array of message hashes
     * @param validatorSetHash Hash of validator set
     *
     * @dev Batching amortizes the ~250K proof verification cost across many updates
     *      Example: 100 updates = ~4K gas per update (99% savings vs 300K native)
     */
    function updateStateWithBatchProof(
        uint256[8] calldata proof,
        BatchUpdate calldata batchUpdate,
        bytes32[] calldata messageHashes,
        bytes32 validatorSetHash
    ) external whenInitialized {
        if (!batchingEnabled) revert Unauthorized();

        uint256 batchSize = batchUpdate.versions.length;

        // 1. Validate batch
        if (batchSize < minBatchSize) revert BatchTooSmall();
        if (
            batchUpdate.stateRoots.length != batchSize ||
            batchUpdate.accumulators.length != batchSize ||
            batchUpdate.timestamps.length != batchSize ||
            messageHashes.length != batchSize
        ) revert InconsistentBatchData();

        // 2. Check not stale (first update must be newer)
        if (batchUpdate.versions[0] <= trustedState.version) revert StaleUpdate();

        // 3. Verify validator set
        if (validatorSetHash != epochValidatorHash[batchUpdate.targetEpoch]) {
            revert InvalidProof();
        }

        // 4. Prepare public inputs for batched verification
        // Hash the batch data to create a single commitment
        bytes32 batchCommitment = _hashBatchUpdate(batchUpdate, messageHashes);

        uint256[7] memory publicInputs;
        publicInputs[0] = uint256(batchCommitment);
        publicInputs[1] = uint256(validatorSetHash);
        publicInputs[2] = uint256(epochQuorumVotingPower[batchUpdate.targetEpoch]);
        publicInputs[3] = uint256(bytes32(uint256(trustedState.version)));
        publicInputs[4] = uint256(trustedState.stateRoot);
        publicInputs[5] = uint256(bytes32(uint256(batchUpdate.versions[batchSize - 1])));
        publicInputs[6] = uint256(batchUpdate.stateRoots[batchSize - 1]);

        // 5. Verify the batched ZK proof
        bool valid = verifier.verifyProof(
            [proof[0], proof[1]],
            [[proof[2], proof[3]], [proof[4], proof[5]]],
            [proof[6], proof[7]],
            publicInputs
        );

        if (!valid) revert InvalidProof();

        // 6. Update to final state in batch
        uint256 lastIdx = batchSize - 1;
        trustedState = TrustedState({
            version: batchUpdate.versions[lastIdx],
            stateRoot: batchUpdate.stateRoots[lastIdx],
            accumulator: batchUpdate.accumulators[lastIdx],
            timestamp: batchUpdate.timestamps[lastIdx],
            epoch: batchUpdate.targetEpoch
        });

        emit BatchStateUpdated(
            batchUpdate.versions[0],
            batchUpdate.versions[lastIdx],
            batchSize,
            batchUpdate.targetEpoch
        );
    }

    /**
     * @notice Register new validator set for an epoch
     * @dev Called during epoch changes
     */
    function registerEpochValidators(
        uint64 epoch,
        bytes32 validatorHash,
        uint128 quorumVotingPower
    ) external onlyOwner {
        epochValidatorHash[epoch] = validatorHash;
        epochQuorumVotingPower[epoch] = quorumVotingPower;
    }

    /**
     * @notice Toggle batching mode
     */
    function setBatchingEnabled(bool enabled) external onlyOwner {
        batchingEnabled = enabled;
        emit BatchingToggled(enabled);
    }

    /**
     * @notice Set minimum batch size
     */
    function setMinBatchSize(uint256 size) external onlyOwner {
        minBatchSize = size;
    }

    /**
     * @notice Verify an account state value against trusted state root
     * @param accountKey State key (hash of address + resource type)
     * @param stateValue The state value bytes
     * @param proof Sparse Merkle proof
     * @return True if verification succeeds
     */
    function verifyAccountState(
        bytes32 accountKey,
        bytes calldata stateValue,
        bytes calldata proof
    ) external view whenInitialized returns (bool) {
        bytes32 valueHash = sha256(stateValue);
        return MerkleVerifier.verifySparseMerkleProof(
            trustedState.stateRoot,
            accountKey,
            valueHash,
            _decodeSiblings(proof)
        );
    }

    /**
     * @notice Verify a transaction exists at a specific version
     * @param txnHash Transaction hash
     * @param version Transaction version
     * @param proof Accumulator inclusion proof
     * @return True if verification succeeds
     */
    function verifyTransaction(
        bytes32 txnHash,
        uint64 version,
        bytes calldata proof
    ) external view whenInitialized returns (bool) {
        return MerkleVerifier.verifyAccumulatorProof(
            trustedState.accumulator,
            txnHash,
            version,
            _decodeSiblings(proof)
        );
    }

    // Internal functions

    function _hashBatchUpdate(
        BatchUpdate calldata batch,
        bytes32[] calldata messageHashes
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            batch.versions,
            batch.stateRoots,
            batch.accumulators,
            batch.timestamps,
            batch.targetEpoch,
            messageHashes
        ));
    }

    function _decodeSiblings(bytes calldata proof)
        internal pure returns (bytes32[] memory)
    {
        require(proof.length % 32 == 0, "Invalid proof length");
        uint256 count = proof.length / 32;
        bytes32[] memory siblings = new bytes32[](count);

        for (uint256 i = 0; i < count; i++) {
            siblings[i] = bytes32(proof[i*32:(i+1)*32]);
        }

        return siblings;
    }

    /**
     * @notice Get current trusted state
     */
    function getTrustedState() external view returns (TrustedState memory) {
        return trustedState;
    }

    /**
     * @notice Get validator info for an epoch
     */
    function getEpochInfo(uint64 epoch) external view returns (
        bytes32 validatorHash,
        uint128 quorumVotingPower
    ) {
        return (
            epochValidatorHash[epoch],
            epochQuorumVotingPower[epoch]
        );
    }
}
