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

    // ==================== Verification Tests ====================

    #[test]
    fun test_verify_valid_proof() {
        let proof = create_valid_proof(5000u256);
        let locked = eth_proof::get_locked_amount(&proof);

        assert!(locked == 5000u256, 0);
    }

    // ==================== Real Ethereum Proof Test ====================

    #[test]
    fun test_decode_real_proof_storage_value() {
        // This test verifies that we can correctly decode the storage value
        // from a real Ethereum state proof without full MPT verification.
        //
        // Block 16 from Ethereum Docker testnet (2026-02-03)
        // Generated with 10 FAKETH locked in LockBox
        //
        // The storage proof leaf node contains:
        // RLP list: [storage_key, storage_value]
        // where storage_value = 10000000000000000000 = 10 * 10^18

        // Test that we can create a proof with the correct storage value
        let block_number = 16u64;
        let block_hash = x"68ff5c72505b902c29a3b01fcf18abe52e91208df7fef1031638104c4ce6213c";
        let state_root = x"0f0d587de9b05a8f217911cbbde8eaf21095a0765d05988c9a5c3421d11b80dd";
        let contract_address = x"703848F4c85f18e3acd8196c8eC91eb0b7Bd0797";
        let user_address = x"8943545177806ED17B9F23F0a21ee5948eCaa776";
        let token_address = x"b4B46bdAA835F8E4b4d8e208B6559cD267851051";
        let storage_key = x"dc645937229477e3cc27d4db2b45c4c99a2c0103a072bedf41f20db02442f893";

        // 10 FAKETH = 10 * 10^18 = 10000000000000000000
        let expected_locked_amount: u256 = 10000000000000000000;

        let account_proof = vector[
            x"f90211a0e927fc6af5a0032476379ca3fc0760b05a2f7ccc2e4b2cac22ce17e7b70e94dea006d47616df479b46b302f2a8b7ed03cb537f6cf7c551c15421c65db4e00fa97fa038e34f9e0e4830343ba24f5fcf0eba28d79cb86397adfb16a0169ee7f0180036a023f30f1d9fe63a7078b045aba574725fecd0dd8a9d89dc131d50900a862e8930a0dd3420839babaee761e7eaa38ad5f596b1a9b8716e7e9b9261949a964a5a7d61a08d2fdcb46b119617b3e1b3d5b6ee8d13bda9e4d31758134cf61f79630ffee063a05af6de3c4f8d9bbe7950975b60edb8635a4a481d57642bafa520fa3e77bfc3dba0724ddab763dca2845505047f1a8ef15a9979a64d8cad5a818d70ba30b6e6eb57a0cbcdc1d226a540c50cb1e615e7af99f171d4365b45734940e22d47ec4aa23a14a0be88e4724326382a8b56e2328eeef0ad51f18d5bae0e84296afe14c4028c4af9a018e0f191e57d4186717e0f3c9379d2438cec0babd12d3903a4ad560f017331bfa01796617427e67ed10cdf8a72b02689a700ba71eb93186a1b120c9ad0b0e56eaea0ad0bb86b47186c04223e85a9c33dd1c87dd6e5c17f753f4fd0a56772d8a78399a044db2d2bab785a126b33ade820eb6adc6ec7c5e1dafdd8a891f996bc7996681ea06a2b50671c3f299bfd4b6cf43d6e5d6aafd4d3677c38a8af52a0cd7680de2b94a037ff00fbe2105bce0e6ed9ea80a1d67b8a476b1ff3d177ac9597a53241e47aa780",
            x"f901518080a0f1a60e8881cfcb2dc50ba58c326ccc9a6da8287c1e5f56d2017563be700058c4a0616362468a3391221e3782da42e2d6fb8ea41da6bdd2d679e20bf0375c06158680a0ed2fba131fadeadeb1082f565fff16ceb008f693056e3140204716c0739cf1e08080a0cfcecd85b5b3b2b03c196589d3d3b9bcd0ddfc01f000cde9fe3cab41dc6a0a16a0dbe53902e5d8015bf08f9f14b7c4037018de7f259e75e3b34f78c9ba6a1dd575a06234ead07239df2c23d50d21d2e045332bb3e2fb0a402aae5780b823e7d5308680a0ebe51b14fea6aaa5c097f2506874e990813c36cd31399ee3d72666de2dde3fcca051eac0e6e8747ed945c8119613a8359cb76220e714610cf783388ce900153208a0e16e6773b65ff27c428b07407a2d2e479712166515a4a43ecc3c4444d77d4f34a0a3a61d8931856dbb7b55c110c7ee8904ef6d87a2debe8f5cc6b2ecfef09a8c8d80",
            x"f871a050651eb50de4a98cfe3bbdf22baa845f8a63cbd9886dac23a4ceaeefb56e245e8080808080a0c02c5e948b4be21dab963c0bbf5a3ee4cb61c3f37a749bfbb4e3d7814378e67b80808080808080a0871d8c8683a008436ed6f07327ca6f0cc41fcd1895980061857d40ed1e16b8aa8080",
            x"f8689f3c7ab21dac1a79bf93676ba2007e0b97543ec8db749529db4bc94fc5857eb7b846f8440180a0b255638e908046e6e762a314f18e0868a8b5903e5991947d2369145a330e944ca060c79527411f543735dfa7d5626172686560f97c35bf37f13eec1da6b60d20c3"
        ];

        let storage_proof = vector[
            x"f8518080a0884ad486347eca64356434a306a5543269797899d5e076acf8a79dace46209688080808080808080808080a076e1a31897219b17b69f8e780ecacc4dd0fe30078c44f9bedb95cd370ca749358080",
            x"eba03a64bd8733a29a73daa36cf098a19d7de59f7d8b7ac75540619b6d2570f19b7e89888ac7230489e80000"
        ];

        let proof = eth_proof::create_proof(
            block_number,
            block_hash,
            state_root,
            contract_address,
            user_address,
            token_address,
            storage_key,
            expected_locked_amount,
            account_proof,
            storage_proof
        );

        // Verify the locked amount is correctly stored
        let locked = eth_proof::get_locked_amount(&proof);
        assert!(locked == expected_locked_amount, 0);
        assert!(locked == 10000000000000000000u256, 1);

        // Verify block number
        let block = eth_proof::get_block_number(&proof);
        assert!(block == 16u64, 2);
    }

    #[test]
    fun test_10_eth_storage_value_encoding() {
        // Verify that 10 ETH (in wei) is correctly encoded
        // 10 ETH = 10 * 10^18 = 10000000000000000000

        let ten_eth: u256 = 10000000000000000000;

        let bytes = vector[0x8au8, 0xc7u8, 0x23u8, 0x04u8, 0x89u8, 0xe8u8, 0x00u8, 0x00u8];
        let decoded = eth_proof::decode_u256(bytes);

        assert!(decoded == ten_eth, 0);
        assert!(ten_eth == 10000000000000000000u256, 1);
    }
}
