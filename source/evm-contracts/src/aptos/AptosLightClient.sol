// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAptosLightClient} from "./IAptosLightClient.sol";
import {AptosTypes} from "./AptosTypes.sol";
import {AptosHash} from "./AptosHash.sol";
import {Bls12381} from "./Bls12381.sol";
import {Bcs} from "./Bcs.sol";
import {Sha3_256} from "./Sha3_256.sol";

/**
 * @title AptosLightClient
 * @notice Verifies Aptos events on Ethereum against the Aptos validator quorum.
 * @dev Trust root: the genesis waypoint, which every Aptos node also trusts. The constructor
 *      recomputes it from the genesis LedgerInfo with the `Ledger2WaypointConverter` rules, so
 *      anyone can audit a deployment by comparing its waypoint with the chain's.
 *
 *      Rotation: `advanceEpoch` stores keccak256(BCS(next_epoch_state)) for epoch + 1 from an
 *      epoch-ending LedgerInfo signed by a quorum of the latest known epoch. Old epochs stay, so a
 *      proof signed in any known epoch verifies forever. There is no owner, pause, proxy or expiry.
 *
 *      Signature check (Aptos `ValidatorVerifier::verify_multi_signatures`):
 *      1. The validator set in calldata hashes to the stored hash of the LedgerInfo's epoch.
 *      2. The bitmask has ceil(n / 8) bytes, names no validator past n, and the signers hold at
 *         least total * 2 / 3 + 1 voting power (strictly more than two thirds).
 *      3. Each signer's uncompressed key matches its compressed key in the set. G1ADD sums them.
 *      4. The message, LedgerInfo seed || BCS(LedgerInfo), is hashed to G2 (RFC 9380).
 *      5. One PAIRING call checks e(aggregate key, H(m)) == e(G1, signature).
 */
contract AptosLightClient is IAptosLightClient {
    /// @inheritdoc IAptosLightClient
    mapping(uint64 => bytes32) public epochStateHash;
    /// @inheritdoc IAptosLightClient
    uint64 public latestEpoch;

    /**
     * @param genesisLedgerInfoWithSignatures BCS of the genesis epoch-ending LedgerInfoWithSignatures.
     * @param waypointVersion The genesis waypoint version.
     * @param waypointHash The genesis waypoint hash.
     */
    constructor(bytes memory genesisLedgerInfoWithSignatures, uint64 waypointVersion, bytes32 waypointHash) {
        bytes memory b = genesisLedgerInfoWithSignatures;
        AptosTypes.LedgerInfo memory li = AptosTypes.parseLedgerInfoWithSignatures(b);
        if (!li.hasNextEpochState) revert NotEpochEnding();
        // Ledger2WaypointConverter BCS = epoch || executed_state_id || version || timestamp_usecs
        // || Some(next_epoch_state). In the LedgerInfo these are bytes [1, 9) and
        // [49, end of next_epoch_state), with round and id between them.
        uint256 tail = AptosTypes.EXECUTED_STATE_ID_OFFSET;
        uint256 end = li.nextEpochStateStart + li.nextEpochStateLen;
        bytes memory converter = abi.encodePacked(
            AptosHash.WAYPOINT_SEED, Bcs.slice(b, AptosTypes.EPOCH_OFFSET, 8), Bcs.slice(b, tail, end - tail)
        );
        if (li.version != waypointVersion || Sha3_256.hash(converter) != waypointHash) revert WaypointMismatch();
        _storeNextEpoch(b, li);
    }

    /// @inheritdoc IAptosLightClient
    function advanceEpoch(SignedLedgerInfo calldata ledgerInfo) external {
        bytes memory b = ledgerInfo.ledgerInfoWithSignatures;
        AptosTypes.LedgerInfo memory li = AptosTypes.parseLedgerInfoWithSignatures(b);
        if (li.epoch < latestEpoch) revert EpochAlreadyAdvanced(li.epoch);
        if (li.epoch > latestEpoch) revert UnknownEpoch(li.epoch);
        if (!li.hasNextEpochState) revert NotEpochEnding();
        _verifyQuorum(b, li, ledgerInfo);
        _storeNextEpoch(b, li);
    }

    /// @inheritdoc IAptosLightClient
    function verifyEvent(EventProof calldata proof, bytes calldata typeTag)
        external
        view
        returns (uint64 version, bytes memory eventData)
    {
        bytes memory b = proof.ledgerInfo.ledgerInfoWithSignatures;
        AptosTypes.LedgerInfo memory li = AptosTypes.parseLedgerInfoWithSignatures(b);
        _verifyQuorum(b, li, proof.ledgerInfo);

        // 6. The TransactionInfo is in the ledger accumulator and succeeded.
        version = proof.version;
        if (version > li.version) revert VersionAfterLedgerInfo(version, li.version);
        bytes memory txnInfo = proof.transactionInfo;
        AptosHash.verifyAccumulator(
            AptosHash.TRANSACTION_ACCUMULATOR_SEED,
            li.executedStateId,
            AptosHash.hashWithSeed(AptosHash.TRANSACTION_INFO_SEED, txnInfo),
            version,
            AptosTypes.accumulatorSiblings(proof.transactionAccumulatorProof)
        );
        bytes32 eventRoot = AptosTypes.transactionEventRoot(txnInfo);

        // 7. The event is in the transaction's event accumulator and has the expected type.
        bytes memory evt = proof.contractEvent;
        AptosHash.verifyAccumulator(
            AptosHash.EVENT_ACCUMULATOR_SEED,
            eventRoot,
            AptosHash.hashWithSeed(AptosHash.CONTRACT_EVENT_SEED, evt),
            proof.eventIndex,
            AptosTypes.accumulatorSiblings(proof.eventAccumulatorProof)
        );
        eventData = AptosTypes.eventData(evt, typeTag);
    }

    /// @dev Steps 1 to 5 of the contract comment. Reverts unless a quorum of the LedgerInfo's
    ///      epoch signed it.
    function _verifyQuorum(bytes memory b, AptosTypes.LedgerInfo memory li, SignedLedgerInfo calldata signed)
        private
        view
    {
        // 1. The validator set.
        bytes32 stored = epochStateHash[li.epoch];
        if (stored == bytes32(0)) revert UnknownEpoch(li.epoch);
        bytes memory es = signed.epochState;
        if (keccak256(es) != stored) revert ValidatorSetMismatch();
        AptosTypes.ValidatorSet memory set = AptosTypes.parseEpochState(es);

        // 2. The bitmask and the quorum. Bit i is bit (7 - i % 8) of byte i / 8.
        uint256 n = set.keyOffsets.length;
        if (li.bitmaskLen != (n + 7) / 8) revert InvalidBitmask();
        uint256 signers;
        uint256 power;
        for (uint256 i = 0; i < li.bitmaskLen * 8; i++) {
            if (uint8(b[li.bitmaskStart + i / 8]) & (0x80 >> (i % 8)) != 0) {
                if (i >= n) revert InvalidBitmask();
                signers++;
                power += set.votingPowers[i];
            }
        }
        uint256 quorum = n == 0 ? 0 : set.totalVotingPower * 2 / 3 + 1;
        if (power < quorum) revert InsufficientVotingPower(power, quorum);

        // 3. The signers' compressed keys, in bitmask order, for the encoding check.
        bytes memory compressedKeys = new bytes(signers * 48);
        uint256 k;
        for (uint256 i = 0; i < n; i++) {
            if (uint8(b[li.bitmaskStart + i / 8]) & (0x80 >> (i % 8)) != 0) {
                uint256 src = set.keyOffsets[i];
                assembly ("memory-safe") {
                    mcopy(add(add(compressedKeys, 0x20), mul(k, 48)), add(add(es, 0x20), src), 48)
                }
                k++;
            }
        }

        // 3 to 5. Keys, hash to G2 and the pairing.
        if (!li.hasSignature) revert MissingSignature();
        bytes memory message =
            abi.encodePacked(AptosHash.LEDGER_INFO_SEED, Bcs.slice(b, li.ledgerInfoStart, li.ledgerInfoLen));
        Bls12381.verifyAggregate(
            compressedKeys, signed.signerPublicKeys, message, Bcs.slice(b, li.signatureStart, 96), signed.signature
        );
    }

    /// @dev Stores the hash of `next_epoch_state` for epoch + 1.
    function _storeNextEpoch(bytes memory b, AptosTypes.LedgerInfo memory li) private {
        uint64 next = AptosTypes.epochStateEpoch(b, li.nextEpochStateStart);
        if (next != li.epoch + 1) revert BadNextEpoch(li.epoch, next);
        bytes32 h = Bcs.keccakRange(b, li.nextEpochStateStart, li.nextEpochStateLen);
        epochStateHash[next] = h;
        latestEpoch = next;
        emit EpochAdvanced(next, h);
    }
}
