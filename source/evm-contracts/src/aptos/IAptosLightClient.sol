// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAptosLightClient
 * @notice Proves to Ethereum that an Aptos event is final. Trusts only the genesis waypoint and
 *         the 2/3 voting-power quorum of each Aptos epoch's validator set. No admin, relayer or
 *         upgrade key: anyone may advance epochs and anyone may verify an event.
 * @dev Byte fields are the hex BCS that an Atomica node serves at
 *      `/v1/atomica/event_proof/{version}/{event_index}` and `/v1/atomica/epoch_change_proof`.
 *      Keys and the signature also come uncompressed, because the EVM cannot decompress points.
 */
interface IAptosLightClient {
    /// @notice A LedgerInfo signed by the validator set of its epoch.
    struct SignedLedgerInfo {
        /// BCS of the `LedgerInfoWithSignatures`.
        bytes ledgerInfoWithSignatures;
        /// BCS of the `EpochState` of the LedgerInfo's epoch (the full validator set).
        bytes epochState;
        /// EIP-2537 uncompressed G1 key (128 bytes) of each signer, in bitmask order.
        bytes signerPublicKeys;
        /// EIP-2537 uncompressed G2 aggregate signature (256 bytes).
        bytes signature;
    }

    /// @notice A proof that an event was emitted by a successful transaction under a signed LedgerInfo.
    struct EventProof {
        SignedLedgerInfo ledgerInfo;
        /// Ledger version of the transaction.
        uint64 version;
        /// BCS of the `TransactionInfo` at `version`.
        bytes transactionInfo;
        /// BCS of the `TransactionAccumulatorProof` from the TransactionInfo to `executed_state_id`.
        bytes transactionAccumulatorProof;
        /// Index of the event within the transaction.
        uint64 eventIndex;
        /// BCS of the `ContractEvent`.
        bytes contractEvent;
        /// BCS of the `EventAccumulatorProof` from the event to the TransactionInfo's `event_root_hash`.
        bytes eventAccumulatorProof;
    }

    /// @notice The validator set of `epoch` is now known.
    event EpochAdvanced(uint64 indexed epoch, bytes32 epochStateHash);

    /// @notice The waypoint does not match the genesis LedgerInfo.
    error WaypointMismatch();
    /// @notice The LedgerInfo does not end an epoch (it has no next_epoch_state).
    error NotEpochEnding();
    /// @notice The next epoch state is not for the epoch after the LedgerInfo's epoch.
    error BadNextEpoch(uint64 epoch, uint64 nextEpoch);
    /// @notice No validator set is known for this epoch.
    error UnknownEpoch(uint64 epoch);
    /// @notice The LedgerInfo was signed by a retired validator set. Only the latest epoch verifies events.
    error StaleEpoch(uint64 epoch, uint64 latestEpoch);
    /// @notice This epoch change was already applied.
    error EpochAlreadyAdvanced(uint64 epoch);
    /// @notice The validator set in calldata does not hash to the stored set of the LedgerInfo's epoch.
    error ValidatorSetMismatch();
    /// @notice The signer bitmask has the wrong length or names a validator outside the set.
    error InvalidBitmask();
    /// @notice The signers hold less than the Aptos quorum (total * 2 / 3 + 1) of voting power.
    error InsufficientVotingPower(uint256 signed, uint256 quorum);
    /// @notice The LedgerInfo carries no aggregate signature.
    error MissingSignature();
    /// @notice The transaction version is above the LedgerInfo's version.
    error VersionAfterLedgerInfo(uint64 version, uint64 ledgerVersion);

    /// @notice The last epoch whose validator set is known.
    function latestEpoch() external view returns (uint64);

    /// @notice keccak256 of the BCS EpochState for `epoch`, or zero if unknown.
    function epochStateHash(uint64 epoch) external view returns (bytes32);

    /**
     * @notice Stores the next validator set from an epoch-ending LedgerInfo signed by a quorum
     *         of the latest known epoch. Permissionless. Epochs advance one at a time.
     */
    function advanceEpoch(SignedLedgerInfo calldata ledgerInfo) external;

    /**
     * @notice Checks that an event of type `typeTag` is final on Aptos and returns it.
     * @dev The LedgerInfo must be signed in the latest known epoch (see StaleEpoch).
     * @param typeTag BCS of the expected `TypeTag`.
     * @return version Ledger version of the transaction that emitted the event.
     * @return eventData BCS of the event payload.
     */
    function verifyEvent(EventProof calldata proof, bytes calldata typeTag)
        external
        view
        returns (uint64 version, bytes memory eventData);
}
