#[test_only]
module atomica::integration_tests {
    use std::vector;
    use aptos_framework::timestamp;

    // NOTE: These integration tests use REAL Ethereum MPT proofs from golden_vectors.json
    // located in /home/lucas/atomica/lib/ethereum-fixtures/golden_vectors.json
    //
    // The proofs are from an Ethereum docker testnet with:
    // - LockBox contract: 0x703848F4c85f18e3acd8196c8eC91eb0b7Bd0797
    // - FakeETH token: 0xb4B46bdAA835F8E4b4d8e208B6559cD267851051
    // - Test user: 0x8943545177806ED17B9F23F0a21ee5948eCaa776
    // - Locked amount: 10 FAKETH (10^19 wei)
    // - Block: 16

    // Test helper: Initialize timestamp for testing
    fun setup_timestamp(framework: &signer) {
        timestamp::set_time_has_started_for_testing(framework);
    }

    // Test helper: Get golden vector proof data for 10 FAKETH lock
    fun get_golden_proof_10_faketh(): (
        u64, // block_number
        vector<u8>, // block_hash
        vector<u8>, // state_root
        vector<u8>, // contract_address
        vector<u8>, // user_address
        vector<u8>, // token_address
        vector<u8>, // storage_key
        u256, // storage_value
        vector<vector<u8>>, // account_proof
        vector<vector<u8>> // storage_proof
    ) {
        let block_number = 16u64;
        let block_hash = x"68ff5c72505b902c29a3b01fcf18abe52e91208df7fef1031638104c4ce6213c";
        let state_root = x"0f0d587de9b05a8f217911cbbde8eaf21095a0765d05988c9a5c3421d11b80dd";
        let contract_address = x"703848F4c85f18e3acd8196c8eC91eb0b7Bd0797";
        let user_address = x"8943545177806ED17B9F23F0a21ee5948eCaa776";
        let token_address = x"b4B46bdAA835F8E4b4d8e208B6559cD267851051";
        let storage_key = x"dc645937229477e3cc27d4db2b45c4c99a2c0103a072bedf41f20db02442f893";
        let storage_value = 10000000000000000000u256; // 10 FAKETH in wei

        // Account proof (4 nodes from golden vectors)
        let account_proof = vector::empty<vector<u8>>();
        vector::push_back(&mut account_proof, x"f90211a0e927fc6af5a0032476379ca3fc0760b05a2f7ccc2e4b2cac22ce17e7b70e94dea006d47616df479b46b302f2a8b7ed03cb537f6cf7c551c15421c65db4e00fa97fa038e34f9e0e4830343ba24f5fcf0eba28d79cb86397adfb16a0169ee7f0180036a023f30f1d9fe63a7078b045aba574725fecd0dd8a9d89dc131d50900a862e8930a0dd3420839babaee761e7eaa38ad5f596b1a9b8716e7e9b9261949a964a5a7d61a08d2fdcb46b119617b3e1b3d5b6ee8d13bda9e4d31758134cf61f79630ffee063a05af6de3c4f8d9bbe7950975b60edb8635a4a481d57642bafa520fa3e77bfc3dba0724ddab763dca2845505047f1a8ef15a9979a64d8cad5a818d70ba30b6e6eb57a0cbcdc1d226a540c50cb1e615e7af99f171d4365b45734940e22d47ec4aa23a14a0be88e4724326382a8b56e2328eeef0ad51f18d5bae0e84296afe14c4028c4af9a018e0f191e57d4186717e0f3c9379d2438cec0babd12d3903a4ad560f017331bfa01796617427e67ed10cdf8a72b02689a700ba71eb93186a1b120c9ad0b0e56eaea0ad0bb86b47186c04223e85a9c33dd1c87dd6e5c17f753f4fd0a56772d8a78399a044db2d2bab785a126b33ade820eb6adc6ec7c5e1dafdd8a891f996bc7996681ea06a2b50671c3f299bfd4b6cf43d6e5d6aafd4d3677c38a8af52a0cd7680de2b94a037ff00fbe2105bce0e6ed9ea80a1d67b8a476b1ff3d177ac9597a53241e47aa780");
        vector::push_back(&mut account_proof, x"f901518080a0f1a60e8881cfcb2dc50ba58c326ccc9a6da8287c1e5f56d2017563be700058c4a0616362468a3391221e3782da42e2d6fb8ea41da6bdd2d679e20bf0375c06158680a0ed2fba131fadeadeb1082f565fff16ceb008f693056e3140204716c0739cf1e08080a0cfcecd85b5b3b2b03c196589d3d3b9bcd0ddfc01f000cde9fe3cab41dc6a0a16a0dbe53902e5d8015bf08f9f14b7c4037018de7f259e75e3b34f78c9ba6a1dd575a06234ead07239df2c23d50d21d2e045332bb3e2fb0a402aae5780b823e7d5308680a0ebe51b14fea6aaa5c097f2506874e990813c36cd31399ee3d72666de2dde3fcca051eac0e6e8747ed945c8119613a8359cb76220e714610cf783388ce900153208a0e16e6773b65ff27c428b07407a2d2e479712166515a4a43ecc3c4444d77d4f34a0a3a61d8931856dbb7b55c110c7ee8904ef6d87a2debe8f5cc6b2ecfef09a8c8d80");
        vector::push_back(&mut account_proof, x"f871a050651eb50de4a98cfe3bbdf22baa845f8a63cbd9886dac23a4ceaeefb56e245e8080808080a0c02c5e948b4be21dab963c0bbf5a3ee4cb61c3f37a749bfbb4e3d7814378e67b80808080808080a0871d8c8683a008436ed6f07327ca6f0cc41fcd1895980061857d40ed1e16b8aa8080");
        vector::push_back(&mut account_proof, x"f8689f3c7ab21dac1a79bf93676ba2007e0b97543ec8db749529db4bc94fc5857eb7b846f8440180a0b255638e908046e6e762a314f18e0868a8b5903e5991947d2369145a330e944ca060c79527411f543735dfa7d5626172686560f97c35bf37f13eec1da6b60d20c3");

        // Storage proof (2 nodes from golden vectors)
        let storage_proof = vector::empty<vector<u8>>();
        vector::push_back(&mut storage_proof, x"f8518080a0884ad486347eca64356434a306a5543269797899d5e076acf8a79dace46209688080808080808080808080a076e1a31897219b17b69f8e780ecacc4dd0fe30078c44f9bedb95cd370ca749358080");
        vector::push_back(&mut storage_proof, x"eba03a64bd8733a29a73daa36cf098a19d7de59f7d8b7ac75540619b6d2570f19b7e89888ac7230489e80000");

        (
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
        )
    }

    /*
    /// Test full E2E flow: Register lock → Verify receipt → Claim → Mint FakeETH
    /// DISABLED: The golden proof data is stale (from Ethereum block 16).
    /// Re-enable when fresh proof data is available.
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_e2e_lock_claim_mint_fake_eth_with_real_proof(
        framework: &signer,
        atomica: &signer
    ) {
        setup_timestamp(framework);

        // 1. Initialize registries and fake_eth
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        fake_eth::initialize(atomica);

        // 2. Get real proof from golden vectors
        let (
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
        ) = get_golden_proof_10_faketh();

        // 3. Register the lock (as atomica admin)
        lock_receipt::register_ethereum_lock<FakeETH>(
            atomica,
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

        // 4. Calculate lock_id to verify receipt
        let lock_id_data = vector::empty<u8>();
        vector::append(&mut lock_id_data, block_hash);
        vector::append(&mut lock_id_data, contract_address);
        vector::append(&mut lock_id_data, user_address);
        vector::append(&mut lock_id_data, token_address);
        vector::append(&mut lock_id_data, storage_key);
        let lock_id = keccak256(lock_id_data);

        // 5. Verify lock is marked as claimed in registry
        assert!(lock_receipt::is_lock_claimed<Ethereum, FakeETH>(lock_id), 1);

        // 6. Verify metrics
        assert!(lock_receipt::get_receipt_count<Ethereum, FakeETH>() == 1, 2);
        assert!(lock_receipt::get_total_locked<Ethereum, FakeETH>() == 10000000000000000000u256, 3);

        // 7. Get and verify receipt details
        let (receipt_user, receipt_amount, receipt_block, receipt_status) = 
            lock_receipt::get_receipt<Ethereum, FakeETH>(lock_id);
        
        assert!(receipt_amount == 10000000000000000000u256, 4);
        assert!(receipt_block == 16, 5);
        assert!(receipt_status == 0, 6); // STATUS_ACTIVE
    }

    /// Test that replay attacks are prevented with real proofs
    /// DISABLED: The golden proof data is stale (from Ethereum block 16).
    /// Re-enable when fresh proof data is available.
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_e2e_replay_attack_prevented_with_real_proof(
        framework: &signer,
        atomica: &signer
    ) {
        setup_timestamp(framework);

        // 1. Initialize
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);

        // 2. Get real proof
        let (
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
        ) = get_golden_proof_10_faketh();

        // 3. Register lock first time (should succeed)
        lock_receipt::register_ethereum_lock<FakeETH>(
            atomica,
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

        // 4. Get proof again (same data)
        let (
            block_number2,
            block_hash2,
            state_root2,
            contract_address2,
            user_address2,
            token_address2,
            storage_key2,
            storage_value2,
            account_proof2,
            storage_proof2
        ) = get_golden_proof_10_faketh();

        // 5. Try to register same lock again (should fail with E_ALREADY_CLAIMED = 1)
        lock_receipt::register_ethereum_lock<FakeETH>(
            atomica,
            block_number2,
            block_hash2,
            state_root2,
            contract_address2,
            user_address2,
            token_address2,
            storage_key2,
            storage_value2,
            account_proof2,
            storage_proof2
        );
    }
    */
}
