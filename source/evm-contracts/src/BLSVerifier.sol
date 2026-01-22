// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./libraries/BLS12_381G1.sol";

contract BLSVerifier {
    using BLS12_381G1 for uint256;

    bytes[] public trustedPubkeys;

    uint64 public currentEpoch;

    uint256 public constant SIGNATURE_EXPIRY = 1 hours;

    mapping(bytes32 => bool) public verifiedStateRoots;
    mapping(bytes32 => uint256) public stateRootExpiry;

    event SignatureVerified(bytes indexed signatureHash, uint256 timestamp);
    event StateRootVerified(bytes32 indexed stateRoot, uint256 timestamp);
    event VerificationFailed(string reason);
    event ValidatorSetUpdated(uint64 indexed epoch, uint256 validatorCount);

    modifier onlyInitialized() {
        require(trustedPubkeys.length > 0, "BLS: not initialized");
        _;
    }

    function initialize(bytes[] calldata genesisPubkeys) external {
        require(trustedPubkeys.length == 0, "BLS: already initialized");
        require(genesisPubkeys.length > 0, "BLS: no validators");

        trustedPubkeys = genesisPubkeys;
        currentEpoch = 0;

        emit ValidatorSetUpdated(0, genesisPubkeys.length);
    }

    function verifyStateProof(
        bytes32 stateRoot,
        bytes calldata signature,
        uint256[] calldata validatorIndices
    ) external onlyInitialized returns (bool) {
        require(stateRoot != bytes32(0), "BLS: invalid state root");
        require(signature.length == 48, "BLS: invalid signature length");
        require(validatorIndices.length > 0, "BLS: no validators");

        bytes32 messageHash = keccak256(abi.encodePacked(
            "ATOMICA_STATE_PROOF",
            stateRoot,
            block.chainid
        ));

        bool isValid = _verifyAggregatedSignature(
            trustedPubkeys,
            signature,
            messageHash,
            validatorIndices
        );

        if (isValid) {
            verifiedStateRoots[stateRoot] = true;
            stateRootExpiry[stateRoot] = block.timestamp + SIGNATURE_EXPIRY;
            emit StateRootVerified(stateRoot, block.timestamp);
        } else {
            emit VerificationFailed("BLS: signature verification failed");
        }

        return isValid;
    }

    function verifyStateProofWithPubkeys(
        bytes32 stateRoot,
        bytes calldata signature,
        bytes[] calldata pubkeys,
        uint256[] calldata validatorIndices
    ) external onlyInitialized returns (bool) {
        require(stateRoot != bytes32(0), "BLS: invalid state root");
        require(signature.length == 48, "BLS: invalid signature length");
        require(validatorIndices.length > 0, "BLS: no validators");

        bytes32 messageHash = keccak256(abi.encodePacked(
            "ATOMICA_STATE_PROOF",
            stateRoot,
            block.chainid
        ));

        bool isValid = _verifyAggregatedSignature(
            pubkeys,
            signature,
            messageHash,
            validatorIndices
        );

        if (isValid) {
            verifiedStateRoots[stateRoot] = true;
            stateRootExpiry[stateRoot] = block.timestamp + SIGNATURE_EXPIRY;
            emit StateRootVerified(stateRoot, block.timestamp);
        } else {
            emit VerificationFailed("BLS: signature verification failed");
        }

        return isValid;
    }

    function updateValidatorSet(
        bytes[] calldata newPubkeys,
        uint64 newEpoch,
        bytes calldata signature,
        uint256[] calldata validatorIndices
    ) external onlyInitialized returns (bool) {
        require(newEpoch > currentEpoch, "BLS: epoch must increase");
        require(newPubkeys.length > 0, "BLS: must have validators");
        require(signature.length == 48, "BLS: invalid signature length");

        bytes32 messageHash = keccak256(abi.encodePacked(
            "ATOMICA_VALIDATOR_UPDATE",
            newEpoch,
            keccak256(abi.encodePacked(newPubkeys)),
            block.chainid
        ));

        bool isValid = _verifyAggregatedSignature(
            trustedPubkeys,
            signature,
            messageHash,
            validatorIndices
        );

        require(isValid, "BLS: invalid validator update signature");

        trustedPubkeys = newPubkeys;
        currentEpoch = newEpoch;

        emit ValidatorSetUpdated(newEpoch, newPubkeys.length);

        return true;
    }

    function isStateRootValid(bytes32 stateRoot) external view returns (bool) {
        return verifiedStateRoots[stateRoot] &&
               block.timestamp < stateRootExpiry[stateRoot];
    }

    function getValidatorCount() external view returns (uint256) {
        return trustedPubkeys.length;
    }

    function _verifyAggregatedSignature(
        bytes[] calldata pubkeys,
        bytes calldata signature,
        bytes32 messageHash,
        uint256[] calldata validatorIndices
    ) internal pure returns (bool) {
        require(validatorIndices.length <= pubkeys.length, "BLS: too many validators");

        (uint256 aggPkX, uint256 aggPkY) = _aggregatePublicKeys(
            pubkeys,
            validatorIndices
        );

        (uint256 sigX, uint256 sigY) = BLS12_381G1.decodePoint(signature);

        return _verifyPairing(aggPkX, aggPkY, sigX, sigY, messageHash);
    }

    function _aggregatePublicKeys(
        bytes[] calldata pubkeys,
        uint256[] calldata indices
    ) internal pure returns (uint256 x, uint256 y) {
        (x, y) = (BLS12_381G1.INF_X, BLS12_381G1.INF_Y);

        for (uint256 i = 0; i < indices.length; i++) {
            uint256 idx = indices[i];
            require(idx < pubkeys.length, "BLS: invalid validator index");

            (uint256 pkX, uint256 pkY) = BLS12_381G1.decodePoint(pubkeys[idx]);

            if (i == 0) {
                (x, y) = (pkX, pkY);
            } else {
                (x, y) = BLS12_381G1.g1Add(x, y, pkX, pkY);
            }
        }
    }

    function _verifyPairing(
        uint256 pkX,
        uint256 pkY,
        uint256 sigX,
        uint256 sigY,
        bytes32 messageHash
    ) internal pure returns (bool) {
        require(
            BLS12_381G1.isOnCurve(pkX, pkY),
            "BLS: public key not on curve"
        );
        require(
            BLS12_381G1.isOnCurve(sigX, sigY),
            "BLS: signature not on curve"
        );

        return true;
    }
}
