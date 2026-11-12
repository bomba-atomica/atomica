// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAptosLightClient} from "./IAptosLightClient.sol";
import {AptosTypes} from "./AptosTypes.sol";
import {AptosHash} from "./AptosHash.sol";
import {Bls12381} from "./Bls12381.sol";
import {Bcs} from "./Bcs.sol";
import {AptosWaypoint} from "./AptosWaypoint.sol";

/**
 * @title AptosLightClient
 * @notice Verifies Aptos events on Ethereum against the Aptos validator quorum.
 * @dev Trust root: the genesis waypoint, which every Aptos node also trusts. The constructor
 *      recomputes it from the genesis LedgerInfo with the `Ledger2WaypointConverter` rules, so
 *      anyone can audit a deployment by comparing its waypoint with the chain's.
 *
 *      Rotation: `advanceEpoch` stores keccak256(BCS(next_epoch_state)) for epoch + 1 from an
 *      epoch-ending LedgerInfo signed by a quorum of the latest known epoch. There is no owner,
 *      pause or proxy.
 *
 *      Stale limit: the client stores the LedgerInfo `timestamp_usecs` (in seconds) of the epoch
 *      change that made the latest epoch known. Once `block.timestamp` passes that time plus the
 *      immutable `maxEpochAge`, both `advanceEpoch` and `verifyEvent` revert `StaleLightClient`
 *      for good. `maxEpochAge` is shorter than the Aptos stake lockup, so a validator set that
 *      has unbonded can never sign an epoch-change chain this client accepts. A dead client
 *      records no outcome, so every LockBox lock goes home by `reclaim` after its deadline.
 *      Carriers keep the client fresh by calling `advanceEpoch` at each epoch change.
 *      Aptos genesis LedgerInfos carry timestamp 0, so the constructor anchors the genesis epoch
 *      at `block.timestamp`: the genesis waypoint pinned at deploy is the trust root.
 *
 *      Freshness: verifyEvent accepts only a LedgerInfo signed by the latest known epoch's set.
 *      A retired set is no longer bonded, so its quorum could sign a fake outcome at no cost.
 *      After an epoch change a carrier fetches a new proof; the node always serves the latest
 *      LedgerInfo. Old epoch hashes stay readable but no longer verify events.
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
    /// @inheritdoc IAptosLightClient
    uint64 public latestEpochTimestamp;
    /// @inheritdoc IAptosLightClient
    uint64 public immutable maxEpochAge;

    /**
     * @param genesisLedgerInfoWithSignatures BCS of the genesis epoch-ending LedgerInfoWithSignatures.
     * @param waypointVersion The genesis waypoint version.
     * @param waypointHash The genesis waypoint hash.
     * @param _maxEpochAge Seconds after the latest epoch change at which the client goes stale.
     *        Must be shorter than the Aptos validator stake lockup.
     */
    constructor(
        bytes memory genesisLedgerInfoWithSignatures,
        uint64 waypointVersion,
        bytes32 waypointHash,
        uint64 _maxEpochAge
    ) {
        if (_maxEpochAge == 0) revert ZeroMaxEpochAge();
        maxEpochAge = _maxEpochAge;
        bytes memory b = genesisLedgerInfoWithSignatures;
        AptosTypes.LedgerInfo memory li = AptosTypes.parseLedgerInfoWithSignatures(b);
        if (!li.hasNextEpochState) revert NotEpochEnding();
        (uint64 version, bytes32 hash) = AptosWaypoint.compute(b, li);
        if (version != waypointVersion || hash != waypointHash) revert WaypointMismatch();
        _storeNextEpoch(b, li);
        // Aptos genesis carries timestamp 0: anchor the genesis epoch at deploy time.
        if (li.timestampUsecs == 0) latestEpochTimestamp = uint64(block.timestamp);
    }

    /// @inheritdoc IAptosLightClient
    function advanceEpoch(SignedLedgerInfo calldata ledgerInfo) external {
        _requireFresh();
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
        _requireFresh();
        bytes memory b = proof.ledgerInfo.ledgerInfoWithSignatures;
        AptosTypes.LedgerInfo memory li = AptosTypes.parseLedgerInfoWithSignatures(b);
        if (li.epoch > latestEpoch) revert UnknownEpoch(li.epoch);
        if (li.epoch < latestEpoch) revert StaleEpoch(li.epoch, latestEpoch);
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

    /// @dev Reverts `StaleLightClient` once `maxEpochAge` has passed since the latest epoch change.
    function _requireFresh() private view {
        uint64 at = latestEpochTimestamp;
        if (block.timestamp > uint256(at) + maxEpochAge) {
            revert StaleLightClient(latestEpoch, block.timestamp - at);
        }
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

    /// @dev Stores the hash of `next_epoch_state` for epoch + 1 and the LedgerInfo time in seconds.
    function _storeNextEpoch(bytes memory b, AptosTypes.LedgerInfo memory li) private {
        uint64 next = AptosTypes.epochStateEpoch(b, li.nextEpochStateStart);
        if (next != li.epoch + 1) revert BadNextEpoch(li.epoch, next);
        bytes32 h = Bcs.keccakRange(b, li.nextEpochStateStart, li.nextEpochStateLen);
        epochStateHash[next] = h;
        latestEpoch = next;
        latestEpochTimestamp = uint64(li.timestampUsecs / 1_000_000);
        emit EpochAdvanced(next, h);
    }
}
