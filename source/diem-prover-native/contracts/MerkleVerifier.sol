// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title MerkleVerifier
 * @notice Library for verifying Merkle proofs from Aptos
 * @dev Supports both accumulator proofs (binary Merkle) and sparse Merkle proofs
 */
library MerkleVerifier {
    // Domain separation prefixes (match Aptos implementation)
    bytes1 constant LEAF_NODE_PREFIX = 0x00;
    bytes1 constant INTERNAL_NODE_PREFIX = 0x01;
    bytes1 constant SPARSE_INTERNAL_NODE_PREFIX = 0x01;

    // Placeholder hash for empty sparse Merkle tree nodes
    bytes32 constant SPARSE_MERKLE_PLACEHOLDER_HASH =
        0x5350415253455f4d45524b4c455f504c414345484f4c4445525f484153480000;

    // Maximum proof depth
    uint256 constant MAX_ACCUMULATOR_PROOF_DEPTH = 63;
    uint256 constant MAX_SPARSE_MERKLE_PROOF_DEPTH = 256;

    error ProofTooDeep();
    error InvalidProof();
    error KeyMismatch();
    error ValueHashMismatch();

    /**
     * @notice Verify an accumulator (binary Merkle tree) proof
     * @param rootHash Expected root hash of the accumulator
     * @param leafHash Hash of the leaf element to verify
     * @param leafIndex Index of the leaf (0-based)
     * @param siblings Array of sibling hashes from leaf to root
     * @return True if proof is valid
     */
    function verifyAccumulatorProof(
        bytes32 rootHash,
        bytes32 leafHash,
        uint64 leafIndex,
        bytes32[] memory siblings
    ) internal pure returns (bool) {
        if (siblings.length > MAX_ACCUMULATOR_PROOF_DEPTH) {
            revert ProofTooDeep();
        }

        bytes32 currentHash = leafHash;
        uint64 currentIndex = leafIndex;

        // Traverse from leaf to root
        for (uint256 i = 0; i < siblings.length; i++) {
            if (currentIndex % 2 == 0) {
                // Current node is left child
                currentHash = _hashInternalNode(currentHash, siblings[i]);
            } else {
                // Current node is right child
                currentHash = _hashInternalNode(siblings[i], currentHash);
            }
            currentIndex = currentIndex / 2;
        }

        return currentHash == rootHash;
    }

    /**
     * @notice Verify a sparse Merkle proof
     * @param rootHash Expected root hash
     * @param key Key to verify (256-bit)
     * @param valueHash Hash of the value (0 for non-inclusion)
     * @param siblings Array of sibling hashes
     * @return True if proof is valid
     */
    function verifySparseMerkleProof(
        bytes32 rootHash,
        bytes32 key,
        bytes32 valueHash,
        bytes32[] memory siblings
    ) internal pure returns (bool) {
        if (siblings.length > MAX_SPARSE_MERKLE_PROOF_DEPTH) {
            revert ProofTooDeep();
        }

        bytes32 currentHash;

        // Start with leaf hash or placeholder
        if (valueHash != bytes32(0)) {
            // Inclusion proof
            currentHash = _hashSparseMerkleLeaf(key, valueHash);
        } else {
            // Non-inclusion proof - empty subtree
            currentHash = SPARSE_MERKLE_PLACEHOLDER_HASH;
        }

        // Traverse from leaf to root
        // Each sibling determines if we go left or right
        for (uint256 i = 0; i < siblings.length; i++) {
            // Check bit at position (255 - siblings.length + i) in key
            uint256 bitPos = 255 - (siblings.length - 1) + i;
            bool bit = _getBit(key, bitPos);

            if (bit) {
                // Key bit is 1, current node is right child
                currentHash = _hashSparseMerkleInternal(siblings[i], currentHash);
            } else {
                // Key bit is 0, current node is left child
                currentHash = _hashSparseMerkleInternal(currentHash, siblings[i]);
            }
        }

        return currentHash == rootHash;
    }

    /**
     * @notice Verify sparse Merkle proof with explicit leaf node
     * @dev Used for non-inclusion proofs where a different key exists
     */
    function verifySparseMerkleProofWithLeaf(
        bytes32 rootHash,
        bytes32 key,
        bytes32 valueHash,
        bytes32[] memory siblings,
        bytes32 leafKey,
        bytes32 leafValueHash
    ) internal pure returns (bool) {
        if (siblings.length > MAX_SPARSE_MERKLE_PROOF_DEPTH) {
            revert ProofTooDeep();
        }

        // Verify this is a valid non-inclusion proof
        if (valueHash != bytes32(0)) {
            // Inclusion proof - keys must match
            if (leafKey != key) revert KeyMismatch();
            if (leafValueHash != valueHash) revert ValueHashMismatch();
        } else {
            // Non-inclusion proof - keys must differ
            if (leafKey == key) revert InvalidProof();

            // Keys must share common prefix up to proof depth
            uint256 commonPrefixLen = _commonPrefixLength(key, leafKey);
            if (commonPrefixLen < siblings.length) revert InvalidProof();
        }

        bytes32 currentHash = _hashSparseMerkleLeaf(leafKey, leafValueHash);

        // Traverse using the leaf key's path
        for (uint256 i = 0; i < siblings.length; i++) {
            uint256 bitPos = 255 - (siblings.length - 1) + i;
            bool bit = _getBit(leafKey, bitPos);

            if (bit) {
                currentHash = _hashSparseMerkleInternal(siblings[i], currentHash);
            } else {
                currentHash = _hashSparseMerkleInternal(currentHash, siblings[i]);
            }
        }

        return currentHash == rootHash;
    }

    /**
     * @notice Hash an internal node in the transaction accumulator
     * @dev Uses SHA-256 with domain separation
     */
    function _hashInternalNode(bytes32 left, bytes32 right)
        private pure returns (bytes32)
    {
        return sha256(abi.encodePacked(INTERNAL_NODE_PREFIX, left, right));
    }

    /**
     * @notice Hash a leaf node in sparse Merkle tree
     */
    function _hashSparseMerkleLeaf(bytes32 key, bytes32 valueHash)
        private pure returns (bytes32)
    {
        return sha256(abi.encodePacked(LEAF_NODE_PREFIX, key, valueHash));
    }

    /**
     * @notice Hash an internal node in sparse Merkle tree
     */
    function _hashSparseMerkleInternal(bytes32 left, bytes32 right)
        private pure returns (bytes32)
    {
        return sha256(abi.encodePacked(SPARSE_INTERNAL_NODE_PREFIX, left, right));
    }

    /**
     * @notice Get bit at specified position in a bytes32
     * @param data The bytes32 to extract bit from
     * @param position Bit position (0 = leftmost/MSB, 255 = rightmost/LSB)
     * @return The bit value (true = 1, false = 0)
     */
    function _getBit(bytes32 data, uint256 position)
        private pure returns (bool)
    {
        require(position < 256, "Position out of range");

        // Calculate byte and bit index
        uint256 byteIndex = position / 8;
        uint256 bitIndex = 7 - (position % 8);

        // Extract the byte and check the bit
        uint8 byteValue = uint8(data[byteIndex]);
        return (byteValue & (1 << bitIndex)) != 0;
    }

    /**
     * @notice Calculate common prefix length between two bytes32 values
     * @param a First value
     * @param b Second value
     * @return Number of matching bits from MSB
     */
    function _commonPrefixLength(bytes32 a, bytes32 b)
        private pure returns (uint256)
    {
        uint256 length = 0;

        for (uint256 i = 0; i < 256; i++) {
            if (_getBit(a, i) == _getBit(b, i)) {
                length++;
            } else {
                break;
            }
        }

        return length;
    }

    /**
     * @notice Verify a range proof for the accumulator
     * @dev Verifies a consecutive range of leaves
     */
    function verifyAccumulatorRangeProof(
        bytes32 rootHash,
        bytes32[] memory leafHashes,
        uint64 firstLeafIndex,
        bytes32[] memory leftSiblings,
        bytes32[] memory rightSiblings
    ) internal pure returns (bool) {
        if (leafHashes.length == 0) {
            return leftSiblings.length == 0 && rightSiblings.length == 0;
        }

        // Build up level by level
        bytes32[] memory currentLevel = leafHashes;
        uint64 firstPos = firstLeafIndex;

        uint256 leftIdx = leftSiblings.length;
        uint256 rightIdx = 0;

        while (currentLevel.length > 1 || leftIdx > 0 || rightIdx < rightSiblings.length) {
            bytes32[] memory nextLevel = new bytes32[]((currentLevel.length + 1) / 2);
            uint256 nextIdx = 0;

            // Handle left sibling if first position is odd
            if (firstPos % 2 == 1 && leftIdx > 0) {
                leftIdx--;
                bytes32 left = leftSiblings[leftIdx];
                bytes32 right = currentLevel[0];
                nextLevel[nextIdx++] = _hashInternalNode(left, right);

                // Copy remaining current level
                for (uint256 i = 1; i < currentLevel.length; i += 2) {
                    if (i + 1 < currentLevel.length) {
                        nextLevel[nextIdx++] = _hashInternalNode(
                            currentLevel[i],
                            currentLevel[i + 1]
                        );
                    } else {
                        // Odd element needs right sibling
                        if (rightIdx >= rightSiblings.length) revert InvalidProof();
                        nextLevel[nextIdx++] = _hashInternalNode(
                            currentLevel[i],
                            rightSiblings[rightIdx++]
                        );
                    }
                }
            } else {
                // Process pairs
                uint256 i = 0;
                for (; i + 1 < currentLevel.length; i += 2) {
                    nextLevel[nextIdx++] = _hashInternalNode(
                        currentLevel[i],
                        currentLevel[i + 1]
                    );
                }

                // Handle remaining odd element
                if (i < currentLevel.length) {
                    if (rightIdx >= rightSiblings.length) revert InvalidProof();
                    nextLevel[nextIdx++] = _hashInternalNode(
                        currentLevel[i],
                        rightSiblings[rightIdx++]
                    );
                }
            }

            // Resize nextLevel to actual size
            bytes32[] memory resized = new bytes32[](nextIdx);
            for (uint256 i = 0; i < nextIdx; i++) {
                resized[i] = nextLevel[i];
            }
            currentLevel = resized;

            firstPos = firstPos / 2;
        }

        return currentLevel[0] == rootHash;
    }
}
