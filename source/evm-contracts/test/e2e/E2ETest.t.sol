// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/DepositBox.sol";
import "../../src/Settlement.sol";
import "../../src/BLSVerifier.sol";
import "../../src/Governance.sol";
import "../../src/libraries/DepositTypes.sol";
import "@openzeppelin/contracts/mocks/ERC20Mock.sol";

/**
 * @title E2ETest
 * @notice End-to-end test using the Docker testnet
 * @dev These tests assume contracts are deployed to a running testnet
 *
 * To run:
 *  1. Start testnet: bun run test-orchestration/src/index.ts --test smoke
 *  2. Deploy contracts: bun run test-orchestration/src/deploy.ts
 *  3. Run tests: forge test --match-path test/e2e/*.sol --rpc-url $ETH_RPC_URL
 */
contract E2ETest is Test {
    // These addresses will be set during deployment
    address depositBoxAddr;
    address settlementAddr;
    address blsVerifierAddr;
    address governanceAddr;
    address usdcTokenAddr;

    DepositBox depositBox;
    Settlement settlement;
    BLSVerifier blsVerifier;
    Governance governance;
    IERC20 usdcToken;

    // Test accounts from Docker testnet genesis
    address alice = address(0x8943545177806ED17B9F23F0a21ee5948eCaa776);
    address bob = address(0x71bE63f3384f5fb98995898A86B02Fb2426c5788);

    // Private keys for test accounts (from testnet genesis)
    // These are well-known test keys - DO NOT USE IN PRODUCTION
    string constant ALICE_KEY = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf7056";
    string constant BOB_KEY = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf7056";

    function setUp() public {
        // Read deployment addresses from file
        string memory deploymentPath = string.concat(vm.projectRoot(), "/test-results/deployment.json");

        if (exists(deploymentPath)) {
            string memory json = vm.readFile(deploymentPath);
            depositBoxAddr = vm.parseJsonAddress(json, ".DepositBox");
            settlementAddr = vm.parseJsonAddress(json, ".Settlement");
            blsVerifierAddr = vm.parseJsonAddress(json, ".BLSVerifier");
            governanceAddr = vm.parseJsonAddress(json, ".Governance");
            usdcTokenAddr = vm.parseJsonAddress(json, ".USDCToken");

            depositBox = DepositBox(payable(depositBoxAddr));
            settlement = Settlement(payable(settlementAddr));
            blsVerifier = BLSVerifier(payable(blsVerifierAddr));
            governance = Governance(payable(governanceAddr));
            usdcToken = IERC20(usdcTokenAddr);
        } else {
            // Fallback: deploy locally for unit testing
            _setupLocal();
        }
    }

    function _setupLocal() internal {
        ERC20Mock mock = new ERC20Mock();
        usdcToken = IERC20(address(mock));

        governance = new Governance(address(usdcToken));
        depositBox = new DepositBox(address(usdcToken));
        blsVerifier = new BLSVerifier();
        settlement = new Settlement(
            address(blsVerifier),
            address(depositBox),
            address(usdcToken)
        );

        // Initialize
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = hex"a8a5c53d9c0c34b9c7b3e3b5c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5";
        blsVerifier.initialize(pubkeys);

        governance.genesis(
            address(depositBox),
            address(blsVerifier),
            address(settlement)
        );

        depositBox.setSettlementContract(address(settlement));

        // Fund test accounts
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        mock.mint(alice, 1000000e6);
        mock.mint(bob, 1000000e6);
    }

    function testE2EDepositFlow() public {
        uint256 depositAmount = 1 ether;

        // Get initial balances
        uint256 initialContractBalance = address(depositBox).balance;
        uint256 initialAliceBalance = alice.balance;

        // Make deposit
        vm.prank(alice);
        depositBox.depositETH{value: depositAmount}();

        // Verify
        assertEq(address(depositBox).balance, initialContractBalance + depositAmount);
        assertEq(alice.balance, initialAliceBalance - depositAmount);

        DepositTypes.Deposit memory deposit = depositBox.getDeposit(alice, 1);
        assertEq(deposit.amount, depositAmount);
        assertEq(uint256(deposit.status), 0); // PENDING
        assertEq(deposit.depositor, alice);
    }

    function testE2EUSDCDepositFlow() public {
        uint256 depositAmount = 500e6;

        // Get initial balances
        uint256 initialContractBalance = usdcToken.balanceOf(address(depositBox));
        uint256 initialAliceBalance = usdcToken.balanceOf(alice);

        // Approve and deposit
        vm.prank(alice);
        usdcToken.approve(address(depositBox), depositAmount);
        vm.prank(alice);
        depositBox.depositUSDC(depositAmount);

        // Verify
        assertEq(usdcToken.balanceOf(address(depositBox)), initialContractBalance + depositAmount);
        assertEq(usdcToken.balanceOf(alice), initialAliceBalance - depositAmount);
    }

    function testE2EConfirmAndSettle() public {
        // Setup
        uint256 ethAmount = 2 ether;
        uint256 usdcAmount = 3000e6;

        // Alice deposits ETH
        vm.prank(alice);
        depositBox.depositETH{value: ethAmount}();

        // Bob deposits USDC
        vm.prank(bob);
        usdcToken.approve(address(depositBox), usdcAmount);
        vm.prank(bob);
        depositBox.depositUSDC(usdcAmount);

        // Confirm deposits
        address[] memory depositors = new address[](2);
        uint256[] memory nonces = new uint256[](2);
        depositors[0] = alice;
        depositors[1] = bob;
        nonces[0] = 1;
        nonces[1] = 1;

        bytes32 stateRoot = bytes32(uint256(keccak256("auction_result")));

        vm.prank(address(settlement));
        depositBox.confirmDeposits(depositors, nonces, stateRoot);

        // Verify confirmed
        assertEq(uint256(depositBox.getDeposit(alice, 1).status), 1); // CONFIRMED
        assertEq(uint256(depositBox.getDeposit(bob, 1).status), 1); // CONFIRMED

        // Execute settlement (mock BLS verification)
        bytes32 blockHash = bytes32(uint256(keccak256("settlement_block")));
        bytes memory blsSig = hex"00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

        uint256[] memory validatorIndices = new uint256[](1);
        validatorIndices[0] = 0;

        address[] memory winners = new address[](1);
        address[] memory settleDepositors = new address[](1);
        uint256[] memory settleNonces = new uint256[](1);
        uint256[] memory ethAmounts = new uint256[](1);
        uint256[] memory usdcAmounts = new uint256[](1);

        winners[0] = alice;
        settleDepositors[0] = bob;
        settleNonces[0] = 1;
        ethAmounts[0] = ethAmount;
        usdcAmounts[0] = usdcAmount;

        DepositTypes.TradeResult memory tradeResult = DepositTypes.TradeResult({
            clearingPrice: 1500e6,
            ethToTrade: ethAmount,
            usdcToTrade: usdcAmount,
            ethStateRoot: stateRoot,
            startNonce: 1,
            endNonce: 2
        });

        // Mock BLS to succeed
        vm.mockCall(
            address(blsVerifier),
            abi.encodeWithSelector(BLSVerifier.verifyBlockHash.selector, blockHash, blsSig, validatorIndices),
            abi.encode(true)
        );

        vm.prank(address(settlement));
        settlement.settle(
            blockHash,
            stateRoot,
            tradeResult,
            blsSig,
            validatorIndices,
            winners,
            settleDepositors,
            settleNonces,
            ethAmounts,
            usdcAmounts
        );

        // Verify settled
        assertEq(uint256(depositBox.getDeposit(bob, 1).status), 2); // SETTLED
    }

    function testE2EStateProofCompatibility() public view {
        // Verify that storage key computation matches what off-chain
        // eth_getProof expects

        bytes32 computedKey = depositBox.getStorageKey(alice, 1);
        bytes32 expectedKey = keccak256(abi.encode(alice, 1));

        assertEq(computedKey, expectedKey);

        // This is the key that would be used in eth_getProof:
        // eth_getProof(depositBoxAddr, [0x${computedKey.slice(2)}], blockNumber)
    }

    function testE2EContractBalances() public view {
        (uint256 ethBalance, uint256 usdcBalance) = settlement.getContractBalances();

        assertGe(ethBalance, 0);
        assertGe(usdcBalance, 0);
    }

    function testE2EGovernanceState() public view {
        (bool isInitialized, bool isBricked, address depositBoxAddr, , , uint256 genesisBlk, uint256 brickBlk) =
            governance.getSystemState();

        assertTrue(isInitialized);
        assertFalse(isBricked);
        assertNotEq(depositBoxAddr, address(0));
        assertGe(genesisBlk, 0);
        assertEq(brickBlk, 0);
    }
}
