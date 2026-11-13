// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {LockBox} from "../src/escrow/LockBox.sol";
import {IAptosLightClient} from "../src/aptos/IAptosLightClient.sol";
import {FakeETH} from "../src/tokens/FakeETH.sol";
import {FakeUSD} from "../src/tokens/FakeUSD.sol";
import {DeployLockBox} from "./DeployLockBox.s.sol";

/**
 * @title LockProofFixture
 * @notice Regenerates the anvil lock proof fixture of
 *         `source/atomica-move-contracts/sources/eth_lock_registration_tests.move` and the live
 *         commitment pin of `source/atomica-sdk/tests/ethereum/storage-key.test.ts`.
 * @dev Run it by hand on a fresh anvil. No CI job runs it. From `source/evm-contracts`:
 *
 *        anvil --timestamp 1794441599 &
 *        forge script script/LockProofFixture.s.sol:LockProofFixture \
 *          --rpc-url http://localhost:8545 --broadcast --slow
 *        forge script script/LockProofFixture.s.sol:LockProofFixture --sig "proofs()" \
 *          --rpc-url http://localhost:8545 --ffi
 *        kill %1
 *
 *      `run` sends one transaction per block from anvil account 0 (nonce in brackets):
 *        block 1 FakeETH [0], block 2 FakeUSD [1], block 3 LockBox [2] at 0x9fE4…a6e0,
 *        block 4 mint 10 FakeETH [3], block 5 approve [4],
 *        block 6 lock 10 FakeETH, lock nonce 0, into window WINDOW_ID, pair hash keccak256("") [5],
 *        block 7 an unrelated FakeUSD mint [6].
 *      LockBox takes the production window schedule. WINDOW_ID defaults to its `currentWindowId()`
 *      at the chain clock. LockBox computes the deadline, `lockDeadline(WINDOW_ID)`: the window
 *      close plus 72 hours (`eth_proof::eth_lock_deadline`).
 *      `proofs` prints the commitment, the state roots of blocks 6 and 7, and `eth_getProof` of the
 *      commitment slot at both blocks.
 *      LIGHT_CLIENT and ATOMICA_ADDRESS default to placeholders: LockBox only needs them nonzero.
 */
contract LockProofFixture is Script {
    /// @notice Anvil account 0.
    uint256 internal constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    uint256 internal constant TEN_ETH = 10 ether;

    function run() external {
        uint256 key = vm.envOr("PRIVATE_KEY", ANVIL_KEY_0);
        IAptosLightClient lightClient = IAptosLightClient(vm.envOr("LIGHT_CLIENT", address(0x1)));
        bytes32 atomica = vm.envOr("ATOMICA_ADDRESS", bytes32(uint256(0xcafe)));
        DeployLockBox deployer = new DeployLockBox();
        bytes memory typeTag = deployer.outcomeTypeTag(atomica);
        (uint64 daySecs, uint64[] memory closeOffsetsSecs) = deployer.productionWindowSchedule();
        address user = vm.addr(key);

        vm.startBroadcast(key);
        FakeETH fakeETH = new FakeETH();
        FakeUSD fakeUSD = new FakeUSD();
        LockBox lockBox =
            new LockBox(address(fakeETH), address(fakeUSD), lightClient, typeTag, daySecs, closeOffsetsSecs);
        uint64 windowId = uint64(vm.envOr("WINDOW_ID", uint256(lockBox.currentWindowId())));
        fakeETH.mint(user, TEN_ETH);
        fakeETH.approve(address(lockBox), TEN_ETH);
        bytes32 lockId = lockBox.lock(address(fakeETH), TEN_ETH, windowId, keccak256(""));
        fakeUSD.mint(user, 1);
        vm.stopBroadcast();

        console.log("FakeETH:    ", address(fakeETH));
        console.log("FakeUSD:    ", address(fakeUSD));
        console.log("LockBox:    ", address(lockBox));
        console.log("USER:       ", user);
        console.log("WINDOW_ID:  ", windowId);
        console.log("DEADLINE:   ", lockBox.lockDeadline(windowId));
        console.log("LOCK_ID:    ", vm.toString(lockId));
        console.log("STORAGE_KEY:", vm.toString(lockBox.commitmentStorageKey(lockId)));
    }

    /// @notice Print the commitment, the state roots and `eth_getProof` of the commitment slot at
    ///         blocks 6 and 7. Needs `--ffi` (it runs `cast`).
    function proofs() external {
        string memory rpc = vm.envOr("RPC_URL", string("http://localhost:8545"));
        address user = vm.addr(vm.envOr("PRIVATE_KEY", ANVIL_KEY_0));
        address lockBox = vm.computeCreateAddress(user, 2);
        bytes32 lockId = LockBox(lockBox).getLockId(user, address(LockBox(lockBox).fakeETH()), 0);
        bytes32 slot = LockBox(lockBox).commitmentStorageKey(lockId);
        console.log("COMMITMENT:", vm.toString(LockBox(lockBox).commitments(lockId)));
        for (uint256 b = 6; b <= 7; b++) {
            console.log("--- block", b);
            console.log("stateRoot:", vm.toString(bytes32(cast(_block(rpc, b)))));
            console.log(string(cast(_proof(rpc, lockBox, slot, b))));
        }
    }

    function cast(string[] memory args) internal returns (bytes memory) {
        return vm.ffi(args);
    }

    function _block(string memory rpc, uint256 b) internal pure returns (string[] memory args) {
        args = new string[](7);
        args[0] = "cast";
        args[1] = "block";
        args[2] = vm.toString(b);
        args[3] = "--field";
        args[4] = "stateRoot";
        args[5] = "--rpc-url";
        args[6] = rpc;
    }

    function _proof(string memory rpc, address lockBox, bytes32 slot, uint256 b)
        internal
        pure
        returns (string[] memory args)
    {
        args = new string[](8);
        args[0] = "cast";
        args[1] = "proof";
        args[2] = vm.toString(lockBox);
        args[3] = vm.toString(slot);
        args[4] = "--block";
        args[5] = vm.toString(b);
        args[6] = "--rpc-url";
        args[7] = rpc;
    }
}
