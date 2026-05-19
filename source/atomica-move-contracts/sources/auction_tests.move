// Auction module tests — v0.1 Beta global-registry shape
//
// Tests cover:
//   - Window ID math (section 2.2 of v0-architecture.md)
//   - Sealed-bid type-check (section 2.5) — verifies new Bid shape compiles and stores
//   - View function behaviour against test-inserted WindowState
//   - create_auction implementation: happy path, stale/far-future window rejection, accumulation
//   - submit_cleartext_and_clear: happy path, invalid cleartext, before-window-close abort
//   - Scaffold abort paths: settle must abort with E_NOT_IMPLEMENTED (99)
//
// Demo-phase tests (per-seller Auction has key) are removed. All tests now
// operate on the global AuctionRegistry shape.
//
// @see docs/architecture/v0-architecture.md §2
#[test_only]
module atomica::auction_tests {
    use std::vector;
    use aptos_framework::ibe_config;
    use aptos_framework::ibe_golden_vector_fixtures as fixtures;
    use aptos_framework::timestamp;
    use aptos_std::crypto_algebra;
    use atomica::auction::{Self};
    use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};

    // ===================== Constants =====================

    const WINDOW_ID: u64 = 100;
    const TOTAL_SUPPLY: u256 = 10_000_000_000_000_000_000u256; // 10 ETH in wei

    // Canonical pair BCS encoding: matches Pair { b"ethereum", b"FakeETH", b"aptos", b"FakeUSD" }
    // In tests we use a simple byte vector; real callers BCS-encode the Pair struct.
    fun default_pair_bcs(): vector<u8> {
        b"eth-fakeusd"
    }

    // ===================== Setup helper =====================

    fun setup(framework: &signer) {
        timestamp::set_time_has_started_for_testing(framework);
    }

    // ===================== Window ID math =====================

    // Window ID formula from docs/architecture/v0-architecture.md §2.2:
    //   epoch = unix_seconds / 43200
    //   tmod  = unix_seconds % 43200
    //   id    = epoch * 2 + (tmod >= 28500 ? 1 : 0)
    //
    // Known vector: unix_seconds = 0 → epoch = 0, tmod = 0 → window_id = 0.
    #[test(framework = @0x1)]
    fun test_window_id_epoch_zero(framework: &signer) {
        setup(framework);
        // timestamp starts at 0
        let wid = auction::current_window_id();
        assert!(wid == 0, 1);
    }

    // unix_seconds = 28500 → tmod = 28500 >= 28500 → offset = 1 → window_id = 1
    #[test(framework = @0x1)]
    fun test_window_id_morning_offset(framework: &signer) {
        setup(framework);
        timestamp::fast_forward_seconds(28500);
        let wid = auction::current_window_id();
        assert!(wid == 1, 1);
    }

    // unix_seconds = 43200 → epoch = 1, tmod = 0 → offset = 0 → window_id = 2
    #[test(framework = @0x1)]
    fun test_window_id_epoch_one_start(framework: &signer) {
        setup(framework);
        timestamp::fast_forward_seconds(43200);
        let wid = auction::current_window_id();
        assert!(wid == 2, 1);
    }

    // unix_seconds = 43200 + 28500 = 71700 → epoch = 1, tmod = 28500 → offset = 1 → window_id = 3
    #[test(framework = @0x1)]
    fun test_window_id_epoch_one_second_window(framework: &signer) {
        setup(framework);
        timestamp::fast_forward_seconds(71700);
        let wid = auction::current_window_id();
        assert!(wid == 3, 1);
    }

    // Window ID is strictly monotone — later timestamp always >= earlier.
    #[test(framework = @0x1)]
    fun test_window_id_monotone(framework: &signer) {
        setup(framework);
        let w0 = auction::current_window_id();
        timestamp::fast_forward_seconds(43200 * 5 + 28500);
        let w1 = auction::current_window_id();
        assert!(w1 > w0, 1);
    }

    // ===================== View functions on test-inserted WindowState =====================

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_auction_exists_true_after_insert(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);
        assert!(auction::auction_exists(WINDOW_ID, pair_bcs), 1);
    }

    #[test(framework = @0x1)]
    fun test_auction_exists_false_before_insert(framework: &signer) {
        setup(framework);
        // No registry at @atomica — auction_exists must return false, not abort
        assert!(!auction::auction_exists(WINDOW_ID, default_pair_bcs()), 1);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_get_bid_count_zero_on_empty_window(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);
        assert!(auction::get_bid_count(WINDOW_ID, pair_bcs) == 0, 1);
    }

    #[test(framework = @0x1)]
    fun test_get_bid_count_zero_when_no_registry(framework: &signer) {
        setup(framework);
        // No registry — must return 0 gracefully
        assert!(auction::get_bid_count(WINDOW_ID, default_pair_bcs()) == 0, 1);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_is_settled_false_on_new_window(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);
        assert!(!auction::is_settled(WINDOW_ID, pair_bcs), 1);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_is_settled_true_when_marked(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, true, 2000);
        assert!(auction::is_settled(WINDOW_ID, pair_bcs), 1);
    }

    #[test(framework = @0x1)]
    fun test_is_settled_false_when_no_registry(framework: &signer) {
        setup(framework);
        assert!(!auction::is_settled(WINDOW_ID, default_pair_bcs()), 1);
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_get_auction_returns_correct_fields(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);
        let (wid, supply, bid_count, settled, clearing_price) =
            auction::get_auction(WINDOW_ID, pair_bcs);
        assert!(wid == WINDOW_ID, 1);
        assert!(supply == TOTAL_SUPPLY, 2);
        assert!(bid_count == 0, 3);
        assert!(!settled, 4);
        assert!(clearing_price == 0, 5);
    }

    #[test(framework = @0x1)]
    #[expected_failure(abort_code = 1, location = atomica::auction)] // E_AUCTION_NOT_FOUND
    fun test_get_auction_aborts_when_not_found(framework: &signer) {
        setup(framework);
        // No window inserted — get_auction aborts with E_AUCTION_NOT_FOUND
        auction::get_auction(WINDOW_ID, default_pair_bcs());
    }

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_get_settlement_returns_price(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let clearing_price = 2050u64;
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, true, clearing_price);
        let (price, supply) = auction::get_settlement(WINDOW_ID, pair_bcs);
        assert!(price == clearing_price, 1);
        assert!(supply == TOTAL_SUPPLY, 2);
    }

    // ===================== create_auction tests =====================
    //
    // Tests cover:
    //   - Happy path: create_auction registers the window, get_auction returns it.
    //   - Stale window_id aborts with E_STALE_WINDOW_ID (6).
    //   - Far-future window_id (> current + 1) aborts with E_STALE_WINDOW_ID (6).
    //   - Duplicate create_auction for same (window_id, pair) accumulates supply.
    //
    // The seller signer is @atomica (= @0xcafe in dev) so that the lazy registry
    // bootstrap (move_to(seller, ...)) publishes the AuctionRegistry at @atomica.
    // Real sellers calling after the first create_auction find the registry already
    // present. A pre-inserted FakeETH LockReceipt is required for each call so
    // that lock_receipt::claim can succeed without proof verification.

    // Helper: initialize FakeETH registry and insert a receipt for a given lock_id.
    fun insert_eth_receipt(
        atomica:     &signer,
        lock_id:     vector<u8>,
        seller_addr: address,
        amount:      u256,
    ) {
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(
            lock_id,
            seller_addr,
            amount,
            1u64, // block_number
        );
    }

    // Happy path: create_auction registers the window, get_auction returns fields.
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_create_auction_happy_path(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs    = default_pair_bcs();
        let lock_id     = b"eth_lock_receipt_id_32bytes_pad__";
        let seller_addr = @atomica; // @0xcafe in dev
        let lock_amount = 5_000_000_000_000_000_000u256; // 5 ETH in wei

        // Set up FakeETH receipt for the seller.
        insert_eth_receipt(atomica, lock_id, seller_addr, lock_amount);

        // current_window_id() == 0 at t=0; use window 0 (current).
        let window_id = auction::current_window_id();
        let mpk_bytes = vector::empty<u8>();
        let timelock_id = 0u64; // test timelock_id
        auction::create_auction(atomica, window_id, pair_bcs, lock_id, 2000u64, timelock_id, mpk_bytes);

        // get_auction must return the registered window.
        let (wid, supply, bid_count, settled, clearing_price) =
            auction::get_auction(window_id, pair_bcs);
        assert!(wid == window_id, 1);
        assert!(supply == lock_amount, 2);
        assert!(bid_count == 0, 3);
        assert!(!settled, 4);
        assert!(clearing_price == 0, 5);
    }

    // Next-window registration: create_auction accepts window_id == current + 1.
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_create_auction_next_window_accepted(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs    = default_pair_bcs();
        let lock_id     = b"eth_lock_receipt_next_window_pad_";
        let seller_addr = @atomica;
        let lock_amount = 1_000_000_000_000_000_000u256; // 1 ETH in wei

        insert_eth_receipt(atomica, lock_id, seller_addr, lock_amount);

        // window_id = current + 1 must be accepted.
        let window_id = auction::current_window_id() + 1;
        let mpk_bytes = vector::empty<u8>();
        let timelock_id = 0u64;
        auction::create_auction(atomica, window_id, pair_bcs, lock_id, 1900u64, timelock_id, mpk_bytes);

        let (wid, supply, _, _, _) = auction::get_auction(window_id, pair_bcs);
        assert!(wid == window_id, 1);
        assert!(supply == lock_amount, 2);
    }

    // Stale window_id (strictly less than current) aborts with E_STALE_WINDOW_ID.
    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 6, location = atomica::auction)] // E_STALE_WINDOW_ID
    fun test_create_auction_stale_window_id_aborts(framework: &signer, atomica: &signer) {
        setup(framework);
        // Advance time so current_window_id() > 0; then supply window_id = 0 (stale).
        timestamp::fast_forward_seconds(43200); // epoch 1, window_id = 2
        let pair_bcs    = default_pair_bcs();
        let lock_id     = vector::empty<u8>();
        let mpk_bytes   = vector::empty<u8>();
        let timelock_id = 0u64;
        // window_id 0 < current 2 → stale.
        auction::create_auction(atomica, 0u64, pair_bcs, lock_id, 100u64, timelock_id, mpk_bytes);
    }

    // Far-future window_id (> current + 1) aborts with E_STALE_WINDOW_ID.
    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 6, location = atomica::auction)] // E_STALE_WINDOW_ID
    fun test_create_auction_far_future_window_id_aborts(framework: &signer, atomica: &signer) {
        setup(framework);
        // current == 0; window_id 100 > 0 + 1 → too far in the future.
        let pair_bcs    = default_pair_bcs();
        let lock_id     = vector::empty<u8>();
        let mpk_bytes   = vector::empty<u8>();
        let timelock_id = 0u64;
        auction::create_auction(atomica, 100u64, pair_bcs, lock_id, 100u64, timelock_id, mpk_bytes);
    }

    // Duplicate create_auction for same (window_id, pair) accumulates total_supply.
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_create_auction_duplicate_accumulates_supply(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs     = default_pair_bcs();
        let lock_id_a    = b"eth_lock_receipt_seller_a_32byte_";
        let lock_id_b    = b"eth_lock_receipt_seller_b_32byte_";
        let seller_addr  = @atomica;
        let amount_a     = 3_000_000_000_000_000_000u256; // 3 ETH
        let amount_b     = 7_000_000_000_000_000_000u256; // 7 ETH
        let expected     = amount_a + amount_b;

        // Two separate FakeETH receipts.
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(
            lock_id_a, seller_addr, amount_a, 1u64,
        );
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(
            lock_id_b, seller_addr, amount_b, 2u64,
        );

        let window_id   = auction::current_window_id();
        let mpk_bytes   = vector::empty<u8>();
        let timelock_id = 0u64;

        // First seller creates the window.
        auction::create_auction(atomica, window_id, pair_bcs, lock_id_a, 2000u64, timelock_id, mpk_bytes);
        // Second seller joins the same window — supply accumulates.
        auction::create_auction(atomica, window_id, pair_bcs, lock_id_b, 1900u64, timelock_id, mpk_bytes);

        let (_, supply, _, _, _) = auction::get_auction(window_id, pair_bcs);
        assert!(supply == expected, 1);
    }

    // ===================== Bidder collateral claim path (Phase 3b) =====================
    //
    // End-to-end test for submit_bid:
    //   1. Initialize LockReceipt registry for Ethereum / FakeUSD.
    //   2. Insert a FakeUSD LockReceipt via test helper (bypasses proof verification).
    //   3. Insert a WindowState so submit_bid can find the window.
    //   4. Call submit_bid — verifies receipt is consumed and bid is stored.
    //
    // @see docs/architecture/v0-architecture.md §2.5

    #[test(framework = @0x1, atomica = @atomica, bidder = @0x1111)]
    fun test_submit_bid_consumes_lock_receipt_and_stores_bid(
        framework: &signer,
        atomica:   &signer,
        bidder:    &signer,
    ) {
        setup(framework);

        // 1. Initialize FakeUSD LockReceipt registry at @atomica (= @0xcafe in tests).
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);

        // 2. Insert a FakeUSD LockReceipt for the bidder, bypassing proof verification.
        //    Receipt ID is a simple 32-byte vector for test clarity.
        let collateral_lock_id = b"fakeusd_lock_receipt_id_32bytes_";
        let bidder_addr = @0x1111;
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(
            collateral_lock_id,
            bidder_addr,
            500_000_000u256, // 500 FakeUSD with 6 decimals
            100u64,          // block_number
        );

        // 3. Insert a WindowState so submit_bid can locate the window.
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);

        // Pre-condition: zero bids before submit_bid.
        assert!(auction::get_bid_count(WINDOW_ID, pair_bcs) == 0, 1);

        // 4. Call submit_bid — consumes receipt and stores the sealed bid.
        let u_bytes    = b"G1_ephemeral_point_48_bytes_pad_";
        let ciphertext = b"aes_gcm_ciphertext_of_price_";
        let quantity   = 1_000_000_000_000_000_000u256; // 1 ETH in wei
        auction::submit_bid(
            bidder,
            WINDOW_ID,
            pair_bcs,
            u_bytes,
            ciphertext,
            collateral_lock_id,
            quantity,
        );

        // Bid count must have incremented to 1.
        assert!(auction::get_bid_count(WINDOW_ID, pair_bcs) == 1, 2);

        // Receipt must now be claimed (STATUS_CLAIMED = 1).
        // We check via is_lock_claimed — after claim() the lock_id is in claimed_locks.
        assert!(lock_receipt::is_lock_claimed<Ethereum, FakeUSD>(collateral_lock_id), 3);
    }

    // Verify that submit_bid aborts when the FakeUSD LockReceipt registry has not
    // been initialized.  This guards against callers that skip initialization.
    #[test(framework = @0x1, atomica = @atomica, bidder = @0x1111)]
    #[expected_failure(abort_code = 6, location = atomica::lock_receipt)] // E_REGISTRY_NOT_INITIALIZED
    fun test_submit_bid_aborts_when_receipt_registry_not_initialized(
        framework: &signer,
        atomica:   &signer,
        bidder:    &signer,
    ) {
        setup(framework);
        // Registry NOT initialized — lock_receipt::claim must abort.
        let pair_bcs           = default_pair_bcs();
        let u_bytes            = vector::empty<u8>();
        let ciphertext         = vector::empty<u8>();
        let collateral_lock_id = vector::empty<u8>();
        let quantity           = 0u256;
        // Insert window so submit_bid reaches the claim call.
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);
        auction::submit_bid(bidder, WINDOW_ID, pair_bcs, u_bytes, ciphertext, collateral_lock_id, quantity);
    }

    // settle aborts with E_AUCTION_NOT_FOUND (1) when no registry exists.
    // This replaces the old E_NOT_IMPLEMENTED scaffold test now that settle is implemented.
    #[test(framework = @0x1, caller = @0x9999)]
    #[expected_failure(abort_code = 1, location = atomica::auction)] // E_AUCTION_NOT_FOUND
    fun test_settle_aborts_auction_not_found(framework: &signer, caller: &signer) {
        setup(framework);
        // No registry at @atomica → settle must abort with E_AUCTION_NOT_FOUND.
        auction::settle(caller, WINDOW_ID, default_pair_bcs());
    }

    // settle aborts with E_WINDOW_ALREADY_SETTLED (11) when called twice.
    #[test(framework = @0x1, atomica = @atomica, caller = @0x9999)]
    #[expected_failure(abort_code = 11, location = atomica::auction)] // E_WINDOW_ALREADY_SETTLED
    fun test_settle_aborts_already_settled(framework: &signer, atomica: &signer, caller: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        // Insert an already-settled window.
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, true, 2000);
        // Calling settle again must abort with E_WINDOW_ALREADY_SETTLED.
        auction::settle(caller, WINDOW_ID, pair_bcs);
    }

    // submit_cleartext_and_clear aborts with E_WINDOW_NOT_CLOSED (7) if the
    // auction window timelock has not yet expired.
    //
    // Uses ibe_config::initialize_for_testing to set up both ibe_config and
    // the timestamp module (so setup(framework) is NOT called separately).
    #[test(framework = @0x1, atomica = @atomica, settler = @0x9999)]
    #[expected_failure(abort_code = 7, location = atomica::auction)] // E_WINDOW_NOT_CLOSED
    fun test_submit_cleartext_aborts_before_window_close(
        framework: &signer,
        atomica:   &signer,
        settler:   &signer,
    ) {
        ibe_config::initialize_for_testing(framework);
        // Register a timelock with a deadline far in the future.
        // timestamp starts at 0 us; deadline is 2000000000000 us (far future).
        let deadline_us = 2000000000000u64;
        ibe_config::register_timelock(framework, deadline_us);
        let timelock_id = 0u64; // first registered timelock

        // Insert a window linked to the not-yet-expired timelock.
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window_with_timelock(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0, timelock_id);

        // Calling submit_cleartext_and_clear before timelock expires must abort with
        // E_WINDOW_NOT_CLOSED (7). Count check passes (0 bids, 0 cleartexts).
        auction::submit_cleartext_and_clear(
            settler,
            WINDOW_ID,
            pair_bcs,
            vector::empty<u64>(),
        );
    }

    // submit_cleartext_and_clear aborts with E_CLEARTEXT_COUNT_MISMATCH (9) if
    // the number of cleartexts does not match the number of bids.
    //
    // Count check happens before timelock expiry check, so no timelock setup is needed.
    #[test(framework = @0x1, atomica = @atomica, settler = @0x9999)]
    #[expected_failure(abort_code = 9, location = atomica::auction)] // E_CLEARTEXT_COUNT_MISMATCH
    fun test_submit_cleartext_aborts_on_count_mismatch(
        framework: &signer,
        atomica:   &signer,
        settler:   &signer,
    ) {
        setup(framework);

        let pair_bcs    = default_pair_bcs();
        let timelock_id = 0u64;
        // Insert window with 1 bid but supply 2 cleartexts.
        auction::test_insert_window_with_timelock(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0, timelock_id);
        auction::test_insert_bid(
            atomica, WINDOW_ID, pair_bcs, @0x1111,
            b"u_bytes_96", b"ciphertext_bytes", b"lock_id",
        );

        // 2 cleartexts but only 1 bid → count mismatch aborts.
        let cleartexts = vector[1u64, 2u64];
        auction::submit_cleartext_and_clear(settler, WINDOW_ID, pair_bcs, cleartexts);
    }

    // ===================== Sealed-bid roundtrip (type-check + storage) =====================
    //
    // Phase 3a: submit_bid aborts with E_NOT_IMPLEMENTED. The roundtrip test
    // bypasses the entry function via test_insert_bid, which directly appends a
    // SealedBid to an existing WindowState. This verifies:
    //   1. The SealedBid shape { bidder, u_bytes, ciphertext, collateral_lock_id } compiles.
    //   2. The bid is stored and get_bid_count reflects the insertion.
    //
    // Full roundtrip through submit_bid (with timelock_config::*_for_testing) is
    // deferred to Phase 3b (#86b) when the entry function body is implemented.

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_sealed_bid_roundtrip_type_check(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);

        // Verify pre-condition: zero bids
        assert!(auction::get_bid_count(WINDOW_ID, pair_bcs) == 0, 1);

        // Insert a sealed bid directly — bypasses submit_bid scaffold abort
        let u_bytes            = b"G1_point_48bytes"; // IBE ephemeral point placeholder
        let ciphertext         = b"aes_gcm_ciphertext"; // encrypted price placeholder
        let collateral_lock_id = b"lock_receipt_id"; // FakeUSD margin placeholder
        auction::test_insert_bid(
            atomica,
            WINDOW_ID,
            pair_bcs,
            @0x1111, // bidder address
            u_bytes,
            ciphertext,
            collateral_lock_id,
        );

        // Bid count must have incremented to 1
        assert!(auction::get_bid_count(WINDOW_ID, pair_bcs) == 1, 2);
    }

    // ===================== clear_uniform_price: §2.7 worked numeric example =====================
    //
    // Supply = 10 ETH (10u256 for test simplicity).
    // Bids (price, qty): Alice(2100, 4), Bob(2050, 3), Carol(2010, 5), Dave(1980, 2).
    // After sorting descending:
    //   Alice 4 → cumulative 4
    //   Bob   3 → cumulative 7
    //   Carol 5 → cumulative 12 > 10 → partial fill: 3 allocated at clearing price 2010
    //   Dave  loses (collateral to be released in settle)
    //
    // Expected clearing price = 2010.
    // Expected fills: Alice=4, Bob=3, Carol=3 (partial), Dave=0.
    //
    // @see docs/architecture/v0-architecture.md §2.7

    #[test(framework = @0x1, atomica = @atomica)]
    fun test_clear_uniform_price_architecture_example(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        // Supply = 10 (using unit quantities for test clarity, not wei)
        let supply: u256 = 10u256;
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        // Insert bids in arbitrary (unsorted) order to exercise the sort.
        // Dave (1980, 2) — will lose
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xDA7E,
            b"u", b"c", b"lock_dave", 2u256,
        );
        // Carol (2010, 5) — partial fill = 3
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xCA401,
            b"u", b"c", b"lock_carol", 5u256,
        );
        // Alice (2100, 4) — full fill
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE,
            b"u", b"c", b"lock_alice", 4u256,
        );
        // Bob (2050, 3) — full fill
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B,
            b"u", b"c", b"lock_bob", 3u256,
        );

        // Bids are inserted at indices: [0=Dave, 1=Carol, 2=Alice, 3=Bob]
        // Set revealed prices index-aligned to bids.
        let prices = vector[1980u64, 2010u64, 2100u64, 2050u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        // Run the clearing algorithm.
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        // Verify clearing_price is 2010 (Carol's marginal price).
        let (_, _, _, _, clearing_price) = auction::get_auction(WINDOW_ID, pair_bcs);
        assert!(clearing_price == 2010, 1);

        // Verify fill amounts per bid.
        let results = auction::test_get_bid_results(WINDOW_ID, pair_bcs);
        assert!(vector::length(&results) == 4, 2);

        // Index 0 = Dave: loser
        let (dave_win, dave_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 0));
        assert!(!dave_win, 3);
        assert!(dave_fill == 0u256, 4);

        // Index 1 = Carol: partial fill = 3
        let (carol_win, carol_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 1));
        assert!(carol_win, 5);
        assert!(carol_fill == 3u256, 6);

        // Index 2 = Alice: full fill = 4
        let (alice_win, alice_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 2));
        assert!(alice_win, 7);
        assert!(alice_fill == 4u256, 8);

        // Index 3 = Bob: full fill = 3
        let (bob_win, bob_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 3));
        assert!(bob_win, 9);
        assert!(bob_fill == 3u256, 10);
    }

    // Single bid fills entire supply at that price.
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_clear_uniform_price_single_bid(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 5u256;
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE,
            b"u", b"c", b"lock_alice", 5u256,
        );
        let prices = vector[3000u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        let (_, _, _, _, clearing_price) = auction::get_auction(WINDOW_ID, pair_bcs);
        assert!(clearing_price == 3000, 1);

        let results = auction::test_get_bid_results(WINDOW_ID, pair_bcs);
        let (alice_win, alice_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 0));
        assert!(alice_win, 2);
        assert!(alice_fill == 5u256, 3);
    }

    // Exact fill: total bid quantity == supply, no partial fill needed.
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_clear_uniform_price_exact_fill(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 7u256;
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        // Alice (2100, 4) + Bob (2050, 3) = 7 = supply exactly.
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE,
            b"u", b"c", b"lock_alice", 4u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B,
            b"u", b"c", b"lock_bob", 3u256,
        );
        let prices = vector[2100u64, 2050u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        let (_, _, _, _, clearing_price) = auction::get_auction(WINDOW_ID, pair_bcs);
        assert!(clearing_price == 2050, 1);

        let results = auction::test_get_bid_results(WINDOW_ID, pair_bcs);
        let (alice_win, alice_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 0));
        assert!(alice_win, 2);
        assert!(alice_fill == 4u256, 3);

        let (bob_win, bob_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 1));
        assert!(bob_win, 4);
        assert!(bob_fill == 3u256, 5);
    }

    // Insufficient bids to fill supply: all bids win at their prices.
    // When total bid quantity < supply, all bids are fully filled;
    // clearing price = lowest bid price.
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_clear_uniform_price_insufficient_bids(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 20u256; // More supply than total bids
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        // Alice (2100, 4) + Bob (2050, 3) = 7 < 20.
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE,
            b"u", b"c", b"lock_alice", 4u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B,
            b"u", b"c", b"lock_bob", 3u256,
        );
        let prices = vector[2100u64, 2050u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        // Clearing price = lowest winning bid = 2050 (Bob, last processed).
        let (_, _, _, _, clearing_price) = auction::get_auction(WINDOW_ID, pair_bcs);
        assert!(clearing_price == 2050, 1);

        let results = auction::test_get_bid_results(WINDOW_ID, pair_bcs);
        // Both bids win fully.
        let (alice_win, alice_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 0));
        assert!(alice_win, 2);
        assert!(alice_fill == 4u256, 3);
        let (bob_win, bob_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 1));
        assert!(bob_win, 4);
        assert!(bob_fill == 3u256, 5);
    }

    // Zero bids: clear_uniform_price handles empty bid list without panic.
    // Clearing price remains 0, bid_results is empty.
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_clear_uniform_price_zero_bids(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, 10u256, false, 0);

        // No bids, no revealed prices — call must succeed without panic.
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        let (_, _, _, _, clearing_price) = auction::get_auction(WINDOW_ID, pair_bcs);
        assert!(clearing_price == 0, 1);

        let results = auction::test_get_bid_results(WINDOW_ID, pair_bcs);
        assert!(vector::length(&results) == 0, 2);
    }

    // ===================== compute_rebates — Phase 3b implementation tests =====================
    //
    // REBATE_COEFFICIENT = 0 in v0, so all rebate amounts are 0.
    // Phase 3c will calibrate the coefficient and update these expected values.
    //
    // @see docs/architecture/v0-architecture.md §2 (fee/rebate section)

    // No-window case: compute_rebates returns empty vector when window is absent.
    #[test(framework = @0x1)]
    fun test_compute_rebates_returns_empty_when_no_window(framework: &signer) {
        setup(framework);
        let rebates = auction::compute_rebates(WINDOW_ID, default_pair_bcs(), 2000u64);
        assert!(vector::length(&rebates) == 0, 1);
    }

    // Single-bidder fixture: with one winner at the clearing price the rebate is 0
    // (REBATE_COEFFICIENT = 0 in v0; Phase 3c will calibrate).
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_compute_rebates_single_bidder_zero_rebate(
        framework: &signer,
        atomica:   &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 5u256;
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        // One winning bid at 2000, fill = 5.
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"u", b"c", b"lock_alice", 5u256,
        );
        let prices = vector[2000u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        let rebates = auction::compute_rebates(WINDOW_ID, pair_bcs, 2000u64);
        assert!(vector::length(&rebates) == 1, 1);
        // REBATE_COEFFICIENT = 0 → amount = 0.
        let (rebate_bidder, rebate_amount) = auction::test_rebate_fields(vector::borrow(&rebates, 0));
        assert!(rebate_bidder == @0xA11CE, 2);
        assert!(rebate_amount == 0u64, 3);
    }

    // Multi-bidder known-distance fixture: three winners above clearing price.
    // Alice (2100), Bob (2050), Carol (2010) vs clearing_price = 2010.
    // REBATE_COEFFICIENT = 0 → all amounts are 0 until Phase 3c calibration.
    #[test(framework = @0x1, atomica = @atomica)]
    fun test_compute_rebates_multi_bidder_known_distances(
        framework: &signer,
        atomica:   &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 10u256;
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        // Alice (2100, 4), Bob (2050, 3), Carol (2010, 3) — all win, supply exactly filled.
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"u", b"c", b"lock_alice", 4u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"u", b"c", b"lock_bob", 3u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xCA401, b"u", b"c", b"lock_carol", 3u256,
        );
        let prices = vector[2100u64, 2050u64, 2010u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        let rebates = auction::compute_rebates(WINDOW_ID, pair_bcs, CLEARING_PRICE_FIXTURE);
        assert!(vector::length(&rebates) == 3, 1);
        // All rebate amounts are 0 until Phase 3c calibrates REBATE_COEFFICIENT.
        let i = 0u64;
        while (i < 3u64) {
            let (_, amount) = auction::test_rebate_fields(vector::borrow(&rebates, i));
            assert!(amount == 0u64, 10 + i);
            i = i + 1;
        };
    }

    // ===================== Uniform-price clearing fixtures (type-check only) =====================
    //
    // The clearing algorithm is implemented in a later sub-issue (#86b–#86e).
    // These fixtures document the canonical test vectors from:
    //   docs/architecture/v0-architecture.md §2.7 (worked numeric example)
    //
    // Supply = 10 ETH.
    // | Bidder | Price | Qty  | Cumulative |
    // | Alice  | 2100  | 4    | 4          |
    // | Bob    | 2050  | 3    | 7          |
    // | Carol  | 2010  | 5    | 12 (partial fill: 3 ETH) |
    // | Dave   | 1980  | 2    | 14         |
    //
    // Clearing price = 2010 (Carol's marginal bid).
    // Winners: Alice (4), Bob (3), Carol (3 partial fill).
    // Dave loses; collateral released.
    //
    // These vectors are preserved as constants for use when clearing is implemented.

    const CLEARING_PRICE_FIXTURE: u64 = 2010;
    const SUPPLY_FIXTURE: u256 = 10u256;

    #[test]
    fun test_fixture_constants_are_consistent() {
        // type-check: fixture constants defined above compile correctly
        assert!(CLEARING_PRICE_FIXTURE == 2010, 1);
        assert!(SUPPLY_FIXTURE == 10u256, 2);
    }

    // ===================== submit_cleartext_and_clear: IBE pairing tests =====================
    //
    // Uses the `timelock_basic` golden vectors from `ibe_golden_vector_fixtures`:
    //   - 5 validators, threshold 3, equal weights
    //   - timelock_id = 0, deadline = 1000000000000 us
    //   - plaintext = b"Timelock test message" (21 bytes)
    //   - U = 96-byte G2 ephemeral point (timelock_basic_ciphertext_u)
    //   - V = 21-byte XOR-encrypted ciphertext (timelock_basic_ciphertext_v)
    //   - DK = 48-byte G1 reconstructed key (timelock_basic_reconstructed_dk)
    //
    // The expected cleartext (u64) is the first 8 bytes of the plaintext
    // b"Timelock" decoded as little-endian.
    //   T=0x54 i=0x69 m=0x6d e=0x65 l=0x6c o=0x6f c=0x63 k=0x6b
    //   LE u64: 0x6b636f6c656d6954 = 7738542499763048276
    //
    // Note: the production path uses `submit_cleartext_and_clear` which calls
    // `timelock::get_decryption_key` internally. The tests use the test-only
    // variant `test_submit_cleartext_with_dk` to inject the DK directly,
    // bypassing the IBE DK reconstruction native (`reconstruct_ibe_dk_internal`)
    // which is not available in the Move test VM. The pairing-based IBE
    // decryption logic is identical in both paths.
    //
    // @see docs/architecture/v0-architecture.md §2.6

    // Expected little-endian u64 from first 8 bytes of b"Timelock test message".
    // T=0x54 i=0x69 m=0x6d e=0x65 l=0x6c o=0x6f c=0x63 k=0x6b
    // python3: int.from_bytes(b'Timelock', 'little') == 7738151096101464404
    const CLEARTEXT_FROM_GOLDEN_PLAINTEXT: u64 = 7738151096101464404u64;

    // Happy path: valid cleartext passes pairing-based IBE verification and is stored.
    //
    // Uses timelock_basic golden vectors. The ciphertext was encrypted with
    // plaintext b"Timelock test message". The test supplies the known DK directly
    // via `test_submit_cleartext_with_dk` to bypass ibe_config dependency.
    // `enable_cryptography_algebra_natives` is called to enable BLS12-381 pairing.
    #[test(framework = @0x1, atomica = @atomica, settler = @0x9999)]
    fun test_submit_cleartext_happy_path_stores_revealed_price(
        framework: &signer,
        atomica:   &signer,
        settler:   &signer,
    ) {
        // Enable BLS12-381 pairing native functions required by the verification.
        crypto_algebra::enable_cryptography_algebra_natives(framework);

        let pair_bcs = default_pair_bcs();
        auction::test_insert_window_with_timelock(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0, 0u64);

        // Insert a sealed bid using the golden vector ciphertext.
        // u_bytes = U (96-byte G2 ephemeral point)
        // ciphertext = V (21-byte XOR-encrypted plaintext)
        let u_bytes    = fixtures::timelock_basic_ciphertext_u();
        let ciphertext = fixtures::timelock_basic_ciphertext_v();
        auction::test_insert_bid(
            atomica, WINDOW_ID, pair_bcs, @0x1111,
            u_bytes, ciphertext, b"collateral_lock_id",
        );

        // Supply the known DK from golden vectors and the expected cleartext.
        let dk_bytes  = fixtures::timelock_basic_reconstructed_dk();
        let cleartext = CLEARTEXT_FROM_GOLDEN_PLAINTEXT;
        let cleartexts = vector[cleartext];
        auction::test_submit_cleartext_with_dk(settler, WINDOW_ID, pair_bcs, cleartexts, dk_bytes);

        // Verify revealed prices are stored index-aligned to bids.
        let revealed = auction::test_get_revealed_prices(WINDOW_ID, pair_bcs);
        assert!(vector::length(&revealed) == 1, 1);
        assert!(*vector::borrow(&revealed, 0) == cleartext, 2);
    }

    // Invalid cleartext: wrong price aborts with E_INVALID_CLEARTEXT (10).
    //
    // Uses timelock_basic golden vectors. Supplying a wrong cleartext means the
    // pairing-decrypted price will not match the settler-provided value.
    #[test(framework = @0x1, atomica = @atomica, settler = @0x9999)]
    #[expected_failure(abort_code = 10, location = atomica::auction)] // E_INVALID_CLEARTEXT
    fun test_submit_cleartext_wrong_price_aborts(
        framework: &signer,
        atomica:   &signer,
        settler:   &signer,
    ) {
        // Enable BLS12-381 pairing native functions.
        crypto_algebra::enable_cryptography_algebra_natives(framework);

        let pair_bcs = default_pair_bcs();
        auction::test_insert_window_with_timelock(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0, 0u64);

        // Insert a sealed bid using the golden vector ciphertext.
        let u_bytes    = fixtures::timelock_basic_ciphertext_u();
        let ciphertext = fixtures::timelock_basic_ciphertext_v();
        auction::test_insert_bid(
            atomica, WINDOW_ID, pair_bcs, @0x1111,
            u_bytes, ciphertext, b"collateral_lock_id",
        );

        // Supply the correct DK but a WRONG cleartext — verification must fail.
        let dk_bytes        = fixtures::timelock_basic_reconstructed_dk();
        let wrong_cleartext = 9999u64;
        let cleartexts      = vector[wrong_cleartext];
        auction::test_submit_cleartext_with_dk(settler, WINDOW_ID, pair_bcs, cleartexts, dk_bytes);
    }

    // ===================== settle: end-to-end tests =====================
    //
    // Tests cover the full settle path from a cleared window:
    //   - settle succeeds and emits AuctionSettled (verified via is_settled)
    //   - losing bidders' LockReceipts are released (STATUS_REVOKED)
    //   - settle aborts E_AUCTION_NOT_FOUND when no registry exists
    //   - settle aborts E_WINDOW_ALREADY_SETTLED on double-settle
    //   - settle aborts E_AUCTION_NOT_ENDED when clearing has not run
    //
    // @see docs/architecture/v0-architecture.md §2.8 and §2.9

    // Helper: set up FakeUSD LockReceipt registry and insert a receipt for a bidder.
    fun insert_usd_receipt(
        atomica:     &signer,
        lock_id:     vector<u8>,
        bidder_addr: address,
        amount:      u256,
    ) {
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(
            lock_id,
            bidder_addr,
            amount,
            1u64, // block_number
        );
    }

    // End-to-end settle: cleared window settles, is_settled becomes true.
    //
    // Setup: insert window → insert 2 bids → set revealed prices → clear → settle.
    // After settle: is_settled returns true; losing bidder's receipt is revoked.
    //
    // @see docs/architecture/v0-architecture.md §2.7, §2.8, §2.9
    #[test(framework = @0x1, atomica = @atomica, caller = @0x9999)]
    fun test_settle_end_to_end_marks_window_settled(
        framework: &signer,
        atomica:   &signer,
        caller:    &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 5u256;
        // Insert window with 5-unit supply.
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        // Two bids: Alice wins (price=2100, qty=5 fills supply exactly), Bob loses.
        let alice_lock = b"fakeusd_lock_alice_32bytes_pad__";
        let bob_lock   = b"fakeusd_lock_bob___32bytes_pad__";

        // Initialize FakeUSD registry and insert claimed receipts (simulating submit_bid).
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(
            alice_lock, @0xA11CE, 10_500_000_000u256, 1u64,
        );
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(
            bob_lock, @0xB0B, 4_100_000_000u256, 1u64,
        );
        // Claim both receipts to simulate submit_bid consuming them.
        lock_receipt::claim<Ethereum, FakeUSD>(@atomica, alice_lock);
        lock_receipt::claim<Ethereum, FakeUSD>(@atomica, bob_lock);

        // Insert bid metadata into the window (test helper bypasses submit_bid).
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"u", b"c", alice_lock, 5u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"u", b"c", bob_lock, 2u256,
        );

        // Set revealed prices: Alice=2100, Bob=2000.
        // Supply=5: Alice (qty=5) fills exactly → clearing_price=2100, Bob loses.
        let prices = vector[2100u64, 2000u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        // Run clearing.
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        // Verify not yet settled.
        assert!(!auction::is_settled(WINDOW_ID, pair_bcs), 1);

        // Settle.
        auction::settle(caller, WINDOW_ID, pair_bcs);

        // Window must be marked settled.
        assert!(auction::is_settled(WINDOW_ID, pair_bcs), 2);

        // Bob (loser): receipt must be released (STATUS_REVOKED = 2).
        let bob_status = lock_receipt::get_receipt_status<Ethereum, FakeUSD>(bob_lock);
        assert!(bob_status == lock_receipt::status_revoked(), 3);

        // Alice (winner): receipt stays claimed (STATUS_CLAIMED = 1) — not released.
        let alice_status = lock_receipt::get_receipt_status<Ethereum, FakeUSD>(alice_lock);
        assert!(alice_status == lock_receipt::status_claimed(), 4);
    }

    // settle with zero bids: window settles with total_filled=0, winner_count=0.
    #[test(framework = @0x1, atomica = @atomica, caller = @0x9999)]
    fun test_settle_zero_bids_succeeds(
        framework: &signer,
        atomica:   &signer,
        caller:    &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, 10u256, false, 0);

        // No bids — run clearing (handles zero-bid case) then settle.
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);
        auction::settle(caller, WINDOW_ID, pair_bcs);

        // Window must be settled.
        assert!(auction::is_settled(WINDOW_ID, pair_bcs), 1);
    }

    // settle aborts E_AUCTION_NOT_ENDED when bid_results not yet populated.
    // (i.e., clear_uniform_price has not been called but there are bids)
    #[test(framework = @0x1, atomica = @atomica, caller = @0x9999)]
    #[expected_failure(abort_code = 3, location = atomica::auction)] // E_AUCTION_NOT_ENDED
    fun test_settle_aborts_when_clearing_not_run(
        framework: &signer,
        atomica:   &signer,
        caller:    &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, 5u256, false, 0);

        // Insert one bid but do NOT call clear_uniform_price.
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"u", b"c", b"lock", 5u256,
        );
        let prices = vector[2000u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        // settle must abort: bid_results.length (0) != bids.length (1).
        auction::settle(caller, WINDOW_ID, pair_bcs);
    }
}
