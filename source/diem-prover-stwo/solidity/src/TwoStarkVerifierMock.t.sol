// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "./TwoStarkVerifierMock.sol";

/// @title Tests for stwo STARK verifier mock
/// @notice Demonstrates the complexity and limitations of STARK verification on EVM
contract TwoStarkVerifierMockTest is Test {
    TwoStarkVerifierMock public verifier;

    function setUp() public {
        verifier = new TwoStarkVerifierMock();
    }

    /// @notice Test basic proof structure validation
    function testValidateProofStructure_ValidInputs() public {
        // Generate mock proof data (7.7 KB)
        bytes memory mockProof = new bytes(7702);
        mockProof[0] = 0x7b; // JSON start '{'

        // For equality check, a and b must be equal
        uint256 a = 42;
        uint256 b = 42;

        // Validate structure (NOT cryptographic verification)
        bool valid = verifier.validateProofStructure(mockProof, a, b);

        assertTrue(valid, "Valid proof structure should pass");
    }

    /// @notice Test rejection of unequal inputs
    function testValidateProofStructure_UnequalInputs() public {
        bytes memory mockProof = new bytes(7702);
        mockProof[0] = 0x7b;

        uint256 a = 42;
        uint256 b = 43;

        bool valid = verifier.validateProofStructure(mockProof, a, b);

        assertFalse(valid, "Unequal inputs should be rejected");
    }

    /// @notice Test rejection of proof that's too small
    function testValidateProofStructure_ProofTooSmall() public {
        bytes memory mockProof = new bytes(100); // Too small

        uint256 a = 42;
        uint256 b = 42;

        bool valid = verifier.validateProofStructure(mockProof, a, b);

        assertFalse(valid, "Proof too small should be rejected");
    }

    /// @notice Test rejection of out-of-range field elements
    function testValidateProofStructure_OutOfRange() public {
        bytes memory mockProof = new bytes(7702);
        mockProof[0] = 0x7b;

        // M31_PRIME = 2^31 - 1 = 2147483647
        uint256 a = 2147483648; // Exceeds M31 prime
        uint256 b = 2147483648;

        bool valid = verifier.validateProofStructure(mockProof, a, b);

        assertFalse(valid, "Out of range values should be rejected");
    }

    /// @notice Test gas estimation for full verification
    function testEstimateFullVerificationGas() public view {
        uint256 estimatedGas = verifier.estimateFullVerificationGas();

        // Should be in the range of 10-50M gas
        assertGt(estimatedGas, 10_000_000, "Should estimate > 10M gas");
        assertLt(estimatedGas, 50_000_000, "Should estimate < 50M gas");

        console.log("Estimated full verification gas:", estimatedGas);
        console.log("Groth16 verification gas: ~300,000");
        console.log("STARK is ~%dx more expensive", estimatedGas / 300_000);
    }

    /// @notice Test complexity comparison
    function testCompareComplexity() public view {
        (uint256 starkOps, uint256 groth16Ops) = verifier.compareComplexity();

        console.log("STARK operations:", starkOps);
        console.log("Groth16 operations:", groth16Ops);
        console.log("STARK is ~%dx more complex", starkOps / groth16Ops);

        assertGt(starkOps, groth16Ops * 50, "STARK should be much more complex");
    }

    /// @notice Test validation limitations
    function testGetVerificationLimitations() public view {
        string memory info = verifier.getVerificationLimitations();

        // Should contain key information
        assertTrue(bytes(info).length > 100, "Should provide detailed information");

        console.log("\n=== STARK Verification Limitations ===");
        console.log(info);
    }

    /// @notice Test proof format validation
    function testIsValidTwoProof() public view {
        // Valid proof (starts with '{' for JSON)
        bytes memory validProof = new bytes(7702);
        validProof[0] = 0x7b; // '{'

        assertTrue(verifier.isValidTwoProof(validProof), "Valid format should pass");

        // Invalid proof (too small)
        bytes memory invalidProof1 = new bytes(100);
        assertFalse(verifier.isValidTwoProof(invalidProof1), "Too small should fail");

        // Invalid proof (wrong format)
        bytes memory invalidProof2 = new bytes(7702);
        invalidProof2[0] = 0x00; // Not JSON
        assertFalse(verifier.isValidTwoProof(invalidProof2), "Wrong format should fail");
    }

    /// @notice Demonstrate the difference in verification complexity
    function testVerificationComplexityComparison() public {
        console.log("\n=== Verification Complexity Comparison ===\n");

        console.log("GROTH16 (Circom):");
        console.log("  Operations: ~15 (2 pairings + 3 muls + 10 field ops)");
        console.log("  Gas cost: ~300,000");
        console.log("  Implementation: ~100 lines of Solidity");
        console.log("  EVM support: Native precompiles (bn254_pairing)");

        console.log("\nSTARK (Stwo):");
        console.log("  Operations: ~2000 (field ops + merkle + FRI + poly eval)");
        console.log("  Gas cost: ~26,750,000 (estimated)");
        console.log("  Implementation: ~5000+ lines of Solidity");
        console.log("  EVM support: None (need custom implementation)");

        console.log("\nConclusion:");
        console.log("  - STARK is ~133x more complex");
        console.log("  - STARK costs ~89x more gas");
        console.log("  - STARK requires 50x more code");

        uint256 estimatedGas = verifier.estimateFullVerificationGas();
        assertGt(estimatedGas, 10_000_000, "STARK verification very expensive");
    }

    /// @notice Integration test with actual stwo proof data
    function testWithActualProofData() public {
        console.log("\n=== Integration Test with Stwo Proof ===\n");

        // This would be actual proof bytes from stwo
        // For demonstration, we use mock data
        bytes memory actualProof = _generateMockTwoProof();

        console.log("Proof size:", actualProof.length, "bytes");
        console.log("Expected size:", verifier.EXPECTED_PROOF_SIZE(), "bytes");

        // Validate structure
        bool structureValid = verifier.isValidTwoProof(actualProof);
        console.log("Structure valid:", structureValid);

        // Check if it would pass basic validation
        uint256 a = 42;
        uint256 b = 42;
        bool valid = verifier.validateProofStructure(actualProof, a, b);

        console.log("Validation passed:", valid);
        console.log("\nNote: This is STRUCTURAL validation only.");
        console.log("Full cryptographic verification not implemented.");
    }

    /// @notice Helper to generate mock stwo proof
    function _generateMockTwoProof() internal pure returns (bytes memory) {
        // Generate a mock proof that resembles stwo JSON format
        bytes memory mockProof = new bytes(7702);

        // Start with JSON object
        mockProof[0] = 0x7b; // '{'

        // Fill with mock data (would be actual proof structure)
        for (uint i = 1; i < 7702; i++) {
            mockProof[i] = bytes1(uint8(i % 256));
        }

        return mockProof;
    }

    /// @notice Document why full verification isn't practical
    function testDocumentWhyNotFullVerification() public view {
        console.log("\n=== Why Full STARK Verification on EVM is Impractical ===\n");

        console.log("1. Field Arithmetic (M31):");
        console.log("   - Stwo uses Mersenne-31 prime (2^31 - 1)");
        console.log("   - EVM uses 256-bit words");
        console.log("   - Requires custom modular arithmetic");
        console.log("   - ~1000 field operations needed");
        console.log("   - Cost: ~15M gas\n");

        console.log("2. Merkle Tree Verification:");
        console.log("   - Blake2s hash (not keccak256)");
        console.log("   - No EVM precompile for Blake2s");
        console.log("   - Need to implement in Solidity");
        console.log("   - ~200 hash operations");
        console.log("   - Cost: ~750k gas\n");

        console.log("3. FRI Protocol:");
        console.log("   - Multiple query rounds");
        console.log("   - Polynomial folding");
        console.log("   - Complex state machine");
        console.log("   - ~500 operations");
        console.log("   - Cost: ~7.5M gas\n");

        console.log("4. Polynomial Evaluations:");
        console.log("   - Barycentric formula");
        console.log("   - Multiple evaluation points");
        console.log("   - ~300 operations");
        console.log("   - Cost: ~3M gas\n");

        console.log("TOTAL ESTIMATED COST: ~26.75M gas");
        console.log("Block gas limit: 30M gas");
        console.log("Result: Would use ~89% of block gas limit\n");

        console.log("RECOMMENDATION:");
        console.log("  Use recursive proofs or L2 solutions instead");
    }
}
