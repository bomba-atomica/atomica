/// Merkle-Patricia Trie (MPT) Verification for Ethereum State Proofs
///
/// Implements cryptographic verification of Ethereum's modified Merkle-Patricia Trie,
/// which is used for storing account states and contract storage.
///
/// MPT Node Types:
/// - Branch: 17-element list [v0, v1, ..., v15, value]
/// - Extension: 2-element list [encoded_path, next_hash]
/// - Leaf: 2-element list [encoded_path, value]
///
/// Hex-Prefix (HP) Encoding:
/// - First nibble: 0=ext+even, 1=ext+odd, 2=leaf+even, 3=leaf+odd
/// - If odd, second nibble of first byte contains first path nibble
module atomica::mpt {
    use std::vector;
    use aptos_std::aptos_hash::keccak256;
    use atomica::rlp;

    // ==================== Error Codes ====================

    const E_INVALID_PROOF: u64 = 1;
    const E_HASH_MISMATCH: u64 = 2;
    const E_PATH_MISMATCH: u64 = 3;
    const E_INVALID_NODE: u64 = 4;
    const E_VALUE_MISMATCH: u64 = 5;

    // ==================== Constants ====================

    /// Node type identifiers
    const NODE_BRANCH: u8 = 17;
    const NODE_EXTENSION: u8 = 2;
    const NODE_LEAF: u8 = 2;

    /// Hex-prefix flags
    const HP_FLAG_EXTENSION_EVEN: u8 = 0;
    const HP_FLAG_EXTENSION_ODD: u8 = 1;
    const HP_FLAG_LEAF_EVEN: u8 = 2;
    const HP_FLAG_LEAF_ODD: u8 = 3;

    // ==================== Public Functions ====================

    /// Verify a Merkle-Patricia proof
    ///
    /// Returns the value at the key if proof is valid, aborts if invalid.
    /// For storage proofs, the value is RLP-encoded.
    ///
    /// @param proof - Array of RLP-encoded trie nodes from root to leaf
    /// @param root - Expected root hash (32 bytes)
    /// @param key - Keccak256 hash of address/storage slot (32 bytes)
    /// @return The value at the key (RLP-encoded for storage values)
    public fun verify_proof(
        proof: vector<vector<u8>>,
        root: vector<u8>,
        key: vector<u8>
    ): vector<u8> {
        let proof_len = vector::length(&proof);
        assert!(proof_len > 0, E_INVALID_PROOF);
        assert!(vector::length(&root) == 32, E_INVALID_PROOF);
        assert!(vector::length(&key) == 32, E_INVALID_PROOF);

        // Convert key to nibbles (each byte becomes 2 nibbles)
        let key_nibbles = key_to_nibbles(key);
        let nibble_index = 0u64;
        let expected_hash = root;

        let i = 0u64;
        while (i < proof_len) {
            let node_rlp = *vector::borrow(&proof, i);
            
            // Verify node hash matches expected hash
            let node_hash = hash_node(&node_rlp);
            
            // For nodes < 32 bytes, the "hash" is the node itself (not hashed)
            if (vector::length(&node_rlp) >= 32) {
                assert!(vectors_equal(&node_hash, &expected_hash), E_HASH_MISMATCH);
            } else {
                // Small node embedded directly
                assert!(vectors_equal(&node_rlp, &expected_hash), E_HASH_MISMATCH);
            };

            // Decode the node
            let node_items = rlp::decode_list(node_rlp);
            let node_len = vector::length(&node_items);

            if (node_len == 17) {
                // Branch node
                let (new_hash, new_index, found_value) = handle_branch_node(
                    &node_items,
                    &key_nibbles,
                    nibble_index
                );
                
                if (vector::length(&found_value) > 0) {
                    // Found value in branch node (terminal)
                    return found_value
                };
                
                expected_hash = new_hash;
                nibble_index = new_index;
            } else if (node_len == 2) {
                // Extension or Leaf node
                let encoded_path = *vector::borrow(&node_items, 0);
                let (path_nibbles, is_leaf) = decode_hex_prefix(encoded_path);
                
                // Check if path matches
                assert!(
                    match_path(&key_nibbles, &path_nibbles, nibble_index),
                    E_PATH_MISMATCH
                );
                
                nibble_index = nibble_index + vector::length(&path_nibbles);
                
                if (is_leaf) {
                    // Leaf node - verify we consumed entire key and return value
                    assert!(nibble_index == vector::length(&key_nibbles), E_PATH_MISMATCH);
                    let value = *vector::borrow(&node_items, 1);
                    return value
                } else {
                    // Extension node - continue to next node
                    expected_hash = *vector::borrow(&node_items, 1);
                }
            } else {
                abort E_INVALID_NODE
            };

            i = i + 1;
        };

        // If we exhausted all proof nodes without finding value, proof is invalid
        abort E_INVALID_PROOF
    }

    /// Convert key bytes to nibbles (4-bit values)
    /// Example: [0xAB, 0xCD] -> [10, 11, 12, 13]
    public fun key_to_nibbles(key: vector<u8>): vector<u8> {
        let nibbles = vector::empty<u8>();
        let len = vector::length(&key);
        let i = 0u64;
        
        while (i < len) {
            let byte = *vector::borrow(&key, i);
            let high = byte >> 4;
            let low = byte & 0x0f;
            vector::push_back(&mut nibbles, high);
            vector::push_back(&mut nibbles, low);
            i = i + 1;
        };
        
        nibbles
    }

    /// Decode hex-prefix encoded path
    ///
    /// Returns (nibbles, is_leaf)
    /// - nibbles: The path as a vector of nibbles (4-bit values)
    /// - is_leaf: true if this is a leaf node, false for extension
    ///
    /// HP encoding:
    /// - Flag 0 (0000): Extension, even length
    /// - Flag 1 (0001): Extension, odd length (second nibble is first path nibble)
    /// - Flag 2 (0010): Leaf, even length  
    /// - Flag 3 (0011): Leaf, odd length
    public fun decode_hex_prefix(encoded: vector<u8>): (vector<u8>, bool) {
        let len = vector::length(&encoded);
        if (len == 0) {
            return (vector::empty<u8>(), false)
        };

        let first_byte = *vector::borrow(&encoded, 0);
        let flag = first_byte >> 4;
        let is_leaf = (flag == HP_FLAG_LEAF_EVEN || flag == HP_FLAG_LEAF_ODD);
        let is_odd = (flag == HP_FLAG_EXTENSION_ODD || flag == HP_FLAG_LEAF_ODD);

        let nibbles = vector::empty<u8>();

        // If odd length, second nibble of first byte is first path nibble
        if (is_odd) {
            let second_nibble = first_byte & 0x0f;
            vector::push_back(&mut nibbles, second_nibble);
        };

        // Process remaining bytes
        let i = 1u64;
        while (i < len) {
            let byte = *vector::borrow(&encoded, i);
            let high = byte >> 4;
            let low = byte & 0x0f;
            vector::push_back(&mut nibbles, high);
            vector::push_back(&mut nibbles, low);
            i = i + 1;
        };

        (nibbles, is_leaf)
    }

    // ==================== Internal Functions ====================

    /// Handle a branch node (17 elements)
    /// Returns (next_hash, new_nibble_index, terminal_value)
    fun handle_branch_node(
        items: &vector<vector<u8>>,
        key_nibbles: &vector<u8>,
        nibble_index: u64
    ): (vector<u8>, u64, vector<u8>) {
        assert!(vector::length(items) == 17, E_INVALID_NODE);

        // Check if we've consumed all key nibbles
        if (nibble_index == vector::length(key_nibbles)) {
            // Value should be in the branch value slot (element 16)
            let value = *vector::borrow(items, 16);
            return (vector::empty<u8>(), nibble_index, value)
        };

        // Get the next nibble to follow
        let nibble = *vector::borrow(key_nibbles, nibble_index);
        assert!((nibble as u64) < 16, E_INVALID_PROOF);
        
        let child_hash = *vector::borrow(items, (nibble as u64));
        
        // If child is empty, path doesn't exist
        assert!(vector::length(&child_hash) > 0, E_INVALID_PROOF);

        (child_hash, nibble_index + 1, vector::empty<u8>())
    }

    /// Match key path with node path
    /// Returns true if the key matches the node's path starting at key_pos
    fun match_path(
        key_nibbles: &vector<u8>,
        path_nibbles: &vector<u8>,
        key_pos: u64
    ): bool {
        let path_len = vector::length(path_nibbles);
        let key_len = vector::length(key_nibbles);

        // Not enough key nibbles remaining
        if (key_pos + path_len > key_len) {
            return false
        };

        let i = 0u64;
        while (i < path_len) {
            let path_nibble = *vector::borrow(path_nibbles, i);
            let key_nibble = *vector::borrow(key_nibbles, key_pos + i);
            if (path_nibble != key_nibble) {
                return false
            };
            i = i + 1;
        };

        true
    }

    /// Hash a trie node using Keccak-256
    fun hash_node(node: &vector<u8>): vector<u8> {
        keccak256(*node)
    }

    /// Compare two byte vectors for equality
    fun vectors_equal(a: &vector<u8>, b: &vector<u8>): bool {
        let len_a = vector::length(a);
        let len_b = vector::length(b);
        
        if (len_a != len_b) {
            return false
        };

        let i = 0u64;
        while (i < len_a) {
            if (*vector::borrow(a, i) != *vector::borrow(b, i)) {
                return false
            };
            i = i + 1;
        };

        true
    }

    // ==================== Test Helpers ====================

    #[test_only]
    /// Create a simple test proof for testing
    public fun create_test_proof(): (vector<vector<u8>>, vector<u8>, vector<u8>) {
        // This would need to be a real proof from Ethereum for actual testing
        // For now, return empty vectors - real tests should use actual Ethereum proofs
        (vector::empty(), vector::empty(), vector::empty())
    }
}
