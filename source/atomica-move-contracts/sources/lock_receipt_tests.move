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

        // This demonstrates type isolation at compile time.
        // The following would NOT compile:
        // let eth_receipt: lock_receipt::LockReceipt<Ethereum, FakeETH> = ...;
        // let usd_receipt: lock_receipt::LockReceipt<Ethereum, FakeUSD> = eth_receipt; // ERROR: type mismatch!
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

    // ==================== Claim: owner only ====================

    /// A depositor's Ethereum-derivable account (any address other than @atomica).
    const OWNER: address = @0x50ccc023d06341b127ca69fd9a204f401118aca3385292926aa2a9ed42ae80e6;

    // The @atomica account has no claim privilege over another user's receipt.
    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 5, location = atomica::lock_receipt)]
    fun atomica_cannot_claim_users_receipt(framework: &signer, atomica: &signer) {
        setup_timestamp(framework);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        let lock_id = create_test_lock_id(0x42);
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(lock_id, OWNER, 1000u256, 6);
        lock_receipt::claim<Ethereum, FakeETH>(@atomica, lock_id);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun owner_claims_own_receipt(framework: &signer, atomica: &signer) {
        setup_timestamp(framework);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        let lock_id = create_test_lock_id(0x42);
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(lock_id, OWNER, 1000u256, 6);
        assert!(lock_receipt::claim<Ethereum, FakeETH>(OWNER, lock_id) == 1000u256, 0);
        assert!(
            lock_receipt::get_receipt_status<Ethereum, FakeETH>(lock_id)
                == lock_receipt::status_claimed(),
            1
        );
    }

    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 5, location = atomica::lock_receipt)]
    fun other_account_cannot_claim(framework: &signer, atomica: &signer) {
        setup_timestamp(framework);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        let lock_id = create_test_lock_id(0x42);
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(lock_id, OWNER, 1000u256, 6);
        lock_receipt::claim<Ethereum, FakeETH>(@0x123, lock_id);
    }

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

    // ===================== Terminal outcomes and cancel (issue 194) =====================

    const OWNER_194: address = @0xA11CE;
    const DELAY_US: u64 = 86_400_000_000; // timelock_config::get_receipt_cancel_delay_us

    fun cancel_setup(framework: &signer, atomica: &signer): vector<u8> {
        setup_timestamp(framework);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        let lock_id = b"cancel_test_lock_id_32bytes_____";
        // Registered at time 0.
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(lock_id, OWNER_194, 1000u256, 1);
        lock_id
    }

    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 14, location = atomica::lock_receipt)] // E_CANCEL_TOO_EARLY
    fun cancel_unauctioned_before_delay_aborts(framework: &signer, atomica: &signer) {
        let lock_id = cancel_setup(framework, atomica);
        assert!(atomica::timelock_config::get_receipt_cancel_delay_us() == DELAY_US, 1);
        timestamp::update_global_time_for_test(DELAY_US - 1);
        let stranger = aptos_framework::account::create_signer_for_test(@0x7777);
        lock_receipt::cancel_unauctioned<Ethereum, FakeETH>(&stranger, lock_id);
    }

    // A non-owner cancels an ACTIVE receipt after the delay: it returns to its depositor
    // with an outcome record, and no window can claim it any more.
    #[test(framework = @0x1, atomica = @atomica)]
    fun cancel_unauctioned_after_delay(framework: &signer, atomica: &signer) {
        let lock_id = cancel_setup(framework, atomica);
        timestamp::update_global_time_for_test(DELAY_US);
        let stranger = aptos_framework::account::create_signer_for_test(@0x7777);
        lock_receipt::cancel_unauctioned<Ethereum, FakeETH>(&stranger, lock_id);
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeETH>(lock_id) == lock_receipt::status_revoked(), 1);
        let (kind, window_id, recipients, amounts) = lock_receipt::get_lock_outcome<Ethereum, FakeETH>(lock_id);
        assert!(kind == lock_receipt::status_revoked() && window_id == 0, 2);
        assert!(recipients == vector[lock_receipt::test_eth_owner(OWNER_194)], 3);
        assert!(amounts == vector[1000u256], 4);
        let events = aptos_framework::event::emitted_events<lock_receipt::LockOutcomeRecorded<Ethereum, FakeETH>>();
        assert!(vector::length(&events) == 1, 5);
        let (e_id, e_kind, e_window, e_to, e_amounts) =
            lock_receipt::test_lock_outcome_event_fields(vector::borrow(&events, 0));
        assert!(e_id == lock_id && e_kind == kind && e_window == window_id, 6);
        assert!(e_to == recipients && e_amounts == amounts, 7);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 4, location = atomica::lock_receipt)] // E_RECEIPT_ALREADY_CLAIMED
    fun cancelled_receipt_cannot_be_claimed(framework: &signer, atomica: &signer) {
        let lock_id = cancel_setup(framework, atomica);
        timestamp::update_global_time_for_test(DELAY_US);
        let stranger = aptos_framework::account::create_signer_for_test(@0x7777);
        lock_receipt::cancel_unauctioned<Ethereum, FakeETH>(&stranger, lock_id);
        lock_receipt::claim_for_window<Ethereum, FakeETH>(OWNER_194, lock_id, 0, vector::empty());
    }

    // A receipt a window holds cannot be cancelled: the window gives it its outcome.
    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 7, location = atomica::lock_receipt)] // E_INVALID_STATUS
    fun cancel_unauctioned_claimed_aborts(framework: &signer, atomica: &signer) {
        let lock_id = cancel_setup(framework, atomica);
        lock_receipt::claim<Ethereum, FakeETH>(OWNER_194, lock_id);
        timestamp::update_global_time_for_test(DELAY_US);
        let stranger = aptos_framework::account::create_signer_for_test(@0x7777);
        lock_receipt::cancel_unauctioned<Ethereum, FakeETH>(&stranger, lock_id);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::lock_receipt)] // E_WRONG_BINDING
    fun claim_for_window_rejects_another_window(framework: &signer, atomica: &signer) {
        let lock_id = cancel_setup(framework, atomica);
        lock_receipt::claim_for_window<Ethereum, FakeETH>(OWNER_194, lock_id, 1, vector::empty());
    }

    fun claimed_lock(framework: &signer, atomica: &signer): vector<u8> {
        let lock_id = cancel_setup(framework, atomica);
        lock_receipt::claim<Ethereum, FakeETH>(OWNER_194, lock_id);
        lock_id
    }

    // A filled outcome pays a counterparty: the receipt becomes FILLED.
    #[test(framework = @0x1, atomica = @atomica)]
    fun record_outcome_marks_a_paying_lock_filled(framework: &signer, atomica: &signer) {
        let lock_id = claimed_lock(framework, atomica);
        let buyer = x"00000000000000000000000000000000000000b1";
        lock_receipt::record_outcome<Ethereum, FakeETH>(
            lock_id, vector[buyer, lock_receipt::test_eth_owner(OWNER_194)], vector[600u256, 400u256],
        );
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeETH>(lock_id) == lock_receipt::status_filled(), 1);
    }

    // Unpayable leaves are refused before any outcome is emitted.
    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 13, location = atomica::lock_receipt)] // E_UNPAYABLE_OUTCOME
    fun record_outcome_rejects_a_zero_recipient(framework: &signer, atomica: &signer) {
        let lock_id = claimed_lock(framework, atomica);
        lock_receipt::record_outcome<Ethereum, FakeETH>(
            lock_id, vector[x"0000000000000000000000000000000000000000"], vector[1000u256],
        );
    }

    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 13, location = atomica::lock_receipt)] // E_UNPAYABLE_OUTCOME
    fun record_outcome_rejects_a_short_recipient(framework: &signer, atomica: &signer) {
        let lock_id = claimed_lock(framework, atomica);
        lock_receipt::record_outcome<Ethereum, FakeETH>(lock_id, vector[x"b1"], vector[1000u256]);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 13, location = atomica::lock_receipt)] // E_UNPAYABLE_OUTCOME
    fun record_outcome_rejects_a_wrong_sum(framework: &signer, atomica: &signer) {
        let lock_id = claimed_lock(framework, atomica);
        lock_receipt::record_outcome<Ethereum, FakeETH>(
            lock_id, vector[lock_receipt::test_eth_owner(OWNER_194)], vector[999u256],
        );
    }

    // A lock gets one outcome: a second record aborts.
    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 7, location = atomica::lock_receipt)] // E_INVALID_STATUS
    fun record_outcome_runs_once(framework: &signer, atomica: &signer) {
        let lock_id = claimed_lock(framework, atomica);
        lock_receipt::return_to_depositor<Ethereum, FakeETH>(lock_id);
        lock_receipt::return_to_depositor<Ethereum, FakeETH>(lock_id);
    }
}
