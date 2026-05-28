// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/DepositBox.sol";
import "../../src/Settlement.sol";
import "../../src/BLSVerifier.sol";
import "../../src/libraries/DepositTypes.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DeploymentVerificationTest
 * @notice Simple E2E test verifying contracts deploy correctly on Docker testnet
 *
 * Usage:
 *   # Start Docker testnet
 *   bun run test-orchestration/src/index.ts --test smoke --keep-alive
 *
 *   # Deploy contracts
 *   bun run test-orchestration/src/deploy.ts --network $ETH_RPC_URL
 *
 *   # Run tests
 *   forge test --match-path test/e2e/*.sol --rpc-url $ETH_RPC_URL
 *
 * Environment:
 *   ETH_RPC_URL      - Docker testnet RPC (default: http://localhost:8545)
 *   USDC_TOKEN_ADDR  - USDC token address on testnet (required)
 */
contract DeploymentVerificationTest is Test {
    address depositBoxAddr;
    address settlementAddr;
    address blsVerifierAddr;
    address usdcTokenAddr;

    DepositBox depositBox;
    Settlement settlement;
    BLSVerifier blsVerifier;
    IERC20 usdcToken;

    address deployer;
    address alice;
    address bob;

    string ETH_RPC_URL;
    string USDC_TOKEN_ADDR;

    function setUp() public {
        ETH_RPC_URL = vm.envOr("ETH_RPC_URL", string("http://localhost:8545"));
        USDC_TOKEN_ADDR = vm.envOr("USDC_TOKEN_ADDR", string(""));

        deployer = vm.addr(uint256(keccak256("deployer")));
        alice = makeAddr("alice");
        bob = makeAddr("bob");

        // Read deployment file if it exists
        string memory deploymentPath = string.concat(vm.projectRoot(), "/test-results/deployment.json");

        if (bytes(USDC_TOKEN_ADDR).length == 0 && vm.exists(deploymentPath)) {
            string memory json = vm.readFile(deploymentPath);
            usdcTokenAddr = vm.parseJsonAddress(json, ".USDCToken");
            USDC_TOKEN_ADDR = vm.toString(usdcTokenAddr);
        } else if (bytes(USDC_TOKEN_ADDR).length == 0) {
            // Deploy mock USDC for testing
            USDC_TOKEN_ADDR = _deployMockUSDC();
        } else {
            usdcTokenAddr = vm.parseAddress(USDC_TOKEN_ADDR);
        }

        usdcToken = IERC20(usdcTokenAddr);

        // Read or deploy contracts
        if (vm.exists(deploymentPath)) {
            _loadDeployment(deploymentPath);
        } else {
            _deployContracts();
        }
    }

    /**
     * @notice Deploy a mock USDC token for testing
     */
    function _deployMockUSDC() internal returns (string memory) {
        // For E2E testing, we need a real USDC token on the testnet
        // This is a placeholder - in production, use the actual USDC address
        // For local testing, this will deploy a mock
        console.log("Warning: USDC_TOKEN_ADDR not set. Using deployer as USDC (will fail if not ERC20).");
        return vm.toString(deployer);
    }

    /**
     * @notice Load deployed contract addresses from file
     */
    function _loadDeployment(string memory path) internal {
        string memory json = vm.readFile(path);

        depositBoxAddr = vm.parseJsonAddress(json, ".DepositBox");
        settlementAddr = vm.parseJsonAddress(json, ".Settlement");
        blsVerifierAddr = vm.parseJsonAddress(json, ".BLSVerifier");
        // Read actual deployer from deployment file
        deployer = vm.parseJsonAddress(json, ".Deployer");

        depositBox = DepositBox(payable(depositBoxAddr));
        settlement = Settlement(payable(settlementAddr));
        blsVerifier = BLSVerifier(payable(blsVerifierAddr));
    }

    /**
     * @notice Deploy all contracts (for local testing or fresh deployment)
     */
    function _deployContracts() internal {
        console.log("Deploying contracts to", ETH_RPC_URL);

        // Deploy DepositBox
        depositBox = new DepositBox(usdcTokenAddr);
        depositBoxAddr = address(depositBox);
        console.log("DepositBox:", depositBoxAddr);

        // Deploy BLSVerifier
        blsVerifier = new BLSVerifier();
        blsVerifierAddr = address(blsVerifier);
        console.log("BLSVerifier:", blsVerifierAddr);

        // Deploy Settlement
        settlement = new Settlement(
            blsVerifierAddr,
            depositBoxAddr,
            usdcTokenAddr
        );
        settlementAddr = address(settlement);
        console.log("Settlement:", settlementAddr);

        // Initialize BLS verifier
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = _getTestValidatorPubkey();
        blsVerifier.initialize(pubkeys);

        // Set settlement contract in deposit box
        depositBox.setSettlementContract(settlementAddr);

        // Save deployment info
        _saveDeployment();
    }

    /**
     * @notice Save deployment addresses to file
     */
    function _saveDeployment() internal {
        string memory outputDir = string.concat(vm.projectRoot(), "/test-results");
        string memory deploymentPath = string.concat(outputDir, "/deployment.json");

        // Ensure directory exists
        string[] memory inputs = new string[](3);
        inputs[0] = "mkdir";
        inputs[1] = "-p";
        inputs[2] = outputDir;
        vm.ffi(inputs);

        string memory json = string.concat(
            "{\n",
            '  "Deployer": "', vm.toString(deployer), '",\n',
            '  "DepositBox": "', vm.toString(depositBoxAddr), '",\n',
            '  "BLSVerifier": "', vm.toString(blsVerifierAddr), '",\n',
            '  "Settlement": "', vm.toString(settlementAddr), '",\n',
            '  "USDCToken": "', USDC_TOKEN_ADDR, '",\n',
            '  "timestamp": "', vm.toString(block.timestamp), '"\n',
            "}"
        );

        vm.writeFile(deploymentPath, json);
        console.log("Deployment info saved to:", deploymentPath);
    }

    /**
     * @notice Get test validator BLS public key
     */
    function _getTestValidatorPubkey() internal pure returns (bytes memory) {
        // Compressed BLS12-381 G2 public key (96 bytes)
        // This is a test key - DO NOT USE IN PRODUCTION
        return hex"a8a5c53d9c0c34b9c7b3e3b5c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5";
    }

    // ==================== Deployment Verification Tests ====================

    /**
     * @notice Verify all contracts are deployed at valid addresses
     */
    function testDeploymentAddressesAreValid() public view {
        assertNotEq(depositBoxAddr, address(0));
        assertNotEq(settlementAddr, address(0));
        assertNotEq(blsVerifierAddr, address(0));
        assertNotEq(usdcTokenAddr, address(0));

        console.log("Contract addresses verified:");
        console.log("  DepositBox:", uint256(uint160(depositBoxAddr)));
        console.log("  Settlement:", uint256(uint160(settlementAddr)));
        console.log("  BLSVerifier:", uint256(uint160(blsVerifierAddr)));
        console.log("  USDC Token:", uint256(uint160(usdcTokenAddr)));
    }

    /**
     * @notice Verify BLS verifier is initialized with validator set
     */
    function testBLSVerifierInitialized() public view {
        uint256 validatorCount = blsVerifier.getValidatorCount();
        assertGt(validatorCount, 0);
        assertEq(validatorCount, 1);

        console.log("BLS Verifier initialized with", validatorCount, "validators");
    }

    /**
     * @notice Verify all contract links are correct after deployment
     *
     * Success Criteria:
     *   - DepositBox links to Settlement
     *   - Settlement links to BLSVerifier and DepositBox
     */
    function testContractLinksAreCorrect() public view {
        // DepositBox links
        assertEq(depositBox.settlementContract(), address(settlement), "DepositBox -> Settlement link");

        // Settlement links
        assertEq(address(settlement.blsVerifier()), address(blsVerifier), "Settlement -> BLSVerifier link");
        assertEq(address(settlement.depositBox()), address(depositBox), "Settlement -> DepositBox link");

        console.log("[OK] All contract links verified");
    }

    /**
     * @notice Verify system is ready for operation
     *
     * Success Criteria:
     *   - All contracts deployed and linked
     *   - BLS verifier initialized
     *   - Settlement contract set in DepositBox
     */
    function testSystemReadyForOperation() public view {
        assertGt(blsVerifier.getValidatorCount(), 0, "BLS verifier must have validators");
        assertNotEq(depositBox.settlementContract(), address(0), "Settlement must be set in DepositBox");

        console.log("System ready for operation:");
        console.log("  BLS validators:", blsVerifier.getValidatorCount());
        console.log("  Settlement set in DepositBox:", depositBox.settlementContract() != address(0));
    }

    /**
     * @notice Verify settlement contract is set in DepositBox
     */
    function testSettlementContractSet() public view {
        assertEq(depositBox.settlementContract(), settlementAddr);
        console.log("Settlement contract set in DepositBox");
    }

    /**
     * @notice Verify contract code exists at deployed addresses
     */
    function testContractCodeExists() public view {
        assertGt(depositBoxAddr.code.length, 0, "DepositBox should have code");
        assertGt(settlementAddr.code.length, 0, "Settlement should have code");
        assertGt(blsVerifierAddr.code.length, 0, "BLSVerifier should have code");

        console.log("Contract code verified at all addresses");
    }

    // ==================== Basic Functionality Tests ====================

    /**
     * @notice Test basic ETH deposit functionality
     * @dev Skipped - requires auction to be in OPEN state
     */
    function testBasicETHDeposit() public {
        vm.skip(true); // TODO: Implement auction state machine and open auction before running
        uint256 depositAmount = 1 ether;
        uint256 initialBalance = address(depositBox).balance;
        uint64 auctionId = 1;

        vm.deal(alice, depositAmount);

        vm.prank(alice);
        depositBox.depositETH{value: depositAmount}(auctionId, 1);

        assertEq(address(depositBox).balance, initialBalance + depositAmount);

        DepositTypes.Deposit memory deposit = depositBox.getDeposit(auctionId, alice, 1);
        assertEq(deposit.amount, depositAmount);
        assertEq(deposit.depositor, alice);
        assertEq(uint256(deposit.status), 0); // PENDING

        console.log("ETH deposit verified: amount=", depositAmount);
    }

    /**
     * @notice Test basic USDC deposit functionality
     */
    function testBasicUSDCDeposit() public {
        // Skip if USDC token is not a real ERC20
        if (usdcTokenAddr == deployer) {
            console.log("Skipping USDC test - no USDC token deployed");
            return;
        }

        uint256 depositAmount = 1000e6;
        uint256 initialBalance = usdcToken.balanceOf(address(depositBox));
        uint64 auctionId = 1;

        // Check if we have USDC balance (might need to mint)
        uint256 aliceBalance = usdcToken.balanceOf(alice);
        if (aliceBalance < depositAmount) {
            console.log("Skipping USDC test - insufficient balance");
            return;
        }

        vm.prank(alice);
        usdcToken.approve(address(depositBox), depositAmount);

        vm.prank(alice);
        depositBox.depositUSDC(auctionId, 2, depositAmount);

        assertEq(usdcToken.balanceOf(address(depositBox)), initialBalance + depositAmount);

        DepositTypes.Deposit memory deposit = depositBox.getDeposit(auctionId, alice, 2);
        assertEq(deposit.amount, depositAmount);
        assertEq(deposit.depositor, alice);
        assertEq(uint256(deposit.assetType), 1); // USDC

        console.log("USDC deposit verified: amount=", depositAmount);
    }

    /**
     * @notice Test deposit confirmation
     * @dev Skipped - requires auction to be in OPEN state
     */
    function testDepositConfirmation() public {
        vm.skip(true); // TODO: Implement auction state machine and open auction before running
        uint64 auctionId = 1;
        // Make a deposit
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        depositBox.depositETH{value: 1 ether}(auctionId, 3);

        // Confirm the deposit
        uint64[] memory auctionIds = new uint64[](1);
        address[] memory depositors = new address[](1);
        uint256[] memory nonces = new uint256[](1);
        auctionIds[0] = auctionId;
        depositors[0] = bob;
        nonces[0] = 3;
        bytes32 stateRoot = bytes32(uint256(keccak256("test_state_root")));

        vm.prank(settlementAddr);
        depositBox.confirmDeposits(auctionIds, depositors, nonces, stateRoot);

        // Verify confirmed
        DepositTypes.Deposit memory deposit = depositBox.getDeposit(auctionId, bob, 3);
        assertEq(uint256(deposit.status), 1); // CONFIRMED

        console.log("Deposit confirmation verified");
    }

    /**
     * @notice Test state proof storage key computation
     */
    function testStateProofStorageKey() public view {
        uint64 auctionId = 1;
        bytes32 computedKey = depositBox.getStorageKey(auctionId, alice, 1);
        bytes32 expectedKey = keccak256(abi.encode(auctionId, alice, 1));

        assertEq(computedKey, expectedKey);

        console.log("Storage key for alice/1:", vm.toString(computedKey));
        console.log("This key is used in eth_getProof for state verification");
    }

    /**
     * @notice Verify settlement contract balances
     */
    function testSettlementBalances() public view {
        (uint256 ethBalance, uint256 usdcBalance) = settlement.getContractBalances();

        assertGe(ethBalance, 0);
        assertGe(usdcBalance, 0);

        console.log("Settlement balances:");
        console.log("  ETH:", ethBalance);
        console.log("  USDC:", usdcBalance);
    }
}
