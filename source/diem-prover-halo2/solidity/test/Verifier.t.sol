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
        // EquivalenceCircuit has 0 instances, so we don't need to parse instances.
        // But verifyProof signature might expect instances array.
        // Let's check Verifier.sol signature later. Usually it's verifyProof(proof, instances).
        // If instances is empty, we pass empty array.
        
        uint256[] memory instances = new uint256[](0);

        // Note: The generated verifier usually takes `uint256[] memory instances` 
        // OR `uint256[][] memory instances` depending on how it's generated.
        // For 0 instances, it might just take the proof.
        // Or it might take `uint256[] calldata instances`.
        
        // Let's assume standard signature: verifyProof(bytes memory proof, uint256[] memory instances)
        // or verifyProof(bytes calldata proof, uint256[] calldata instances)
        
        // I will try to call it. If signature mismatches, I'll fix it.
        
        bool success = verifier.verifyProof(proof, instances);
        assertTrue(success, "Proof verification failed");
    }
}
