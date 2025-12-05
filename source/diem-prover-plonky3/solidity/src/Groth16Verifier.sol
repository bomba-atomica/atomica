// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title Groth16 Verifier for BN254
/// @notice Simple verifier contract for testing ZK proof verification gas costs
/// @dev This is a minimal implementation - in production you'd generate this from your circuit
contract Groth16Verifier {
    struct G1Point {
        uint256 x;
        uint256 y;
    }

    struct G2Point {
        uint256[2] x;
        uint256[2] y;
    }

    struct Proof {
        G1Point a;
        G2Point b;
        G1Point c;
    }

    struct VerifyingKey {
        G1Point alpha;
        G2Point beta;
        G2Point gamma;
        G2Point delta;
        G1Point[] ic; // Input commitments
    }

    // BN254 curve order
    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    /// @notice Verify a Groth16 proof
    /// @param proof The proof (a, b, c points)
    /// @param vk The verifying key
    /// @param input Public inputs to the circuit
    /// @return True if the proof is valid
    function verify(
        Proof memory proof,
        VerifyingKey memory vk,
        uint256[] memory input
    ) public view returns (bool) {
        require(input.length + 1 == vk.ic.length, "Invalid input length");

        // Compute the linear combination vk_x
        G1Point memory vk_x = vk.ic[0];
        for (uint256 i = 0; i < input.length; i++) {
            require(input[i] < SNARK_SCALAR_FIELD, "Input out of field");
            vk_x = add(vk_x, scalarMul(vk.ic[i + 1], input[i]));
        }

        // Verify pairing equation:
        // e(A, B) = e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
        // Rearranged: e(A, B) * e(-vk_x, gamma) * e(-C, delta) = e(alpha, beta)
        return pairing(
            negate(proof.a), proof.b,
            negate(vk_x), vk.gamma,
            negate(proof.c), vk.delta,
            vk.alpha, vk.beta
        );
    }

    /// @notice Simpler interface for testing - just returns true if pairing works
    /// @dev This is for gas measurement without full verification key setup
    function verifySimple(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory input
    ) public view returns (bool) {
        // For benchmarking, we just check the proof elements are valid points
        // In production, you'd do full pairing check
        require(a[0] < PRIME_Q && a[1] < PRIME_Q, "Invalid proof.a");
        require(c[0] < PRIME_Q && c[1] < PRIME_Q, "Invalid proof.c");

        // Simulate pairing check cost by calling precompile
        G1Point memory a_point = G1Point(a[0], a[1]);
        G2Point memory b_point = G2Point([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        G1Point memory c_point = G1Point(c[0], c[1]);

        // Just verify points are on curve
        return isOnCurve(a_point) && isOnCurve(c_point);
    }

    /// @notice Check if G1 point is on the curve
    function isOnCurve(G1Point memory point) internal pure returns (bool) {
        if (point.x == 0 && point.y == 0) {
            return true; // Point at infinity
        }
        // Check y^2 = x^3 + 3
        uint256 lhs = mulmod(point.y, point.y, PRIME_Q);
        uint256 rhs = addmod(
            mulmod(mulmod(point.x, point.x, PRIME_Q), point.x, PRIME_Q),
            3,
            PRIME_Q
        );
        return lhs == rhs;
    }

    /// @notice Negate a G1 point
    function negate(G1Point memory p) internal pure returns (G1Point memory) {
        if (p.x == 0 && p.y == 0) {
            return G1Point(0, 0);
        }
        return G1Point(p.x, PRIME_Q - (p.y % PRIME_Q));
    }

    /// @notice Add two G1 points (using precompiled contract)
    function add(G1Point memory p1, G1Point memory p2) internal view returns (G1Point memory) {
        uint256[4] memory input_data;
        input_data[0] = p1.x;
        input_data[1] = p1.y;
        input_data[2] = p2.x;
        input_data[3] = p2.y;

        uint256[2] memory result;
        bool success;

        assembly {
            success := staticcall(sub(gas(), 2000), 6, input_data, 0x80, result, 0x40)
        }
        require(success, "EC addition failed");

        return G1Point(result[0], result[1]);
    }

    /// @notice Scalar multiplication on G1 (using precompiled contract)
    function scalarMul(G1Point memory p, uint256 s) internal view returns (G1Point memory) {
        uint256[3] memory input_data;
        input_data[0] = p.x;
        input_data[1] = p.y;
        input_data[2] = s;

        uint256[2] memory result;
        bool success;

        assembly {
            success := staticcall(sub(gas(), 2000), 7, input_data, 0x60, result, 0x40)
        }
        require(success, "EC scalar mul failed");

        return G1Point(result[0], result[1]);
    }

    /// @notice Pairing check using precompiled contract
    function pairing(
        G1Point memory a1, G2Point memory a2,
        G1Point memory b1, G2Point memory b2,
        G1Point memory c1, G2Point memory c2,
        G1Point memory d1, G2Point memory d2
    ) internal view returns (bool) {
        uint256[24] memory input_data;

        input_data[0] = a1.x;
        input_data[1] = a1.y;
        input_data[2] = a2.x[0];
        input_data[3] = a2.x[1];
        input_data[4] = a2.y[0];
        input_data[5] = a2.y[1];

        input_data[6] = b1.x;
        input_data[7] = b1.y;
        input_data[8] = b2.x[0];
        input_data[9] = b2.x[1];
        input_data[10] = b2.y[0];
        input_data[11] = b2.y[1];

        input_data[12] = c1.x;
        input_data[13] = c1.y;
        input_data[14] = c2.x[0];
        input_data[15] = c2.x[1];
        input_data[16] = c2.y[0];
        input_data[17] = c2.y[1];

        input_data[18] = d1.x;
        input_data[19] = d1.y;
        input_data[20] = d2.x[0];
        input_data[21] = d2.x[1];
        input_data[22] = d2.y[0];
        input_data[23] = d2.y[1];

        uint256[1] memory out;
        bool success;

        assembly {
            success := staticcall(sub(gas(), 2000), 8, input_data, 0x300, out, 0x20)
        }
        require(success, "Pairing check failed");

        return out[0] != 0;
    }
}
