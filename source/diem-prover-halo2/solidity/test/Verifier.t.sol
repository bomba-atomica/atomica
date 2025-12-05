// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Verifier.sol";

contract VerifierTest is Test {
    Halo2Verifier verifier;

    struct ProofData {
        bytes proof;
        bytes[] instances;
    }

    function setUp() public {
        verifier = new Halo2Verifier();
    }

    function testVerification() public {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/proof_data.json");
        string memory json = vm.readFile(path);

        bytes memory proof = vm.parseJsonBytes(json, ".proof");
        
        // For EquivalenceCircuit, there are no public instances.
        // The generated verifier uses a fallback function that expects the proof (and instances if any) as calldata.
        // Since instances are empty, we just send the proof.
        
        (bool success, ) = address(verifier).call(proof);
        assertTrue(success, "Proof verification failed");
    }

    function testVerificationFailure() public {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/bad_proof_data.json");
        // Only run this test if the file exists to avoid breaking if run independently without the rust driver
        if (!vm.isFile(path)) {
            return;
        }
        string memory json = vm.readFile(path);

        bytes memory proof = vm.parseJsonBytes(json, ".proof");
        
        (bool success, ) = address(verifier).call(proof);
        assertFalse(success, "Proof verification should have failed");
    }
}
