#[test_only]
module atomica::integration_tests {
    use std::vector;
    use aptos_framework::timestamp;


    // ===================== A window at both caps (issue 218) =====================

    // The i-th seller or bidder of the cap window: a distinct address per role and index.
    fun cap_party(role: address, i: u64): address {
        aptos_framework::account::create_resource_address(&role, std::bcs::to_bytes(&i))
    }

    // A distinct 32-byte lock id per role and index (outcome leaves need 32-byte ids).
    fun cap_lock_id(prefix: vector<u8>, i: u64): vector<u8> {
        let id = prefix;
        vector::append(&mut id, std::bcs::to_bytes(&i));
        while (vector::length(&id) < 32) vector::push_back(&mut id, 0x5f);
        id
    }

    // Builds the current window of the launch pair at both caps: the maximum seller locks,
    // each of the minimum seller lock and owned by its own seller through `create_auction`,
    // and the maximum bids, each holding the minimum collateral claimed as `submit_bid`
    // claims it. Returns (window id, pair bytes, timelock id).
    fun build_window_at_both_caps(atomica: &signer): (u64, vector<u8>, u64) {
        use atomica::auction;
        use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};

        atomica::auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        let pair = auction::launch_pair_bcs();
        let window_id = auction::current_window_id();
        let pair_hash = auction::pair_hash(pair);
        let (max_bids, max_sellers, min_lock, min_collateral) = auction::get_window_limits();

        let i = 0;
        while (i < max_sellers) {
            let who = cap_party(@0x5E, i);
            let lock_id = cap_lock_id(b"cap_seller_lock_", i);
            lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
                lock_id, who, min_lock, window_id, pair_hash,
            );
            let seller = aptos_framework::account::create_signer_for_test(who);
            auction::create_auction(&seller, window_id, pair, lock_id);
            i = i + 1;
        };

        let j = 0;
        while (j < max_bids) {
            let who = cap_party(@0xB1D, j);
            let lock_id = cap_lock_id(b"cap_bid_lock_", j);
            lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
                lock_id, who, min_collateral, window_id, pair_hash,
            );
            lock_receipt::claim_for_window<Ethereum, FakeUSD>(who, lock_id, window_id, pair_hash);
            auction::test_insert_bid_with_qty(atomica, window_id, pair, who, lock_id, lock_id, 1);
            j = j + 1;
        };

        let (lock_ids, _) = auction::get_window_lock_ids(window_id, pair);
        assert!(vector::length(&lock_ids) == max_sellers, 100);
        assert!(auction::get_bid_count(window_id, pair) == max_bids, 101);
        (window_id, pair, auction::window_timelock(window_id))
    }

    // Asserts every lock of the cap window is revoked and its whole amount goes back to its
    // depositor, and the window emitted one AuctionOutcome over all of them.
    fun assert_every_cap_lock_returned(window_id: u64, pair: vector<u8>) {
        use atomica::auction;
        use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};

        let (max_bids, max_sellers, min_lock, min_collateral) = auction::get_window_limits();
        let revoked = lock_receipt::status_revoked();
        let i = 0;
        while (i < max_sellers) {
            let lock_id = cap_lock_id(b"cap_seller_lock_", i);
            let (kind, _, to, amounts) = lock_receipt::get_lock_outcome<Ethereum, FakeETH>(lock_id);
            assert!(kind == revoked, 200);
            assert!(to == vector[lock_receipt::test_eth_owner(cap_party(@0x5E, i))], 201);
            assert!(amounts == vector[min_lock], 202);
            assert!(lock_receipt::get_receipt_status<Ethereum, FakeETH>(lock_id) == revoked, 203);
            i = i + 1;
        };
        let j = 0;
        while (j < max_bids) {
            let lock_id = cap_lock_id(b"cap_bid_lock_", j);
            let (kind, _, to, amounts) = lock_receipt::get_lock_outcome<Ethereum, FakeUSD>(lock_id);
            assert!(kind == revoked, 210);
            assert!(to == vector[lock_receipt::test_eth_owner(cap_party(@0xB1D, j))], 211);
            assert!(amounts == vector[min_collateral], 212);
            assert!(lock_receipt::get_receipt_status<Ethereum, FakeUSD>(lock_id) == revoked, 213);
            j = j + 1;
        };
        assert!(outcome_total<FakeETH>() == (max_sellers as u256) * min_lock, 220);
        assert!(outcome_total<FakeUSD>() == (max_bids as u256) * min_collateral, 221);
        let outcomes = aptos_framework::event::emitted_events<auction::AuctionOutcome>();
        assert!(vector::length(&outcomes) == 1, 222);
        let (w, h, _, _, leaf_count) = auction::test_auction_outcome_fields(vector::borrow(&outcomes, 0));
        assert!(w == window_id && h == auction::pair_hash(pair), 223);
        assert!(leaf_count == max_sellers + max_bids, 224);
    }

    // A window at both caps whose key never comes out: at the stuck deadline a stranger
    // unwinds it in one call and every lock goes back to its depositor. Move tests bound no
    // gas; the live settle-100-bids browser test measures the settle cost.
    #[test(atomica = @atomica)]
    fun unwind_at_both_caps_returns_every_lock(atomica: &signer) {
        use atomica::auction;
        let (window_id, pair, _) = build_window_at_both_caps(atomica);
        timestamp::update_global_time_for_test(auction::get_stuck_deadline_us(window_id, pair));
        let stranger = aptos_framework::account::create_signer_for_test(@0x7777);
        auction::unwind(&stranger, window_id, pair);
        assert_every_cap_lock_returned(window_id, pair);
    }

    // The same window on a timelock that expires (the epoch ends before the reveal): one
    // `refund_expired_window` call releases every lock to its depositor.
    #[test(atomica = @atomica)]
    fun refund_at_both_caps_releases_every_lock(atomica: &signer) {
        use atomica::auction;
        let (window_id, pair, timelock_id) = build_window_at_both_caps(atomica);
        aptos_framework::reconfiguration::reconfigure_for_test_custom();
        assert!(atomica::timelock::get_status(timelock_id) == atomica::timelock::status_expired(), 1);
        let stranger = aptos_framework::account::create_signer_for_test(@0x7777);
        auction::refund_expired_window(&stranger, window_id, pair);
        let (_, _, refunded) = auction::get_window_status(window_id, pair);
        assert!(refunded, 2);
        assert_every_cap_lock_returned(window_id, pair);
    }

    // Build two adjacent, both-caps windows whose all-refund leaf sets are identical. The
    // same 200 lock ids, owners, and amounts appear in each outcome; FakeETH/FakeUSD
    // registries are disjoint, so the ids can be assigned to the other asset in the second
    // window without reusing a receipt. This lets one test compare the actual roots emitted
    // by refund_expired_window and unwind.
    fun build_windows_with_matching_refund_leaves(atomica: &signer): (u64, u64, vector<u8>) {
        use atomica::auction;
        use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};

        let _framework = atomica::auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        let pair = auction::launch_pair_bcs();
        let pair_hash = auction::pair_hash(pair);
        let refund_window = auction::current_window_id();
        let unwind_window = refund_window + 1;
        let (max_bids, max_sellers, min_lock, min_collateral) = auction::get_window_limits();
        let shared_amount = if (min_lock > min_collateral) { min_lock } else { min_collateral };

        let i = 0;
        while (i < max_sellers) {
            let seller_id = cap_lock_id(b"matching_seller_", i);
            let seller_owner = cap_party(@0x5E, i);
            let bidder_id = cap_lock_id(b"matching_bid_", i);
            let bidder_owner = cap_party(@0xB1D, i);

            // Create both windows first: each can then accept its 100 bids in the next pass.
            // Refund window: FakeETH seller. Unwind window: FakeETH seller with the bidder ID.
            lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
                seller_id, seller_owner, shared_amount, refund_window, pair_hash,
            );
            let refund_seller = aptos_framework::account::create_signer_for_test(seller_owner);
            auction::create_auction(&refund_seller, refund_window, pair, seller_id);

            lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
                bidder_id, bidder_owner, shared_amount, unwind_window, pair_hash,
            );
            let unwind_seller = aptos_framework::account::create_signer_for_test(bidder_owner);
            auction::create_auction(&unwind_seller, unwind_window, pair, bidder_id);
            i = i + 1;
        };

        let j = 0;
        while (j < max_bids) {
            let bidder_id = cap_lock_id(b"matching_bid_", j);
            let bidder_owner = cap_party(@0xB1D, j);
            let seller_id = cap_lock_id(b"matching_seller_", j);
            let seller_owner = cap_party(@0x5E, j);

            // Refund window: FakeUSD bidder. Unwind window: FakeETH seller.
            lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
                bidder_id, bidder_owner, shared_amount, refund_window, pair_hash,
            );
            lock_receipt::claim_for_window<Ethereum, FakeUSD>(bidder_owner, bidder_id, refund_window, pair_hash);
            auction::test_insert_bid_with_qty(atomica, refund_window, pair, bidder_owner, bidder_id, bidder_id, 1);

            lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
                seller_id, seller_owner, shared_amount, unwind_window, pair_hash,
            );
            lock_receipt::claim_for_window<Ethereum, FakeUSD>(seller_owner, seller_id, unwind_window, pair_hash);
            auction::test_insert_bid_with_qty(atomica, unwind_window, pair, seller_owner, seller_id, seller_id, 1);
            j = j + 1;
        };

        let (refund_sellers, refund_bids) = auction::get_window_lock_ids(refund_window, pair);
        let (unwind_sellers, unwind_bids) = auction::get_window_lock_ids(unwind_window, pair);
        assert!(vector::length(&refund_sellers) == max_sellers, 230);
        assert!(vector::length(&refund_bids) == max_bids, 231);
        assert!(vector::length(&unwind_sellers) == max_sellers, 232);
        assert!(vector::length(&unwind_bids) == max_bids, 233);
        (refund_window, unwind_window, pair)
    }

    #[test(atomica = @atomica)]
    fun refund_and_unwind_at_both_caps_emit_the_same_outcome(atomica: &signer) {
        use atomica::auction;
        let (refund_window, unwind_window, pair) =
            build_windows_with_matching_refund_leaves(atomica);

        // Unwind the later window first. Its stuck deadline is after the earlier window's
        // timelock deadline, so the subsequent reconfiguration also expires the refund
        // window's key.
        timestamp::update_global_time_for_test(
            auction::get_stuck_deadline_us(unwind_window, pair),
        );
        let stranger = aptos_framework::account::create_signer_for_test(@0x7777);
        auction::unwind(&stranger, unwind_window, pair);
        aptos_framework::reconfiguration::reconfigure_for_test_custom();
        auction::refund_expired_window(&stranger, refund_window, pair);

        let outcomes = aptos_framework::event::emitted_events<auction::AuctionOutcome>();
        assert!(vector::length(&outcomes) == 2, 234);
        let (unwound_id, _, _, unwind_root, unwind_leaves) =
            auction::test_auction_outcome_fields(vector::borrow(&outcomes, 0));
        let (refunded_id, _, _, refund_root, refund_leaves) =
            auction::test_auction_outcome_fields(vector::borrow(&outcomes, 1));
        assert!(unwound_id == unwind_window && refunded_id == refund_window, 235);
        assert!(unwind_leaves == 200 && refund_leaves == 200, 236);
        assert!(unwind_root == refund_root, 237);
    }

    // ===================== Lock, auction, unwind (issue 194) =====================

    // Sum of the payout amounts of every LockOutcomeRecorded event of `Asset`.
    fun outcome_total<Asset>(): u256 {
        let events = aptos_framework::event::emitted_events<
            atomica::lock_receipt::LockOutcomeRecorded<atomica::lock_receipt::Ethereum, Asset>
        >();
        let total: u256 = 0;
        let i = 0;
        while (i < vector::length(&events)) {
            let (_, _, _, _, amounts) =
                atomica::lock_receipt::test_lock_outcome_event_fields(vector::borrow(&events, i));
            let j = 0;
            while (j < vector::length(&amounts)) {
                total = total + *vector::borrow(&amounts, j);
                j = j + 1;
            };
            i = i + 1;
        };
        total
    }

    // Two sellers create a window through `create_auction` with locks bound to it, two
    // bidders' collateral is claimed into it, and the key never comes out. At the stuck
    // deadline a stranger unwinds the window: per asset, the outcome amounts sum to the
    // locked amounts, and one AuctionOutcome covers all four locks.
    #[test(atomica = @atomica)]
    fun test_e2e_lock_auction_unwind_returns_every_lock(atomica: &signer) {
        use atomica::auction;
        use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};

        atomica::auction_bid_wrapper_tests::setup();
        auction::init_for_test(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        let pair = auction::launch_pair_bcs();
        let window_id = auction::current_window_id();
        let pair_hash = auction::pair_hash(pair);

        let sellers = vector[@0x5A, @0x5B];
        let seller_locks = vector[b"e2e_seller_lock_a_32bytes_______", b"e2e_seller_lock_b_32bytes_______"];
        let seller_amounts = vector[2_000_000_000_000_000_000u256, 3_000_000_000_000_000_000u256];
        let i = 0;
        while (i < 2) {
            let who = *vector::borrow(&sellers, i);
            let lock_id = *vector::borrow(&seller_locks, i);
            lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
                lock_id, who, *vector::borrow(&seller_amounts, i), window_id, pair_hash,
            );
            let seller = aptos_framework::account::create_signer_for_test(who);
            auction::create_auction(&seller, window_id, pair, lock_id);
            i = i + 1;
        };

        // Collateral claimed as `submit_bid` claims it (the golden ciphertext is bound to
        // another timelock, so the bids are inserted directly).
        let bidders = vector[@0xA11CE, @0xB0B];
        let bid_locks = vector[b"e2e_bid_lock_a_32bytes__________", b"e2e_bid_lock_b_32bytes__________"];
        let bid_amounts = vector[9_000_000_000u256, 4_000_000_000u256];
        let j = 0;
        while (j < 2) {
            let who = *vector::borrow(&bidders, j);
            let lock_id = *vector::borrow(&bid_locks, j);
            lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
                lock_id, who, *vector::borrow(&bid_amounts, j), window_id, pair_hash,
            );
            lock_receipt::claim_for_window<Ethereum, FakeUSD>(who, lock_id, window_id, pair_hash);
            auction::test_insert_bid_with_qty(atomica, window_id, pair, who, lock_id, lock_id, 1);
            j = j + 1;
        };

        timestamp::update_global_time_for_test(auction::get_stuck_deadline_us(window_id, pair));
        let stranger = aptos_framework::account::create_signer_for_test(@0x7777);
        auction::unwind(&stranger, window_id, pair);

        assert!(outcome_total<FakeETH>() == lock_receipt::get_total_locked<Ethereum, FakeETH>(), 1);
        assert!(outcome_total<FakeUSD>() == lock_receipt::get_total_locked<Ethereum, FakeUSD>(), 2);
        assert!(outcome_total<FakeETH>() == 5_000_000_000_000_000_000u256, 3);
        assert!(outcome_total<FakeUSD>() == 13_000_000_000u256, 4);
        let outcomes = aptos_framework::event::emitted_events<auction::AuctionOutcome>();
        assert!(vector::length(&outcomes) == 1, 5);
        let (w, h, _, _, leaf_count) = auction::test_auction_outcome_fields(vector::borrow(&outcomes, 0));
        assert!(w == window_id && h == pair_hash && leaf_count == 4, 6);
    }
}
