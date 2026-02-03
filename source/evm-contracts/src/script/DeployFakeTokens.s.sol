// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../tokens/FakeETH.sol";
import "../tokens/FakeUSD.sol";

/**
 * @title DeployFakeTokens
 * @notice Deployment script for FakeETH and FakeUSD test tokens
 * @dev Usage: forge script script/DeployFakeTokens.s.sol --rpc-url <RPC_URL> --broadcast
 */
contract DeployFakeTokens is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy FakeETH
        FakeETH fakeETH = new FakeETH();
        console.log("FakeETH deployed at:", address(fakeETH));
        console.log("  Name:", fakeETH.name());
        console.log("  Symbol:", fakeETH.symbol());
        console.log("  Decimals:", fakeETH.decimals());
        console.log("  Max Mint:", fakeETH.MAX_MINT_AMOUNT());

        // Deploy FakeUSD
        FakeUSD fakeUSD = new FakeUSD();
        console.log("FakeUSD deployed at:", address(fakeUSD));
        console.log("  Name:", fakeUSD.name());
        console.log("  Symbol:", fakeUSD.symbol());
        console.log("  Decimals:", fakeUSD.decimals());
        console.log("  Max Mint:", fakeUSD.MAX_MINT_AMOUNT());

        vm.stopBroadcast();

        // Write addresses to JSON file for TypeScript integration
        string memory json = string(
            abi.encodePacked(
                '{\n',
                '  "FakeETH": "', vm.toString(address(fakeETH)), '",\n',
                '  "FakeUSD": "', vm.toString(address(fakeUSD)), '",\n',
                '  "deployer": "', vm.toString(vm.addr(deployerPrivateKey)), '",\n',
                '  "timestamp": "', vm.toString(block.timestamp), '"\n',
                '}'
            )
        );

        vm.writeFile("deployments/fake-tokens.json", json);
        console.log("\nDeployment info written to deployments/fake-tokens.json");
    }
}
