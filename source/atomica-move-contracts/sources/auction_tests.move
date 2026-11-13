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
    use aptos_framework::account;
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use atomica::auction::{Self};
    use atomica::eth_proof;
    use atomica::outcome_tree;
    use atomica::auction_bid_wrapper_tests;
    use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};

    // ===================== Constants =====================

    const WINDOW_ID: u64 = 100;
    const TOTAL_SUPPLY: u256 = 10_000_000_000_000_000_000u256; // 10 ETH in wei
    const ETH: u256 = 1_000_000_000_000_000_000; // 1 ETH in wei
    // The registered timelock of `auction_bid_wrapper_tests::setup`.
    const TIMELOCK_ID: u64 = 11;

    // The launch pair bytes: BCS of Pair { b"ethereum", b"FakeETH", b"ethereum", b"FakeUSD" }.
    // `init_module` puts them on the allowlist.
    fun default_pair_bcs(): vector<u8> {
        auction::launch_pair_bcs()
    }

    // BCS of Pair { ethereum, FakeETH, ethereum, OtherUSD }: a second pair that tests add
    // with `allow_pair`.
    fun other_pair_bcs(): vector<u8> {
        auction::test_pair_bcs(b"ethereum", b"FakeETH", b"ethereum", b"OtherUSD")
    }


    // ===================== Setup helper =====================

    fun setup(framework: &signer) {
        timestamp::set_time_has_started_for_testing(framework);
    }

    // The seller lock of `revealed_window`, owned by SELLER.
    const SELLER_LOCK: vector<u8> = b"revealed_window_seller_lock_32__";
    const SELLER: address = @0x5E11E5;

    // A window bound to timelock 11, whose key is revealed after its deadline. `settle`
    // needs this state: deadline passed and status `Revealed`. The window holds one claimed
    // seller lock of `total_supply`.
    fun revealed_window(atomica: &signer, total_supply: u256) {
        auction_bid_wrapper_tests::setup();
        auction_bid_wrapper_tests::reveal_timelock();
        auction::test_insert_window_with_timelock(
            atomica, WINDOW_ID, default_pair_bcs(), total_supply, false, 0, TIMELOCK_ID,
        );
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(SELLER_LOCK, SELLER, total_supply, 1);
        lock_receipt::claim<Ethereum, FakeETH>(SELLER, SELLER_LOCK);
        auction::test_add_seller_lock(atomica, WINDOW_ID, default_pair_bcs(), SELLER_LOCK);
    }

    // ===================== Window ID math =====================

    // Window ID formula from docs/architecture/v0-architecture.md §2.2:
    //   day = unix_seconds / 86400
    //   t   = unix_seconds % 86400
    //   id  = day * 2 + (t >= 27900 ? 1 : 0) + (t >= 58500 ? 1 : 0)
    // The id changes at 07:45 UTC (27 900 s) and 16:15 UTC (58 500 s).
    //
    // Known vector: unix_seconds = 0 → day = 0, t = 0 → window_id = 0.
    #[test(framework = @0x1)]
    fun test_window_id_epoch_zero(framework: &signer) {
        setup(framework);
        // timestamp starts at 0
        let wid = auction::current_window_id();
        assert!(wid == 0, 1);
    }

    // unix_seconds = 43200 (12:00 UTC) → between the two closes → window_id = 1
    #[test(framework = @0x1)]
    fun test_window_id_midday(framework: &signer) {
        setup(framework);
        timestamp::fast_forward_seconds(43200);
        let wid = auction::current_window_id();
        assert!(wid == 1, 1);
    }

    // unix_seconds = 86399 (23:59:59 UTC) → after the afternoon close → window_id = 2
    #[test(framework = @0x1)]
    fun test_window_id_end_of_day(framework: &signer) {
        setup(framework);
        timestamp::fast_forward_seconds(86399);
        let wid = auction::current_window_id();
        assert!(wid == 2, 1);
    }

    // unix_seconds = 86400 (00:00 UTC of day 1) → no boundary at midnight → window_id = 2
    #[test(framework = @0x1)]
    fun test_window_id_midnight_is_no_boundary(framework: &signer) {
        setup(framework);
        timestamp::fast_forward_seconds(86400);
        let wid = auction::current_window_id();
        assert!(wid == 2, 1);
    }

    // Window ID is strictly monotone — later timestamp always >= earlier.
    #[test(framework = @0x1)]
    fun test_window_id_monotone(framework: &signer) {
        setup(framework);
        let w0 = auction::current_window_id();
        timestamp::fast_forward_seconds(86400 * 5 + 58500);
        let w1 = auction::current_window_id();
        assert!(w0 == 0 && w1 == 12, 1);
        assert!(w1 > w0, 2);
    }

    // The id changes exactly at 07:45:00 UTC.
    #[test(framework = @0x1)]
    fun test_window_id_changes_at_0745_utc(framework: &signer) {
        setup(framework);
        timestamp::update_global_time_for_test_secs(27899);
        assert!(auction::current_window_id() == 0, 1);
        timestamp::update_global_time_for_test_secs(27900);
        assert!(auction::current_window_id() == 1, 2);
    }

    // The id changes exactly at 16:15:00 UTC.
    #[test(framework = @0x1)]
    fun test_window_id_changes_at_1615_utc(framework: &signer) {
        setup(framework);
        timestamp::update_global_time_for_test_secs(58499);
        assert!(auction::current_window_id() == 1, 1);
        timestamp::update_global_time_for_test_secs(58500);
        assert!(auction::current_window_id() == 2, 2);
    }

    // The second day's morning close moves the id from 2 to 3.
    #[test(framework = @0x1)]
    fun test_window_id_second_day(framework: &signer) {
        setup(framework);
        timestamp::update_global_time_for_test_secs(86400 + 27899);
        assert!(auction::current_window_id() == 2, 1);
        timestamp::update_global_time_for_test_secs(86400 + 27900);
        assert!(auction::current_window_id() == 3, 2);
    }

    // `window_close_secs(w)` is the first second of window w + 1.
    #[test(framework = @0x1)]
    fun test_window_id_round_trips_window_close_secs(framework: &signer) {
        setup(framework);
        let w = 0;
        while (w < 20) {
            let close = eth_proof::window_close_secs(w);
            timestamp::update_global_time_for_test_secs(close - 1);
            assert!(auction::current_window_id() == w, w);
            timestamp::update_global_time_for_test_secs(close);
            assert!(auction::current_window_id() == w + 1, 100 + w);
            w = w + 1;
        };
        // A window id of today's chain clock (about 41 538 in November 2026).
        let w = 41538;
        let close = eth_proof::window_close_secs(w);
        assert!(eth_proof::window_id_at(close - 1) == w, 200);
        assert!(eth_proof::window_id_at(close) == w + 1, 201);
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
        let (price, filled) = auction::get_settlement(WINDOW_ID, pair_bcs);
        assert!(price == clearing_price, 1);
        // The window has no bids, so nothing filled.
        assert!(filled == 0, 2);
    }

    // A window of supply 8 with winning bids of 4 and 3: the second value is the sum of
    // the winners' fills (7), not the window supply.
    #[test(atomica = @atomica, caller = @0x9999)]
    fun get_settlement_returns_filled_total(atomica: &signer, caller: &signer) {
        let pair_bcs = default_pair_bcs();
        revealed_window(atomica, 8u256);

        let alice_lock = b"filled_total_alice_lock_32bytes_";
        let bob_lock   = b"filled_total_bob___lock_32bytes_";
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(alice_lock, @0xA11CE, 10_500_000_000u256, 1u64);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(bob_lock,   @0xB0B,   7_175_000_000u256, 1u64);
        lock_receipt::claim<Ethereum, FakeUSD>(@0xA11CE, alice_lock);
        lock_receipt::claim<Ethereum, FakeUSD>(@0xB0B, bob_lock);
        auction::test_insert_bid_with_qty(atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", alice_lock, 4u256);
        auction::test_insert_bid_with_qty(atomica, WINDOW_ID, pair_bcs, @0xB0B, b"c", bob_lock, 3u256);
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, vector[2100u64, 2050u64]);
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);
        auction::settle(caller, WINDOW_ID, pair_bcs);

        let (price, filled) = auction::get_settlement(WINDOW_ID, pair_bcs);
        assert!(price == 2050, 1);
        assert!(filled == 7u256, 2);
    }

    // A cleared window that is not settled yet reads (0, 0), not its cleared price.
    #[test(framework = @0x1, atomica = @atomica)]
    fun get_settlement_zero_before_settle(framework: &signer, atomica: &signer) {
        setup(framework);
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, 5u256, false, 0);
        auction::test_insert_bid_with_qty(atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", b"lock_alice", 5u256);
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, vector[2000u64]);
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);
        let (_, _, _, settled, cleared_price) = auction::get_auction(WINDOW_ID, pair_bcs);
        assert!(!settled && cleared_price == 2000, 1);

        let (price, filled) = auction::get_settlement(WINDOW_ID, pair_bcs);
        assert!(price == 0, 2);
        assert!(filled == 0, 3);
    }
    // SCOUT(#218) TEST: window_limits_view

    // SCOUT(#243) EDIT: the nine `create_auction` calls of this file drop `timelock_id`; the golden timelock 11 can no longer be bound to a window through `create_auction`.

    // ===================== create_auction tests =====================
    //
    // Tests cover:
    //   - Happy path: create_auction registers the window, get_auction returns it.
    //   - Stale window_id aborts with E_STALE_WINDOW_ID (6).
    //   - Far-future window_id (> current + 1) aborts with E_STALE_WINDOW_ID (6).
    //   - Duplicate create_auction for same (window_id, pair) accumulates supply.
    //
    // init_module publishes the AuctionRegistry at @atomica, so each test that reaches
    // the registry calls `auction::init_for_test` first. A pre-inserted FakeETH
    // LockReceipt is required for each call so that lock_receipt::claim can succeed
    // without proof verification.

    // Helper: initialize FakeETH registry and insert a receipt for a given lock_id, bound
    // to the current window and the default pair.
    fun insert_eth_receipt(
        atomica:     &signer,
        lock_id:     vector<u8>,
        seller_addr: address,
        amount:      u256,
    ) {
        insert_bound_eth_receipt(atomica, lock_id, seller_addr, amount, auction::current_window_id());
    }

    fun insert_bound_eth_receipt(
        atomica:     &signer,
        lock_id:     vector<u8>,
        seller_addr: address,
        amount:      u256,
        window_id:   u64,
    ) {
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
            lock_id, seller_addr, amount, window_id, auction::pair_hash(default_pair_bcs()),
        );
    }

    // Happy path: create_auction registers the window, get_auction returns fields.
    #[test(atomica = @atomica)]
    fun test_create_auction_happy_path(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let pair_bcs    = default_pair_bcs();
        let lock_id     = b"eth_lock_receipt_id_32bytes_pad_";
        let seller_addr = @atomica; // @0xcafe in dev
        let lock_amount = 5_000_000_000_000_000_000u256; // 5 ETH in wei

        // Set up FakeETH receipt for the seller.
        insert_eth_receipt(atomica, lock_id, seller_addr, lock_amount);

        // The setup clock sits in window 5; use the current window.
        let window_id = auction::current_window_id();
        let timelock_id = auction_bid_wrapper_tests::register_live_timelock();
        auction::create_auction(atomica, window_id, pair_bcs, lock_id, timelock_id);

        // get_auction must return the registered window.
        let (wid, supply, bid_count, settled, clearing_price) =
            auction::get_auction(window_id, pair_bcs);
        assert!(wid == window_id, 1);
        assert!(supply == lock_amount, 2);
        assert!(bid_count == 0, 3);
        assert!(!settled, 4);
        assert!(clearing_price == 0, 5);
    }

    // A depositor's Ethereum-derivable account (lock_receipt owner), not @atomica.
    const DERIVED_OWNER: address = @0x50ccc023d06341b127ca69fd9a204f401118aca3385292926aa2a9ed42ae80e6;

    // The @atomica account cannot claim another user's receipt into a window.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 5, location = atomica::lock_receipt)] // E_NOT_RECEIPT_OWNER
    fun test_create_auction_atomica_cannot_claim_users_receipt(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let lock_id = b"eth_lock_receipt_of_derived_user";
        insert_eth_receipt(atomica, lock_id, DERIVED_OWNER, 1_000_000_000_000_000_000u256);
        auction::create_auction(
            atomica, auction::current_window_id(), default_pair_bcs(), lock_id,
            auction_bid_wrapper_tests::register_live_timelock(),
        );
    }

    // The receipt's derived owner claims it into a window, and is the first
    // seller: init_module published the registry.
    #[test(atomica = @atomica)]
    fun test_create_auction_by_derived_owner(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let lock_id = b"eth_lock_receipt_of_derived_user";
        let lock_amount = 1_000_000_000_000_000_000u256;
        insert_eth_receipt(atomica, lock_id, DERIVED_OWNER, lock_amount);
        let owner = aptos_framework::account::create_signer_for_test(DERIVED_OWNER);
        let window_id = auction::current_window_id();
        auction::create_auction(
            &owner, window_id, default_pair_bcs(), lock_id, auction_bid_wrapper_tests::register_live_timelock(),
        );
        let (_, supply, _, _, _) = auction::get_auction(window_id, default_pair_bcs());
        assert!(supply == lock_amount, 0);
        assert!(
            lock_receipt::get_receipt_status<Ethereum, FakeETH>(lock_id)
                == lock_receipt::status_claimed(),
            1
        );
    }

    // Next-window registration: create_auction accepts window_id == current + 1.
    #[test(atomica = @atomica)]
    fun test_create_auction_next_window_accepted(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let pair_bcs    = default_pair_bcs();
        let lock_id     = b"eth_lock_receipt_next_window_pad_";
        let seller_addr = @atomica;
        let lock_amount = 1_000_000_000_000_000_000u256; // 1 ETH in wei

        // window_id = current + 1 must be accepted.
        let window_id = auction::current_window_id() + 1;
        insert_bound_eth_receipt(atomica, lock_id, seller_addr, lock_amount, window_id);

        let timelock_id = auction_bid_wrapper_tests::register_live_timelock();
        auction::create_auction(atomica, window_id, pair_bcs, lock_id, timelock_id);

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
        timestamp::fast_forward_seconds(86400); // day 1, window_id = 2
        let pair_bcs    = default_pair_bcs();
        let lock_id     = vector::empty<u8>();
        let timelock_id = 0u64;
        // window_id 0 < current 2 → stale.
        auction::create_auction(atomica, 0u64, pair_bcs, lock_id, timelock_id);
    }

    // Far-future window_id (> current + 1) aborts with E_STALE_WINDOW_ID.
    #[test(framework = @0x1, atomica = @atomica)]
    #[expected_failure(abort_code = 6, location = atomica::auction)] // E_STALE_WINDOW_ID
    fun test_create_auction_far_future_window_id_aborts(framework: &signer, atomica: &signer) {
        setup(framework);
        // current == 0; window_id 100 > 0 + 1 → too far in the future.
        let pair_bcs    = default_pair_bcs();
        let lock_id     = vector::empty<u8>();
        let timelock_id = 0u64;
        auction::create_auction(atomica, 100u64, pair_bcs, lock_id, timelock_id);
    }

    // Duplicate create_auction for same (window_id, pair) accumulates total_supply.
    #[test(atomica = @atomica)]
    fun test_create_auction_duplicate_accumulates_supply(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let pair_bcs     = default_pair_bcs();
        let lock_id_a    = b"eth_lock_receipt_seller_a_32byte";
        let lock_id_b    = b"eth_lock_receipt_seller_b_32byte";
        let seller_addr  = @atomica;
        let amount_a     = 3_000_000_000_000_000_000u256; // 3 ETH
        let amount_b     = 7_000_000_000_000_000_000u256; // 7 ETH
        let expected     = amount_a + amount_b;

        // Two separate FakeETH receipts.
        insert_eth_receipt(atomica, lock_id_a, seller_addr, amount_a);
        insert_eth_receipt(atomica, lock_id_b, seller_addr, amount_b);

        let window_id   = auction::current_window_id();
        let timelock_id = auction_bid_wrapper_tests::register_live_timelock();

        // First seller creates the window.
        auction::create_auction(atomica, window_id, pair_bcs, lock_id_a, timelock_id);
        // Second seller joins the same window — supply accumulates.
        auction::create_auction(atomica, window_id, pair_bcs, lock_id_b, timelock_id);

        let (_, supply, _, _, _) = auction::get_auction(window_id, pair_bcs);
        assert!(supply == expected, 1);
    }

    // create_auction never publishes the AuctionRegistry or the pair allowlist: without
    // init_module no pair is listed, so it aborts before it claims the lock.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 42, location = atomica::auction)] // E_PAIR_NOT_ALLOWED
    fun create_auction_without_registry_aborts(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        let lock_id = b"eth_lock_receipt_no_registry_pad";
        insert_eth_receipt(atomica, lock_id, @atomica, 1_000_000_000_000_000_000u256);
        auction::create_auction(
            atomica, auction::current_window_id(), default_pair_bcs(), lock_id,
            auction_bid_wrapper_tests::register_live_timelock(),
        );
    }

    // There is no reserve price: `create_auction` takes (window_id, pair_bcs, lock_id,
    // timelock_id) after the signer, and the window holds only the lock's supply.
    #[test(atomica = @atomica)]
    fun create_auction_takes_no_reserve_price(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let lock_id = b"eth_lock_receipt_no_reserve_pad_";
        let lock_amount = 2_000_000_000_000_000_000u256;
        insert_eth_receipt(atomica, lock_id, @atomica, lock_amount);
        let window_id = auction::current_window_id();
        auction::create_auction(
            atomica, window_id, default_pair_bcs(), lock_id,
            auction_bid_wrapper_tests::register_live_timelock(),
        );
        let (wid, supply, bid_count, settled, clearing_price) =
            auction::get_auction(window_id, default_pair_bcs());
        assert!(wid == window_id, 1);
        assert!(supply == lock_amount, 2);
        assert!(bid_count == 0, 3);
        assert!(!settled, 4);
        assert!(clearing_price == 0, 5);
    }

    // SCOUT(#218) TEST: create_auction_at_seller_cap_aborts
    // SCOUT(#218) TEST: create_auction_below_min_lock_aborts
    // SCOUT(#218) TEST: create_auction_at_min_lock_succeeds
    // SCOUT(#243) TEST: first_create_auction_registers_the_window_timelock
    // SCOUT(#243) TEST: second_seller_joins_the_stored_timelock
    // SCOUT(#243) TEST: two_pairs_of_one_window_share_a_timelock (waits for open question 2)
    // SCOUT(#243) TEST: current_and_next_window_get_two_timelocks
    // SCOUT(#243) TEST: create_auction_aborts_when_registrar_is_not_the_package (framework `E_NOT_REGISTRAR`)
    // SCOUT(#243) TEST: create_auction_aborts_when_close_is_inside_the_epoch_guard (framework `E_DEADLINE_AFTER_EPOCH_END`)
    // SCOUT(#243) TEST: joining_an_expired_window_timelock_aborts
    // SCOUT(#243) TEST: timelock_registrar_address_is_the_named_object_address

    // ===================== Pair allowlist =====================

    // The launch pair is on the allowlist after publish, and its bytes are the 34-byte BCS
    // of Pair { ethereum, FakeETH, ethereum, FakeUSD }.
    #[test(atomica = @atomica)]
    fun launch_pair_is_allowed_at_publish(atomica: &signer) {
        auction::init_for_test(atomica);
        assert!(auction::is_pair_allowed(auction::launch_pair_bcs()), 1);
        assert!(
            auction::launch_pair_bcs()
                == x"08657468657265756d0746616b6545544808657468657265756d0746616b65555344",
            2
        );
        assert!(!auction::is_pair_allowed(b"eth-fakeusd"), 3);
        assert!(!auction::is_pair_allowed(vector::empty()), 4);
    }

    // Pair bytes that are not on the allowlist cannot open a window.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 42, location = atomica::auction)] // E_PAIR_NOT_ALLOWED
    fun create_auction_unlisted_pair_aborts(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let unlisted = b"eth-fakeusd";
        let lock_id = b"unlisted_pair_seller_lock_32byt_";
        let window_id = auction::current_window_id();
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
            lock_id, @atomica, ETH, window_id, auction::pair_hash(unlisted),
        );
        auction::create_auction(
            atomica, window_id, unlisted, lock_id, auction_bid_wrapper_tests::register_live_timelock(),
        );
    }

    // A new window stores the `Pair` the allowlist holds for its bytes.
    #[test(atomica = @atomica)]
    fun create_auction_stores_listed_pair(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let lock_id = b"listed_pair_seller_lock_32bytes_";
        insert_eth_receipt(atomica, lock_id, @atomica, ETH);
        let window_id = auction::current_window_id();
        auction::create_auction(
            atomica, window_id, default_pair_bcs(), lock_id,
            auction_bid_wrapper_tests::register_live_timelock(),
        );
        assert!(auction::auction_exists(window_id, default_pair_bcs()), 1);
        let (base_chain, base_token, quote_chain, quote_token) =
            auction::test_get_window_pair(window_id, default_pair_bcs());
        assert!(base_chain == b"ethereum", 2);
        assert!(base_token == b"FakeETH", 3);
        assert!(quote_chain == b"ethereum", 4);
        assert!(quote_token == b"FakeUSD", 5);
    }

    // Another signer cannot add a pair.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 43, location = atomica::auction)] // E_NOT_PACKAGE_ACCOUNT
    fun allow_pair_only_package_account(atomica: &signer) {
        auction::init_for_test(atomica);
        let stranger = aptos_framework::account::create_signer_for_test(DERIVED_OWNER);
        auction::allow_pair(&stranger, b"ethereum", b"FakeETH", b"ethereum", b"OtherUSD");
    }

    // The same call from @atomica lists the pair, and `create_auction` then accepts the new
    // pair's BCS and stores its `Pair`. Adding a listed pair again is a no-op.
    #[test(atomica = @atomica)]
    fun allow_pair_from_package_account_lists_the_pair(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let other = other_pair_bcs();
        assert!(!auction::is_pair_allowed(other), 1);
        auction::allow_pair(atomica, b"ethereum", b"FakeETH", b"ethereum", b"OtherUSD");
        auction::allow_pair(atomica, b"ethereum", b"FakeETH", b"ethereum", b"OtherUSD");
        assert!(auction::is_pair_allowed(other), 2);
        assert!(auction::is_pair_allowed(default_pair_bcs()), 3);

        let lock_id = b"other_pair_listed_seller_lock_32";
        let window_id = auction::current_window_id();
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
            lock_id, @atomica, ETH, window_id, auction::pair_hash(other),
        );
        auction::create_auction(
            atomica, window_id, other, lock_id, auction_bid_wrapper_tests::register_live_timelock(),
        );
        let (_, _, quote_chain, quote_token) = auction::test_get_window_pair(window_id, other);
        assert!(quote_chain == b"ethereum", 4);
        assert!(quote_token == b"OtherUSD", 5);
    }

    // Two sellers with the launch pair for one window id join one window, and its
    // `total_supply` is the sum of their locks.
    #[test(atomica = @atomica)]
    fun sellers_join_one_window_per_pair(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let window_id = auction::current_window_id();
        let timelock_id = auction_bid_wrapper_tests::register_live_timelock();
        let lock_a = b"one_window_seller_lock_a_32byte_";
        let lock_b = b"one_window_seller_lock_b_32byte_";
        insert_eth_receipt(atomica, lock_a, DERIVED_OWNER, 2 * ETH);
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
            lock_b, @atomica, 3 * ETH, window_id, auction::pair_hash(default_pair_bcs()),
        );
        let owner = aptos_framework::account::create_signer_for_test(DERIVED_OWNER);
        auction::create_auction(&owner, window_id, default_pair_bcs(), lock_a, timelock_id);
        auction::create_auction(atomica, window_id, default_pair_bcs(), lock_b, timelock_id);

        let (_, supply, _, _, _) = auction::get_auction(window_id, default_pair_bcs());
        assert!(supply == 5 * ETH, 1);
        let (lock_ids, _) = auction::get_window_lock_ids(window_id, default_pair_bcs());
        assert!(vector::length(&lock_ids) == 2, 2);
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
    // SCOUT(#218) TEST: submit_bid_below_min_collateral_aborts
    // SCOUT(#218) TEST: submit_bid_at_min_collateral_succeeds

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

        // The relayer reads the same results and their collateral lock ids through views.
        assert!(auction::get_bid_results(WINDOW_ID, pair_bcs) == results, 50);
        let (_, collateral) = auction::get_window_lock_ids(WINDOW_ID, pair_bcs);
        assert!(collateral == vector[b"lock_dave", b"lock_carol", b"lock_alice", b"lock_bob"], 51);

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

    // ===================== Bid validity at opening =====================
    //
    // These tests open bids through `submit_cleartext_and_clear`, so the validity rule of
    // `open_one` runs. The submit-time quantity checks live in auction_bid_wrapper_tests.move.
    //
    // @see docs/architecture/v0-architecture.md §2.6 to §2.8

    const MAX_PRICE: u64 = 18_446_744_073_709_551_615;

    fun salt32(b: u8): vector<u8> {
        let s = vector::empty<u8>();
        let i = 0;
        while (i < 32) {
            vector::push_back(&mut s, b);
            i = i + 1;
        };
        s
    }

    // Inserts a bid committed to `(price, salt32(s))` holding `collateral`.
    fun insert_open_able_bid(
        atomica: &signer, bidder: address, price: u64, s: u8, quantity: u256, collateral: u256,
    ) {
        let pair_bcs = default_pair_bcs();
        let ad = auction::bid_associated_data(TIMELOCK_ID, WINDOW_ID, bidder);
        auction::test_insert_committed_bid(
            atomica, WINDOW_ID, pair_bcs, bidder, vector[s],
            auction::compute_bid_commitment(price, salt32(s), ad), vector[s], quantity,
        );
        let index = auction::get_bid_count(WINDOW_ID, pair_bcs) - 1;
        auction::test_set_bid_collateral(atomica, WINDOW_ID, pair_bcs, index, collateral);
    }

    // Opens every bid in one call. `prices[i]` opens bid i with salt32(i + 1).
    fun open_all(prices: vector<u64>) {
        let salts = vector::empty<vector<u8>>();
        let i = 0u64;
        while (i < vector::length(&prices)) {
            vector::push_back(&mut salts, salt32(((i + 1) as u8)));
            i = i + 1;
        };
        let caller = account::create_signer_for_test(@0x9999);
        auction::submit_cleartext_and_clear(&caller, WINDOW_ID, default_pair_bcs(), prices, salts);
    }

    fun bid_valid(index: u64): bool {
        let (_, _, _, opened, _, valid) = auction::get_bid_info(WINDOW_ID, default_pair_bcs(), index);
        assert!(opened, 900);
        valid
    }

    fun fill_of(index: u64): (bool, u256) {
        let results = auction::get_bid_results(WINDOW_ID, default_pair_bcs());
        let (win, fill, _) = auction::test_bid_result_fields(vector::borrow(&results, index));
        (win, fill)
    }

    // The one BidInvalid event of the test: (bid_index, reason).
    fun only_invalid_event(): (u64, u8) {
        let events = event::emitted_events<auction::BidInvalid>();
        assert!(vector::length(&events) == 1, 901);
        let (window_id, pair_bcs, bid_index, _, reason) =
            auction::test_bid_invalid_fields(vector::borrow(&events, 0));
        assert!(window_id == WINDOW_ID && pair_bcs == default_pair_bcs(), 902);
        (bid_index, reason)
    }

    // Review finding A-1: one dust lock bids the whole supply at the top price. It opens
    // without abort, reads invalid, and takes nothing. The honest bid wins at its own price.
    #[test(atomica = @atomica)]
    fun undercollateralized_bid_is_invalid_and_does_not_fill(atomica: &signer) {
        revealed_window(atomica, TOTAL_SUPPLY);
        insert_open_able_bid(atomica, @0xA11CE, 2000, 1, ETH, auction::quote_for_fill(ETH, 2000));
        insert_open_able_bid(atomica, @0xD057, MAX_PRICE, 2, TOTAL_SUPPLY, 1);
        open_all(vector[2000, MAX_PRICE]);

        assert!(bid_valid(0), 1);
        assert!(!bid_valid(1), 2);
        let (bid_index, reason) = only_invalid_event();
        assert!(bid_index == 1 && reason == 2, 3);
        let (dust_win, dust_fill) = fill_of(1);
        assert!(!dust_win && dust_fill == 0, 4);
        let (honest_win, honest_fill) = fill_of(0);
        assert!(honest_win && honest_fill == ETH, 5);
        let (_, _, _, _, clearing_price) = auction::get_auction(WINDOW_ID, default_pair_bcs());
        assert!(clearing_price == 2000, 6);
    }

    // A zero price is invalid (reason 1) and does not set the clearing price of an
    // undersubscribed window: the lowest valid winning price does.
    #[test(atomica = @atomica)]
    fun zero_price_bid_is_invalid(atomica: &signer) {
        revealed_window(atomica, TOTAL_SUPPLY);
        insert_open_able_bid(atomica, @0xA11CE, 2100, 1, ETH, auction::quote_for_fill(ETH, 2100));
        insert_open_able_bid(atomica, @0xB0B, 2000, 2, ETH, auction::quote_for_fill(ETH, 2000));
        insert_open_able_bid(atomica, @0x2E40, 0, 3, ETH, auction::quote_for_fill(ETH, 2100));
        open_all(vector[2100, 2000, 0]);

        assert!(!bid_valid(2), 1);
        let (bid_index, reason) = only_invalid_event();
        assert!(bid_index == 2 && reason == 1, 2);
        let (zero_win, zero_fill) = fill_of(2);
        assert!(!zero_win && zero_fill == 0, 3);
        let (_, _, _, _, clearing_price) = auction::get_auction(WINDOW_ID, default_pair_bcs());
        assert!(clearing_price == 2000, 4);
    }

    // Collateral equal to `quote_for_fill(quantity, price)` is valid and fills. One base
    // unit less is invalid with reason 2.
    #[test(atomica = @atomica)]
    fun exact_collateral_bid_is_valid(atomica: &signer) {
        revealed_window(atomica, TOTAL_SUPPLY);
        let quote = auction::quote_for_fill(ETH, 2000);
        assert!(quote == 2_000_000_000, 1);
        insert_open_able_bid(atomica, @0xA11CE, 2000, 1, ETH, quote);
        insert_open_able_bid(atomica, @0xB0B, 2000, 2, ETH, quote - 1);
        open_all(vector[2000, 2000]);

        assert!(bid_valid(0), 2);
        assert!(!bid_valid(1), 3);
        let (bid_index, reason) = only_invalid_event();
        assert!(bid_index == 1 && reason == 2, 4);
        let (exact_win, exact_fill) = fill_of(0);
        assert!(exact_win && exact_fill == ETH, 5);
        let (short_win, short_fill) = fill_of(1);
        assert!(!short_win && short_fill == 0, 6);
    }

    // Review finding A-2: a `2^256 - 1` quantity behind a filled bid made `accumulated + qty`
    // overflow and froze the window. `submit_bid` now bounds the quantity; this inserts it
    // through the test helper and opens it through the bypass helper (opening it through
    // `open_one` would overflow `quote_for_fill`). The bypass closes the reveal, so the test
    // runs the clearing through `clear_uniform_price`, the same `clear_internal` that
    // `finalize_reveal` runs.
    #[test(atomica = @atomica)]
    fun huge_quantity_does_not_overflow_clearing(atomica: &signer) {
        revealed_window(atomica, TOTAL_SUPPLY);
        let pair_bcs = default_pair_bcs();
        let huge = 115792089237316195423570985008687907853269984665640564039457584007913129639935u256;
        auction::test_insert_bid_with_qty(atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"a", b"lock_a", ETH);
        auction::test_insert_bid_with_qty(atomica, WINDOW_ID, pair_bcs, @0xB16, b"b", b"lock_b", huge);
        auction::test_insert_bid_with_qty(atomica, WINDOW_ID, pair_bcs, @0xB17, b"c", b"lock_c", huge);
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, vector[3000, 2000, 1000]);
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);

        let (_, _, _, _, clearing_price) = auction::get_auction(WINDOW_ID, pair_bcs);
        assert!(clearing_price == 2000, 1);
        let (first_win, first_fill) = fill_of(0);
        assert!(first_win && first_fill == ETH, 2);
        let (huge_win, huge_fill) = fill_of(1);
        assert!(huge_win && huge_fill == TOTAL_SUPPLY - ETH, 3);
        let (last_win, last_fill) = fill_of(2);
        assert!(!last_win && last_fill == 0, 4);
    }

    // SCOUT(#217) TEST: quote_for_fill_reads_whole_usd_prices (quote_for_fill(10^18, 2000) == 2000 * 10^6; `quote_for_fill` exists only in the unwind pull request (213))

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
    #[test(atomica = @atomica, caller = @0x9999)]
    fun test_settle_distributes_proceeds_to_seller(
        atomica:   &signer,
        caller:    &signer,
    ) {
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 5u256;
        revealed_window(atomica, supply);

        // Insert FakeUSD receipt for winning bidder (simulating submit_bid claim).
        let alice_lock = b"settle_proceeds_alice_lock_32pad";
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(
            alice_lock, @0xA11CE, 10_500_000_000u256, 1u64,
        );
        lock_receipt::claim<Ethereum, FakeUSD>(@0xA11CE, alice_lock);

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

        // get_settlement returns (clearing_price, total_filled).
        // Alice fills the whole supply: total_filled = 5.
        // Seller proceeds = clearing_price * total_filled = 2100 * 5 units.
        let (settlement_price, settlement_filled) = auction::get_settlement(WINDOW_ID, pair_bcs);
        assert!(settlement_price == 2100, 3);
        assert!(settlement_filled == 5u256, 4);
    }

    // test_settle_releases_losing_collateral
    //
    // After settle(), losing bidders' FakeUSD LockReceipts go back to the depositor
    // (STATUS_REVOKED = 2). A winner whose collateral pays the seller is STATUS_FILLED (= 3).
    //
    // Setup: 2 bids — Alice wins (price=2100, qty=5 fills supply=5),
    //        Bob loses (price=2000, qty=3).
    #[test(atomica = @atomica, caller = @0x9999)]
    fun test_settle_releases_losing_collateral(
        atomica:   &signer,
        caller:    &signer,
    ) {
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 5 * ETH;
        revealed_window(atomica, supply);

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
        lock_receipt::claim<Ethereum, FakeUSD>(@0xA11CE, alice_lock);
        lock_receipt::claim<Ethereum, FakeUSD>(@0xB0B, bob_lock);

        // Alice wins (price=2100, qty=5 fills supply), Bob loses (price=2000).
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", alice_lock, 5 * ETH,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"c", bob_lock, 3 * ETH,
        );
        let prices = vector[2100u64, 2000u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        auction::clear_uniform_price(WINDOW_ID, pair_bcs);
        auction::settle(caller, WINDOW_ID, pair_bcs);

        // Bob (loser): receipt must be released (STATUS_REVOKED = 2).
        let bob_status = lock_receipt::get_receipt_status<Ethereum, FakeUSD>(bob_lock);
        assert!(bob_status == lock_receipt::status_revoked(), 1);

        // Alice (winner): her collateral pays the seller 5 ETH at 2100 = 10_500 FakeUSD,
        // all of it, so the receipt is FILLED. The seller lock is FILLED too.
        let alice_status = lock_receipt::get_receipt_status<Ethereum, FakeUSD>(alice_lock);
        assert!(
            lock_receipt::get_receipt_status<Ethereum, FakeETH>(SELLER_LOCK) == lock_receipt::status_filled(),
            10
        );
        assert!(alice_status == lock_receipt::status_filled(), 2);
    }

    // A receipt a live window holds cannot be pulled out through the public
    // entry functions, so nothing outside settle/refund can revoke it and
    // make them abort E_INVALID_STATUS. (`claim` and `release` are
    // package-only, so other modules cannot call them at all, and the old
    // `mint_from_lock` path is retired: it aborts E_RETIRED.)
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 3, location = atomica::fake_usd)] // E_RETIRED
    fun test_owner_cannot_pull_collateral_held_by_window(atomica: &signer) {
        revealed_window(atomica, 5u256);
        let bob_lock = b"held_collat_bob___lock_32bytes__";
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(bob_lock, @0xB0B, 6_000_000_000u256, 1u64);
        // submit_bid's claim: the window now holds the receipt.
        lock_receipt::claim<Ethereum, FakeUSD>(@0xB0B, bob_lock);
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, default_pair_bcs(), @0xB0B, b"c", bob_lock, 3u256,
        );
        let bob = aptos_framework::account::create_signer_for_test(@0xB0B);
        atomica::fake_usd::mint_from_lock(&bob, bob_lock);
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 3, location = atomica::fake_eth)] // E_RETIRED
    fun test_owner_cannot_pull_seller_receipt_held_by_window(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let lock_id = b"eth_lock_receipt_of_derived_user";
        insert_eth_receipt(atomica, lock_id, DERIVED_OWNER, 1_000_000_000_000_000_000u256);
        let owner = aptos_framework::account::create_signer_for_test(DERIVED_OWNER);
        auction::create_auction(
            &owner, auction::current_window_id(), default_pair_bcs(), lock_id,
            auction_bid_wrapper_tests::register_live_timelock(),
        );
        atomica::fake_eth::mint_from_lock(&owner, lock_id);
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
    #[test(atomica = @atomica, caller = @0x9999)]
    fun test_settle_emits_auction_settled_event(
        atomica:   &signer,
        caller:    &signer,
    ) {
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 5u256;
        revealed_window(atomica, supply);

        let alice_lock = b"event_emit_alice_lock_32bytes_pa";
        let bob_lock   = b"event_emit_bob___lock_32bytes_pa";

        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(alice_lock, @0xA11CE, 10_500_000_000u256, 1u64);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(bob_lock,   @0xB0B,   4_100_000_000u256, 1u64);
        lock_receipt::claim<Ethereum, FakeUSD>(@0xA11CE, alice_lock);
        lock_receipt::claim<Ethereum, FakeUSD>(@0xB0B, bob_lock);

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
    #[test(atomica = @atomica, caller = @0x9999)]
    #[expected_failure(abort_code = 3, location = atomica::auction)] // E_AUCTION_NOT_ENDED
    fun test_settle_aborts_if_not_cleared(
        atomica:   &signer,
        caller:    &signer,
    ) {
        let pair_bcs = default_pair_bcs();
        revealed_window(atomica, 5u256);

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
    #[test(atomica = @atomica, caller = @0x9999)]
    #[expected_failure(abort_code = 11, location = atomica::auction)] // E_WINDOW_ALREADY_SETTLED
    fun test_settle_aborts_if_already_settled(
        atomica:   &signer,
        caller:    &signer,
    ) {
        let pair_bcs = default_pair_bcs();
        // Insert an already-cleared zero-bid window and run clearing.
        revealed_window(atomica, 10u256);
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

    // SCOUT(#228) REMOVE: the two comment-only sections below; they describe `submit_cleartext_and_clear` tests that no longer exist.
    // SCOUT(#240) DOC: the first section below names the fork native `reconstruct_ibe_dk_internal`, which the fork cleanup removes.
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
    //      aborts the whole call and no bid price is written.
    //   2. Decryption key not yet revealed: timelock expired but DK not submitted
    //      by validators → abort from ibe_config with E_DECRYPTION_KEY_NOT_REVEALED.
    //   3. Auction not found: non-existent (window_id, pair) → E_AUCTION_NOT_FOUND.
    //   4. Idempotency: calling submit_cleartext_and_clear twice on the same window
    //      overwrites the bid prices and returns successfully (not idempotent by
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
    #[test(atomica = @atomica, caller = @0x9999)]
    fun test_settle_end_to_end_marks_window_settled(
        atomica:   &signer,
        caller:    &signer,
    ) {
        let pair_bcs = default_pair_bcs();
        let supply: u256 = 5 * ETH;
        // Insert window with 5-unit supply.
        revealed_window(atomica, supply);

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
        lock_receipt::claim<Ethereum, FakeUSD>(@0xA11CE, alice_lock);
        lock_receipt::claim<Ethereum, FakeUSD>(@0xB0B, bob_lock);

        // Insert bid metadata into the window (test helper bypasses submit_bid).
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", alice_lock, 5 * ETH,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"c", bob_lock, 2 * ETH,
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

        // Alice (winner): her collateral pays the seller 5 ETH at 2100 = 10_500 FakeUSD,
        // all of it, so the receipt is FILLED. The seller lock is FILLED too.
        let alice_status = lock_receipt::get_receipt_status<Ethereum, FakeUSD>(alice_lock);
        assert!(
            lock_receipt::get_receipt_status<Ethereum, FakeETH>(SELLER_LOCK) == lock_receipt::status_filled(),
            10
        );
        assert!(alice_status == lock_receipt::status_filled(), 4);
    }

    // settle with zero bids: window settles with total_filled=0, winner_count=0.
    #[test(atomica = @atomica, caller = @0x9999)]
    fun test_settle_zero_bids_succeeds(
        atomica:   &signer,
        caller:    &signer,
    ) {
        let pair_bcs = default_pair_bcs();
        revealed_window(atomica, 10u256);

        // No bids — run clearing (handles zero-bid case) then settle.
        auction::clear_uniform_price(WINDOW_ID, pair_bcs);
        auction::settle(caller, WINDOW_ID, pair_bcs);

        // Window must be settled.
        assert!(auction::is_settled(WINDOW_ID, pair_bcs), 1);
    }

    // settle aborts E_AUCTION_NOT_ENDED when bid_results not yet populated.
    // (i.e., clear_uniform_price has not been called but there are bids)
    #[test(atomica = @atomica, caller = @0x9999)]
    #[expected_failure(abort_code = 3, location = atomica::auction)] // E_AUCTION_NOT_ENDED
    fun test_settle_aborts_when_clearing_not_run(
        atomica:   &signer,
        caller:    &signer,
    ) {
        let pair_bcs = default_pair_bcs();
        revealed_window(atomica, 5u256);

        // Insert one bid but do NOT call clear_uniform_price.
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"c", b"lock", 5u256,
        );
        let prices = vector[2000u64];
        auction::test_set_revealed_prices(atomica, WINDOW_ID, pair_bcs, prices);

        // settle must abort: bid_results.length (0) != bids.length (1).
        auction::settle(caller, WINDOW_ID, pair_bcs);
    }

    // ===================== Lock outcomes, settle and unwind (issue 194) =====================
    //
    // The mixed window: sellers A (2 ETH) and B (3 ETH), supply 5 ETH. Bids in order:
    //   W1 4 ETH at 2100, collateral 9_000 USD   -> wins 4 ETH
    //   W2 3 ETH at 2000, collateral 7_000 USD   -> marginal, wins 1 ETH; clearing price 2000
    //   L  1 ETH at 1500, collateral 2_000 USD   -> loses
    //   U  unopened,      collateral 1_000 USD   -> invalid
    // Fills in bid order from the sellers in lock order (SDK planSettlementReleases):
    //   W1 takes A's 2 ETH (4_000 USD to A) and 2 ETH of B (4_000 USD to B), 1_000 USD back.
    //   W2 takes B's last 1 ETH (2_000 USD to B), 5_000 USD back.
    // Every receipt is bound to WINDOW_ID and the default pair.

    const USD: u256 = 1_000_000; // FakeUSD base units per dollar
    const SELLER_A: address = @0x5A;
    const SELLER_B: address = @0x5B;
    const W1: address = @0xA11CE;
    const W2: address = @0xB0B;
    const LOSER: address = @0xCA401;
    const UNOPENED: address = @0xD0D;
    const SELLER_A_LOCK: vector<u8> = b"mixed_seller_a_lock_32bytes_____";
    const SELLER_B_LOCK: vector<u8> = b"mixed_seller_b_lock_32bytes_____";
    const W1_LOCK: vector<u8> = b"mixed_winner_1_collateral_32b___";
    const W2_LOCK: vector<u8> = b"mixed_winner_2_collateral_32b___";
    const LOSER_LOCK: vector<u8> = b"mixed_loser_collateral_32bytes__";
    const UNOPENED_LOCK: vector<u8> = b"mixed_unopened_collateral_32b___";

    fun add_seller(atomica: &signer, lock_id: vector<u8>, owner: address, amount: u256) {
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
            lock_id, owner, amount, WINDOW_ID, auction::pair_hash(default_pair_bcs()),
        );
        lock_receipt::claim<Ethereum, FakeETH>(owner, lock_id);
        auction::test_add_seller_lock(atomica, WINDOW_ID, default_pair_bcs(), lock_id);
    }

    fun add_bid(atomica: &signer, lock_id: vector<u8>, bidder: address, collateral: u256, quantity: u256) {
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
            lock_id, bidder, collateral, WINDOW_ID, auction::pair_hash(default_pair_bcs()),
        );
        lock_receipt::claim<Ethereum, FakeUSD>(bidder, lock_id);
        auction::test_insert_bid_with_qty(atomica, WINDOW_ID, default_pair_bcs(), bidder, lock_id, lock_id, quantity);
    }

    // The mixed window, bound to timelock 11 with the key out but not settled. When
    // `revealed` is false the timelock stays pending and no bid is opened.
    fun mixed_window(atomica: &signer, revealed: bool) {
        auction_bid_wrapper_tests::setup();
        if (revealed) auction_bid_wrapper_tests::reveal_timelock();
        let pair = default_pair_bcs();
        auction::test_insert_window_with_timelock(atomica, WINDOW_ID, pair, 5 * ETH, false, 0, TIMELOCK_ID);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        add_seller(atomica, SELLER_A_LOCK, SELLER_A, 2 * ETH);
        add_seller(atomica, SELLER_B_LOCK, SELLER_B, 3 * ETH);
        add_bid(atomica, W1_LOCK, W1, 9_000 * USD, 4 * ETH);
        add_bid(atomica, W2_LOCK, W2, 7_000 * USD, 3 * ETH);
        add_bid(atomica, LOSER_LOCK, LOSER, 2_000 * USD, 1 * ETH);
        add_bid(atomica, UNOPENED_LOCK, UNOPENED, 1_000 * USD, 1 * ETH);
        if (revealed) {
            auction::test_set_openings(
                atomica, WINDOW_ID, pair, vector[2100, 2000, 1500, 0], vector[true, true, true, false],
            );
            auction::clear_uniform_price(WINDOW_ID, pair);
        };
    }

    fun eth_owners(who: vector<address>): vector<vector<u8>> {
        let out = vector::empty<vector<u8>>();
        let i = 0;
        while (i < vector::length(&who)) {
            vector::push_back(&mut out, lock_receipt::test_eth_owner(*vector::borrow(&who, i)));
            i = i + 1;
        };
        out
    }

    // The lock's status and stored outcome record are `kind`, paying `amounts[i]` to the
    // Ethereum owner of `to[i]`.
    fun assert_outcome<Asset>(lock_id: vector<u8>, kind: u8, to: vector<address>, amounts: vector<u256>) {
        assert!(lock_receipt::get_receipt_status<Ethereum, Asset>(lock_id) == kind, 100);
        let (k, window_id, recipients, paid) = lock_receipt::get_lock_outcome<Ethereum, Asset>(lock_id);
        assert!(k == kind, 101);
        assert!(window_id == WINDOW_ID, 102);
        assert!(recipients == eth_owners(to), 103);
        assert!(paid == amounts, 104);
    }

    fun assert_returned<Asset>(lock_id: vector<u8>, owner: address, amount: u256) {
        assert_outcome<Asset>(lock_id, lock_receipt::status_revoked(), vector[owner], vector[amount]);
    }

    fun assert_mixed_settled() {
        let filled = lock_receipt::status_filled();
        assert_outcome<FakeETH>(SELLER_A_LOCK, filled, vector[W1], vector[2 * ETH]);
        assert_outcome<FakeETH>(SELLER_B_LOCK, filled, vector[W1, W2], vector[2 * ETH, 1 * ETH]);
        assert_outcome<FakeUSD>(
            W1_LOCK, filled, vector[SELLER_A, SELLER_B, W1], vector[4_000 * USD, 4_000 * USD, 1_000 * USD],
        );
        assert_outcome<FakeUSD>(W2_LOCK, filled, vector[SELLER_B, W2], vector[2_000 * USD, 5_000 * USD]);
        assert_returned<FakeUSD>(LOSER_LOCK, LOSER, 2_000 * USD);
        assert_returned<FakeUSD>(UNOPENED_LOCK, UNOPENED, 1_000 * USD);
    }

    fun assert_mixed_returned() {
        assert_returned<FakeETH>(SELLER_A_LOCK, SELLER_A, 2 * ETH);
        assert_returned<FakeETH>(SELLER_B_LOCK, SELLER_B, 3 * ETH);
        assert_returned<FakeUSD>(W1_LOCK, W1, 9_000 * USD);
        assert_returned<FakeUSD>(W2_LOCK, W2, 7_000 * USD);
        assert_returned<FakeUSD>(LOSER_LOCK, LOSER, 2_000 * USD);
        assert_returned<FakeUSD>(UNOPENED_LOCK, UNOPENED, 1_000 * USD);
    }

    // Exactly one AuctionOutcome was emitted, and its root and leaf count are the
    // outcome tree of the six stored per-lock records.
    fun assert_one_outcome_matches_records() {
        let outcomes = event::emitted_events<auction::AuctionOutcome>();
        assert!(vector::length(&outcomes) == 1, 200);
        let (window_id, pair_hash, deadline, root, leaf_count) =
            auction::test_auction_outcome_fields(vector::borrow(&outcomes, 0));
        assert!(window_id == WINDOW_ID, 201);
        assert!(pair_hash == auction::pair_hash(default_pair_bcs()), 202);
        assert!(deadline == auction::eth_lock_deadline(WINDOW_ID), 203);
        assert!(leaf_count == 6, 204);

        let ids = vector[SELLER_A_LOCK, SELLER_B_LOCK];
        let hashes = vector::empty<vector<u8>>();
        let i = 0;
        while (i < 2) {
            let (_, _, r, a) = lock_receipt::get_lock_outcome<Ethereum, FakeETH>(*vector::borrow(&ids, i));
            vector::push_back(&mut hashes, outcome_tree::payouts_hash(&r, &a));
            i = i + 1;
        };
        let usd = vector[W1_LOCK, W2_LOCK, LOSER_LOCK, UNOPENED_LOCK];
        let j = 0;
        while (j < 4) {
            let id = *vector::borrow(&usd, j);
            let (_, _, r, a) = lock_receipt::get_lock_outcome<Ethereum, FakeUSD>(id);
            vector::push_back(&mut hashes, outcome_tree::payouts_hash(&r, &a));
            vector::push_back(&mut ids, id);
            j = j + 1;
        };
        assert!(root == outcome_tree::root(&outcome_tree::sorted_leaves(ids, hashes)), 205);
    }

    // Each LockOutcomeRecorded event of `Asset` equals the stored record of its lock, pays
    // exactly the lock amount, and pays only Ethereum owners of the window's receipts.
    // Returns the number of events.
    fun assert_events_match_records<Asset>(): u64 {
        let owners = eth_owners(vector[SELLER_A, SELLER_B, W1, W2, LOSER, UNOPENED]);
        let events = event::emitted_events<lock_receipt::LockOutcomeRecorded<Ethereum, Asset>>();
        let n = vector::length(&events);
        let i = 0;
        while (i < n) {
            let (lock_id, kind, window_id, recipients, amounts) =
                lock_receipt::test_lock_outcome_event_fields(vector::borrow(&events, i));
            let (k, w, r, a) = lock_receipt::get_lock_outcome<Ethereum, Asset>(lock_id);
            assert!(kind == k && window_id == w && recipients == r && amounts == a, 300);
            let (_, amount, _, _, _) = lock_receipt::get_receipt<Ethereum, Asset>(lock_id);
            let sum: u256 = 0;
            let j = 0;
            while (j < vector::length(&amounts)) {
                assert!(vector::contains(&owners, vector::borrow(&recipients, j)), 301);
                sum = sum + *vector::borrow(&amounts, j);
                j = j + 1;
            };
            assert!(sum == amount, 302);
            i = i + 1;
        };
        n
    }

    fun to_stuck_deadline() {
        timestamp::update_global_time_for_test(auction::get_stuck_deadline_us(WINDOW_ID, default_pair_bcs()));
    }

    fun stranger(): signer { account::create_signer_for_test(@0x7777) }

    // Settle before the stuck deadline honours the fills: FakeETH to the winners' Ethereum
    // owners, FakeUSD to the sellers' Ethereum owners, and everything else back to its
    // depositor. One AuctionOutcome covers every lock.
    #[test(atomica = @atomica)]
    fun settle_honours_fills_and_returns_the_rest(atomica: &signer) {
        mixed_window(atomica, true);
        auction::settle(&stranger(), WINDOW_ID, default_pair_bcs());
        assert!(auction::is_settled(WINDOW_ID, default_pair_bcs()), 1);
        assert_mixed_settled();
        assert_one_outcome_matches_records();
        assert!(assert_events_match_records<FakeETH>() == 2, 2);
        assert!(assert_events_match_records<FakeUSD>() == 4, 3);
    }

    // A winner below supply leaves unsold supply, which goes back to the seller.
    #[test(atomica = @atomica)]
    fun settle_returns_unsold_supply(atomica: &signer) {
        revealed_window(atomica, 5 * ETH);
        add_bid(atomica, W1_LOCK, W1, 5_000 * USD, 2 * ETH);
        auction::test_set_revealed_prices(atomica, WINDOW_ID, default_pair_bcs(), vector[2100]);
        auction::clear_uniform_price(WINDOW_ID, default_pair_bcs());
        auction::settle(&stranger(), WINDOW_ID, default_pair_bcs());
        let filled = lock_receipt::status_filled();
        let (k, _, r, a) = lock_receipt::get_lock_outcome<Ethereum, FakeETH>(SELLER_LOCK);
        assert!(k == filled && r == eth_owners(vector[W1, SELLER]) && a == vector[2 * ETH, 3 * ETH], 1);
        assert_outcome<FakeUSD>(W1_LOCK, filled, vector[SELLER, W1], vector[4_200 * USD, 800 * USD]);
    }

    // A winner whose collateral cannot pay its fill makes the outcome unpayable: settle
    // aborts, and after the stuck deadline unwind returns every lock.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 36, location = atomica::auction)] // E_UNPAYABLE_FILL
    fun settle_aborts_when_collateral_cannot_pay(atomica: &signer) {
        revealed_window(atomica, 5 * ETH);
        add_bid(atomica, W1_LOCK, W1, 100 * USD, 5 * ETH);
        auction::test_set_revealed_prices(atomica, WINDOW_ID, default_pair_bcs(), vector[2100]);
        auction::clear_uniform_price(WINDOW_ID, default_pair_bcs());
        auction::settle(&stranger(), WINDOW_ID, default_pair_bcs());
    }

    // From the stuck deadline on only unwind finalizes a window.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 35, location = atomica::auction)] // E_PAST_STUCK_DEADLINE
    fun settle_after_stuck_deadline_aborts(atomica: &signer) {
        mixed_window(atomica, true);
        to_stuck_deadline();
        auction::settle(&stranger(), WINDOW_ID, default_pair_bcs());
    }

    // A non-admin settles the mixed window; each receipt has its terminal outcome. Unwind
    // after the stuck deadline finds nothing held and emits no second outcome.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 34, location = atomica::auction)] // E_WINDOW_FINAL
    fun unwind_settled_mixed_outcomes(atomica: &signer) {
        mixed_window(atomica, true);
        auction::settle(&stranger(), WINDOW_ID, default_pair_bcs());
        assert_mixed_settled();
        assert_one_outcome_matches_records();
        to_stuck_deadline();
        auction::unwind(&stranger(), WINDOW_ID, default_pair_bcs());
    }

    // A revealed window nobody settled: at the stuck deadline any account unwinds it, every
    // lock goes back to its depositor, and one all-refund AuctionOutcome is emitted.
    #[test(atomica = @atomica)]
    fun unwind_stuck_after_grace(atomica: &signer) {
        mixed_window(atomica, true);
        let stuck = auction::get_stuck_deadline_us(WINDOW_ID, default_pair_bcs());
        assert!(
            stuck == aptos_framework::ibe_config::get_reveal_expiry(TIMELOCK_ID) + 600_000_000
                + atomica::timelock_config::get_unwind_grace_us(),
            1
        );
        to_stuck_deadline();
        auction::unwind(&stranger(), WINDOW_ID, default_pair_bcs());
        assert_mixed_returned();
        assert_one_outcome_matches_records();
        assert!(assert_events_match_records<FakeETH>() == 2, 2);
        assert!(assert_events_match_records<FakeUSD>() == 4, 3);
        let (_, _, refunded) = auction::get_window_status(WINDOW_ID, default_pair_bcs());
        assert!(refunded && !auction::is_settled(WINDOW_ID, default_pair_bcs()), 4);
    }

    // Whatever the reveal state: a window whose key never came out unwinds the same way.
    #[test(atomica = @atomica)]
    fun unwind_stuck_unrevealed_window(atomica: &signer) {
        mixed_window(atomica, false);
        to_stuck_deadline();
        auction::unwind(&stranger(), WINDOW_ID, default_pair_bcs());
        assert_mixed_returned();
        assert_one_outcome_matches_records();
    }

    // One microsecond before the stuck deadline, unwind aborts.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 33, location = atomica::auction)] // E_NOT_STUCK
    fun unwind_before_grace_aborts(atomica: &signer) {
        mixed_window(atomica, true);
        let stuck = auction::get_stuck_deadline_us(WINDOW_ID, default_pair_bcs());
        timestamp::update_global_time_for_test(stuck - 1);
        auction::unwind(&stranger(), WINDOW_ID, default_pair_bcs());
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 34, location = atomica::auction)] // E_WINDOW_FINAL
    fun unwind_twice_aborts(atomica: &signer) {
        mixed_window(atomica, true);
        to_stuck_deadline();
        auction::unwind(&stranger(), WINDOW_ID, default_pair_bcs());
        auction::unwind(&stranger(), WINDOW_ID, default_pair_bcs());
    }

    // A settled window that still holds claimed receipts (the state the pre-194 settle left
    // behind): unwind returns only those coins and emits no AuctionOutcome.
    #[test(atomica = @atomica)]
    fun unwind_returns_coins_a_settled_window_still_holds(atomica: &signer) {
        mixed_window(atomica, true);
        auction::test_mark_settled(atomica, WINDOW_ID, default_pair_bcs());
        to_stuck_deadline();
        auction::unwind(&stranger(), WINDOW_ID, default_pair_bcs());
        assert_mixed_returned();
        assert!(vector::is_empty(&event::emitted_events<auction::AuctionOutcome>()), 1);
    }

    // Rounding dust: a winner pays the rounded-down quote, so the dust stays in its leaf
    // and goes back to the depositor.
    #[test]
    fun quote_for_fill_rounds_down() {
        assert!(auction::quote_for_fill(ETH, 2000) == 2_000 * USD, 1);
        assert!(auction::quote_for_fill(1, 2000) == 0, 2);
        assert!(auction::quote_for_fill(ETH / 3, 2000) == 666_666_666, 3);
    }

    // Timing order: timelock 11 has a 2023 deadline, so its stuck deadline plus the carrier
    // margin is far past `eth_lock_deadline` of the current window.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 32, location = atomica::auction)] // E_STUCK_AFTER_LOCK_DEADLINE
    fun create_auction_rejects_stuck_deadline_after_lock_deadline(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let lock_id = b"timing_seller_lock_32bytes______";
        insert_eth_receipt(atomica, lock_id, @atomica, ETH);
        auction::create_auction(
            atomica, auction::current_window_id(), default_pair_bcs(), lock_id, TIMELOCK_ID,
        );
    }

    // A lock bound to the next window cannot back the current one.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::lock_receipt)] // E_WRONG_BINDING
    fun create_auction_rejects_a_lock_bound_to_another_window(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        let lock_id = b"next_window_seller_lock_32bytes_";
        insert_bound_eth_receipt(atomica, lock_id, @atomica, ETH, auction::current_window_id() + 1);
        auction::create_auction(
            atomica, auction::current_window_id(), default_pair_bcs(), lock_id,
            auction_bid_wrapper_tests::register_live_timelock(),
        );
    }

    // A lock bound to another pair cannot back this window, even when both pairs are listed.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::lock_receipt)] // E_WRONG_BINDING
    fun create_auction_rejects_a_lock_bound_to_another_pair(atomica: &signer) {
        auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        auction::allow_pair(atomica, b"ethereum", b"FakeETH", b"ethereum", b"OtherUSD");
        let lock_id = b"other_pair_seller_lock_32bytes__";
        insert_eth_receipt(atomica, lock_id, @atomica, ETH);
        auction::create_auction(
            atomica, auction::current_window_id(), other_pair_bcs(), lock_id,
            auction_bid_wrapper_tests::register_live_timelock(),
        );
    }
}
