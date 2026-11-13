// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {LockBox} from "../src/escrow/LockBox.sol";
import {IAptosLightClient} from "../src/aptos/IAptosLightClient.sol";
import {FakeETH} from "../src/tokens/FakeETH.sol";
import {FakeUSD} from "../src/tokens/FakeUSD.sol";

/**
 * @title DeployLockBox
 * @notice Deploys the fake tokens and the proof-gated LockBox.
 * @dev LockBox has no admin and no upgrade path, so each release ships at a new address. It takes
 *      the light client address in its constructor, so a new AptosLightClient (for example one
 *      with the stale limit, `maxEpochAge`) always ships with a new LockBox. Point clients only at
 *      the new LockBox; the old one takes no new locks and its open locks go home by `reclaim`.
 *      Usage:
 *        PRIVATE_KEY=<key> LIGHT_CLIENT=<AptosLightClient address> ATOMICA_ADDRESS=<0x… 32 bytes> \
 *        forge script script/DeployLockBox.s.sol:DeployLockBox \
 *          --rpc-url http://localhost:8545 --broadcast
 *      LIGHT_CLIENT comes from script/DeployAptosLightClient.s.sol. ATOMICA_ADDRESS is the Aptos
 *      account of the `atomica` package; the outcome type tag is `<ATOMICA_ADDRESS>::auction::AuctionOutcome`.
 *      The last two constructor arguments, `daySecs` and `closeOffsetsSecs`, are the window clock
 *      LockBox freezes for its life. This script passes `productionWindowSchedule()`.
 */
contract DeployLockBox is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        IAptosLightClient lightClient = IAptosLightClient(vm.envAddress("LIGHT_CLIENT"));
        bytes memory typeTag = outcomeTypeTag(vm.envBytes32("ATOMICA_ADDRESS"));
        vm.startBroadcast(deployerPrivateKey);

        FakeETH fakeETH = new FakeETH();
        console.log("FakeETH deployed at:", address(fakeETH));

        FakeUSD fakeUSD = new FakeUSD();
        console.log("FakeUSD deployed at:", address(fakeUSD));

        (uint64 daySecs, uint64[] memory closeOffsetsSecs) = productionWindowSchedule();
        LockBox lockBox =
            new LockBox(address(fakeETH), address(fakeUSD), lightClient, typeTag, daySecs, closeOffsetsSecs);
        console.log("LockBox deployed at:", address(lockBox));

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("FakeETH:     ", address(fakeETH));
        console.log("FakeUSD:     ", address(fakeUSD));
        console.log("LockBox:     ", address(lockBox));
        console.log("LightClient: ", address(lightClient));
        console.log("\nAdd to .env:");
        console.log("VITE_FAKE_ETH_ADDRESS=", vm.toString(address(fakeETH)));
        console.log("VITE_FAKE_USD_ADDRESS=", vm.toString(address(fakeUSD)));
        console.log("VITE_LOCK_BOX_ADDRESS=", vm.toString(address(lockBox)));
    }

    /// @notice The production window clock: two closes a day, at 07:45 and 16:15 UTC
    ///         (docs/specifications/auction-timing.md).
    function productionWindowSchedule() public pure returns (uint64 daySecs, uint64[] memory closeOffsetsSecs) {
        daySecs = 86_400;
        closeOffsetsSecs = new uint64[](2);
        closeOffsetsSecs[0] = 27_900;
        closeOffsetsSecs[1] = 58_500;
    }

    /// @notice BCS TypeTag of `<atomica>::auction::AuctionOutcome`.
    function outcomeTypeTag(bytes32 atomica) public pure returns (bytes memory) {
        return abi.encodePacked(uint8(7), atomica, uint8(7), "auction", uint8(14), "AuctionOutcome", uint8(0));
    }
}
