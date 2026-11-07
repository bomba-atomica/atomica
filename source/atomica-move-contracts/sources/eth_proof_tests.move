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

    // ==================== Lock id and storage key ====================

    // Values read from LockBox.getLockId / LockBox.calculateLockStorageKey on
    // anvil (user 0xf39F…2266, FakeETH 0x5FbD…0aa3, nonce 0).

    #[test]
    fun lock_id_matches_lockbox() {
        let id = eth_proof::lock_id(
            x"f39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            x"5FbDB2315678afecb367f032d93F642f64180aa3",
            0,
        );
        assert!(id == x"971e89c2b26f64aa4fc94b73baad52f35b2beb721f37991b5771e8328a10586a", 0);
    }

    #[test]
    fun lock_storage_key_matches_lockbox() {
        let key = eth_proof::lock_storage_key(
            x"f39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            x"5FbDB2315678afecb367f032d93F642f64180aa3",
            0,
        );
        assert!(key == x"a64f5e3f73fd5de7a6385dddf214ac430a21cc86902db5bd6560d9babea4ec89", 0);
    }

    #[test]
    fun lock_ids_differ_by_nonce() {
        let user = x"f39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
        let token = x"5FbDB2315678afecb367f032d93F642f64180aa3";
        assert!(eth_proof::lock_id(user, token, 0) != eth_proof::lock_id(user, token, 1), 0);
    }

    #[test]
    #[expected_failure(abort_code = 8, location = atomica::eth_proof)]
    fun lock_id_rejects_short_address() {
        eth_proof::lock_id(x"f39F", x"5FbDB2315678afecb367f032d93F642f64180aa3", 0);
    }

    // ==================== Config and trusted headers ====================

    fun init(atomica: &signer) {
        eth_proof::initialize(
            atomica,
            x"9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
            x"5FbDB2315678afecb367f032d93F642f64180aa3",
            x"e7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        );
    }

    #[test(atomica = @atomica)]
    fun config_is_pinned(atomica: &signer) {
        init(atomica);
        let (lockbox, eth_token, usd_token) = eth_proof::get_config();
        assert!(lockbox == x"9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", 0);
        assert!(eth_token == x"5FbDB2315678afecb367f032d93F642f64180aa3", 1);
        assert!(usd_token == x"e7f1725E7734CE288F8367e1Bb143E90bb3F0512", 2);
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 6, location = atomica::eth_proof)]
    fun config_cannot_be_changed(atomica: &signer) {
        init(atomica);
        init(atomica);
    }

    #[test(other = @0x123)]
    #[expected_failure(abort_code = 5, location = atomica::eth_proof)]
    fun only_admin_pins_config(other: &signer) {
        init(other);
    }

    #[test(atomica = @atomica)]
    fun admin_stores_header(atomica: &signer) {
        init(atomica);
        assert!(!eth_proof::has_header(6), 0);
        let root = x"5b6545b4c0f529b4be8977fd5a1521a5768b58d2d3e79c1172f9e3bcc089a618";
        eth_proof::submit_header(atomica, 6, root);
        assert!(eth_proof::has_header(6), 1);
        assert!(eth_proof::get_state_root(6) == root, 2);
        // Re-posting the same root is a no-op.
        eth_proof::submit_header(atomica, 6, root);
    }

    #[test(atomica = @atomica, other = @0x123)]
    #[expected_failure(abort_code = 5, location = atomica::eth_proof)]
    fun only_admin_stores_header(atomica: &signer, other: &signer) {
        init(atomica);
        eth_proof::submit_header(
            other, 6, x"5b6545b4c0f529b4be8977fd5a1521a5768b58d2d3e79c1172f9e3bcc089a618"
        );
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 10, location = atomica::eth_proof)]
    fun trusted_root_cannot_be_replaced(atomica: &signer) {
        init(atomica);
        eth_proof::submit_header(
            atomica, 6, x"5b6545b4c0f529b4be8977fd5a1521a5768b58d2d3e79c1172f9e3bcc089a618"
        );
        eth_proof::submit_header(
            atomica, 6, x"dbfb2e7809d2e11e9359c3ec55d8aa0254a04bc795e2d62a6c85ea34f977d7ba"
        );
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 9, location = atomica::eth_proof)]
    fun unknown_header_has_no_root(atomica: &signer) {
        init(atomica);
        eth_proof::get_state_root(6);
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
