// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AptosTypes} from "./AptosTypes.sol";
import {AptosHash} from "./AptosHash.sol";
import {Bcs} from "./Bcs.sol";
import {Sha3_256} from "./Sha3_256.sol";

/**
 * @title AptosWaypoint
 * @notice The Aptos waypoint of an epoch-ending LedgerInfo, by the `Ledger2WaypointConverter` rules.
 * @dev Shared by the AptosLightClient constructor and the deploy script's genesis pin check.
 */
library AptosWaypoint {
    /**
     * @notice Waypoint (version, hash) of the LedgerInfo in a BCS LedgerInfoWithSignatures.
     * @dev Ledger2WaypointConverter BCS = epoch || executed_state_id || version || timestamp_usecs
     *      || Some(next_epoch_state). In the LedgerInfo these are bytes [1, 9) and
     *      [49, end of next_epoch_state), with round and id between them.
     *      Reverts `AptosTypes` errors on malformed BCS. The caller checks `hasNextEpochState`.
     */
    function compute(bytes memory b, AptosTypes.LedgerInfo memory li)
        internal
        pure
        returns (uint64 version, bytes32 hash)
    {
        uint256 tail = AptosTypes.EXECUTED_STATE_ID_OFFSET;
        uint256 end = li.nextEpochStateStart + li.nextEpochStateLen;
        bytes memory converter = abi.encodePacked(
            AptosHash.WAYPOINT_SEED, Bcs.slice(b, AptosTypes.EPOCH_OFFSET, 8), Bcs.slice(b, tail, end - tail)
        );
        return (li.version, Sha3_256.hash(converter));
    }
}
