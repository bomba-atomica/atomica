// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAptosLightClient} from "../../src/aptos/IAptosLightClient.sol";

/**
 * @title MockAptosLightClient
 * @notice IAptosLightClient for LockBox unit tests. It checks no signature.
 * @dev `verifyEvent` returns `proof.contractEvent` as the event payload and `proof.version` as the
 *      version. The proof's epoch is `abi.decode(ledgerInfoWithSignatures, (uint64))`, or the
 *      latest epoch when that field is empty. Like the real client, it reverts with
 *      `StaleEpoch(epoch, latestEpoch)` for an older epoch and with `UnknownEpoch` for a later one.
 *      It never goes stale (`maxEpochAge` is the uint64 maximum).
 */
contract MockAptosLightClient is IAptosLightClient {
    uint64 public latestEpoch = 1;
    uint64 public latestEpochTimestamp;
    uint64 public maxEpochAge = type(uint64).max;
    bytes public expectedTypeTag;

    error WrongTypeTag();

    constructor(bytes memory typeTag) {
        expectedTypeTag = typeTag;
    }

    function setLatestEpoch(uint64 epoch) external {
        latestEpoch = epoch;
    }

    function epochStateHash(uint64) external pure returns (bytes32) {
        return bytes32(0);
    }

    function advanceEpoch(SignedLedgerInfo calldata) external {
        latestEpoch++;
        emit EpochAdvanced(latestEpoch, bytes32(0));
    }

    function verifyEvent(EventProof calldata proof, bytes calldata typeTag)
        external
        view
        returns (uint64 version, bytes memory eventData)
    {
        uint64 epoch = proof.ledgerInfo.ledgerInfoWithSignatures.length == 0
            ? latestEpoch
            : abi.decode(proof.ledgerInfo.ledgerInfoWithSignatures, (uint64));
        if (epoch < latestEpoch) revert StaleEpoch(epoch, latestEpoch);
        if (epoch > latestEpoch) revert UnknownEpoch(epoch);
        if (keccak256(typeTag) != keccak256(expectedTypeTag)) revert WrongTypeTag();
        return (proof.version, proof.contractEvent);
    }
}
