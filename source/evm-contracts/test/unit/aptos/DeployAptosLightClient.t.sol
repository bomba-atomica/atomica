// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AptosLightClient} from "../../../src/aptos/AptosLightClient.sol";
import {DeployAptosLightClient} from "../../../script/DeployAptosLightClient.s.sol";
import {AptosVectors} from "./AptosVectors.sol";

/**
 * @notice The genesis pin of script/DeployAptosLightClient.s.sol, with the golden genesis vector
 *         standing in for the node's answers. Each check runs before the script broadcasts.
 */
contract DeployAptosLightClientTest is AptosVectors {
    DeployAptosLightClient internal script;
    bytes internal genesis;
    string internal nodeWaypoint;

    uint64 internal constant LOCKUP = 1 days;

    function setUp() public {
        script = new DeployAptosLightClient();
        genesis = _hex(".genesis.ledger_info_with_signatures");
        nodeWaypoint = vm.parseJsonString(vectors, ".genesis.waypoint");
    }

    function test_revertsWhenExpectedWaypointUnset() public {
        vm.setEnv("EXPECTED_GENESIS_WAYPOINT", "");
        vm.expectRevert(DeployAptosLightClient.MissingExpectedWaypoint.selector);
        script.expectedWaypoint();
        vm.expectRevert(DeployAptosLightClient.MissingExpectedWaypoint.selector);
        script.deploy("", genesis, genesis, nodeWaypoint, MAX_EPOCH_AGE, LOCKUP);
    }

    function test_readsExpectedWaypointFromEnv() public {
        vm.setEnv("EXPECTED_GENESIS_WAYPOINT", nodeWaypoint);
        assertEq(script.expectedWaypoint(), nodeWaypoint);
    }

    /// The node serves the golden waypoint; the deployer expects another one.
    function test_revertsWhenExpectedDiffersFromNode() public {
        string memory other = "0:0000000000000000000000000000000000000000000000000000000000000001";
        vm.expectRevert(
            abi.encodeWithSelector(DeployAptosLightClient.NodeWaypointMismatch.selector, other, nodeWaypoint)
        );
        script.deploy(other, genesis, genesis, nodeWaypoint, MAX_EPOCH_AGE, LOCKUP);
    }

    /// Node and deployer agree on a waypoint the genesis LedgerInfo does not hash to.
    function test_revertsWhenRecomputedDiffers() public {
        string memory other = "0:0000000000000000000000000000000000000000000000000000000000000001";
        vm.expectRevert(
            abi.encodeWithSelector(DeployAptosLightClient.RecomputedWaypointMismatch.selector, other, nodeWaypoint)
        );
        script.deploy(other, genesis, genesis, other, MAX_EPOCH_AGE, LOCKUP);
    }

    function test_revertsWhenEndpointsServeDifferentGenesis() public {
        bytes memory changed = bytes.concat(genesis);
        changed[60] ^= 0x01;
        vm.expectRevert(DeployAptosLightClient.GenesisLedgerInfoMismatch.selector);
        script.deploy(nodeWaypoint, genesis, changed, nodeWaypoint, MAX_EPOCH_AGE, LOCKUP);
    }

    function test_revertsWhenMaxEpochAgeNotBelowLockup() public {
        vm.expectRevert(abi.encodeWithSelector(DeployAptosLightClient.BadMaxEpochAge.selector, LOCKUP, LOCKUP));
        script.deploy(nodeWaypoint, genesis, genesis, nodeWaypoint, LOCKUP, LOCKUP);
    }

    function test_deploysWhenWaypointMatches() public {
        AptosLightClient client = script.deploy(nodeWaypoint, genesis, genesis, nodeWaypoint, MAX_EPOCH_AGE, LOCKUP);
        assertGt(address(client).code.length, 0);
        assertEq(client.latestEpoch(), 1);
        assertEq(client.maxEpochAge(), MAX_EPOCH_AGE);
    }

    /// A "0x" hash and upper-case hex name the same waypoint.
    function test_acceptsPrefixedUpperCaseWaypoint() public {
        string memory hash = vm.parseJsonString(vectors, ".genesis.waypoint_value");
        string memory upper = string.concat("0:0x", vm.toUppercase(hash));
        AptosLightClient client = script.deploy(upper, genesis, genesis, nodeWaypoint, MAX_EPOCH_AGE, LOCKUP);
        assertGt(address(client).code.length, 0);
    }

    function test_formatWaypointMatchesGolden() public view {
        assertEq(script.formatWaypoint(0, _b32(".genesis.waypoint_value")), nodeWaypoint);
    }
}
