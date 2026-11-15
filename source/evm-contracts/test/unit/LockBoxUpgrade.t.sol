// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {LockBox} from "../../src/escrow/LockBox.sol";
import {OutcomeTree} from "../../src/escrow/OutcomeTree.sol";
import {IAptosLightClient} from "../../src/aptos/IAptosLightClient.sol";
import {FakeETH} from "../../src/tokens/FakeETH.sol";
import {FakeUSD} from "../../src/tokens/FakeUSD.sol";
import {MockAptosLightClient} from "../utils/MockAptosLightClient.sol";
import {OutcomeTreeBuilder} from "../utils/OutcomeTreeBuilder.sol";
import {DeployLockBox} from "../../script/DeployLockBox.s.sol";
import {LockBoxV2Mock} from "../utils/LockBoxV2Mock.sol";

contract LockBoxUpgradeTest is Test {
    bytes internal constant TYPE_TAG = hex"07cafe";
    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    LockBox private lockBox;
    FakeETH private fakeETH;
    FakeUSD private fakeUSD;
    MockAptosLightClient private client;
    uint64 private window;
    uint64 private deadline;
    address private alice = address(0xA11CE);
    address private stranger = address(0x5157);

    function setUp() public {
        vm.warp(1_700_000_000);
        fakeETH = new FakeETH();
        fakeUSD = new FakeUSD();
        client = new MockAptosLightClient(TYPE_TAG);
        (uint64 daySecs, uint64[] memory offsets) = new DeployLockBox().productionWindowSchedule();
        (lockBox,) = new DeployLockBox()
            .deployProxy(address(fakeETH), address(fakeUSD), client, TYPE_TAG, daySecs, offsets, address(this));
        window = lockBox.currentWindowId();
        deadline = lockBox.lockDeadline(window);
        fakeETH.mint(alice, 20 ether);
        vm.prank(alice);
        fakeETH.approve(address(lockBox), type(uint256).max);
    }

    function test_upgradePreservesSlotZeroLockAndWindowClock() public {
        LockBox.Lock memory l = _lock();
        bytes32 lockId = lockBox.getLockId(l.depositor, l.token, l.nonce);
        bytes32 commitment = lockBox.commitments(lockId);
        uint256 implementationBefore = uint256(vm.load(address(lockBox), IMPLEMENTATION_SLOT));

        LockBoxV2Mock v2 = new LockBoxV2Mock();
        lockBox.upgradeToAndCall(address(v2), bytes(""));

        assertEq(uint256(vm.load(address(lockBox), IMPLEMENTATION_SLOT)), uint256(uint160(address(v2))));
        assertTrue(uint256(vm.load(address(lockBox), IMPLEMENTATION_SLOT)) != implementationBefore);
        assertEq(LockBoxV2Mock(address(lockBox)).version(), 2);
        assertEq(vm.load(address(lockBox), lockBox.commitmentStorageKey(lockId)), commitment);
        assertEq(lockBox.commitments(lockId), commitment);
        assertEq(uint256(lockBox.statuses(lockId)), uint256(LockBox.Status.Open));
        assertEq(lockBox.lockDeadline(window), deadline);
        (uint64 daySecs, uint64[] memory offsets) = lockBox.windowSchedule();
        assertEq(daySecs, 86_400);
        assertEq(offsets.length, 2);
        assertEq(offsets[0], 27_900);
        assertEq(offsets[1], 58_500);
    }

    function test_freezePermanentlyDisablesUpgradeAndSecondFreeze() public {
        lockBox.freeze();
        assertTrue(lockBox.frozen());
        LockBoxV2Mock v2 = new LockBoxV2Mock();
        vm.expectRevert(LockBox.UpgradesFrozen.selector);
        lockBox.upgradeToAndCall(address(v2), bytes(""));
        vm.expectRevert(LockBox.AlreadyFrozen.selector);
        lockBox.freeze();

        vm.expectRevert(LockBox.NotAdmin.selector);
        vm.prank(stranger);
        lockBox.upgradeToAndCall(address(v2), bytes(""));
        vm.expectRevert(LockBox.NotAdmin.selector);
        vm.prank(stranger);
        lockBox.freeze();
    }

    function test_onlyAdminCanUpgradeOrFreeze() public {
        LockBoxV2Mock v2 = new LockBoxV2Mock();
        vm.expectRevert(LockBox.NotAdmin.selector);
        vm.prank(stranger);
        lockBox.upgradeToAndCall(address(v2), bytes(""));
        vm.expectRevert(LockBox.NotAdmin.selector);
        vm.prank(stranger);
        lockBox.freeze();
    }

    function test_initializerCannotBeReused() public {
        LockBox implementation = new LockBox();
        (uint64 daySecs, uint64[] memory offsets) = new DeployLockBox().productionWindowSchedule();
        vm.expectRevert();
        implementation.initialize(address(fakeETH), address(fakeUSD), client, TYPE_TAG, daySecs, offsets, address(this));
        vm.expectRevert();
        lockBox.initialize(address(fakeETH), address(fakeUSD), client, TYPE_TAG, daySecs, offsets, address(this));
    }

    function test_proxyInitializerRejectsZeroAdmin() public {
        LockBox implementation = new LockBox();
        (uint64 daySecs, uint64[] memory offsets) = new DeployLockBox().productionWindowSchedule();
        bytes memory initialization = abi.encodeCall(
            LockBox.initialize, (address(fakeETH), address(fakeUSD), client, TYPE_TAG, daySecs, offsets, address(0))
        );
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Invalid admin"));
        new ERC1967Proxy(address(implementation), initialization);
    }

    function test_bareImplementationIsDisabledAndProxyIsInitialized() public view {
        assertEq(address(lockBox.admin()), address(this));
        assertFalse(lockBox.frozen());
    }

    function test_userPathsStayPermissionlessAfterUpgradeAndFreeze() public {
        LockBoxV2Mock v2 = new LockBoxV2Mock();
        lockBox.upgradeToAndCall(address(v2), bytes(""));
        LockBox.Lock memory l = _lock();
        LockBox.Lock memory reclaimed = _lockWithPair(bytes32("other pair"));
        bytes32 lockId = lockBox.getLockId(l.depositor, l.token, l.nonce);
        OutcomeTree.Payout[] memory payouts = new OutcomeTree.Payout[](1);
        payouts[0] = OutcomeTree.Payout(stranger, l.amount);
        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = OutcomeTreeBuilder.leafHash(lockId, OutcomeTreeBuilder.payoutsHash(payouts));
        IAptosLightClient.EventProof memory proof;
        proof.version = 1;
        proof.contractEvent =
            OutcomeTreeBuilder.outcomeBcs(l.windowId, l.pairHash, l.deadline, OutcomeTreeBuilder.root(leaves), 1);
        lockBox.recordOutcome(proof);
        lockBox.freeze();

        vm.prank(stranger);
        lockBox.releaseByOutcome(l, payouts, OutcomeTree.LeafProof(0, new bytes32[](0)));
        vm.warp(reclaimed.deadline);
        vm.prank(stranger);
        lockBox.reclaim(reclaimed, new OutcomeTree.Neighbour[](0));
        assertEq(uint256(lockBox.statuses(lockId)), uint256(LockBox.Status.Released));
        assertEq(
            uint256(lockBox.statuses(lockBox.getLockId(reclaimed.depositor, reclaimed.token, reclaimed.nonce))),
            uint256(LockBox.Status.Reclaimed)
        );
        assertEq(fakeETH.balanceOf(stranger), 10 ether);
        assertEq(fakeETH.balanceOf(alice), 10 ether);
    }

    function test_lockRemainsPermissionlessAfterFreeze() public {
        lockBox.freeze();
        fakeETH.mint(stranger, 2 ether);
        vm.startPrank(stranger);
        fakeETH.approve(address(lockBox), 2 ether);
        uint256 nonce = lockBox.nextLockNonce();
        lockBox.lock(address(fakeETH), 2 ether, window, bytes32("post-freeze"));
        vm.stopPrank();

        bytes32 lockId = lockBox.getLockId(stranger, address(fakeETH), nonce);
        assertTrue(lockBox.frozen());
        assertEq(uint256(lockBox.statuses(lockId)), uint256(LockBox.Status.Open));
        assertEq(fakeETH.balanceOf(address(lockBox)), 2 ether);
    }

    function _lock() private returns (LockBox.Lock memory l) {
        return _lockWithPair(bytes32("pair"));
    }

    function _lockWithPair(bytes32 pairHash) private returns (LockBox.Lock memory l) {
        uint256 nonce = lockBox.nextLockNonce();
        vm.prank(alice);
        lockBox.lock(address(fakeETH), 10 ether, window, pairHash);
        l = LockBox.Lock(alice, address(fakeETH), nonce, 10 ether, window, pairHash, deadline);
    }
}

contract DeployLockBoxProxyTest is Test {
    bytes internal constant TYPE_TAG = hex"07cafe";

    function test_deployScriptInitializesProxyState() public {
        FakeETH fakeETH = new FakeETH();
        FakeUSD fakeUSD = new FakeUSD();
        MockAptosLightClient client = new MockAptosLightClient(TYPE_TAG);
        (uint64 daySecs, uint64[] memory offsets) = new DeployLockBox().productionWindowSchedule();
        (LockBox lockBox,) = new DeployLockBox()
            .deployProxy(
                address(fakeETH),
                address(fakeUSD),
                IAptosLightClient(address(client)),
                TYPE_TAG,
                daySecs,
                offsets,
                address(this)
            );
        assertEq(lockBox.admin(), address(this));
        assertFalse(lockBox.frozen());
        (uint64 actualDay, uint64[] memory actualOffsets) = lockBox.windowSchedule();
        assertEq(actualDay, daySecs);
        assertEq(actualOffsets.length, offsets.length);
        for (uint256 i = 0; i < offsets.length; i++) {
            assertEq(actualOffsets[i], offsets[i]);
        }
    }

    function test_runDeploysProxyUsingEnvironment() public {
        uint256 deployerKey = 0xA11CE;
        address deployer = vm.addr(deployerKey);
        address admin = address(0xAD01);
        vm.setEnv("PRIVATE_KEY", vm.toString(deployerKey));
        vm.setEnv("LIGHT_CLIENT", vm.toString(address(new MockAptosLightClient(TYPE_TAG))));
        vm.setEnv("LOCKBOX_ADMIN", vm.toString(admin));
        vm.setEnv("ATOMICA_ADDRESS", vm.toString(bytes32(uint256(0xA70))));

        address expectedProxy = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 3);
        new DeployLockBox().run();

        LockBox lockBox = LockBox(expectedProxy);
        assertEq(lockBox.admin(), admin);
        assertFalse(lockBox.frozen());
        (uint64 daySecs, uint64[] memory closeOffsetsSecs) = lockBox.windowSchedule();
        assertEq(daySecs, 86_400);
        assertEq(closeOffsetsSecs.length, 2);
        assertEq(closeOffsetsSecs[0], 27_900);
        assertEq(closeOffsetsSecs[1], 58_500);
    }
}
