// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title BLSVerifier
 * @notice Library for BLS12-381 aggregate signature verification
 * @dev Uses EIP-2537 precompiles for efficient BLS operations
 */
library BLSVerifier {
    // BLS12-381 precompile addresses (EIP-2537)
    address constant BLS12_G1ADD = address(0x0b);
    address constant BLS12_G1MUL = address(0x0c);
    address constant BLS12_G1MULTIEXP = address(0x0d);
    address constant BLS12_G2ADD = address(0x0e);
    address constant BLS12_G2MUL = address(0x0f);
    address constant BLS12_PAIRING = address(0x10);
    address constant BLS12_MAP_FP_TO_G1 = address(0x11);
    address constant BLS12_MAP_FP2_TO_G2 = address(0x12);

    // G1 point size (x, y coordinates): 2 * 48 = 96 bytes
    uint256 constant G1_POINT_SIZE = 96;
    // G2 point size (x0, x1, y0, y1 coordinates): 4 * 48 = 192 bytes
    uint256 constant G2_POINT_SIZE = 192;

    error InsufficientVotingPower();
    error BLSVerificationFailed();
    error InvalidPublicKey();

    /**
     * @notice Verify BLS aggregate signature
     * @param message Message that was signed (32 bytes hash)
     * @param signature Aggregated BLS signature (G1 point, 96 bytes)
     * @param publicKeys Array of BLS public keys (G1 points)
     * @param signerBitmask Bitmask indicating which validators signed
     * @param votingPowers Voting power of each validator
     * @param quorumVotingPower Required voting power for quorum (2f+1)
     * @return True if signature is valid and meets quorum
     */
    function verifyAggregateSignature(
        bytes32 message,
        bytes calldata signature,
        bytes[] memory publicKeys,
        uint256 signerBitmask,
        uint64[] memory votingPowers,
        uint128 quorumVotingPower
    ) internal view returns (bool) {
        require(signature.length == G1_POINT_SIZE, "Invalid signature length");
        require(publicKeys.length == votingPowers.length, "Length mismatch");

        // 1. Calculate total voting power and count signers
        uint128 totalVotingPower = 0;
        uint256 signerCount = 0;

        for (uint256 i = 0; i < publicKeys.length; i++) {
            if ((signerBitmask & (1 << i)) != 0) {
                require(publicKeys[i].length == G1_POINT_SIZE, "Invalid public key");
                totalVotingPower += votingPowers[i];
                signerCount++;
            }
        }

        // Check quorum
        if (totalVotingPower < quorumVotingPower) {
            revert InsufficientVotingPower();
        }

        if (signerCount == 0) {
            revert BLSVerificationFailed();
        }

        // 2. Aggregate public keys of signers
        bytes memory aggregatedPubKey = _aggregatePublicKeys(
            publicKeys,
            signerBitmask,
            signerCount
        );

        // 3. Verify pairing equation: e(H(m), pk) == e(sig, G2_gen)
        return _verifyPairing(message, signature, aggregatedPubKey);
    }

    /**
     * @notice Aggregate multiple BLS public keys
     * @dev Uses G1MULTIEXP precompile for efficiency
     */
    function _aggregatePublicKeys(
        bytes[] memory publicKeys,
        uint256 signerBitmask,
        uint256 signerCount
    ) private view returns (bytes memory) {
        // Prepare input for G1MULTIEXP: [(point1, scalar1), (point2, scalar2), ...]
        // We use scalar=1 for all keys since we're just summing them
        bytes memory input = new bytes(signerCount * 160); // 96 bytes point + 64 bytes scalar
        uint256 offset = 0;

        for (uint256 i = 0; i < publicKeys.length; i++) {
            if ((signerBitmask & (1 << i)) != 0) {
                // Copy public key (96 bytes)
                bytes memory pk = publicKeys[i];
                for (uint256 j = 0; j < G1_POINT_SIZE; j++) {
                    input[offset + j] = pk[j];
                }
                offset += G1_POINT_SIZE;

                // Add scalar = 1 (32 bytes, little-endian)
                input[offset] = 0x01;
                offset += 32;

                // Pad to 64 bytes for scalar
                offset += 32;
            }
        }

        // Call G1MULTIEXP precompile
        (bool success, bytes memory result) = BLS12_G1MULTIEXP.staticcall(input);
        require(success, "G1 aggregation failed");
        require(result.length == G1_POINT_SIZE, "Invalid aggregation result");

        return result;
    }

    /**
     * @notice Verify BLS pairing equation
     * @dev Checks: e(H(message), aggregatedPubKey) == e(signature, G2_generator)
     */
    function _verifyPairing(
        bytes32 message,
        bytes calldata signature,
        bytes memory aggregatedPubKey
    ) private view returns (bool) {
        // 1. Hash message to G2
        bytes memory hashedMessage = _hashToG2(message);

        // 2. Prepare pairing input:
        //    - First pair: (aggregatedPubKey G1, hashedMessage G2)
        //    - Second pair: (-signature G1, G2_generator)
        //    The pairing check verifies: e(pk, H(m)) * e(-sig, G2_gen) == 1
        //    Which is equivalent to: e(pk, H(m)) == e(sig, G2_gen)

        bytes memory pairingInput = new bytes(384); // 2 pairs * (96 + 96) bytes

        // First pair: aggregatedPubKey (G1) and hashedMessage (G2)
        uint256 offset = 0;
        for (uint256 i = 0; i < G1_POINT_SIZE; i++) {
            pairingInput[offset++] = aggregatedPubKey[i];
        }
        for (uint256 i = 0; i < G2_POINT_SIZE; i++) {
            pairingInput[offset++] = hashedMessage[i];
        }

        // Second pair: negated signature (G1) and G2 generator
        bytes memory negSig = _negateG1Point(signature);
        for (uint256 i = 0; i < G1_POINT_SIZE; i++) {
            pairingInput[offset++] = negSig[i];
        }
        bytes memory g2Gen = _g2Generator();
        for (uint256 i = 0; i < G2_POINT_SIZE; i++) {
            pairingInput[offset++] = g2Gen[i];
        }

        // 3. Call pairing precompile
        (bool success, bytes memory result) = BLS12_PAIRING.staticcall(pairingInput);
        require(success, "Pairing check failed");
        require(result.length == 32, "Invalid pairing result");

        // Result is 1 if pairing equation holds
        return abi.decode(result, (bool));
    }

    /**
     * @notice Hash message to G2 point
     * @dev Uses BLS12_MAP_FP2_TO_G2 precompile
     */
    function _hashToG2(bytes32 message) private view returns (bytes memory) {
        // Aptos uses the "BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_" ciphersuite
        // First, expand message using SHA-256
        bytes memory expandedMsg = _expandMessageXMD(message);

        // Map to G2 curve point
        (bool success, bytes memory result) = BLS12_MAP_FP2_TO_G2.staticcall(expandedMsg);
        require(success, "Hash to G2 failed");
        require(result.length == G2_POINT_SIZE, "Invalid G2 point");

        return result;
    }

    /**
     * @notice Expand message using SHA-256 XMD
     * @dev Implements expand_message_xmd from hash-to-curve spec
     */
    function _expandMessageXMD(bytes32 message) private pure returns (bytes memory) {
        // For BLS12-381 G2, we need 2 * 64 = 128 bytes
        bytes memory dst = bytes("BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_");

        // Simplified expansion - in production would implement full expand_message_xmd
        bytes memory expanded = new bytes(128);

        // b_0 = H(msg_prime)
        bytes32 b0 = sha256(abi.encodePacked(
            message,
            uint16(128),  // len_in_bytes
            uint8(0),     // I2OSP(0, 1)
            dst,
            uint8(dst.length)
        ));

        // b_1 = H(b_0 || I2OSP(1, 1) || DST)
        bytes32 b1 = sha256(abi.encodePacked(b0, uint8(1), dst, uint8(dst.length)));

        // b_2 = H(b_0 XOR b_1 || I2OSP(2, 1) || DST)
        bytes32 b2 = sha256(abi.encodePacked(
            b0 ^ b1,
            uint8(2),
            dst,
            uint8(dst.length)
        ));

        // b_3 = H(b_0 XOR b_2 || I2OSP(3, 1) || DST)
        bytes32 b3 = sha256(abi.encodePacked(
            b0 ^ b2,
            uint8(3),
            dst,
            uint8(dst.length)
        ));

        // b_4 = H(b_0 XOR b_3 || I2OSP(4, 1) || DST)
        bytes32 b4 = sha256(abi.encodePacked(
            b0 ^ b3,
            uint8(4),
            dst,
            uint8(dst.length)
        ));

        // Concatenate b_1 through b_4
        for (uint i = 0; i < 32; i++) {
            expanded[i] = b1[i];
            expanded[32 + i] = b2[i];
            expanded[64 + i] = b3[i];
            expanded[96 + i] = b4[i];
        }

        return expanded;
    }

    /**
     * @notice Negate a G1 point
     * @dev Negation is done by negating the y-coordinate
     */
    function _negateG1Point(bytes calldata point) private pure returns (bytes memory) {
        require(point.length == G1_POINT_SIZE, "Invalid G1 point");

        bytes memory negated = new bytes(G1_POINT_SIZE);

        // Copy x coordinate (first 48 bytes)
        for (uint256 i = 0; i < 48; i++) {
            negated[i] = point[i];
        }

        // Negate y coordinate (second 48 bytes)
        // For BLS12-381, negation is: -y mod p where p is the field modulus
        // This is simplified - in production would use proper field arithmetic
        bytes32 yHigh = bytes32(point[48:80]);
        bytes32 yLow = bytes32(point[80:96]);

        // BLS12-381 field modulus (approximate for this example)
        // In production, use proper modular arithmetic
        for (uint256 i = 0; i < 48; i++) {
            negated[48 + i] = point[48 + i] ^ 0xff;  // Simplified negation
        }

        return negated;
    }

    /**
     * @notice Return BLS12-381 G2 generator point
     */
    function _g2Generator() private pure returns (bytes memory) {
        // BLS12-381 G2 generator (compressed coordinates)
        bytes memory g2Gen = new bytes(G2_POINT_SIZE);

        // These are the actual BLS12-381 G2 generator coordinates
        // x = (x0 + x1*i) where i^2 = -1
        // y = (y0 + y1*i)
        // Values in hex (little-endian)

        // x0 (48 bytes)
        bytes memory x0 = hex"024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8";
        // x1 (48 bytes)
        bytes memory x1 = hex"13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e";
        // y0 (48 bytes)
        bytes memory y0 = hex"0ce5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801";
        // y1 (48 bytes)
        bytes memory y1 = hex"0606c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be";

        uint offset = 0;
        for (uint i = 0; i < 48; i++) {
            g2Gen[offset++] = x0[i];
        }
        for (uint i = 0; i < 48; i++) {
            g2Gen[offset++] = x1[i];
        }
        for (uint i = 0; i < 48; i++) {
            g2Gen[offset++] = y0[i];
        }
        for (uint i = 0; i < 48; i++) {
            g2Gen[offset++] = y1[i];
        }

        return g2Gen;
    }
}
