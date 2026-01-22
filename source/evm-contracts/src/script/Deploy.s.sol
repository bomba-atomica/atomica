// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "../DepositBox.sol";
import "../Settlement.sol";
import "../BLSVerifier.sol";
import "../Governance.sol";
import "../AuctionRegistry.sol";

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
    string constant DEFAULT_PRIVATE_KEY = "0xbcdf20249abf0ed6d944c0288fad489e33f66b3960d9e6229c1cd214ed3bbe31";

    function run() public {
        string memory rpcUrl = vm.envOr("ETH_RPC_URL", DEFAULT_RPC_URL);
        string memory privateKeyStr = vm.envOr("ETH_PRIVATE_KEY", string(DEFAULT_PRIVATE_KEY));
        string memory usdcTokenAddr = vm.envOr("USDC_TOKEN_ADDR", string(""));

        console.log("============================================================");
        console.log("  Atomica EVM Contracts Deployment");
        console.log("============================================================");
        console.log("RPC URL:", rpcUrl);

        uint256 deployerPrivateKey = vm.parseUint(privateKeyStr);
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

        // Deploy AuctionRegistry
        console.log("\nDeploying AuctionRegistry...");
        AuctionRegistry auctionRegistry = new AuctionRegistry();
        console.log("  AuctionRegistry:", address(auctionRegistry));

        // Deploy Governance
        console.log("Deploying Governance...");
        Governance governance = new Governance(usdcAddr);
        console.log("  Governance:", address(governance));

        // Deploy DepositBox
        console.log("Deploying DepositBox...");
        DepositBox depositBox = new DepositBox(usdcAddr, address(auctionRegistry));
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

        // Transfer AuctionRegistry ownership to governance
        console.log("Transferring AuctionRegistry ownership to governance...");
        auctionRegistry.transferOwnership(address(governance));
        console.log("  AuctionRegistry ownership transferred");

        vm.stopBroadcast();

        // Print summary
        console.log("\n============================================================");
        console.log("  DEPLOYMENT COMPLETE");
        console.log("============================================================");
        console.log("USDC Token:", usdcAddr);
        console.log("AuctionRegistry:", address(auctionRegistry));
        console.log("Governance:", address(governance));
        console.log("DepositBox:", address(depositBox));
        console.log("BLSVerifier:", address(blsVerifier));
        console.log("Settlement:", address(settlement));
        console.log("============================================================");

        // Save deployment info
        _saveDeployment(
            deployer,
            address(auctionRegistry),
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
        address auctionRegistry,
        address governance,
        address depositBox,
        address blsVerifier,
        address settlement,
        address usdcToken
    ) internal {
        string memory outputDir = string.concat(vm.projectRoot(), "/test-results");

        // Ensure directory exists
        vm.createDir(outputDir, true);

        string memory deploymentPath = string.concat(outputDir, "/deployment.json");

        string memory json = string.concat(
            "{\n",
            '  "Deployer": "', vm.toString(deployer), '",\n',
            '  "AuctionRegistry": "', vm.toString(auctionRegistry), '",\n',
            '  "Governance": "', vm.toString(governance), '",\n',
            '  "DepositBox": "', vm.toString(depositBox), '",\n',
            '  "BLSVerifier": "', vm.toString(blsVerifier), '",\n',
            '  "Settlement": "', vm.toString(settlement), '",\n',
            '  "USDCToken": "', vm.toString(usdcToken), '",\n',
            '  "timestamp": "', vm.toString(block.timestamp), '"\n',
            "}"
        );

        vm.writeFile(deploymentPath, json);
        console.log("\nDeployment info saved to:", deploymentPath);
    }
}
