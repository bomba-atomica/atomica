// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Simple mock USDC token for testing on Docker testnet
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin (Mock)", "USDC") {
        _mint(msg.sender, 1_000_000_000e6); // 1 billion USDC
    }

    function decimals() public view override returns (uint8) {
        return 6;
    }
}

/**
 * @title Deploy
 * @notice Deployment script for Atomica EVM contracts to Docker testnet
 *
 * Usage:
 *   # With environment variables
 *   export ETH_RPC_URL="http://localhost:8545"
 *   export ETH_PRIVATE_KEY="0x..."  # Test account private key
 *   export USDC_TOKEN_ADDR=""       # Leave empty to deploy mock
 *
 *   forge script script/Deploy.s.sol --rpc-url $ETH_RPC_URL --broadcast
 *
 * Output:
 *   Writes deployment addresses to test-results/deployment.json
 */
contract Deploy is Script {
    string constant DEFAULT_RPC_URL = "http://localhost:8545";
    string constant DEFAULT_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    function run() public {
        string memory rpcUrl = vm.envOr("ETH_RPC_URL", DEFAULT_RPC_URL);
        string memory privateKeyStr = vm.envOr("ETH_PRIVATE_KEY", DEFAULT_PRIVATE_KEY);
        string memory usdcTokenAddr = vm.envOr("USDC_TOKEN_ADDR", "");

        console.log("═".repeat(60));
        console.log("  Atomica EVM Contracts Deployment");
        console.log("═".repeat(60));
        console.log("RPC URL:", rpcUrl);

        uint256 deployerPrivateKey = vm.parsePrivateKey(privateKeyStr);
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy or use USDC token
        address usdcAddr;
        if (bytes(usdcTokenAddr).length == 0) {
            console.log("\nDeploying mock USDC token...");
            MockUSDC mockUsdc = new MockUSDC();
            usdcAddr = address(mockUsdc);
            console.log("Mock USDC deployed at:", usdcAddr);

            // Fund test accounts
            address[] memory testAccounts = new address[](4);
            testAccounts[0] = 0x8943545177806ED17B9F23F0a21ee5948eCaa776;
            testAccounts[1] = 0x71bE63f3384f5fb98995898A86B02Fb2426c5788;
            testAccounts[2] = 0xFABB0ac9d68B0B445fB7357272Ff202C5651694a;
            testAccounts[3] = 0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec;

            for (uint256 i = 0; i < testAccounts.length; i++) {
                mockUsdc.transfer(testAccounts[i], 100_000_000e6); // 100M USDC each
            }
            console.log("Funded test accounts with USDC");
        } else {
            usdcAddr = vm.parseAddress(usdcTokenAddr);
            console.log("Using existing USDC token at:", usdcAddr);
        }

        // Deploy Governance
        console.log("\nDeploying Governance...");
        Governance governance = new Governance(usdcAddr);
        console.log("  Governance:", address(governance));

        // Deploy DepositBox
        console.log("Deploying DepositBox...");
        DepositBox depositBox = new DepositBox(usdcAddr);
        console.log("  DepositBox:", address(depositBox));

        // Deploy BLSVerifier
        console.log("Deploying BLSVerifier...");
        BLSVerifier blsVerifier = new BLSVerifier();
        console.log("  BLSVerifier:", address(blsVerifier));

        // Deploy Settlement
        console.log("Deploying Settlement...");
        Settlement settlement = new Settlement(
            address(blsVerifier),
            address(depositBox),
            usdcAddr
        );
        console.log("  Settlement:", address(settlement));

        // Initialize BLS verifier
        console.log("\nInitializing BLS verifier...");
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = _getTestValidatorPubkey();
        blsVerifier.initialize(pubkeys);
        console.log("  BLS verifier initialized with 1 validator");

        // Initialize system via governance
        console.log("\nInitializing system via Governance...");
        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );
        console.log("  System initialized");

        // Set settlement contract in deposit box
        depositBox.setSettlementContract(address(settlement));
        console.log("  Settlement contract set in DepositBox");

        vm.stopBroadcast();

        // Print summary
        console.log("\n" + "═".repeat(60));
        console.log("  DEPLOYMENT COMPLETE");
        console.log("═".repeat(60));
        console.log("USDC Token:", usdcAddr);
        console.log("Governance:", address(governance));
        console.log("DepositBox:", address(depositBox));
        console.log("BLSVerifier:", address(blsVerifier));
        console.log("Settlement:", address(settlement));
        console.log("═".repeat(60));

        // Save deployment info
        _saveDeployment(
            deployer,
            address(governance),
            address(depositBox),
            address(blsVerifier),
            address(settlement),
            usdcAddr
        );
    }

    function _getTestValidatorPubkey() internal pure returns (bytes memory) {
        return hex"a8a5c53d9c0c34b9c7b3e3b5c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5";
    }

    function _saveDeployment(
        address deployer,
        address governance,
        address depositBox,
        address blsVerifier,
        address settlement,
        address usdcToken
    ) internal {
        string memory outputDir = string.concat(vm.projectRoot(), "/test-results");

        // Ensure directory exists
        string memory mkdirCmd = string.concat("mkdir -p ", outputDir);
        vm.ffi(mkdirCmd);

        string memory deploymentPath = string.concat(outputDir, "/deployment.json");

        string memory json = string.concat(
            "{\n",
            '  "Deployer": "', Strings.toHexString(deployer), '",\n',
            '  "Governance": "', Strings.toHexString(governance), '",\n',
            '  "DepositBox": "', Strings.toHexString(depositBox), '",\n',
            '  "BLSVerifier": "', Strings.toHexString(blsVerifier), '",\n',
            '  "Settlement": "', Strings.toHexString(settlement), '",\n',
            '  "USDCToken": "', Strings.toHexString(usdcToken), '",\n',
            '  "timestamp": "', Strings.toString(block.timestamp), '"\n',
            "}"
        );

        vm.writeFile(deploymentPath, json);
        console.log("\nDeployment info saved to:", deploymentPath);
    }
}

// Import statements for deployment
import "../src/DepositBox.sol";
import "../src/Settlement.sol";
import "../src/BLSVerifier.sol";
import "../src/Governance.sol";
