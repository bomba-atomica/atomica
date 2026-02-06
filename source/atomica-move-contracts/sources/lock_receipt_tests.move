#[test_only]
module atomica::lock_receipt_tests {
    use std::vector;
    use aptos_framework::timestamp;
    use aptos_std::aptos_hash::keccak256;
    use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};

    // Test helper: Initialize timestamp for testing
    fun setup_timestamp(framework: &signer) {
        timestamp::set_time_has_started_for_testing(framework);
    }

    // Test helper: Create a test lock ID
    fun create_test_lock_id(value: u8): vector<u8> {
        let lock_id = vector::empty<u8>();
        vector::push_back(&mut lock_id, value);
        lock_id
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_initialize_registry(framework: &signer, atomica: &signer) {
        setup_timestamp(framework);

        // Initialize registry for Ethereum FakeETH
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);

        // Verify it was created
        assert!(lock_receipt::is_registry_initialized<Ethereum, FakeETH>(), 1);

        // Check initial state
        assert!(lock_receipt::get_total_locked<Ethereum, FakeETH>() == 0, 2);
        assert!(lock_receipt::get_receipt_count<Ethereum, FakeETH>() == 0, 3);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_separate_registries_for_different_assets(
        framework: &signer,
        atomica: &signer
    ) {
        setup_timestamp(framework);

        // Initialize separate registries
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);

        // Both should exist
        assert!(lock_receipt::is_registry_initialized<Ethereum, FakeETH>(), 1);
        assert!(lock_receipt::is_registry_initialized<Ethereum, FakeUSD>(), 2);

        // They should be independent
        assert!(lock_receipt::get_total_locked<Ethereum, FakeETH>() == 0, 3);
        assert!(lock_receipt::get_total_locked<Ethereum, FakeUSD>() == 0, 4);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_lock_not_claimed_initially(framework: &signer, atomica: &signer) {
        setup_timestamp(framework);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);

        let lock_id = create_test_lock_id(0xAA);

        // Should not be claimed initially
        assert!(!lock_receipt::is_lock_claimed<Ethereum, FakeETH>(lock_id), 1);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_view_functions_on_uninitialized_registry(framework: &signer) {
        setup_timestamp(framework);

        // These should not crash on uninitialized registry
        assert!(lock_receipt::get_total_locked<Ethereum, FakeETH>() == 0, 1);
        assert!(lock_receipt::get_receipt_count<Ethereum, FakeETH>() == 0, 2);
        assert!(!lock_receipt::is_registry_initialized<Ethereum, FakeETH>(), 3);

        let lock_id = create_test_lock_id(0xFF);
        assert!(!lock_receipt::is_lock_claimed<Ethereum, FakeETH>(lock_id), 4);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_type_safety_different_assets(framework: &signer, atomica: &signer) {
        setup_timestamp(framework);

        // Initialize registries for different assets
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);

        let lock_id = create_test_lock_id(0xAA);

        // Same lock_id, different asset types
        // FakeETH should not see FakeUSD's lock
        assert!(!lock_receipt::is_lock_claimed<Ethereum, FakeETH>(lock_id), 1);
        assert!(!lock_receipt::is_lock_claimed<Ethereum, FakeUSD>(lock_id), 2);

        // This demonstrates type isolation at compile time
        // The following would NOT compile:
        // let eth_receipt: LockReceipt<Ethereum, FakeETH> = ...;
        // fake_usd::mint_from_receipt(eth_receipt); // ERROR: type mismatch!
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_multiple_initializations_idempotent(
        framework: &signer,
        atomica: &signer
    ) {
        setup_timestamp(framework);

        // Initialize once
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        assert!(lock_receipt::is_registry_initialized<Ethereum, FakeETH>(), 1);

        // Initialize again - should be idempotent (no error)
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        assert!(lock_receipt::is_registry_initialized<Ethereum, FakeETH>(), 2);
    }

    // New comprehensive tests below

    // Note: Tests for claim_wrong_owner and claim_already_claimed require
    // full E2E integration with register_ethereum_lock, which will be tested
    // in integration_tests.move

    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 3, location = atomica::lock_receipt)]
    fun test_claim_nonexistent_receipt_fails(
        framework: &signer,
        atomica: &signer
    ) {
        setup_timestamp(framework);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);

        let user = @0x1234;
        let lock_id = create_test_lock_id(0x99);

        // Try to claim non-existent receipt
        lock_receipt::claim<Ethereum, FakeETH>(user, lock_id);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 6, location = atomica::lock_receipt)]
    fun test_claim_uninitialized_registry_fails(framework: &signer) {
        setup_timestamp(framework);

        let user = @0x1234;
        let lock_id = create_test_lock_id(0x99);

        // Try to claim from uninitialized registry
        lock_receipt::claim<Ethereum, FakeETH>(user, lock_id);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 3, location = atomica::lock_receipt)]
    fun test_get_receipt_nonexistent_fails(
        framework: &signer,
        atomica: &signer
    ) {
        setup_timestamp(framework);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);

        let lock_id = create_test_lock_id(0x99);

        // Try to get non-existent receipt
        lock_receipt::get_receipt<Ethereum, FakeETH>(lock_id);
    }

    #[test(framework = @0x1)]
    fun test_lock_id_uniqueness(framework: &signer) {
        setup_timestamp(framework);

        // Create different lock IDs
        let data1 = b"block1usertoken";
        let data2 = b"block2usertoken";
        let data3 = b"block1usertoken"; // Same as data1

        let id1 = keccak256(data1);
        let id2 = keccak256(data2);
        let id3 = keccak256(data3);

        // Different data should produce different IDs
        assert!(id1 != id2, 1);

        // Same data should produce same ID
        assert!(id1 == id3, 2);
    }
}

