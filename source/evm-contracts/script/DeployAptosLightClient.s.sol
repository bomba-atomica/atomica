// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {AptosLightClient} from "../src/aptos/AptosLightClient.sol";
import {AptosTypes} from "../src/aptos/AptosTypes.sol";
import {AptosWaypoint} from "../src/aptos/AptosWaypoint.sol";

/**
 * @title DeployAptosLightClient
 * @notice Deploys the Aptos light client from an Atomica node's genesis LedgerInfo and waypoint.
 * @dev Reads `/v1/atomica/epoch_change_proof?start_epoch=0&end_epoch=1` (the genesis
 *      epoch-ending LedgerInfo), `/v1/atomica/genesis_waypoint` and the chain's
 *      `0x1::staking_config::StakingConfig`.
 *
 *      Genesis pin. The deployer names the genesis waypoint it trusts in
 *      `EXPECTED_GENESIS_WAYPOINT` ("version:hash", the `waypoint` field the node serves). Before
 *      anything is broadcast, the script reverts when that value is missing, differs from the
 *      node's waypoint, or differs from the waypoint recomputed from the genesis LedgerInfo. The
 *      node is not trusted: the constructor recomputes the waypoint again.
 *
 *      Stale limit. `MAX_EPOCH_AGE` (seconds) defaults to half the chain's
 *      `recurring_lockup_duration_secs` and must be below it (see AptosLightClient).
 *
 *      Writes the address to test-results/deployment.json under "AptosLightClient". LockBox takes
 *      the client address in its constructor, so a new client means a new LockBox
 *      (script/DeployLockBox.s.sol).
 *
 *      Usage:
 *        APTOS_NODE_URL=http://127.0.0.1:8080 PRIVATE_KEY=<key> \
 *        EXPECTED_GENESIS_WAYPOINT=0:<hash> [MAX_EPOCH_AGE=<seconds>] \
 *        forge script script/DeployAptosLightClient.s.sol:DeployAptosLightClient \
 *          --rpc-url http://localhost:8545 --broadcast
 */
contract DeployAptosLightClient is Script {
    // SCOUT(#219) EDIT: the dual-chain testnet deploys with ethers from forge artifacts, not with this script, so it must port these two node reads and the same-LedgerInfo check; it also deploys LockBox before Aptos starts today.
    /// @notice EXPECTED_GENESIS_WAYPOINT is unset or empty.
    error MissingExpectedWaypoint();
    /// @notice The node serves another genesis waypoint than the expected one.
    error NodeWaypointMismatch(string expected, string node);
    /// @notice The waypoint recomputed from the genesis LedgerInfo differs from the expected one.
    error RecomputedWaypointMismatch(string expected, string recomputed);
    /// @notice The two node endpoints serve different genesis LedgerInfos.
    error GenesisLedgerInfoMismatch();
    /// @notice The genesis LedgerInfo does not end an epoch.
    error GenesisNotEpochEnding();
    /// @notice maxEpochAge is zero or not below the stake lockup.
    error BadMaxEpochAge(uint64 maxEpochAge, uint64 lockup);

    function run() external returns (AptosLightClient client) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        string memory node = vm.envString("APTOS_NODE_URL");
        string memory expected = expectedWaypoint();

        string memory changes = _get(string.concat(node, "/v1/atomica/epoch_change_proof?start_epoch=0&end_epoch=1"));
        bytes memory genesis = vm.parseBytes(vm.parseJsonString(changes, ".ledger_infos_with_signatures[0]"));
        string memory waypoint = _get(string.concat(node, "/v1/atomica/genesis_waypoint"));
        string memory nodeWaypoint = vm.parseJsonString(waypoint, ".waypoint");
        bytes memory waypointLedgerInfo = vm.parseBytes(vm.parseJsonString(waypoint, ".ledger_info_with_signatures"));
        string memory staking =
            _get(string.concat(node, "/v1/accounts/0x1/resource/0x1::staking_config::StakingConfig"));
        uint64 lockup = uint64(vm.parseUint(vm.parseJsonString(staking, ".data.recurring_lockup_duration_secs")));
        uint64 maxEpochAge = uint64(vm.envOr("MAX_EPOCH_AGE", uint256(lockup / 2)));

        // Every check runs before anything is broadcast.
        checkGenesis(expected, genesis, waypointLedgerInfo, nodeWaypoint, maxEpochAge, lockup);

        vm.startBroadcast(deployerPrivateKey);
        client = deploy(expected, genesis, waypointLedgerInfo, nodeWaypoint, maxEpochAge, lockup);
        vm.stopBroadcast();

        console.log("AptosLightClient deployed at:", address(client));
        console.log("Genesis waypoint:", nodeWaypoint);
        console.log("Max epoch age (s):", maxEpochAge);
        _record(address(client));
    }

    /// @notice EXPECTED_GENESIS_WAYPOINT, reverting MissingExpectedWaypoint when unset or empty.
    function expectedWaypoint() public view returns (string memory w) {
        w = vm.envOr("EXPECTED_GENESIS_WAYPOINT", string(""));
        if (bytes(w).length == 0) revert MissingExpectedWaypoint();
    }

    /**
     * @notice Checks the genesis pin and the stale limit. Returns the waypoint to deploy with.
     * @param expected The trusted waypoint, "version:hash" (hash in hex, with or without 0x).
     * @param genesis BCS genesis LedgerInfoWithSignatures from the epoch change endpoint.
     * @param waypointLedgerInfo The same LedgerInfo from the genesis waypoint endpoint.
     * @param nodeWaypoint The `waypoint` string the node serves.
     */
    function checkGenesis(
        string memory expected,
        bytes memory genesis,
        bytes memory waypointLedgerInfo,
        string memory nodeWaypoint,
        uint64 maxEpochAge,
        uint64 lockup
    ) public pure returns (uint64 version, bytes32 hash) {
        if (bytes(expected).length == 0) revert MissingExpectedWaypoint();
        if (keccak256(waypointLedgerInfo) != keccak256(genesis)) revert GenesisLedgerInfoMismatch();
        if (maxEpochAge == 0 || maxEpochAge >= lockup) revert BadMaxEpochAge(maxEpochAge, lockup);

        string memory want = _normalize(expected);
        if (keccak256(bytes(_normalize(nodeWaypoint))) != keccak256(bytes(want))) {
            revert NodeWaypointMismatch(expected, nodeWaypoint);
        }
        AptosTypes.LedgerInfo memory li = AptosTypes.parseLedgerInfoWithSignatures(genesis);
        if (!li.hasNextEpochState) revert GenesisNotEpochEnding();
        (version, hash) = AptosWaypoint.compute(genesis, li);
        string memory recomputed = formatWaypoint(version, hash);
        if (keccak256(bytes(recomputed)) != keccak256(bytes(want))) {
            revert RecomputedWaypointMismatch(expected, recomputed);
        }
    }

    /// @notice Runs `checkGenesis`, then deploys the client.
    function deploy(
        string memory expected,
        bytes memory genesis,
        bytes memory waypointLedgerInfo,
        string memory nodeWaypoint,
        uint64 maxEpochAge,
        uint64 lockup
    ) public returns (AptosLightClient) {
        (uint64 version, bytes32 hash) =
            checkGenesis(expected, genesis, waypointLedgerInfo, nodeWaypoint, maxEpochAge, lockup);
        return new AptosLightClient(genesis, version, hash, maxEpochAge);
    }

    /// @notice The Aptos waypoint string "version:hash" with the hash in lower-case hex, no 0x.
    function formatWaypoint(uint64 version, bytes32 hash) public pure returns (string memory) {
        return _normalize(string.concat(vm.toString(version), ":", vm.toString(hash)));
    }

    /// @dev Lower-case and drop a "0x" right after the colon.
    function _normalize(string memory w) private pure returns (string memory) {
        bytes memory b = bytes(w);
        bytes memory out = new bytes(b.length);
        uint256 n;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == "0" && i + 1 < b.length && (b[i + 1] == "x" || b[i + 1] == "X") && i > 0 && b[i - 1] == ":") {
                i++;
                continue;
            }
            bytes1 c = b[i];
            if (c >= "A" && c <= "Z") c = bytes1(uint8(c) + 32);
            out[n++] = c;
        }
        assembly ("memory-safe") {
            mstore(out, n)
        }
        return string(out);
    }

    function _get(string memory url) internal returns (string memory) {
        string[] memory cmd = new string[](5);
        cmd[0] = "curl";
        cmd[1] = "-sSf";
        cmd[2] = "--max-time";
        cmd[3] = "30";
        cmd[4] = url;
        return string(vm.ffi(cmd));
    }

    // SCOUT(#219) EDIT: this writes the tracked file test-results/deployment.json on every run; write to an untracked path, or only return the address, before the testnet setup calls it.
    function _record(address client) internal {
        string memory dir = string.concat(vm.projectRoot(), "/test-results");
        vm.createDir(dir, true);
        string memory path = string.concat(dir, "/deployment.json");
        if (!vm.exists(path)) vm.writeFile(path, "{}");
        vm.writeJson(vm.toString(client), path, ".AptosLightClient");
        console.log("Recorded in:", path);
    }
}
