// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/BLSVerifier.sol";

contract BLSVerifierTest is Test {
    BLSVerifier blsVerifier;

    address admin = address(0xADMIN);

    function setUp() public {
        blsVerifier = new BLSVerifier();
    }

    function testInitialize() public {
        bytes[] memory pubkeys = new bytes[](3);
        pubkeys[0] = _generateValidPubkey();
        pubkeys[1] = _generateValidPubkey();
        pubkeys[2] = _generateValidPubkey();

        blsVerifier.initialize(pubkeys);

        assertEq(blsVerifier.getValidatorCount(), 3);
        assertEq(blsVerifier.currentEpoch(), 0);
    }

    function testInitializeEmpty() public {
        bytes[] memory empty = new bytes[](0);

        vm.expectRevert("BLS: no validators");
        blsVerifier.initialize(empty);
    }

    function testInitializeTwice() public {
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = _generateValidPubkey();

        blsVerifier.initialize(pubkeys);

        vm.expectRevert("BLS: already initialized");
        blsVerifier.initialize(pubkeys);
    }

    function testIsStateRootValidUninitialized() public view {
        assertTrue(!blsVerifier.isStateRootValid(bytes32(0)));
    }

    function testIsStateRootValidNotVerified() public {
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = _generateValidPubkey();

        blsVerifier.initialize(pubkeys);

        assertTrue(!blsVerifier.isStateRootValid(bytes32("test")));
    }

    function testVerifyStateProofBeforeInitialization() public {
        bytes32 stateRoot = bytes32("test state");
        bytes memory signature = _generateValidSignature();
        uint256[] memory indices = new uint256[](1);
        indices[0] = 0;

        vm.expectRevert("BLS: not initialized");
        blsVerifier.verifyStateProof(stateRoot, signature, indices);
    }

    function testVerifyStateProofInvalidStateRoot() public {
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = _generateValidPubkey();

        blsVerifier.initialize(pubkeys);

        bytes memory signature = _generateValidSignature();
        uint256[] memory indices = new uint256[](1);
        indices[0] = 0;

        vm.expectRevert("BLS: invalid state root");
        blsVerifier.verifyStateProof(bytes32(0), signature, indices);
    }

    function testVerifyStateProofInvalidSignatureLength() public {
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = _generateValidPubkey();

        blsVerifier.initialize(pubkeys);

        bytes32 stateRoot = bytes32("test state");
        bytes memory shortSig = new bytes(32);

        uint256[] memory indices = new uint256[](1);
        indices[0] = 0;

        vm.expectRevert("BLS: invalid signature length");
        blsVerifier.verifyStateProof(stateRoot, shortSig, indices);
    }

    function testVerifyStateProofNoValidators() public {
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = _generateValidPubkey();

        blsVerifier.initialize(pubkeys);

        bytes32 stateRoot = bytes32("test state");
        bytes memory signature = _generateValidSignature();
        uint256[] memory emptyIndices = new uint256[](0);

        vm.expectRevert("BLS: no validators");
        blsVerifier.verifyStateProof(stateRoot, signature, emptyIndices);
    }

    function testUpdateValidatorSet() public {
        bytes[] memory initialPubkeys = new bytes[](1);
        initialPubkeys[0] = _generateValidPubkey();

        blsVerifier.initialize(initialPubkeys);

        bytes[] memory newPubkeys = new bytes[](2);
        newPubkeys[0] = _generateValidPubkey();
        newPubkeys[1] = _generateValidPubkey();

        uint64 newEpoch = 1;
        bytes memory signature = _generateValidSignature();
        uint256[] memory indices = new uint256[](1);
        indices[0] = 0;

        vm.expectRevert("BLS: invalid validator update signature");
        blsVerifier.updateValidatorSet(newPubkeys, newEpoch, signature, indices);
    }

    function testUpdateValidatorSetSameEpoch() public {
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = _generateValidPubkey();

        blsVerifier.initialize(pubkeys);

        bytes[] memory newPubkeys = new bytes[](2);
        newPubkeys[0] = _generateValidPubkey();
        newPubkeys[1] = _generateValidPubkey();

        uint64 sameEpoch = 0;
        bytes memory signature = _generateValidSignature();
        uint256[] memory indices = new uint256[](1);
        indices[0] = 0;

        vm.expectRevert("BLS: epoch must increase");
        blsVerifier.updateValidatorSet(newPubkeys, sameEpoch, signature, indices);
    }

    function testUpdateValidatorSetEmptyPubkeys() public {
        bytes[] memory pubkeys = new bytes[](1);
        pubkeys[0] = _generateValidPubkey();

        blsVerifier.initialize(pubkeys);

        bytes[] memory emptyPubkeys = new bytes[](0);
        uint64 newEpoch = 1;
        bytes memory signature = _generateValidSignature();
        uint256[] memory indices = new uint256[](1);
        indices[0] = 0;

        vm.expectRevert("BLS: must have validators");
        blsVerifier.updateValidatorSet(emptyPubkeys, newEpoch, signature, indices);
    }

    function _generateValidPubkey() internal pure returns (bytes memory) {
        bytes memory pubkey = new bytes(48);
        pubkey[0] = 0x80;

        for (uint256 i = 1; i < 48; i++) {
            pubkey[i] = bytes1(uint8(i));
        }

        return pubkey;
    }

    function _generateValidSignature() internal pure returns (bytes memory) {
        bytes memory sig = new bytes(48);
        sig[0] = 0x40;

        for (uint256 i = 1; i < 48; i++) {
            sig[i] = bytes1(uint8(i + 100));
        }

        return sig;
    }
}
