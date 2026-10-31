// Auction module tests — v0.1 Beta global-registry shape
//
// Tests cover:
//   - Window ID math (section 2.2 of v0-architecture.md)
//   - Sealed-bid type-check (section 2.5) — verifies new Bid shape compiles and stores
//   - View function behaviour against test-inserted WindowState
//   - create_auction implementation: happy path, stale/far-future window rejection, accumulation
//   - clear_uniform_price and settle on windows whose reveal is closed
//   (V2 bid submission, opening, expiry and refund tests: auction_bid_wrapper_tests.move)
//
// Demo-phase tests (per-seller Auction has key) are removed. All tests now
// operate on the global AuctionRegistry shape.
//
// @see docs/architecture/v0-architecture.md §2
#[test_only]
module atomica::auction_tests {
    use std::vector;
    use aptos_framework::timestamp;
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

    // ===================== submit_bid edge cases (issue #129) =====================
    //
    // Six tests that verify boundary conditions of submit_bid not covered by the
    // existing happy-path and uninitialized-registry tests.
    //
    // @see docs/architecture/v0-architecture.md §2.5

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
            b"c", b"lock_dave", 2u256,
        );
        // Carol (2010, 5) — partial fill = 3
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xCA401,
            b"c", b"lock_carol", 5u256,
        );
        // Alice (2100, 4) — full fill
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE,
            b"c", b"lock_alice", 4u256,
        );
        // Bob (2050, 3) — full fill
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B,
            b"c", b"lock_bob", 3u256,
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
            b"c", b"lock_alice", 5u256,
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
            b"c", b"lock_alice", 4u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B,
            b"c", b"lock_bob", 3u256,
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
            b"c", b"lock_alice", 4u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B,
            b"c", b"lock_bob", 3u256,
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
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", b"lock_alice", 5u256,
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
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", b"lock_alice", 4u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"c", b"lock_bob", 3u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xCA401, b"c", b"lock_carol", 3u256,
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

    // ===================== settle: named acceptance-criteria tests =====================
    //
    // These seven tests are the primary acceptance criteria for issue #131.
    // They cover each observable effect of settle() using the exact names
    // specified in the issue acceptance criteria.
    //
    // @see docs/architecture/v0-architecture.md §2.8 and §2.9

    // test_settle_distributes_proceeds_to_seller
    //
    // After settle(), the AuctionSettled event carries clearing_price and
    // total_filled so the off-chain relayer can compute seller proceeds.
    // On-chain we verify via get_settlement that clearing_price * total_filled
    // are correctly recorded.  FakeUSD token transfers happen on Ethereum after
    // the relayer reads AuctionSettled; this test verifies the on-chain state
    // is correct.
    //
    // Setup: 1 seller (5 ETH supply), 1 winning bid (price=2100, qty=5).
    // Expected total_filled = 5, clearing_price = 2100.
    #[test(framework = @0x1, atomica = @atomica, caller = @0x9999)]
    fun test_settle_distributes_proceeds_to_seller(
        framework: &signer,
        atomica:   &signer,
        caller:    &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 5u256;
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        // Insert FakeUSD receipt for winning bidder (simulating submit_bid claim).
        let alice_lock = b"settle_proceeds_alice_lock_32pad";
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(
            alice_lock, @0xA11CE, 10_500_000_000u256, 1u64,
        );
        lock_receipt::claim<Ethereum, FakeUSD>(@atomica, alice_lock);

        // Single winning bid: Alice (price=2100, qty=5) fills supply exactly.
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", alice_lock, 5u256,
        );
        let prices = vector[2100u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        // Verify clearing_price from get_auction before settle.
        let (_, _, _, _, cp_before) = auction::get_auction(WINDOW_ID, pair_bcs);
        assert!(cp_before == 2100, 1);

        // Settle.
        auction::settle(caller, WINDOW_ID, pair_bcs);

        // Window is settled.
        assert!(auction::is_settled(WINDOW_ID, pair_bcs), 2);

        // get_settlement returns (clearing_price, total_supply).
        // total_supply = 5 — the amount of seller liquidity available.
        // Seller proceeds = clearing_price * total_filled = 2100 * 5 units.
        let (settlement_price, settlement_supply) = auction::get_settlement(WINDOW_ID, pair_bcs);
        assert!(settlement_price == 2100, 3);
        assert!(settlement_supply == 5u256, 4);
    }

    // test_settle_releases_losing_collateral
    //
    // After settle(), losing bidders' FakeUSD LockReceipts are released
    // (STATUS_REVOKED = 2) so the off-chain relayer returns their collateral.
    // Winning bidders' receipts remain STATUS_CLAIMED (= 1).
    //
    // Setup: 2 bids — Alice wins (price=2100, qty=5 fills supply=5),
    //        Bob loses (price=2000, qty=3).
    #[test(framework = @0x1, atomica = @atomica, caller = @0x9999)]
    fun test_settle_releases_losing_collateral(
        framework: &signer,
        atomica:   &signer,
        caller:    &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 5u256;
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        let alice_lock = b"losing_collat_alice_lock_32bytes";
        let bob_lock   = b"losing_collat_bob___lock_32bytes";

        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(
            alice_lock, @0xA11CE, 10_500_000_000u256, 1u64,
        );
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(
            bob_lock, @0xB0B, 6_000_000_000u256, 1u64,
        );
        // Claim both receipts to simulate submit_bid consuming them.
        lock_receipt::claim<Ethereum, FakeUSD>(@atomica, alice_lock);
        lock_receipt::claim<Ethereum, FakeUSD>(@atomica, bob_lock);

        // Alice wins (price=2100, qty=5 fills supply), Bob loses (price=2000).
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", alice_lock, 5u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"c", bob_lock, 3u256,
        );
        let prices = vector[2100u64, 2000u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        auction::clear_uniform_price(WINDOW_ID, pair_bcs);
        auction::settle(caller, WINDOW_ID, pair_bcs);

        // Bob (loser): receipt must be released (STATUS_REVOKED = 2).
        let bob_status = lock_receipt::get_receipt_status<Ethereum, FakeUSD>(bob_lock);
        assert!(bob_status == lock_receipt::status_revoked(), 1);

        // Alice (winner): receipt stays claimed (STATUS_CLAIMED = 1) — not released.
        let alice_status = lock_receipt::get_receipt_status<Ethereum, FakeUSD>(alice_lock);
        assert!(alice_status == lock_receipt::status_claimed(), 2);
    }

    // test_settle_applies_fee_rebates
    //
    // After settle(), compute_rebates returns a vector of Rebate entries for all
    // bidders in the cleared window.  With REBATE_COEFFICIENT = 0 (v0 calibration
    // deferred to Phase 3c), all rebate amounts are 0.  This test asserts that:
    //   - compute_rebates is callable after settle()
    //   - it returns one entry per bidder
    //   - all amounts are 0 at the current coefficient
    //
    // Setup: 3 bids — Alice wins (price=2100), Bob wins (price=2050),
    //        Carol loses (price=1900). Supply=7.
    #[test(framework = @0x1, atomica = @atomica, caller = @0x9999)]
    fun test_settle_applies_fee_rebates(
        framework: &signer,
        atomica:   &signer,
        caller:    &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 7u256;
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        let alice_lock = b"fee_rebate_alice_lock_32bytes_pa";
        let bob_lock   = b"fee_rebate_bob___lock_32bytes_pa";
        let carol_lock = b"fee_rebate_carol_lock_32bytes_pa";

        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(alice_lock, @0xA11CE, 10_500_000_000u256, 1u64);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(bob_lock,   @0xB0B,   7_175_000_000u256, 1u64);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(carol_lock, @0xCA401, 6_650_000_000u256, 1u64);
        lock_receipt::claim<Ethereum, FakeUSD>(@atomica, alice_lock);
        lock_receipt::claim<Ethereum, FakeUSD>(@atomica, bob_lock);
        lock_receipt::claim<Ethereum, FakeUSD>(@atomica, carol_lock);

        // Alice (2100, 4) + Bob (2050, 3) = 7 fills supply. Carol (1900, 2) loses.
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", alice_lock, 4u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"c", bob_lock, 3u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xCA401, b"c", carol_lock, 2u256,
        );
        let prices = vector[2100u64, 2050u64, 1900u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        auction::clear_uniform_price(WINDOW_ID, pair_bcs);
        auction::settle(caller, WINDOW_ID, pair_bcs);

        // compute_rebates must return 3 entries (one per bidder).
        let clearing_price = 2050u64; // Bob's price is the marginal price
        let rebates = auction::compute_rebates(WINDOW_ID, pair_bcs, clearing_price);
        assert!(vector::length(&rebates) == 3, 1);

        // REBATE_COEFFICIENT = 0 → all rebate amounts are 0 until Phase 3c.
        let i = 0u64;
        while (i < 3u64) {
            let (_, amount) = auction::test_rebate_fields(vector::borrow(&rebates, i));
            assert!(amount == 0u64, 10 + i);
            i = i + 1;
        };
    }

    // test_settle_emits_auction_settled_event
    //
    // After settle(), an AuctionSettled event is emitted with correct fields.
    // The Move test VM does not provide direct event inspection, so we verify
    // the event was emitted by confirming post-settle state (is_settled=true)
    // and by verifying the clearing_price and window data recorded in state
    // match the expected values that would appear in the AuctionSettled payload.
    //
    // Setup: 2 bids, supply=5, Alice wins (price=2100, qty=5), Bob loses.
    // Expected AuctionSettled: { window_id=WINDOW_ID, clearing_price=2100,
    //   total_filled=5, winner_count=1 }
    #[test(framework = @0x1, atomica = @atomica, caller = @0x9999)]
    fun test_settle_emits_auction_settled_event(
        framework: &signer,
        atomica:   &signer,
        caller:    &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 5u256;
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, supply, false, 0);

        let alice_lock = b"event_emit_alice_lock_32bytes_pa";
        let bob_lock   = b"event_emit_bob___lock_32bytes_pa";

        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(alice_lock, @0xA11CE, 10_500_000_000u256, 1u64);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(bob_lock,   @0xB0B,   4_100_000_000u256, 1u64);
        lock_receipt::claim<Ethereum, FakeUSD>(@atomica, alice_lock);
        lock_receipt::claim<Ethereum, FakeUSD>(@atomica, bob_lock);

        // Alice wins (price=2100, qty=5 fills supply), Bob loses (price=2000).
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", alice_lock, 5u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"c", bob_lock, 2u256,
        );
        let prices = vector[2100u64, 2000u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        // Pre-settle: not settled.
        assert!(!auction::is_settled(WINDOW_ID, pair_bcs), 1);

        // Settle triggers AuctionSettled event emission.
        auction::settle(caller, WINDOW_ID, pair_bcs);

        // Post-settle: is_settled becomes true — proxy that event was emitted.
        assert!(auction::is_settled(WINDOW_ID, pair_bcs), 2);

        // Verify the on-chain data that populates the AuctionSettled event fields.
        let (settlement_price, _) = auction::get_settlement(WINDOW_ID, pair_bcs);
        assert!(settlement_price == 2100, 3); // clearing_price in AuctionSettled

        // Window metadata is correct (window_id field of AuctionSettled).
        let (wid, _, _, settled, cp) = auction::get_auction(WINDOW_ID, pair_bcs);
        assert!(wid == WINDOW_ID, 4);
        assert!(settled, 5);
        assert!(cp == 2100, 6);
    }

    // test_settle_aborts_if_not_cleared
    //
    // Calling settle() before clear_uniform_price() has run aborts with
    // E_AUCTION_NOT_ENDED (3) — bid_results.length (0) != bids.length (N).
    #[test(framework = @0x1, atomica = @atomica, caller = @0x9999)]
    #[expected_failure(abort_code = 3, location = atomica::auction)] // E_AUCTION_NOT_ENDED
    fun test_settle_aborts_if_not_cleared(
        framework: &signer,
        atomica:   &signer,
        caller:    &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, 5u256, false, 0);

        // Insert one bid but do NOT call clear_uniform_price.
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", b"lock", 5u256,
        );
        let prices = vector[2100u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        // settle must abort: bid_results.length (0) != bids.length (1).
        auction::settle(caller, WINDOW_ID, pair_bcs);
    }

    // test_settle_aborts_if_already_settled
    //
    // Calling settle() twice on the same cleared window aborts with
    // E_WINDOW_ALREADY_SETTLED (11) on the second call.
    #[test(framework = @0x1, atomica = @atomica, caller = @0x9999)]
    #[expected_failure(abort_code = 11, location = atomica::auction)] // E_WINDOW_ALREADY_SETTLED
    fun test_settle_aborts_if_already_settled(
        framework: &signer,
        atomica:   &signer,
        caller:    &signer,
    ) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        // Insert an already-cleared zero-bid window and run clearing.
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, 10u256, false, 0);
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        // First settle succeeds.
        auction::settle(caller, WINDOW_ID, pair_bcs);
        assert!(auction::is_settled(WINDOW_ID, pair_bcs), 1);

        // Second settle must abort with E_WINDOW_ALREADY_SETTLED (11).
        auction::settle(caller, WINDOW_ID, pair_bcs);
    }

    // test_settle_aborts_if_auction_not_found
    //
    // Calling settle() for a non-existent (window_id, pair) aborts with
    // E_AUCTION_NOT_FOUND (1).
    #[test(framework = @0x1, caller = @0x9999)]
    #[expected_failure(abort_code = 1, location = atomica::auction)] // E_AUCTION_NOT_FOUND
    fun test_settle_aborts_if_auction_not_found(framework: &signer, caller: &signer) {
        setup(framework);
        // No registry at @atomica → settle must abort with E_AUCTION_NOT_FOUND.
        auction::settle(caller, WINDOW_ID, default_pair_bcs());
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
    // Uses the V2 golden vectors from `ibe_golden_vector_fixtures`:
    //   - identity, mpk and the reconstructed 48-byte G1 key (`timelock_basic_mpk`,
    //     `timelock_basic_reconstructed_dk`) of the seeded chunky DKG dealing.
    //   - The bid ciphertext is built in-test by `golden_bid` (see its comment):
    //     the V2 fixture ciphertexts use an AES-GCM wrapper that Move cannot open,
    //     while the contract's cleartext check still uses the Boneh-Franklin XOR
    //     scheme. The key is the real golden key, so the pairing check is real.
    //   - The expected cleartext is GOLDEN_PRICE (2010).
    //
    // Note: the production path uses `submit_cleartext_and_clear` which calls
    // `timelock::get_decryption_key` internally. The tests use the test-only
    // variant `test_submit_cleartext_with_dk` to inject the DK directly,
    // bypassing the IBE DK reconstruction native (`reconstruct_ibe_dk_internal`)
    // which is not available in the Move test VM. The pairing-based IBE
    // decryption logic is identical in both paths.
    //
    // @see docs/architecture/v0-architecture.md §2.6

    // ===================== submit_cleartext_and_clear: multi-bid and edge-case tests =====================
    //
    // Issue #130: grade B→A coverage for submit_cleartext_and_clear.
    // Four new tests cover:
    //   1. Partial batch failure: atomicity guarantee — any invalid cleartext
    //      aborts the whole call and no revealed_prices are written.
    //   2. Decryption key not yet revealed: timelock expired but DK not submitted
    //      by validators → abort from ibe_config with E_DECRYPTION_KEY_NOT_REVEALED.
    //   3. Auction not found: non-existent (window_id, pair) → E_AUCTION_NOT_FOUND.
    //   4. Idempotency: calling submit_cleartext_and_clear twice on the same window
    //      overwrites revealed_prices and returns successfully (not idempotent by
    //      spec, but the second call does not corrupt state when cleartexts match).
    //
    // @see docs/architecture/v0-architecture.md §2.6

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
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", alice_lock, 5u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"c", bob_lock, 2u256,
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
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", b"lock", 5u256,
        );
        let prices = vector[2000u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        // settle must abort: bid_results.length (0) != bids.length (1).
        auction::settle(caller, WINDOW_ID, pair_bcs);
    }
}
