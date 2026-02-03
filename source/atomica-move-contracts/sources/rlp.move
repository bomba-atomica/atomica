/// RLP (Recursive Length Prefix) Decoder for Ethereum data structures
///
/// Implements the RLP encoding specification used in Ethereum for serializing
/// arbitrary nested arrays of binary data.
///
/// RLP Encoding Rules:
/// - [0x00, 0x7f]: Single byte (the byte itself)
/// - [0x80, 0xb7]: String 0-55 bytes (length = byte - 0x80)
/// - [0xb8, 0xbf]: String >55 bytes (length-of-length = byte - 0xb7)
/// - [0xc0, 0xf7]: List 0-55 bytes (length = byte - 0xc0)
/// - [0xf8, 0xff]: List >55 bytes (length-of-length = byte - 0xf7)
module atomica::rlp {
    use std::vector;

    // ==================== Error Codes ====================
    
    const E_INVALID_RLP: u64 = 1;
    const E_INVALID_LENGTH: u64 = 2;
    const E_UNEXPECTED_END: u64 = 3;
    const E_NOT_A_LIST: u64 = 4;

    // ==================== Constants ====================

    const SHORT_STRING_OFFSET: u8 = 0x80;
    const LONG_STRING_OFFSET: u8 = 0xb8;
    const SHORT_LIST_OFFSET: u8 = 0xc0;
    const LONG_LIST_OFFSET: u8 = 0xf8;

    // ==================== Public Functions ====================

    /// Decode a list and return its items as byte vectors
    /// Assumes the input is an RLP-encoded list
    public fun decode_list(bytes: vector<u8>): vector<vector<u8>> {
        let (is_list, items) = decode_internal(bytes, 0);
        assert!(is_list, E_NOT_A_LIST);
        items
    }

    /// Decode RLP bytes and return (is_list, items)
    /// - If is_list = false, items will have one element (the decoded bytes)
    /// - If is_list = true, items contains the list elements
    public fun decode(bytes: vector<u8>): (bool, vector<vector<u8>>) {
        decode_internal(bytes, 0)
    }

    /// Get the length of the decoded RLP data (without actually decoding)
    public fun get_item_length(bytes: &vector<u8>, offset: u64): u64 {
        let len = vector::length(bytes);
        assert!(offset < len, E_UNEXPECTED_END);

        let first_byte = *vector::borrow(bytes, offset);

        if (first_byte < SHORT_STRING_OFFSET) {
            // Single byte
            1
        } else if (first_byte < LONG_STRING_OFFSET) {
            // Short string: 0-55 bytes
            let str_len = ((first_byte - SHORT_STRING_OFFSET) as u64);
            1 + str_len
        } else if (first_byte < SHORT_LIST_OFFSET) {
            // Long string
            let len_of_len = ((first_byte - LONG_STRING_OFFSET + 1) as u64);
            assert!(offset + len_of_len < len, E_UNEXPECTED_END);
            let str_len = decode_length(bytes, offset + 1, len_of_len);
            1 + len_of_len + str_len
        } else if (first_byte < LONG_LIST_OFFSET) {
            // Short list: 0-55 bytes total payload
            let list_len = ((first_byte - SHORT_LIST_OFFSET) as u64);
            1 + list_len
        } else {
            // Long list
            let len_of_len = ((first_byte - LONG_LIST_OFFSET + 1) as u64);
            assert!(offset + len_of_len < len, E_UNEXPECTED_END);
            let list_len = decode_length(bytes, offset + 1, len_of_len);
            1 + len_of_len + list_len
        }
    }

    // ==================== Internal Functions ====================

    /// Internal decode function that works with offsets
    fun decode_internal(bytes: vector<u8>, offset: u64): (bool, vector<vector<u8>>) {
        let len = vector::length(&bytes);
        assert!(offset < len, E_UNEXPECTED_END);

        let first_byte = *vector::borrow(&bytes, offset);

        if (first_byte < SHORT_STRING_OFFSET) {
            // Single byte [0x00, 0x7f]
            let result = vector::singleton(first_byte);
            (false, vector::singleton(result))
        } else if (first_byte < LONG_STRING_OFFSET) {
            // Short string [0x80, 0xb7]: 0-55 bytes
            let str_len = ((first_byte - SHORT_STRING_OFFSET) as u64);
            assert!(offset + 1 + str_len <= len, E_UNEXPECTED_END);
            
            let data = extract_bytes(&bytes, offset + 1, str_len);
            (false, vector::singleton(data))
        } else if (first_byte < SHORT_LIST_OFFSET) {
            // Long string [0xb8, 0xbf]: >55 bytes
            let len_of_len = ((first_byte - LONG_STRING_OFFSET + 1) as u64);
            assert!(offset + 1 + len_of_len <= len, E_UNEXPECTED_END);
            
            let str_len = decode_length(&bytes, offset + 1, len_of_len);
            assert!(offset + 1 + len_of_len + str_len <= len, E_UNEXPECTED_END);
            
            let data = extract_bytes(&bytes, offset + 1 + len_of_len, str_len);
            (false, vector::singleton(data))
        } else if (first_byte < LONG_LIST_OFFSET) {
            // Short list [0xc0, 0xf7]: 0-55 bytes total payload
            let list_len = ((first_byte - SHORT_LIST_OFFSET) as u64);
            assert!(offset + 1 + list_len <= len, E_UNEXPECTED_END);
            
            let items = decode_list_items(&bytes, offset + 1, list_len);
            (true, items)
        } else {
            // Long list [0xf8, 0xff]: >55 bytes total payload
            let len_of_len = ((first_byte - LONG_LIST_OFFSET + 1) as u64);
            assert!(offset + 1 + len_of_len <= len, E_UNEXPECTED_END);
            
            let list_len = decode_length(&bytes, offset + 1, len_of_len);
            assert!(offset + 1 + len_of_len + list_len <= len, E_UNEXPECTED_END);
            
            let items = decode_list_items(&bytes, offset + 1 + len_of_len, list_len);
            (true, items)
        }
    }

    /// Decode list items from a payload
    fun decode_list_items(bytes: &vector<u8>, start: u64, total_len: u64): vector<vector<u8>> {
        let items = vector::empty<vector<u8>>();
        let pos = start;
        let end = start + total_len;

        while (pos < end) {
            let item_len = get_item_length(bytes, pos);
            let item_bytes = extract_bytes(bytes, pos, item_len);
            
            // Decode the item to get its actual content
            let (is_list, decoded_items) = decode_internal(item_bytes, 0);
            
            if (is_list) {
                // For lists, we need to keep the original RLP encoding
                vector::push_back(&mut items, item_bytes);
            } else {
                // For strings, get the decoded content
                assert!(vector::length(&decoded_items) == 1, E_INVALID_RLP);
                let content = *vector::borrow(&decoded_items, 0);
                vector::push_back(&mut items, content);
            };
            
            pos = pos + item_len;
        };

        assert!(pos == end, E_INVALID_LENGTH);
        items
    }

    /// Decode a big-endian length value
    fun decode_length(bytes: &vector<u8>, offset: u64, len_bytes: u64): u64 {
        assert!(len_bytes > 0 && len_bytes <= 8, E_INVALID_LENGTH);
        
        let result = 0u64;
        let i = 0u64;
        while (i < len_bytes) {
            let byte = *vector::borrow(bytes, offset + i);
            result = result * 256 + (byte as u64);
            i = i + 1;
        };
        result
    }

    /// Extract a slice of bytes from a vector
    fun extract_bytes(bytes: &vector<u8>, offset: u64, len: u64): vector<u8> {
        let result = vector::empty<u8>();
        let i = 0u64;
        while (i < len) {
            let byte = *vector::borrow(bytes, offset + i);
            vector::push_back(&mut result, byte);
            i = i + 1;
        };
        result
    }

    // ==================== Test Helpers ====================

    #[test_only]
    /// Decode and return the first item from a list
    public fun decode_list_first(bytes: vector<u8>): vector<u8> {
        let items = decode_list(bytes);
        assert!(vector::length(&items) > 0, E_INVALID_RLP);
        *vector::borrow(&items, 0)
    }
}
