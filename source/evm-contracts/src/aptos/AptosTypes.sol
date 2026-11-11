// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Bcs} from "./Bcs.sol";

/**
 * @title AptosTypes
 * @notice Parsers for the BCS of the aptos-types structs that an Aptos outcome proof carries.
 * @dev Layouts follow aptos-types at the atomica-aptos commit pinned in
 *      test/fixtures/aptos/aptos_outcome_proof_vectors.json:
 *
 *      LedgerInfoWithSignatures = enum { V0(LedgerInfo, AggregateSignature) }
 *      LedgerInfo = { commit_info: BlockInfo, consensus_data_hash: HashValue }
 *      BlockInfo = { epoch: u64, round: u64, id: HashValue, executed_state_id: HashValue,
 *                    version: u64, timestamp_usecs: u64, next_epoch_state: Option<EpochState> }
 *      EpochState = { epoch: u64, verifier: ValidatorVerifier { validator_infos: Vec<ValidatorConsensusInfo> } }
 *      ValidatorConsensusInfo = { address: [u8; 32], public_key: bytes (48), voting_power: u64 }
 *      AggregateSignature = { validator_bitmask: BitVec (bytes), sig: Option<bytes (96)> }
 *      TransactionInfo = enum { V0 { gas_used: u64, status: ExecutionStatus, transaction_hash,
 *                    event_root_hash, state_change_hash: HashValue, state_checkpoint_hash: Option<HashValue>,
 *                    auxiliary_info_hash: Option<HashValue> } }
 *      ContractEvent = enum { V1(..), V2 { type_tag: TypeTag, event_data: bytes } }
 *
 *      A HashValue is 32 raw bytes. Offsets returned here index into the parsed buffer.
 */
library AptosTypes {
    using Bcs for bytes;

    /// @notice An enum variant this verifier does not accept.
    error UnsupportedVariant(uint8 variant);
    /// @notice A BLS public key in a validator set was not 48 bytes.
    error BadPublicKeyLength();
    /// @notice A signature in a LedgerInfoWithSignatures was not 96 bytes.
    error BadSignatureLength();
    /// @notice The transaction did not succeed.
    error TransactionFailed();
    /// @notice The event is not a V2 event of the expected type.
    error UnexpectedEventType();

    struct LedgerInfo {
        uint64 epoch;
        bytes32 executedStateId;
        uint64 version;
        // BCS of the LedgerInfo inside the LedgerInfoWithSignatures (the signed part).
        uint256 ledgerInfoStart;
        uint256 ledgerInfoLen;
        bool hasNextEpochState;
        uint256 nextEpochStateStart;
        uint256 nextEpochStateLen;
        uint256 bitmaskStart;
        uint256 bitmaskLen;
        bool hasSignature;
        uint256 signatureStart;
    }

    struct ValidatorSet {
        uint64 epoch;
        // Offset of each validator's 48-byte compressed key in the EpochState buffer.
        uint256[] keyOffsets;
        uint64[] votingPowers;
        uint256 totalVotingPower;
    }

    /// Offsets inside a LedgerInfoWithSignatures (after the 1-byte variant).
    uint256 internal constant LI_START = 1;
    uint256 internal constant EPOCH_OFFSET = 1;
    uint256 internal constant EXECUTED_STATE_ID_OFFSET = 49;
    uint256 internal constant VERSION_OFFSET = 81;
    uint256 internal constant NEXT_EPOCH_STATE_TAG_OFFSET = 97;

    /// @notice Parses the BCS of a LedgerInfoWithSignatures. The whole buffer must be consumed.
    function parseLedgerInfoWithSignatures(bytes memory b) internal pure returns (LedgerInfo memory li) {
        (uint8 variant, uint256 off) = b.readU8(0);
        if (variant != 0) revert UnsupportedVariant(variant);
        li.ledgerInfoStart = off;
        (li.epoch, off) = b.readU64(off);
        off += 8 + 32; // round, id
        (li.executedStateId, off) = b.readBytes32(off);
        (li.version, off) = b.readU64(off);
        off += 8; // timestamp_usecs
        (li.hasNextEpochState, off) = b.readOptionTag(off);
        if (li.hasNextEpochState) {
            li.nextEpochStateStart = off;
            off = _skipEpochState(b, off);
            li.nextEpochStateLen = off - li.nextEpochStateStart;
        }
        (, off) = b.readBytes32(off); // consensus_data_hash
        li.ledgerInfoLen = off - li.ledgerInfoStart;
        (li.bitmaskStart, li.bitmaskLen, off) = b.readBytesRange(off);
        (li.hasSignature, off) = b.readOptionTag(off);
        if (li.hasSignature) {
            uint256 len;
            (li.signatureStart, len, off) = b.readBytesRange(off);
            if (len != 96) revert BadSignatureLength();
        }
        b.requireEnd(off);
    }

    /// @notice Parses the BCS of an EpochState. The whole buffer must be consumed.
    function parseEpochState(bytes memory b) internal pure returns (ValidatorSet memory set) {
        uint256 off;
        (set.epoch, off) = b.readU64(0);
        uint256 n;
        (n, off) = b.readLength(off);
        set.keyOffsets = new uint256[](n);
        set.votingPowers = new uint64[](n);
        for (uint256 i = 0; i < n; i++) {
            off += 32; // address
            uint256 len;
            (set.keyOffsets[i], len, off) = b.readBytesRange(off);
            if (len != 48) revert BadPublicKeyLength();
            (set.votingPowers[i], off) = b.readU64(off);
            set.totalVotingPower += set.votingPowers[i];
        }
        b.requireEnd(off);
    }

    /// @notice Reads the epoch field of an EpochState that starts at `off`.
    function epochStateEpoch(bytes memory b, uint256 off) internal pure returns (uint64 epoch) {
        (epoch,) = b.readU64(off);
    }

    /**
     * @notice Parses the BCS of a TransactionInfo and returns its event root hash.
     * @dev Reverts with TransactionFailed unless the status is Success.
     */
    function transactionEventRoot(bytes memory b) internal pure returns (bytes32 eventRootHash) {
        (uint8 variant, uint256 off) = b.readU8(0);
        if (variant != 0) revert UnsupportedVariant(variant);
        off += 8; // gas_used
        uint8 status;
        (status, off) = b.readU8(off);
        // ExecutionStatus::Success is variant 0 and carries no data.
        if (status != 0) revert TransactionFailed();
        off += 32; // transaction_hash
        (eventRootHash, off) = b.readBytes32(off);
        off += 32; // state_change_hash
        bool some;
        (some, off) = b.readOptionTag(off);
        if (some) off += 32;
        (some, off) = b.readOptionTag(off);
        if (some) off += 32;
        b.requireEnd(off);
    }

    /**
     * @notice Parses the BCS of a ContractEvent and returns its data.
     * @dev Reverts with UnexpectedEventType unless it is a V2 event whose type tag BCS equals `typeTag`.
     */
    function eventData(bytes memory b, bytes memory typeTag) internal pure returns (bytes memory data) {
        if (b.length == 0 || uint8(b[0]) != 1 || !b.rangeEquals(1, typeTag)) revert UnexpectedEventType();
        (uint256 start, uint256 len, uint256 off) = b.readBytesRange(1 + typeTag.length);
        b.requireEnd(off);
        data = b.slice(start, len);
    }

    /// @notice Parses the BCS of an AccumulatorProof: a vector of sibling hashes, leaf level first.
    function accumulatorSiblings(bytes memory b) internal pure returns (bytes32[] memory siblings) {
        (uint256 n, uint256 off) = b.readLength(0);
        siblings = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            (siblings[i], off) = b.readBytes32(off);
        }
        b.requireEnd(off);
    }

    function _skipEpochState(bytes memory b, uint256 off) private pure returns (uint256) {
        off += 8; // epoch
        uint256 n;
        (n, off) = b.readLength(off);
        for (uint256 i = 0; i < n; i++) {
            off += 32; // address
            uint256 len;
            (, len, off) = b.readBytesRange(off);
            if (len != 48) revert BadPublicKeyLength();
            off += 8; // voting_power
        }
        return off;
    }
}
