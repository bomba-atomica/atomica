#[test_only]
module atomica::integration_tests {
    use std::vector;
    use aptos_framework::timestamp;

    // SCOUT(#218) TEST: unwind_at_both_caps_returns_every_lock (`unwind` exists only in the unwind pull request (213))
    // SCOUT(#218) TEST: refund_at_both_caps_releases_every_lock

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
        let timelock_id = atomica::auction_bid_wrapper_tests::register_live_timelock();

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
            auction::create_auction(&seller, window_id, pair, lock_id, timelock_id);
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
