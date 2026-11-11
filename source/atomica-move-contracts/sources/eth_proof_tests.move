#[test_only]
module atomica::eth_proof_tests {
    use atomica::eth_proof;
    use aptos_framework::account_abstraction;
    use aptos_framework::ethereum_headers;
    use std::bcs;
    use std::string;
    use std::vector;

    /// Any 32-byte block hash: eth_proof reads only the state root.
    const BLOCK_HASH: vector<u8> = x"1111111111111111111111111111111111111111111111111111111111111111";

    /// The SDK's derived address of 0xf39F…2266 under `localhost:3000`.
    const SDK_DERIVED_OWNER: address = @0x50ccc023d06341b127ca69fd9a204f401118aca3385292926aa2a9ed42ae80e6;

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

    // ==================== Config and certified headers ====================

    fun init(atomica: &signer) {
        eth_proof::initialize(
            atomica,
            x"9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
            x"5FbDB2315678afecb367f032d93F642f64180aa3",
            x"e7f1725E7734CE288F8367e1Bb143E90bb3F0512",
            b"localhost:3000",
        );
    }

    #[test(atomica = @atomica)]
    fun config_is_pinned(atomica: &signer) {
        init(atomica);
        let (lockbox, eth_token, usd_token) = eth_proof::get_config();
        assert!(lockbox == x"9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", 0);
        assert!(eth_token == x"5FbDB2315678afecb367f032d93F642f64180aa3", 1);
        assert!(usd_token == x"e7f1725E7734CE288F8367e1Bb143E90bb3F0512", 2);
        assert!(eth_proof::siwe_domain() == b"localhost:3000", 3);
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
    #[expected_failure(abort_code = 13, location = atomica::eth_proof)]
    fun config_needs_siwe_domain(atomica: &signer) {
        eth_proof::initialize(
            atomica,
            x"9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
            x"5FbDB2315678afecb367f032d93F642f64180aa3",
            x"e7f1725E7734CE288F8367e1Bb143E90bb3F0512",
            b"",
        );
    }

    #[test]
    fun reads_root_certified_by_validators() {
        assert!(!eth_proof::has_header(6), 0);
        let root = x"5b6545b4c0f529b4be8977fd5a1521a5768b58d2d3e79c1172f9e3bcc089a618";
        ethereum_headers::set_header_for_test(6, BLOCK_HASH, root);
        assert!(eth_proof::has_header(6), 1);
        assert!(eth_proof::get_state_root(6) == root, 2);
    }

    #[test]
    #[expected_failure(abort_code = 9, location = atomica::eth_proof)]
    fun uncertified_block_has_no_root() {
        // Another block is certified: block 6 still has no root.
        ethereum_headers::set_header_for_test(
            7, BLOCK_HASH, x"dbfb2e7809d2e11e9359c3ec55d8aa0254a04bc795e2d62a6c85ea34f977d7ba"
        );
        eth_proof::get_state_root(6);
    }

    // ==================== Ethereum-derivable owner ====================

    // Golden value: `getDerivedAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    // "localhost:3000")` from source/atomica-sdk/src/siwe.ts. The SDK and the
    // chain derive the same receipt owner.
    #[test(atomica = @atomica)]
    fun owner_matches_sdk_derived_address(atomica: &signer) {
        init(atomica);
        let owner = eth_proof::ethereum_account_address(
            x"f39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
        );
        assert!(owner == SDK_DERIVED_OWNER, 0);
    }

    // The derivation is the framework's: the same abstract public key gives the
    // account `0x1::ethereum_derivable_account` authenticates.
    #[test(atomica = @atomica)]
    fun owner_matches_framework_derivation(atomica: &signer) {
        init(atomica);
        let key = bcs::to_bytes(&b"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
        vector::append(&mut key, bcs::to_bytes(&b"localhost:3000"));
        let expected = account_abstraction::derive_account_address_view(
            @0x1, string::utf8(b"ethereum_derivable_account"), string::utf8(b"authenticate"), key
        );
        assert!(
            eth_proof::ethereum_account_address(x"f39Fd6e51aad88F6F4ce6aB8827279cffFb92266") == expected,
            0
        );
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 8, location = atomica::eth_proof)]
    fun owner_needs_20_byte_address(atomica: &signer) {
        init(atomica);
        eth_proof::ethereum_account_address(x"f39F");
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
