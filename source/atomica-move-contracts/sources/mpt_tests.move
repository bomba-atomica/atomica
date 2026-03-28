#[test_only]
module atomica::mpt_tests {
    use atomica::mpt;
    use std::vector;

    // ==================== Helper Functions ====================

    #[test]
    fun test_key_to_nibbles() {
        // Test: [0xAB, 0xCD] -> [10, 11, 12, 13]
        let key = vector[0xabu8, 0xcdu8];
        let nibbles = mpt::key_to_nibbles(key);
        
        assert!(vector::length(&nibbles) == 4, 0);
        assert!(*vector::borrow(&nibbles, 0) == 10, 1); // 0xA
        assert!(*vector::borrow(&nibbles, 1) == 11, 2); // 0xB
        assert!(*vector::borrow(&nibbles, 2) == 12, 3); // 0xC
        assert!(*vector::borrow(&nibbles, 3) == 13, 4); // 0xD
    }

    #[test]
    fun test_key_to_nibbles_zeros() {
        let key = vector[0x00u8, 0x00u8];
        let nibbles = mpt::key_to_nibbles(key);
        
        assert!(vector::length(&nibbles) == 4, 0);
        assert!(*vector::borrow(&nibbles, 0) == 0, 1);
        assert!(*vector::borrow(&nibbles, 1) == 0, 2);
        assert!(*vector::borrow(&nibbles, 2) == 0, 3);
        assert!(*vector::borrow(&nibbles, 3) == 0, 4);
    }

    #[test]
    fun test_key_to_nibbles_32_bytes() {
        // Test with 32-byte key (typical Ethereum hash)
        let key = build_32_byte_key();
        
        let nibbles = mpt::key_to_nibbles(key);
        assert!(vector::length(&nibbles) == 64, 0); // 32 bytes * 2 nibbles/byte
    }
    
    fun build_32_byte_key(): vector<u8> {
        let key = vector::empty<u8>();
        let i = 0;
        while (i < 32) {
            vector::push_back(&mut key, (i as u8));
            i = i + 1;
        };
        key
    }

    // ==================== Hex-Prefix Decoding Tests ====================

    #[test]
    fun test_decode_hex_prefix_extension_even() {
        // Flag 0 (extension, even): 0x00, followed by nibbles
        // Example: [0x00, 0x12, 0x34] -> path = [1, 2, 3, 4]
        let encoded = vector[0x00u8, 0x12u8, 0x34u8];
        let (path, is_leaf) = mpt::decode_hex_prefix(encoded);
        
        assert!(!is_leaf, 0);
        assert!(vector::length(&path) == 4, 1);
        assert!(*vector::borrow(&path, 0) == 1, 2);
        assert!(*vector::borrow(&path, 1) == 2, 3);
        assert!(*vector::borrow(&path, 2) == 3, 4);
        assert!(*vector::borrow(&path, 3) == 4, 5);
    }

    #[test]
    fun test_decode_hex_prefix_extension_odd() {
        // Flag 1 (extension, odd): 0x1X where X is first nibble
        // Example: [0x15, 0x67] -> path = [5, 6, 7]
        let encoded = vector[0x15u8, 0x67u8];
        let (path, is_leaf) = mpt::decode_hex_prefix(encoded);
        
        assert!(!is_leaf, 0);
        assert!(vector::length(&path) == 3, 1);
        assert!(*vector::borrow(&path, 0) == 5, 2);
        assert!(*vector::borrow(&path, 1) == 6, 3);
        assert!(*vector::borrow(&path, 2) == 7, 4);
    }

    #[test]
    fun test_decode_hex_prefix_leaf_even() {
        // Flag 2 (leaf, even): 0x20
        // Example: [0x20, 0x12, 0x34] -> path = [1, 2, 3, 4]
        let encoded = vector[0x20u8, 0x12u8, 0x34u8];
        let (path, is_leaf) = mpt::decode_hex_prefix(encoded);
        
        assert!(is_leaf, 0);
        assert!(vector::length(&path) == 4, 1);
        assert!(*vector::borrow(&path, 0) == 1, 2);
    }

    #[test]
    fun test_decode_hex_prefix_leaf_odd() {
        // Flag 3 (leaf, odd): 0x3X where X is first nibble
        // Example: [0x39, 0xab] -> path = [9, 10, 11]
        let encoded = vector[0x39u8, 0xabu8];
        let (path, is_leaf) = mpt::decode_hex_prefix(encoded);
        
        assert!(is_leaf, 0);
        assert!(vector::length(&path) == 3, 1);
        assert!(*vector::borrow(&path, 0) == 9, 2);
        assert!(*vector::borrow(&path, 1) == 10, 3);
        assert!(*vector::borrow(&path, 2) == 11, 4);
    }

    #[test]
    fun test_decode_hex_prefix_empty() {
        let encoded = vector::empty<u8>();
        let (path, is_leaf) = mpt::decode_hex_prefix(encoded);
        
        assert!(!is_leaf, 0);
        assert!(vector::length(&path) == 0, 1);
    }

    // ==================== Integration Notes ====================
    
    // Real MPT proof verification tests require actual Ethereum proofs
    // which should be generated using the TypeScript proof generator
    // and then hardcoded here as test vectors.
    //
    // For now, we verify the building blocks (key_to_nibbles, decode_hex_prefix)
    // work correctly. Full end-to-end tests will be added once we have
    // real proof data from the Ethereum testnet.
    
    #[test]
    fun test_nibble_conversion_roundtrip() {
        // Verify that nibble conversion is consistent
        let original = vector[0xabu8, 0xcdu8, 0xefu8];
        let nibbles = mpt::key_to_nibbles(original);
        
        // Should get 6 nibbles: [a, b, c, d, e, f]
        assert!(vector::length(&nibbles) == 6, 0);
        assert!(*vector::borrow(&nibbles, 0) == 0xa, 1);
        assert!(*vector::borrow(&nibbles, 1) == 0xb, 2);
        assert!(*vector::borrow(&nibbles, 2) == 0xc, 3);
        assert!(*vector::borrow(&nibbles, 3) == 0xd, 4);
        assert!(*vector::borrow(&nibbles, 4) == 0xe, 5);
        assert!(*vector::borrow(&nibbles, 5) == 0xf, 6);
    }
}
