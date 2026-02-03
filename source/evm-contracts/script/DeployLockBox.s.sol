// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {LockBox} from "../src/escrow/LockBox.sol";
import {FakeETH} from "../src/tokens/FakeETH.sol";
import {FakeUSD} from "../src/tokens/FakeUSD.sol";

/**
 * @title DeployLockBox
 * @notice Deployment script for LockBox escrow contract and fake tokens
 * @dev Usage:
 *   forge script script/DeployLockBox.s.sol:DeployLockBox \
 *     --rpc-url http://localhost:8545 \
 *     --broadcast \
 *     --private-key <key>
 */
contract DeployLockBox is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy tokens
        FakeETH fakeETH = new FakeETH();
        console.log("FakeETH deployed at:", address(fakeETH));

        FakeUSD fakeUSD = new FakeUSD();
        console.log("FakeUSD deployed at:", address(fakeUSD));

        // Deploy LockBox
        LockBox lockBox = new LockBox(address(fakeETH), address(fakeUSD));
        console.log("LockBox deployed at:", address(lockBox));

        vm.stopBroadcast();

        // Print summary
        console.log("\n=== Deployment Summary ===");
        console.log("FakeETH:  ", address(fakeETH));
        console.log("FakeUSD:  ", address(fakeUSD));
        console.log("LockBox:  ", address(lockBox));
        console.log("\nAdd to .env:");
        console.log("VITE_FAKE_ETH_ADDRESS=", vm.toString(address(fakeETH)));
        console.log("VITE_FAKE_USD_ADDRESS=", vm.toString(address(fakeUSD)));
        console.log("VITE_LOCKBOX_ADDRESS=", vm.toString(address(lockBox)));
    }
}
