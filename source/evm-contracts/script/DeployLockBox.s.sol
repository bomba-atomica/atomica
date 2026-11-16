// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {LockBox} from "../src/escrow/LockBox.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAptosLightClient} from "../src/aptos/IAptosLightClient.sol";
import {FakeETH} from "../src/tokens/FakeETH.sol";
import {FakeUSD} from "../src/tokens/FakeUSD.sol";

/**
 * @title DeployLockBox
 * @notice Deploys the fake tokens, LockBox implementation and initialized ERC1967 proxy.
 * @dev The proxy address is the LockBox address clients use and pin. `LOCKBOX_ADMIN` is trusted
 *      to upgrade until it calls `freeze()`, which disables upgrades permanently.
 *      Usage:
 *        PRIVATE_KEY=<key> LIGHT_CLIENT=<AptosLightClient address> ATOMICA_ADDRESS=<0x… 32 bytes> \
 *        forge script script/DeployLockBox.s.sol:DeployLockBox \
 *          --rpc-url http://localhost:8545 --broadcast
 *      LIGHT_CLIENT comes from script/DeployAptosLightClient.s.sol. ATOMICA_ADDRESS is the Aptos
 *      account of the `atomica` package; the outcome type tag is `<ATOMICA_ADDRESS>::auction::AuctionOutcome`.
 *      `LOCKBOX_ADMIN` names the trusted upgrade admin. The last two initializer arguments,
 *      `daySecs` and `closeOffsetsSecs`, are the window clock stored in the proxy.
 */
contract DeployLockBox is Script {
    error WindowScheduleMismatch();

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        IAptosLightClient lightClient = IAptosLightClient(vm.envAddress("LIGHT_CLIENT"));
        address admin = vm.envAddress("LOCKBOX_ADMIN");
        bytes memory typeTag = outcomeTypeTag(vm.envBytes32("ATOMICA_ADDRESS"));
        vm.startBroadcast(deployerPrivateKey);

        FakeETH fakeETH = new FakeETH();
        console.log("FakeETH deployed at:", address(fakeETH));

        FakeUSD fakeUSD = new FakeUSD();
        console.log("FakeUSD deployed at:", address(fakeUSD));

        (uint64 daySecs, uint64[] memory closeOffsetsSecs) = productionWindowSchedule();
        (LockBox lockBox, address implementation) =
            deployProxy(address(fakeETH), address(fakeUSD), lightClient, typeTag, daySecs, closeOffsetsSecs, admin);
        assertWindowSchedule(lockBox, daySecs, closeOffsetsSecs);
        console.log("LockBox implementation deployed at:", implementation);
        console.log("LockBox proxy deployed at:", address(lockBox));

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("FakeETH:     ", address(fakeETH));
        console.log("FakeUSD:     ", address(fakeUSD));
        console.log("LockBox implementation:", implementation);
        console.log("LockBox:     ", address(lockBox));
        console.log("LockBox admin:", admin);
        console.log("LightClient: ", address(lightClient));
        console.log("\nAdd to .env:");
        console.log("VITE_FAKE_ETH_ADDRESS=", vm.toString(address(fakeETH)));
        console.log("VITE_FAKE_USD_ADDRESS=", vm.toString(address(fakeUSD)));
        console.log("VITE_LOCK_BOX_ADDRESS=", vm.toString(address(lockBox)));
    }

    function deployProxy(
        address fakeETH,
        address fakeUSD,
        IAptosLightClient lightClient,
        bytes memory typeTag,
        uint64 daySecs,
        uint64[] memory closeOffsetsSecs,
        address admin
    ) public returns (LockBox proxy, address implementation) {
        LockBox logic = new LockBox();
        implementation = address(logic);
        bytes memory initialization = abi.encodeCall(
            LockBox.initialize, (fakeETH, fakeUSD, lightClient, typeTag, daySecs, closeOffsetsSecs, admin)
        );
        proxy = LockBox(address(new ERC1967Proxy(implementation, initialization)));
    }

    /// @notice The production window clock: two closes a day, at 07:45 and 16:15 UTC
    ///         (docs/specifications/auction-timing.md).
    function productionWindowSchedule() public pure returns (uint64 daySecs, uint64[] memory closeOffsetsSecs) {
        daySecs = 86_400;
        closeOffsetsSecs = new uint64[](2);
        closeOffsetsSecs[0] = 27_900;
        closeOffsetsSecs[1] = 58_500;
    }

    /// @notice Reverts unless the deployed proxy froze the intended schedule.
    function assertWindowSchedule(LockBox lockBox, uint64 daySecs, uint64[] memory closeOffsetsSecs) public view {
        (uint64 actualDaySecs, uint64[] memory actualOffsets) = lockBox.windowSchedule();
        if (actualDaySecs != daySecs || actualOffsets.length != closeOffsetsSecs.length) {
            revert WindowScheduleMismatch();
        }
        for (uint256 i = 0; i < closeOffsetsSecs.length; i++) {
            if (actualOffsets[i] != closeOffsetsSecs[i]) revert WindowScheduleMismatch();
        }
    }

    /// @notice BCS TypeTag of `<atomica>::auction::AuctionOutcome`.
    function outcomeTypeTag(bytes32 atomica) public pure returns (bytes memory) {
        return abi.encodePacked(uint8(7), atomica, uint8(7), "auction", uint8(14), "AuctionOutcome", uint8(0));
    }
}
