#[test_only]
module atomica::eth_proof_tests {
    use atomica::eth_proof;
    use std::vector;

    // ==================== Decoding Tests ====================

    #[test]
    fun test_decode_u64_zero() {
        let bytes = vector::empty<u8>();
        let result = eth_proof::decode_u64(bytes);
        assert!(result == 0, 0);
    }

    #[test]
    fun test_decode_u64_single_byte() {
        let bytes = vector::singleton(42u8);
        let result = eth_proof::decode_u64(bytes);
        assert!(result == 42, 0);
    }

    #[test]
    fun test_decode_u64_two_bytes() {
        let bytes = vector[1u8, 0u8];
        // 1 * 256 + 0 = 256
        let result = eth_proof::decode_u64(bytes);
        assert!(result == 256, 0);
    }

    #[test]
    fun test_decode_u256_zero() {
        let bytes = vector::empty<u8>();
        let result = eth_proof::decode_u256(bytes);
        assert!(result == 0, 0);
    }

    #[test]
    fun test_decode_u256_single_byte() {
        let bytes = vector::singleton(100u8);
        let result = eth_proof::decode_u256(bytes);
        assert!(result == 100, 0);
    }

    #[test]
    fun test_decode_u256_ethereum_wei() {
        // 10 ETH = 10 * 10^18 wei = 0x8AC7230489E80000
        let bytes = vector[0x8Au8, 0xC7u8, 0x23u8, 0x04u8, 0x89u8, 0xE8u8, 0x00u8, 0x00u8];
        let result = eth_proof::decode_u256(bytes);

        // 10 ETH in wei
        let expected = 10000000000000000000u256;
        assert!(result == expected, 0);
    }

    // ==================== Proof Creation Tests ====================

    #[test]
    fun test_create_proof() {
        let block_number = 12345u64;
        let block_hash = vector::singleton(1u8);
        let state_root = vector::singleton(2u8);
        let contract_address = vector::singleton(3u8);
        let user_address = vector::singleton(4u8);
        let token_address = vector::singleton(5u8);
        let storage_key = vector::singleton(6u8);
        let storage_value = 1000u256;
        let account_proof = vector::singleton(vector::singleton(7u8));
        let storage_proof = vector::singleton(vector::singleton(8u8));

        let proof = eth_proof::create_proof(
            block_number,
            block_hash,
            state_root,
            contract_address,
            user_address,
            token_address,
            storage_key,
            storage_value,
            account_proof,
            storage_proof
        );

        assert!(eth_proof::get_locked_amount(&proof) == 1000u256, 0);
        assert!(eth_proof::get_block_number(&proof) == 12345u64, 1);
    }

    #[test]
    fun test_create_proof_with_10_eth() {
        let block_number = 100u64;
        let block_hash = x"0123456789012345678901234567890123456789012345678901234567890123";
        let state_root = x"0123456789012345678901234567890123456789012345678901234567890123";
        let contract_address = x"5FbDB2315678afecb367f032d93F642f64180aa3";
        let user_address = x"f39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
        let token_address = x"e7f1725E7734CE288F8367e1Bb143E90bb3F0512";
        let storage_key = x"0000000000000000000000000000000000000000000000000000000000000001";
        let storage_value = 10000000000000000000u256; // 10 ETH
        let account_proof = vector::singleton(x"01");
        let storage_proof = vector::singleton(x"02");

        let proof = eth_proof::create_proof(
            block_number,
            block_hash,
            state_root,
            contract_address,
            user_address,
            token_address,
            storage_key,
            storage_value,
            account_proof,
            storage_proof
        );

        assert!(eth_proof::get_locked_amount(&proof) == 10000000000000000000u256, 0);
    }

    // ==================== Verification Tests ====================

    #[test]
    fun test_verify_valid_proof() {
        let proof = create_valid_proof(5000u256);
        let locked = eth_proof::verify_and_extract(&proof);

        assert!(locked == 5000u256, 0);
    }

    #[test]
    fun test_has_sufficient_lock_true() {
        let proof = create_valid_proof(10000u256);
        let result = eth_proof::has_sufficient_lock(&proof, 5000u256);

        assert!(result == true, 0);
    }

    #[test]
    fun test_has_sufficient_lock_exact() {
        let proof = create_valid_proof(5000u256);
        let result = eth_proof::has_sufficient_lock(&proof, 5000u256);

        assert!(result == true, 0);
    }

    #[test]
    fun test_has_sufficient_lock_false() {
        let proof = create_valid_proof(3000u256);
        let result = eth_proof::has_sufficient_lock(&proof, 5000u256);

        assert!(result == false, 0);
    }

    #[test]
    fun test_has_sufficient_lock_zero() {
        let proof = create_valid_proof(0u256);
        let result = eth_proof::has_sufficient_lock(&proof, 0u256);

        assert!(result == true, 0);
    }

    #[test]
    #[expected_failure(abort_code = 1)] // E_INVALID_PROOF
    fun test_verify_invalid_block_hash_length() {
        let proof = eth_proof::create_proof(
            100u64,
            vector::singleton(1u8), // Invalid: should be 32 bytes
            x"0123456789012345678901234567890123456789012345678901234567890123",
            x"01",
            x"02",
            x"03",
            x"04",
            1000u256,
            vector::singleton(x"05"),
            vector::singleton(x"06")
        );

        eth_proof::verify_and_extract(&proof);
    }

    #[test]
    #[expected_failure(abort_code = 1)] // E_INVALID_PROOF
    fun test_verify_empty_account_proof() {
        let proof = eth_proof::create_proof(
            100u64,
            x"0123456789012345678901234567890123456789012345678901234567890123",
            x"0123456789012345678901234567890123456789012345678901234567890123",
            x"01",
            x"02",
            x"03",
            x"04",
            1000u256,
            vector::empty(), // Invalid: empty proof
            vector::singleton(x"06")
        );

        eth_proof::verify_and_extract(&proof);
    }

    // ==================== Helper Functions ====================

    fun create_valid_proof(locked_amount: u256): eth_proof::StateProof {
        eth_proof::create_proof(
            12345u64,
            x"0123456789012345678901234567890123456789012345678901234567890123",
            x"0123456789012345678901234567890123456789012345678901234567890123",
            x"5FbDB2315678afecb367f032d93F642f64180aa3",
            x"f39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            x"e7f1725E7734CE288F8367e1Bb143E90bb3F0512",
            x"0000000000000000000000000000000000000000000000000000000000000001",
            locked_amount,
            vector::singleton(x"abcd"),
            vector::singleton(x"ef01")
        )
    }
}
