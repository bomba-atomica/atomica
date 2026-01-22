// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/DepositBox.sol";
import "../src/Settlement.sol";
import "../src/BLSVerifier.sol";
import "../src/Governance.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Deploy
 * @notice Deployment script for Atomica EVM contracts
 *
 * Usage:
 *   forge script script/Deploy.s.sol --rpc-url $ETH_RPC_URL --broadcast
 *   forge script script/Deploy.s.sol --rpc-url $ETH_RPC_URL --verify
 *
 * Environment variables:
 *   ETH_RPC_URL      - RPC endpoint (required)
 *   ETH_PRIVATE_KEY  - Private key for deployment (required)
 *   FOUNDRY_PROFILE  - Build profile (default: "test")
 */
contract Deploy is Script {
    // For local testing, use well-known test private key
    // In production, this would come from secure key management
    string constant DEFAULT_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    function run() public {
        uint256 deployerPrivateKey = vm.envOr("ETH_PRIVATE_KEY", DEFAULT_PRIVATE_KEY);
        address usdcTokenAddress = vm.envAddress("USDC_TOKEN_ADDRESS");

        console.log("Deploying Atomica EVM contracts...");
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("USDC Token:", usdcTokenAddress);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Governance first (owns all contracts)
        Governance governance = new Governance(usdcTokenAddress);
        console.log("Governance deployed:", address(governance));

        // Deploy DepositBox
        DepositBox depositBox = new DepositBox(usdcTokenAddress);
        console.log("DepositBox deployed:", address(depositBox));

        // Deploy BLSVerifier
        BLSVerifier blsVerifier = new BLSVerifier();
        console.log("BLSVerifier deployed:", address(blsVerifier));

        // Deploy Settlement
        Settlement settlement = new Settlement(
            address(blsVerifier),
            address(depositBox),
            usdcTokenAddress
        );
        console.log("Settlement deployed:", address(settlement));

        // Initialize BLS verifier with genesis validator set
        // In production, this would be loaded from secure config
        bytes[] memory genesisPubkeys = new bytes[](1);
        // Example BLS12-381 G2 public key (compressed format, 96 bytes)
        // This is a test key - DO NOT USE IN PRODUCTION
        genesisPubkeys[0] = hex"a8a5c53d9c0c34b9c7b3e3b5c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5";
        blsVerifier.initialize(genesisPubkeys);
        console.log("BLS verifier initialized with genesis validators");

        // Initialize system via governance
        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );
        console.log("System initialized via governance");

        // Set settlement contract in deposit box
        depositBox.setSettlementContract(address(settlement));
        console.log("Settlement contract set in DepositBox");

        vm.stopBroadcast();

        // Print summary
        console.log("\n" + "=".repeat(60));
        console.log("DEPLOYMENT COMPLETE");
        console.log("=".repeat(60));
        console.log("Governance:", address(governance));
        console.log("DepositBox:", address(depositBox));
        console.log("BLSVerifier:", address(blsVerifier));
        console.log("Settlement:", address(settlement));
        console.log("USDC Token:", usdcTokenAddress);
        console.log("=".repeat(60));

        // Store deployment info for tests
        string memory deploymentJson = string.concat(
            "{\n",
            '  "Governance": "', Strings.toHexString(address(governance)), '",\n',
            '  "DepositBox": "', Strings.toHexString(address(depositBox)), '",\n',
            '  "BLSVerifier": "', Strings.toHexString(address(blsVerifier)), '",\n',
            '  "Settlement": "', Strings.toHexString(address(settlement)), '",\n',
            '  "USDCToken": "', Strings.toHexString(usdcTokenAddress), '",\n',
            '  "timestamp": "', vm.toString(block.timestamp), '"\n',
            "}"
        );

        // Write deployment info
        vm.writeFile("test-results/deployment.json", deploymentJson);
        console.log("\nDeployment info written to test-results/deployment.json");
    }
}
