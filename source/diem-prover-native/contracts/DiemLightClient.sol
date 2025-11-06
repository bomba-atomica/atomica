// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./BLSVerifier.sol";
import "./MerkleVerifier.sol";

/**
 * @title AptosLightClient
 * @notice Ethereum light client for Aptos blockchain
 * @dev Maintains trusted state and verifies Aptos StateProofs
 */
contract AptosLightClient {
    using BLSVerifier for *;
    using MerkleVerifier for *;

    /// @notice Current trusted state of Aptos blockchain
    struct TrustedState {
        uint64 version;          // Aptos blockchain version
        bytes32 stateRoot;       // State tree root hash
        bytes32 accumulator;     // Transaction accumulator root
        uint64 timestamp;        // Block timestamp
        uint64 epoch;           // Current epoch
    }

    /// @notice Validator information
    struct Validator {
        bytes publicKey;        // BLS12-381 public key (96 bytes)
        uint64 votingPower;
        bytes32 aptosAddress;   // Aptos account address (32 bytes)
    }

    /// @notice Validator set for an epoch
    struct ValidatorSet {
        uint64 epoch;
        bytes32 validatorHash;   // Hash of all validators
        uint128 totalVotingPower;
        uint128 quorumVotingPower; // 2f+1
        Validator[] validators;
    }

    /// @notice Current trusted state
    TrustedState public trustedState;

    /// @notice Current epoch
    uint64 public currentEpoch;

    /// @notice Validator sets indexed by epoch
    mapping(uint64 => ValidatorSet) public epochValidators;

    /// @notice Owner/admin address
    address public owner;

    /// @notice Whether contract is initialized
    bool public initialized;

    // Events
    event StateUpdated(
        uint64 indexed version,
        bytes32 stateRoot,
        bytes32 accumulator,
        uint64 epoch,
        uint64 timestamp
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

    // Errors
    error AlreadyInitialized();
    error NotInitialized();
    error Unauthorized();
    error InvalidProof();
    error StaleUpdate();
    error InvalidEpoch();
    error InsufficientVotingPower();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenInitialized() {
        if (!initialized) revert NotInitialized();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Initialize light client with a trusted waypoint
     * @param version Initial Aptos version
     * @param stateRoot Initial state root hash
     * @param accumulator Initial transaction accumulator root
     * @param timestamp Initial timestamp
     * @param epoch Initial epoch
     * @param validators Initial validator set
     */
    function initialize(
        uint64 version,
        bytes32 stateRoot,
        bytes32 accumulator,
        uint64 timestamp,
        uint64 epoch,
        Validator[] calldata validators
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
        _setValidatorSet(epoch, validators);

        initialized = true;

        emit Initialized(version, epoch, stateRoot);
    }

    /**
     * @notice Update trusted state with a new StateProof from Aptos
     * @param ledgerInfo Encoded LedgerInfo
     * @param signatures BLS aggregate signature
     * @param signerBitmask Bitmask of validators who signed
     * @param epochChangeProof Optional proof of epoch changes
     */
    function updateState(
        bytes calldata ledgerInfo,
        bytes calldata signatures,
        uint256 signerBitmask,
        bytes calldata epochChangeProof
    ) external whenInitialized {
        // 1. Decode LedgerInfo
        (
            uint64 newVersion,
            bytes32 newStateRoot,
            bytes32 newAccumulator,
            uint64 newTimestamp,
            uint64 newEpoch,
            bytes32 nextEpochHash
        ) = _decodeLedgerInfo(ledgerInfo);

        // 2. Check not stale
        if (newVersion <= trustedState.version) revert StaleUpdate();

        // 3. Handle epoch change if needed
        if (newEpoch > currentEpoch) {
            _verifyEpochChange(
                epochChangeProof,
                newEpoch,
                nextEpochHash
            );
        }

        // 4. Verify signature on LedgerInfo
        _verifyLedgerInfoSignature(
            ledgerInfo,
            signatures,
            signerBitmask,
            newEpoch
        );

        // 5. Update trusted state
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

    /**
     * @notice Get current validator set
     */
    function getValidatorSet(uint64 epoch)
        external view returns (ValidatorSet memory)
    {
        return epochValidators[epoch];
    }

    // Internal functions

    function _setValidatorSet(
        uint64 epoch,
        Validator[] calldata validators
    ) internal {
        ValidatorSet storage vs = epochValidators[epoch];
        vs.epoch = epoch;

        uint128 totalVotingPower = 0;

        // Clear existing validators if any
        delete vs.validators;

        // Add validators
        for (uint256 i = 0; i < validators.length; i++) {
            vs.validators.push(validators[i]);
            totalVotingPower += validators[i].votingPower;
        }

        vs.totalVotingPower = totalVotingPower;
        // Quorum is 2f+1, which is (2 * totalVotingPower / 3) + 1
        vs.quorumVotingPower = (totalVotingPower * 2 / 3) + 1;
        vs.validatorHash = _hashValidatorSet(validators);
    }

    function _verifyEpochChange(
        bytes calldata epochChangeProof,
        uint64 targetEpoch,
        bytes32 nextEpochHash
    ) internal {
        // For now, simplified: trust the new validator set if provided
        // In production, would verify chain of epoch changes
        if (targetEpoch <= currentEpoch) revert InvalidEpoch();

        // Decode and set new validator set
        Validator[] memory newValidators = _decodeValidatorSet(epochChangeProof);
        _setValidatorSet(targetEpoch, newValidators);

        emit EpochChanged(currentEpoch, targetEpoch, nextEpochHash);
        currentEpoch = targetEpoch;
    }

    function _verifyLedgerInfoSignature(
        bytes calldata ledgerInfo,
        bytes calldata signature,
        uint256 signerBitmask,
        uint64 epoch
    ) internal view {
        ValidatorSet storage vs = epochValidators[epoch];

        // Compute message hash
        bytes32 messageHash = sha256(ledgerInfo);

        // Extract public keys and voting powers of signers
        (bytes[] memory pubKeys, uint64[] memory votingPowers) =
            _extractSignerInfo(vs, signerBitmask);

        // Verify BLS aggregate signature
        bool valid = BLSVerifier.verifyAggregateSignature(
            messageHash,
            signature,
            pubKeys,
            signerBitmask,
            votingPowers,
            vs.quorumVotingPower
        );

        if (!valid) revert InvalidProof();
    }

    function _extractSignerInfo(
        ValidatorSet storage vs,
        uint256 signerBitmask
    ) internal view returns (
        bytes[] memory pubKeys,
        uint64[] memory votingPowers
    ) {
        uint256 signerCount = 0;
        for (uint256 i = 0; i < vs.validators.length; i++) {
            if ((signerBitmask & (1 << i)) != 0) {
                signerCount++;
            }
        }

        pubKeys = new bytes[](signerCount);
        votingPowers = new uint64[](signerCount);

        uint256 idx = 0;
        for (uint256 i = 0; i < vs.validators.length; i++) {
            if ((signerBitmask & (1 << i)) != 0) {
                pubKeys[idx] = vs.validators[i].publicKey;
                votingPowers[idx] = vs.validators[i].votingPower;
                idx++;
            }
        }
    }

    function _decodeLedgerInfo(bytes calldata data)
        internal pure returns (
            uint64 version,
            bytes32 stateRoot,
            bytes32 accumulator,
            uint64 timestamp,
            uint64 epoch,
            bytes32 nextEpochHash
        )
    {
        // Simplified decoding - in production would use BCS deserialization
        require(data.length >= 160, "Invalid ledger info");

        version = uint64(bytes8(data[0:8]));
        epoch = uint64(bytes8(data[8:16]));
        accumulator = bytes32(data[16:48]);
        stateRoot = bytes32(data[48:80]);
        timestamp = uint64(bytes8(data[80:88]));
        nextEpochHash = bytes32(data[88:120]);
    }

    function _decodeValidatorSet(bytes calldata data)
        internal pure returns (Validator[] memory)
    {
        // Simplified - would need proper BCS decoding
        uint256 count = uint256(bytes32(data[0:32]));
        Validator[] memory validators = new Validator[](count);

        uint256 offset = 32;
        for (uint256 i = 0; i < count; i++) {
            uint256 pkLen = uint256(bytes32(data[offset:offset+32]));
            offset += 32;

            validators[i].publicKey = data[offset:offset+pkLen];
            offset += pkLen;

            validators[i].votingPower = uint64(bytes8(data[offset:offset+8]));
            offset += 8;

            validators[i].aptosAddress = bytes32(data[offset:offset+32]);
            offset += 32;
        }

        return validators;
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

    function _hashValidatorSet(Validator[] calldata validators)
        internal pure returns (bytes32)
    {
        bytes memory data;
        for (uint256 i = 0; i < validators.length; i++) {
            data = abi.encodePacked(
                data,
                validators[i].publicKey,
                validators[i].votingPower,
                validators[i].aptosAddress
            );
        }
        return sha256(data);
    }
}
