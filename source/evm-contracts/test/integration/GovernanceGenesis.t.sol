// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/DepositBox.sol";
import "../../src/Settlement.sol";
import "../../src/BLSVerifier.sol";
import "../../src/Governance.sol";
import "../../src/AuctionRegistry.sol";
import "../../src/libraries/DepositTypes.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title GovernanceGenesisTest
 * @notice Tests for Governance genesis() access control
 *
 * Test Scenarios:
 * 1. Only owner can call genesis()
 * 2. genesis() can only be called once
 * 3. Non-owner cannot call genesis()
 * 4. genesis() cannot be called after initialization
 *
 * Success Criteria:
 *   - Deployer (owner) can call genesis()
 *   - Non-owner calling genesis() reverts
 *   - Double genesis() reverts
 */
contract GovernanceGenesisTest is Test {
    Governance governance;
    DepositBox depositBox;
    BLSVerifier blsVerifier;
    Settlement settlement;
    AuctionRegistry auctionRegistry;

    address deployer;
    address nonOwner;
    address usdcTokenAddr;

    function setUp() public {
        deployer = vm.addr(uint256(keccak256("deployer")));
        nonOwner = vm.addr(uint256(keccak256("nonowner")));

        // Deploy a mock USDC token for testing
        MockUSDC mockUsdc = new MockUSDC();
        usdcTokenAddr = address(mockUsdc);

        // Fund deployer with test ETH and USDC
        vm.deal(deployer, 1000 ether);
        mockUsdc.mint(deployer, 1000000e6);
    }

    /**
     * @notice Deploy all contracts
     */
    function _deployContracts() internal {
        vm.startPrank(deployer);

        auctionRegistry = new AuctionRegistry();

        governance = new Governance(usdcTokenAddr);
        assertEq(governance.deployer(), deployer);

        depositBox = new DepositBox(usdcTokenAddr, address(auctionRegistry));

        blsVerifier = new BLSVerifier();

        settlement = new Settlement(
            address(blsVerifier),
            address(depositBox),
            usdcTokenAddr
        );

        vm.stopPrank();
    }

    // ==================== Test Cases ====================

    /**
     * @notice Test: Deployer can call genesis()
     *
     * Success Criteria:
     *   - genesis() succeeds when called by owner
     *   - initialized flag is set to true
     *   - genesisBlock is set
     *   - Contract addresses are linked
     */
    function testGenesisByOwnerSucceeds() public {
        _deployContracts();

        vm.prank(deployer);
        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );

        // Verify initialization
        assertTrue(governance.initialized(), "Should be initialized");
        assertGt(governance.genesisBlock(), 0, "genesisBlock should be set");

        // Verify contract links
        assertEq(governance.depositBox(), address(depositBox));
        assertEq(governance.blsVerifier(), address(blsVerifier));
        assertEq(governance.settlement(), address(settlement));

        // Verify not bricked
        assertFalse(governance.bricked(), "Should not be bricked");

        console.log("[PASS] genesis() succeeded for owner");
        console.log("  - initialized:", governance.initialized());
        console.log("  - genesisBlock:", governance.genesisBlock());
    }

    /**
     * @notice Test: Non-owner cannot call genesis()
     *
     * Success Criteria:
     *   - genesis() reverts when called by non-owner
     *   - Error message: "Ownable: caller is not the owner"
     */
    function testGenesisByNonOwnerReverts() public {
        _deployContracts();

        vm.prank(nonOwner);
        vm.expectRevert("Governance: not deployer");
        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );

        // Verify still not initialized
        assertFalse(governance.initialized(), "Should not be initialized");
        assertEq(governance.genesisBlock(), 0, "genesisBlock should be 0");

        console.log("[PASS] genesis() correctly reverted for non-owner");
    }

    /**
     * @notice Test: genesis() can only be called once
     *
     * Success Criteria:
     *   - Second call to genesis() reverts
     *   - Error message: "Governance: already initialized"
     */
    function testGenesisCannotBeCalledTwice() public {
        _deployContracts();

        // First call succeeds
        vm.prank(deployer);
        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );
        assertTrue(governance.initialized());

        // Second call reverts
        vm.prank(deployer);
        vm.expectRevert("Governance: already initialized");
        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );

        console.log("[PASS] genesis() correctly rejected on second call");
    }

    /**
     * @notice Test: genesis() rejects zero addresses
     *
     * Success Criteria:
     *   - genesis() reverts with "invalid deposit box" for zero address
     */
    function testGenesisRejectsZeroAddresses() public {
        _deployContracts();

        // Zero depositBox address
        vm.prank(deployer);
        vm.expectRevert("Governance: invalid deposit box");
        governance.genesis(
            address(0),
            address(blsVerifier),
            address(settlement)
        );

        // Zero BLSVerifier address
        vm.prank(deployer);
        vm.expectRevert("Governance: invalid BLS verifier");
        governance.genesis(
            address(depositBox),
            address(0),
            address(settlement)
        );

        // Zero Settlement address
        vm.prank(deployer);
        vm.expectRevert("Governance: invalid settlement");
        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(0)
        );

        console.log("[PASS] genesis() correctly rejected zero addresses");
    }

    /**
     * @notice Test: getSystemState() reflects initialization
     *
     * Success Criteria:
     *   - getSystemState() returns correct values after genesis()
     */
    function testGetSystemStateAfterGenesis() public {
        _deployContracts();

        // Before genesis
        (bool isInit, bool isBricked, address depBox, , , uint256 genBlk, uint256 brickBlk) =
            governance.getSystemState();
        assertFalse(isInit, "Should not be initialized");
        assertEq(genBlk, 0, "genesisBlock should be 0");

        // After genesis
        vm.prank(deployer);
        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );

        (isInit, isBricked, depBox, , , genBlk, brickBlk) = governance.getSystemState();
        assertTrue(isInit, "Should be initialized");
        assertFalse(isBricked, "Should not be bricked");
        assertEq(depBox, address(depositBox));
        assertGt(genBlk, 0, "genesisBlock should be set");
        assertEq(brickBlk, 0, "brickBlock should be 0");

        console.log("[PASS] getSystemState() returns correct values");
    }

    /**
     * @notice Test: Full deployment and genesis flow
     *
     * Success Criteria:
     *   - Complete flow: deploy → genesis works correctly
     *   - All contracts are properly linked
     */
    function testFullDeploymentAndGenesisFlow() public {
        console.log("\n+============================================================+");
        console.log("|  Full Deployment and Genesis Flow Test                    |");
        console.log("+============================================================+");

        console.log("\n[1] Deploying contracts...");
        _deployContracts();
        console.log("   [OK] Governance deployed at:", address(governance));
        console.log("   [OK] DepositBox deployed at:", address(depositBox));
        console.log("   [OK] BLSVerifier deployed at:", address(blsVerifier));
        console.log("   [OK] Settlement deployed at:", address(settlement));

        console.log("\n[2] Initializing BLS verifier...");
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = _getTestValidatorPubkey();
        vm.prank(deployer);
        blsVerifier.initialize(pubkeys);
        console.log("   [OK] BLS verifier initialized with 1 validator");

        console.log("\n[3] Calling genesis()...");
        vm.prank(deployer);
        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );
        console.log("   [OK] genesis() succeeded");

        console.log("\n[4] Setting settlement contract in DepositBox...");
        vm.prank(deployer);
        depositBox.setSettlementContract(address(settlement));
        console.log("   [OK] Settlement contract set");

        console.log("\n[5] Verifying all links...");
        assertEq(governance.depositBox(), address(depositBox));
        assertEq(governance.blsVerifier(), address(blsVerifier));
        assertEq(governance.settlement(), address(settlement));
        assertEq(depositBox.settlementContract(), address(settlement));
        console.log("   [OK] All contracts properly linked");

        console.log("\n+============================================================+");
        console.log("|  [PASS] Full deployment and genesis flow PASSED           |");
        console.log("+============================================================+");
    }

    /**
     * @notice Helper: Get test validator BLS public key
     */
    function _getTestValidatorPubkey() internal pure returns (bytes memory) {
        return hex"a8a5c53d9c0c34b9c7b3e3b5c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5";
    }
}

/**
 * @title MockUSDC
 * @notice Simple mock USDC token for testing
 */
contract MockUSDC {
    string public name = "USD Coin (Mock)";
    string public symbol = "USDC";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor() {
        balanceOf[msg.sender] = 1_000_000_000_000_000e6; // 1T USDC
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }
}
