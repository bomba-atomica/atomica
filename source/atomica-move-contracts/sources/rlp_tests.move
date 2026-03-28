#[test_only]
module atomica::rlp_tests {
    use atomica::rlp;
    use std::vector;

    // ==================== Single Byte Tests ====================

    #[test]
    fun test_decode_single_byte_zero() {
        let bytes = vector[0x00u8];
        let (is_list, items) = rlp::decode(bytes);
        
        assert!(!is_list, 0);
        assert!(vector::length(&items) == 1, 1);
        
        let decoded = *vector::borrow(&items, 0);
        assert!(vector::length(&decoded) == 1, 2);
        assert!(*vector::borrow(&decoded, 0) == 0x00, 3);
    }

    #[test]
    fun test_decode_single_byte_max() {
        let bytes = vector[0x7fu8];
        let (is_list, items) = rlp::decode(bytes);
        
        assert!(!is_list, 0);
        let decoded = *vector::borrow(&items, 0);
        assert!(*vector::borrow(&decoded, 0) == 0x7f, 1);
    }

    // ==================== Short String Tests ====================

    #[test]
    fun test_decode_empty_string() {
        // RLP of empty string: 0x80
        let bytes = vector[0x80u8];
        let (is_list, items) = rlp::decode(bytes);
        
        assert!(!is_list, 0);
        let decoded = *vector::borrow(&items, 0);
        assert!(vector::length(&decoded) == 0, 1);
    }

    #[test]
    fun test_decode_short_string() {
        // RLP of "dog" (0x646f67): 0x83, 0x64, 0x6f, 0x67
        let bytes = vector[0x83u8, 0x64u8, 0x6fu8, 0x67u8];
        let (is_list, items) = rlp::decode(bytes);
        
        assert!(!is_list, 0);
        let decoded = *vector::borrow(&items, 0);
        assert!(vector::length(&decoded) == 3, 1);
        assert!(*vector::borrow(&decoded, 0) == 0x64, 2);
        assert!(*vector::borrow(&decoded, 1) == 0x6f, 3);
        assert!(*vector::borrow(&decoded, 2) == 0x67, 4);
    }

    #[test]
    fun test_decode_32_byte_hash() {
        // RLP of 32-byte hash: 0xa0 (160 = 0x80 + 32) followed by 32 bytes
        let bytes = build_32_byte_hash();
        
        let (is_list, items) = rlp::decode(bytes);
        assert!(!is_list, 0);
        
        let decoded = *vector::borrow(&items, 0);
        assert!(vector::length(&decoded) == 32, 1);
    }
    
    fun build_32_byte_hash(): vector<u8> {
        let bytes = vector[0xa0u8];
        let i = 0;
        while (i < 32) {
            vector::push_back(&mut bytes, (i as u8));
            i = i + 1;
        };
        bytes
    }

    // ==================== List Tests ====================

    #[test]
    fun test_decode_empty_list() {
        // RLP of []: 0xc0
        let bytes = vector[0xc0u8];
        let (is_list, items) = rlp::decode(bytes);
        
        assert!(is_list, 0);
        assert!(vector::length(&items) == 0, 1);
    }

    #[test]
    fun test_decode_list_of_strings() {
        // RLP of ["cat", "dog"]
        // "cat" = 0x83, 0x63, 0x61, 0x74
        // "dog" = 0x83, 0x64, 0x6f, 0x67
        // List = 0xc8 (192 + 8), 0x83, 0x63, 0x61, 0x74, 0x83, 0x64, 0x6f, 0x67
        let bytes = vector[
            0xc8u8, 
            0x83u8, 0x63u8, 0x61u8, 0x74u8,  // "cat"
            0x83u8, 0x64u8, 0x6fu8, 0x67u8   // "dog"
        ];
        
        let items = rlp::decode_list(bytes);
        assert!(vector::length(&items) == 2, 0);
        
        let cat = *vector::borrow(&items, 0);
        assert!(vector::length(&cat) == 3, 1);
        assert!(*vector::borrow(&cat, 0) == 0x63, 2);
        
        let dog = *vector::borrow(&items, 1);
        assert!(vector::length(&dog) == 3, 3);
        assert!(*vector::borrow(&dog, 0) == 0x64, 4);
    }

    #[test]
    fun test_decode_list_with_numbers() {
        // RLP of [1, 2, 3]
        // 1 = 0x01, 2 = 0x02, 3 = 0x03
        // List = 0xc3 (192 + 3), 0x01, 0x02, 0x03
        let bytes = vector[0xc3u8, 0x01u8, 0x02u8, 0x03u8];
        
        let items = rlp::decode_list(bytes);
        assert!(vector::length(&items) == 3, 0);
        
        let one = *vector::borrow(&items, 0);
        assert!(vector::length(&one) == 1, 1);
        assert!(*vector::borrow(&one, 0) == 0x01, 2);
    }

    #[test]
    fun test_decode_ethereum_account() {
        // Ethereum account: [nonce, balance, storageRoot, codeHash]
        // Simplified example with small values
        // [0, 0, 32-byte-hash, 32-byte-hash]
        
        let bytes = build_ethereum_account();
        
        let items = rlp::decode_list(bytes);
        assert!(vector::length(&items) == 4, 0);
        
        // Check storage root
        let storage_root = *vector::borrow(&items, 2);
        assert!(vector::length(&storage_root) == 32, 1);
        assert!(*vector::borrow(&storage_root, 0) == 0xaa, 2);
    }
    
    fun build_ethereum_account(): vector<u8> {
        let bytes = vector[0xf8u8, 0x44u8]; // Long list, 68 bytes payload
        
        // nonce = 0
        vector::push_back(&mut bytes, 0x80u8);
        
        // balance = 0  
        vector::push_back(&mut bytes, 0x80u8);
        
        // storageRoot (32 bytes of 0xAA)
        vector::push_back(&mut bytes, 0xa0u8); // 32-byte string
        let i = 0;
        while (i < 32) {
            vector::push_back(&mut bytes, 0xaau8);
            i = i + 1;
        };
        
        // codeHash (32 bytes of 0xBB)
        vector::push_back(&mut bytes, 0xa0u8);
        let j = 0;
        while (j < 32) {
            vector::push_back(&mut bytes, 0xbbu8);
            j = j + 1;
        };
        
        bytes
    }

    // ==================== Edge Cases ====================

    #[test]
    fun test_decode_255_byte_string() {
        // Maximum short string: 0xb7 (183 = 0x80 + 55)
        let bytes = build_55_byte_string();
        
        let (is_list, items) = rlp::decode(bytes);
        assert!(!is_list, 0);
        
        let decoded = *vector::borrow(&items, 0);
        assert!(vector::length(&decoded) == 55, 1);
    }
    
    fun build_55_byte_string(): vector<u8> {
        let bytes = vector[0xb7u8];
        let i = 0;
        while (i < 55) {
            vector::push_back(&mut bytes, 0x42u8);
            i = i + 1;
        };
        bytes
    }

    #[test]
    fun test_get_item_length() {
        // Test the length calculation function
        let bytes = vector[0x83u8, 0x64u8, 0x6fu8, 0x67u8]; // "dog"
        let len = rlp::get_item_length(&bytes, 0);
        assert!(len == 4, 0); // 1 (prefix) + 3 (data)
        
        let bytes2 = vector[0x01u8]; // single byte
        let len2 = rlp::get_item_length(&bytes2, 0);
        assert!(len2 == 1, 1);
    }
}
