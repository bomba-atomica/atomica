// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

/// @notice Reads the Aptos outcome proof golden vectors copied from atomica-aptos.
abstract contract AptosVectors is Test {
    string internal vectors =
        vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/aptos/aptos_outcome_proof_vectors.json"));

    /// Hex field without a 0x prefix.
    function _hex(string memory path) internal view returns (bytes memory) {
        return vm.parseBytes(string.concat("0x", vm.parseJsonString(vectors, path)));
    }

    function _b32(string memory path) internal view returns (bytes32) {
        return bytes32(_hex(path));
    }
}
