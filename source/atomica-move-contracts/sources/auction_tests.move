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

    // ===================== submit_bid edge cases (issue #129) =====================
    //
    // Six tests that verify boundary conditions of submit_bid not covered by the
    // existing happy-path and uninitialized-registry tests.
    //
    // @see docs/architecture/v0-architecture.md §2.5

    // Helper: initialize the FakeUSD registry and insert one active receipt.
    fun insert_usd_receipt_single(
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
            1u64,
        );
    }

    // test_submit_bid_aborts_after_window_settled:
    //   A bid on a window whose `settled` flag is true must abort with
    //   E_WINDOW_ALREADY_SETTLED (11).  The guard was added to submit_bid in
    //   issue #129: bids after settlement would lose their collateral silently
    //   because the supply has already been allocated and no clearing will run.
    //
    //   Abort code: E_WINDOW_ALREADY_SETTLED = 11 from atomica::auction.
    #[test(framework = @0x1, atomica = @atomica, bidder = @0x1111)]
    #[expected_failure(abort_code = 11, location = atomica::auction)]
    fun test_submit_bid_aborts_after_window_settled(
        framework: &signer,
        atomica:   &signer,
        bidder:    &signer,
    ) {
        setup(framework);
        let pair_bcs           = default_pair_bcs();
        let collateral_lock_id = b"fakeusd_lock_settled_window_32b_";
        let bidder_addr        = @0x1111;

        // Insert a FakeUSD receipt so the claim call in submit_bid succeeds
        // before the settled-window guard fires.
        insert_usd_receipt_single(atomica, collateral_lock_id, bidder_addr, 1_000_000u256);

        // Insert the window with settled = true.
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, true, 2000);

        // submit_bid must abort with E_WINDOW_ALREADY_SETTLED because the window
        // is already settled and the collateral claim happens before the guard.
        auction::submit_bid(
            bidder,
            WINDOW_ID,
            pair_bcs,
            b"u_bytes",
            b"ciphertext",
            collateral_lock_id,
            1_000_000_000_000_000_000u256,
        );
    }

    // test_submit_bid_aborts_on_mismatched_collateral_owner:
    //   A bidder that is neither the receipt owner nor @atomica must not be able to
    //   claim a LockReceipt belonging to another address.  `lock_receipt::claim`
    //   enforces `receipt.user == claimer || claimer == @atomica`, aborting with
    //   E_NOT_RECEIPT_OWNER (5) from atomica::lock_receipt.
    //
    //   Setup: receipt is owned by @0x2222 (other_owner), but the bidder signer is
    //   @0x3333 (thief).  The thief's address is neither the owner nor @atomica.
    //
    //   Abort code: E_NOT_RECEIPT_OWNER = 5 from atomica::lock_receipt.
    #[test(framework = @0x1, atomica = @atomica, thief = @0x3333)]
    #[expected_failure(abort_code = 5, location = atomica::lock_receipt)]
    fun test_submit_bid_aborts_on_mismatched_collateral_owner(
        framework: &signer,
        atomica:   &signer,
        thief:     &signer,
    ) {
        setup(framework);
        let pair_bcs           = default_pair_bcs();
        let collateral_lock_id = b"fakeusd_lock_other_owner_32byte_";
        let other_owner        = @0x2222; // receipt belongs to this address

        // Insert receipt owned by other_owner (not the thief).
        insert_usd_receipt_single(atomica, collateral_lock_id, other_owner, 500_000u256);

        // Insert window so submit_bid reaches the claim call.
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);

        // thief (@0x3333) tries to claim a receipt owned by @0x2222.
        // Must abort with E_NOT_RECEIPT_OWNER.
        auction::submit_bid(
            thief,
            WINDOW_ID,
            pair_bcs,
            b"u_bytes",
            b"ciphertext",
            collateral_lock_id,
            100u256,
        );
    }

    // test_submit_bid_aborts_on_zero_quantity:
    //   Spec documents: zero-quantity bids are ALLOWED.  A bid with quantity=0 is
    //   stored in the window and bid count becomes 1.  After clearing the bid
    //   receives fill_amount=0 because it contributes no supply pressure.
    //
    //   This test explicitly asserts the allowed behaviour so that any future
    //   change that makes zero-quantity an abort will break here first.
    //
    //   @see auction.move submit_bid code comment on zero-quantity behaviour.
    #[test(framework = @0x1, atomica = @atomica, bidder = @0x1111)]
    fun test_submit_bid_aborts_on_zero_quantity(
        framework: &signer,
        atomica:   &signer,
        bidder:    &signer,
    ) {
        setup(framework);
        let pair_bcs           = default_pair_bcs();
        let collateral_lock_id = b"fakeusd_lock_zero_qty_32bytes___";
        let bidder_addr        = @0x1111;

        insert_usd_receipt_single(atomica, collateral_lock_id, bidder_addr, 1_000_000u256);
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);

        // quantity = 0 — spec allows this, bid must be stored.
        auction::submit_bid(
            bidder,
            WINDOW_ID,
            pair_bcs,
            b"u_bytes",
            b"ciphertext",
            collateral_lock_id,
            0u256, // zero quantity
        );

        // Bid count must be 1: the zero-quantity bid is stored.
        assert!(auction::get_bid_count(WINDOW_ID, pair_bcs) == 1, 1);
    }

    // test_submit_bid_quantity_exceeds_supply_boundary:
    //   Spec documents: bids whose quantity exceeds total_supply are ALLOWED.
    //   The clearing algorithm caps allocation at total_supply via partial fill;
    //   an over-supply bid either receives a partial fill or loses entirely.
    //
    //   This test asserts the allowed behaviour: the bid is stored and bid count
    //   becomes 1.  Any future guard that rejects over-supply bids must update
    //   this test.
    //
    //   @see auction.move submit_bid code comment on over-supply behaviour.
    #[test(framework = @0x1, atomica = @atomica, bidder = @0x1111)]
    fun test_submit_bid_quantity_exceeds_supply_boundary(
        framework: &signer,
        atomica:   &signer,
        bidder:    &signer,
    ) {
        setup(framework);
        let pair_bcs           = default_pair_bcs();
        let collateral_lock_id = b"fakeusd_lock_over_supply_32byte_";
        let bidder_addr        = @0x1111;

        insert_usd_receipt_single(atomica, collateral_lock_id, bidder_addr, 1_000_000u256);

        let total_supply: u256 = 5u256; // small supply for clarity
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, total_supply, false, 0);

        // quantity (100) >> total_supply (5) — spec allows this, bid must be stored.
        auction::submit_bid(
            bidder,
            WINDOW_ID,
            pair_bcs,
            b"u_bytes",
            b"ciphertext",
            collateral_lock_id,
            100u256, // quantity far exceeds total_supply
        );

        // Bid count must be 1: the over-supply bid is stored.
        assert!(auction::get_bid_count(WINDOW_ID, pair_bcs) == 1, 1);
    }

    // test_submit_bid_same_bidder_twice_two_receipts:
    //   A bidder may submit multiple bids using distinct LockReceipts.  Each call
    //   consumes a separate collateral receipt, and each bid is independently stored.
    //   After two submit_bid calls from the same bidder, bid count must be 2.
    //
    //   This models the legitimate multi-tranche bidding scenario.
    #[test(framework = @0x1, atomica = @atomica, bidder = @0x1111)]
    fun test_submit_bid_same_bidder_twice_two_receipts(
        framework: &signer,
        atomica:   &signer,
        bidder:    &signer,
    ) {
        setup(framework);
        let pair_bcs  = default_pair_bcs();
        let bidder_addr = @0x1111;

        // Two distinct FakeUSD receipts for the same bidder.
        let lock_id_a = b"fakeusd_lock_bidder_tranche_a___";
        let lock_id_b = b"fakeusd_lock_bidder_tranche_b___";

        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(
            lock_id_a, bidder_addr, 1_000_000u256, 1u64,
        );
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(
            lock_id_b, bidder_addr, 2_000_000u256, 2u64,
        );

        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);

        // First bid from the same bidder using receipt A.
        auction::submit_bid(
            bidder, WINDOW_ID, pair_bcs,
            b"u_bytes_a", b"ciphertext_a", lock_id_a,
            1_000_000_000_000_000_000u256,
        );

        // Second bid from the same bidder using receipt B.
        auction::submit_bid(
            bidder, WINDOW_ID, pair_bcs,
            b"u_bytes_b", b"ciphertext_b", lock_id_b,
            2_000_000_000_000_000_000u256,
        );

        // Bid count must be 2: both bids are stored independently.
        assert!(auction::get_bid_count(WINDOW_ID, pair_bcs) == 2, 1);

        // Both receipts must be claimed (STATUS_CLAIMED).
        assert!(lock_receipt::is_lock_claimed<Ethereum, FakeUSD>(lock_id_a), 2);
        assert!(lock_receipt::is_lock_claimed<Ethereum, FakeUSD>(lock_id_b), 3);
    }

    // test_submit_bid_double_spend_collateral:
    //   A bidder that attempts to reuse the same collateral_lock_id in a second
    //   submit_bid call must be rejected.  After the first submit_bid, the receipt
    //   status is STATUS_CLAIMED.  The second call to `lock_receipt::claim` finds
    //   status != STATUS_ACTIVE and aborts with E_RECEIPT_ALREADY_CLAIMED (4)
    //   from atomica::lock_receipt.
    //
    //   Abort code: E_RECEIPT_ALREADY_CLAIMED = 4 from atomica::lock_receipt.
    #[test(framework = @0x1, atomica = @atomica, bidder = @0x1111)]
    #[expected_failure(abort_code = 4, location = atomica::lock_receipt)]
    fun test_submit_bid_double_spend_collateral(
        framework: &signer,
        atomica:   &signer,
        bidder:    &signer,
    ) {
        setup(framework);
        let pair_bcs           = default_pair_bcs();
        let collateral_lock_id = b"fakeusd_lock_double_spend_32byte";
        let bidder_addr        = @0x1111;

        insert_usd_receipt_single(atomica, collateral_lock_id, bidder_addr, 1_000_000u256);
        auction::test_insert_window(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0);

        // First bid: succeeds, receipt is consumed (STATUS_CLAIMED).
        auction::submit_bid(
            bidder, WINDOW_ID, pair_bcs,
            b"u_bytes_first", b"ciphertext_first", collateral_lock_id,
            1_000_000_000_000_000_000u256,
        );

        // Second bid with the same collateral_lock_id: must abort with
        // E_RECEIPT_ALREADY_CLAIMED because the receipt is no longer STATUS_ACTIVE.
        auction::submit_bid(
            bidder, WINDOW_ID, pair_bcs,
            b"u_bytes_second", b"ciphertext_second", collateral_lock_id,
            500_000_000_000_000_000u256,
        );
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
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"u", b"c", alice_lock, 5u256,
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
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"u", b"c", alice_lock, 5u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"u", b"c", bob_lock, 3u256,
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
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"u", b"c", alice_lock, 4u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"u", b"c", bob_lock, 3u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xCA401, b"u", b"c", carol_lock, 2u256,
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
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"u", b"c", alice_lock, 5u256,
        );
        auction::test_insert_bid_with_qty(
            atomica, WINDOW_ID, pair_bcs, @0xB0B, b"u", b"c", bob_lock, 2u256,
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
            atomica, WINDOW_ID, pair_bcs, @0xA11CE, b"u", b"c", b"lock", 5u256,
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

    // Partial batch failure: a batch of N bids where cleartext[k] is wrong aborts
    // with E_INVALID_CLEARTEXT (10) and no revealed_prices are stored.
    //
    // Uses the `timelock_basic` golden vectors ciphertext for both bids.
    // Both bids encrypt the same plaintext; the test supplies the correct
    // cleartext for bid 0 and a wrong cleartext for bid 1. The abort must happen
    // before any state is written (Move VM atomicity: on abort, all writes in the
    // current frame are reverted).
    //
    // After abort, no revealed_prices are stored because the VM discards all
    // state mutations for the aborted call.
    #[test(framework = @0x1, atomica = @atomica, settler = @0x9999)]
    #[expected_failure(abort_code = 10, location = atomica::auction)] // E_INVALID_CLEARTEXT
    fun test_submit_cleartext_partial_failure_aborts_atomically(
        framework: &signer,
        atomica:   &signer,
        settler:   &signer,
    ) {
        // Enable BLS12-381 pairing native functions.
        crypto_algebra::enable_cryptography_algebra_natives(framework);

        let pair_bcs = default_pair_bcs();
        auction::test_insert_window_with_timelock(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0, 0u64);

        // Insert 2 bids using the same golden vector ciphertext.
        // Both bids encrypt the same plaintext (b"Timelock test message").
        let u_bytes    = fixtures::timelock_basic_ciphertext_u();
        let ciphertext = fixtures::timelock_basic_ciphertext_v();

        // Bid 0: valid golden vector ciphertext.
        auction::test_insert_bid(
            atomica, WINDOW_ID, pair_bcs, @0x1111,
            u_bytes, ciphertext, b"collateral_lock_id_0",
        );
        // Bid 1: same ciphertext (same encrypted plaintext).
        auction::test_insert_bid(
            atomica, WINDOW_ID, pair_bcs, @0x2222,
            u_bytes, ciphertext, b"collateral_lock_id_1",
        );

        let dk_bytes = fixtures::timelock_basic_reconstructed_dk();

        // Supply correct cleartext for bid 0 but WRONG cleartext for bid 1.
        // The loop in test_submit_cleartext_with_dk verifies in order: bid 0
        // passes (correct price), bid 1 fails (wrong price) → E_INVALID_CLEARTEXT.
        // Move VM reverts all state writes from this call on abort, so
        // revealed_prices remains empty after the abort.
        let cleartexts = vector[
            CLEARTEXT_FROM_GOLDEN_PLAINTEXT,  // correct for bid 0
            9999u64,                           // wrong for bid 1
        ];
        auction::test_submit_cleartext_with_dk(settler, WINDOW_ID, pair_bcs, cleartexts, dk_bytes);
    }

    // Decryption key not yet revealed: the timelock deadline has passed but
    // validators have not submitted threshold shares. submit_cleartext_and_clear
    // calls timelock::get_decryption_key which delegates to
    // ibe_config::get_decryption_key. That function aborts with
    // E_DECRYPTION_KEY_NOT_REVEALED (5) from aptos_framework::ibe_config when
    // is_revealed == false.
    //
    // Note: this abort originates in ibe_config (code 5), not auction (code 8).
    // auction::E_DECRYPTION_KEY_NOT_REVEALED (8) documents the intended error
    // category; the actual abort comes from the framework module.
    //
    // The test verifies that no state (revealed_prices) is written before
    // the DK is available — all writes are reverted on abort by the VM.
    //
    // Setup: ibe_config::initialize_for_testing sets up timestamp + registry.
    // register_timelock creates a timelock with a near-future deadline.
    // fast_forward_seconds advances past the deadline so is_expired == true.
    // No DK shares are submitted, so is_revealed == false.
    // submit_cleartext_and_clear must pass the E_WINDOW_NOT_CLOSED guard
    // (timelock IS expired) and then abort inside get_decryption_key.
    #[test(framework = @0x1, atomica = @atomica, settler = @0x9999)]
    #[expected_failure(abort_code = 5, location = aptos_framework::ibe_config)] // E_DECRYPTION_KEY_NOT_REVEALED
    fun test_submit_cleartext_aborts_when_decryption_key_not_revealed(
        framework: &signer,
        atomica:   &signer,
        settler:   &signer,
    ) {
        // Initialize ibe_config and timestamp together.
        ibe_config::initialize_for_testing(framework);

        // Register a timelock with a deadline 1 second in the future.
        // timestamp is in microseconds; deadline_us = 1_000_000 us = 1 s.
        let deadline_us = 1_000_000u64;
        ibe_config::register_timelock(framework, deadline_us);
        let timelock_id = 0u64;

        // Insert a window linked to the timelock.
        let pair_bcs = default_pair_bcs();
        auction::test_insert_window_with_timelock(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0, timelock_id);

        // Insert one bid so count check passes (1 cleartext, 1 bid).
        auction::test_insert_bid(
            atomica, WINDOW_ID, pair_bcs, @0x1111,
            b"u_bytes", b"ciphertext", b"lock_id",
        );

        // Advance time past the deadline: is_expired becomes true.
        // timestamp::fast_forward_seconds works in seconds; advance 2 s.
        timestamp::fast_forward_seconds(2);

        // Call submit_cleartext_and_clear. The timelock IS expired
        // (passes E_WINDOW_NOT_CLOSED guard), but DK was never submitted —
        // get_decryption_key aborts with ibe_config::E_DECRYPTION_KEY_NOT_REVEALED (5).
        let cleartexts = vector[1234u64];
        auction::submit_cleartext_and_clear(settler, WINDOW_ID, pair_bcs, cleartexts);
    }

    // Auction not found: submit_cleartext_and_clear with a non-existent (window_id,
    // pair) aborts with E_AUCTION_NOT_FOUND (1) before any state is written.
    //
    // No AuctionRegistry exists at @atomica in this test, so the first assert in
    // submit_cleartext_and_clear fires immediately.
    #[test(framework = @0x1, settler = @0x9999)]
    #[expected_failure(abort_code = 1, location = atomica::auction)] // E_AUCTION_NOT_FOUND
    fun test_submit_cleartext_aborts_when_auction_not_found(
        framework: &signer,
        settler:   &signer,
    ) {
        setup(framework);
        // No AuctionRegistry at @atomica — first assert in submit_cleartext_and_clear
        // aborts with E_AUCTION_NOT_FOUND (1).
        let pair_bcs   = default_pair_bcs();
        let cleartexts = vector::empty<u64>();
        auction::submit_cleartext_and_clear(settler, WINDOW_ID, pair_bcs, cleartexts);
    }

    // Idempotency: calling submit_cleartext_and_clear twice on the same window.
    //
    // The current implementation does NOT guard against repeated calls on the
    // same window (it only checks !settled). The second call overwrites
    // revealed_prices with the same values, so the outcome is the same.
    //
    // Spec outcome: the second call succeeds and overwrites revealed_prices
    // with identical values. The window is not corrupted. This is a valid
    // operational behaviour — the settler can re-run the call with the same
    // cleartexts if needed (e.g., after a dropped transaction). However,
    // it also means a malicious settler could overwrite prices if not guarded
    // at the application layer.
    //
    // This test documents the current behaviour as "second call succeeds and
    // produces the same revealed_prices". A guard (`assert!(revealed_prices is
    // empty)`) could be added in a future issue to prevent re-submission.
    #[test(framework = @0x1, atomica = @atomica, settler = @0x9999)]
    fun test_submit_cleartext_idempotency(
        framework: &signer,
        atomica:   &signer,
        settler:   &signer,
    ) {
        // Enable BLS12-381 pairing native functions.
        crypto_algebra::enable_cryptography_algebra_natives(framework);

        let pair_bcs = default_pair_bcs();
        auction::test_insert_window_with_timelock(atomica, WINDOW_ID, pair_bcs, TOTAL_SUPPLY, false, 0, 0u64);

        // Insert one bid using the golden vector ciphertext.
        let u_bytes    = fixtures::timelock_basic_ciphertext_u();
        let ciphertext = fixtures::timelock_basic_ciphertext_v();
        auction::test_insert_bid(
            atomica, WINDOW_ID, pair_bcs, @0x1111,
            u_bytes, ciphertext, b"collateral_lock_id",
        );

        let dk_bytes  = fixtures::timelock_basic_reconstructed_dk();
        let cleartext = CLEARTEXT_FROM_GOLDEN_PLAINTEXT;
        let cleartexts = vector[cleartext];

        // First call: stores revealed_prices[0] = cleartext.
        auction::test_submit_cleartext_with_dk(settler, WINDOW_ID, pair_bcs, cleartexts, dk_bytes);

        // Verify first call stored the price.
        let revealed = auction::test_get_revealed_prices(WINDOW_ID, pair_bcs);
        assert!(vector::length(&revealed) == 1, 1);
        assert!(*vector::borrow(&revealed, 0) == cleartext, 2);

        // Second call: overwrites revealed_prices with the same values.
        // This must succeed (no guard against re-submission in the current impl).
        auction::test_submit_cleartext_with_dk(settler, WINDOW_ID, pair_bcs, cleartexts, dk_bytes);

        // Verify second call stored the same price — no corruption.
        let revealed2 = auction::test_get_revealed_prices(WINDOW_ID, pair_bcs);
        assert!(vector::length(&revealed2) == 1, 3);
        assert!(*vector::borrow(&revealed2, 0) == cleartext, 4);
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
