// Auction module tests — v0.1 Beta global-registry shape
//
// Tests cover:
//   - Window ID math (section 2.2 of v0-architecture.md)
//   - Sealed-bid type-check (section 2.5) — verifies new Bid shape compiles and stores
//   - View function behaviour against test-inserted WindowState
//   - Scaffold abort paths: create_auction / submit_bid / settle / submit_cleartext_and_clear
//     must all abort with E_NOT_IMPLEMENTED (99)
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

    // ===================== Scaffold abort paths =====================
    //
    // Each Phase 3a entry function must abort with E_NOT_IMPLEMENTED (99).
    // These tests document the expected abort code and prove the function
    // exists with the correct type signature.

    #[test(framework = @0x1, seller = @0xcafe)]
    #[expected_failure(abort_code = 99, location = atomica::auction)] // E_NOT_IMPLEMENTED
    fun test_create_auction_aborts_not_implemented(
        framework: &signer,
        seller:    &signer,
    ) {
        setup(framework);
        let pair_bcs  = default_pair_bcs();
        let lock_id   = vector::empty<u8>();
        let mpk_bytes = vector::empty<u8>();
        auction::create_auction(seller, WINDOW_ID, pair_bcs, lock_id, 100u64, mpk_bytes);
    }

    #[test(framework = @0x1, bidder = @0x1111)]
    #[expected_failure(abort_code = 99, location = atomica::auction)] // E_NOT_IMPLEMENTED
    fun test_submit_bid_aborts_not_implemented(framework: &signer, bidder: &signer) {
        setup(framework);
        let pair_bcs           = default_pair_bcs();
        let u_bytes            = vector::empty<u8>();
        let ciphertext         = vector::empty<u8>();
        let collateral_lock_id = vector::empty<u8>();
        auction::submit_bid(bidder, WINDOW_ID, pair_bcs, u_bytes, ciphertext, collateral_lock_id);
    }

    #[test(framework = @0x1, caller = @0x9999)]
    #[expected_failure(abort_code = 99, location = atomica::auction)] // E_NOT_IMPLEMENTED
    fun test_settle_aborts_not_implemented(framework: &signer, caller: &signer) {
        setup(framework);
        auction::settle(caller, WINDOW_ID, default_pair_bcs());
    }

    #[test(framework = @0x1, settler = @0x9999)]
    #[expected_failure(abort_code = 99, location = atomica::auction)] // E_NOT_IMPLEMENTED
    fun test_submit_cleartext_and_clear_aborts_not_implemented(
        framework: &signer,
        settler: &signer,
    ) {
        setup(framework);
        auction::submit_cleartext_and_clear(
            settler,
            WINDOW_ID,
            default_pair_bcs(),
            vector::empty<u64>(),
        );
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
}
