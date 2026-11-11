// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {AptosLightClient} from "../src/aptos/AptosLightClient.sol";

/**
 * @title DeployAptosLightClient
 * @notice Deploys the Aptos light client from an Atomica node's genesis LedgerInfo and waypoint.
 * @dev Reads `/v1/atomica/epoch_change_proof?start_epoch=0&end_epoch=1` (the genesis
 *      epoch-ending LedgerInfo) and `/v1/atomica/genesis_waypoint`, and requires both to serve the
 *      same LedgerInfo. The node is not trusted: the constructor recomputes the waypoint from the
 *      LedgerInfo, and anyone can compare the deployed waypoint with the chain's own.
 *      Writes the address to test-results/deployment.json under "AptosLightClient".
 *
 *      Usage:
 *        APTOS_NODE_URL=http://127.0.0.1:8080 PRIVATE_KEY=<key> \
 *        forge script script/DeployAptosLightClient.s.sol:DeployAptosLightClient \
 *          --rpc-url http://localhost:8545 --broadcast
 */
contract DeployAptosLightClient is Script {
    // SCOUT(#219) EDIT: the dual-chain testnet deploys with ethers from forge artifacts, not with this script, so it must port these two node reads and the same-LedgerInfo check; it also deploys LockBox before Aptos starts today.
    function run() external returns (AptosLightClient client) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        string memory node = vm.envString("APTOS_NODE_URL");

        string memory changes = _get(string.concat(node, "/v1/atomica/epoch_change_proof?start_epoch=0&end_epoch=1"));
        bytes memory genesis = vm.parseBytes(vm.parseJsonString(changes, ".ledger_infos_with_signatures[0]"));

        string memory waypoint = _get(string.concat(node, "/v1/atomica/genesis_waypoint"));
        uint64 waypointVersion = uint64(vm.parseUint(vm.parseJsonString(waypoint, ".version")));
        bytes32 waypointHash = bytes32(vm.parseBytes(vm.parseJsonString(waypoint, ".value")));
        bytes memory waypointLedgerInfo = vm.parseBytes(vm.parseJsonString(waypoint, ".ledger_info_with_signatures"));
        require(keccak256(waypointLedgerInfo) == keccak256(genesis), "genesis LedgerInfo differs between endpoints");

        vm.startBroadcast(deployerPrivateKey);
        client = new AptosLightClient(genesis, waypointVersion, waypointHash);
        vm.stopBroadcast();

        console.log("AptosLightClient deployed at:", address(client));
        console.log("Genesis waypoint:", vm.parseJsonString(waypoint, ".waypoint"));
        _record(address(client));
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
