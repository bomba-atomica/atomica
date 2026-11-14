// V2 bid wrapper, reveal, expiry and refund tests for `atomica::auction`.
//
// Environment: the framework golden vectors. `bid_ad()` is the associated data of golden
// bid 0: chain id 7, epoch 3, timelock id 11, auction id 5, bidder 0x01..01 (32 bytes) and
// deadline 1_700_000_000_000_000 us. `setup` rebuilds exactly that chain state, so the
// golden ciphertext passes `ibe::verify_bid_ct` through `auction::submit_bid`.
//
// The price bids of the fork's golden vectors (version 3.1.0, `price_bid_*`) carry the
// 8-byte little-endian price as plaintext. They are bound to auction id 9 and open with the
// golden key through `auction::open_bids`, which calls the fork native `ibe::decrypt_bid`.
// Golden bid 0 of window 5 opens to a 21-byte plaintext, so `open_bids` marks it invalid.
//
// Design: atomica/docs/decisions/auction-v2-bid-wrapper.md
#[test_only]
module atomica::auction_bid_wrapper_tests {
    use std::vector;
    use aptos_framework::account;
    use aptos_framework::chain_id;
    use aptos_framework::event;
    use aptos_framework::ibe_config;
    use aptos_framework::ibe_golden_vector_fixtures as fixtures;
    use aptos_framework::reconfiguration;
    use aptos_framework::timestamp;
    use aptos_std::ibe;
    use atomica::auction;
    use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};
    use atomica::timelock;

    const MIN: u64 = 60_000_000;
    const DEADLINE_US: u64 = 1_700_000_000_000_000;
    // 216_000 s (day 2, 12:00 UTC) falls in window 5 (2 * 2 + 1), which runs from
    // 200_700 s to 231_300 s. AUCTION_ID 5 is bound into the golden ciphertext.
    const BID_TIME_US: u64 = 216_000_000_000;
    const EPOCH_INTERVAL_US: u64 = 2_000_000_000_000_000;
    const TIMELOCK_ID: u64 = 11;
    const AUCTION_ID: u64 = 5;
    // The seller lock is the minimum seller lock (0.01 FakeETH). A FakeUSD receipt holds
    // COLLATERAL (1000 FakeUSD), above the minimum bid collateral (10 FakeUSD).
    const SUPPLY: u256 = 10_000_000_000_000_000;
    const COLLATERAL: u256 = 1_000_000_000;
    // The minimum bid collateral, `auction::get_window_limits` field 4.
    const MIN_COLLATERAL: u256 = 10_000_000;

    // The launch pair bytes, on the allowlist after `init_module`.
    fun pair(): vector<u8> { auction::launch_pair_bcs() }

    const GOLDEN_LOCK: vector<u8> = b"usd_lock_golden_bidder_32bytes__";
    const SELLER_LOCK: vector<u8> = b"eth_lock_seller_32bytes_________";

    fun golden_bidder(): address {
        @0x0101010101010101010101010101010101010101010101010101010101010101
    }

    fun golden_ct(): vector<u8> {
        *vector::borrow(&fixtures::bid_case_cts(), 0)
    }

    // SCOUT(#231) EDIT: if epoch ends become UTC anchored, the epoch config and the golden deadline of `setup` must still pass the 15 minute guard after the pin bump.
    // Chain state of the golden bid: chain id 7, epoch 3, timelock id 11 pending with the
    // golden deadline, clock inside auction window 5. Public so `auction_tests` can bind
    // windows to a real registered timelock. The framework signer registers the golden
    // timelocks as a temporary registrar; `setup` then names the auction package's registrar
    // object, so `create_auction` registers each window timelock as on a live chain.
    public fun setup(): signer {
        let framework = account::create_signer_for_test(@0x1);
        account::create_account_for_test(@aptos_framework);
        timestamp::set_time_has_started_for_testing(&framework);
        chain_id::initialize_for_test(&framework, 7);
        reconfiguration::initialize_for_test(&framework);
        ibe_config::initialize(&framework);
        let t = 1;
        while (t <= 3) {
            timestamp::update_global_time_for_test(t * MIN);
            reconfiguration::reconfigure_for_test_custom();
            t = t + 1;
        };
        ibe_config::set_epoch_config_for_testing(
            &framework, 3, fixtures::timelock_basic_mpk(), 3, vector[2, 1, 2], EPOCH_INTERVAL_US,
        );
        ibe_config::set_timelock_registrar(&framework, @aptos_framework);
        let n = 0;
        while (n < 13) {
            ibe_config::register_timelock(&framework, DEADLINE_US);
            n = n + 1;
        };
        ibe_config::set_timelock_registrar(&framework, auction::timelock_registrar_address());
        timestamp::update_global_time_for_test(BID_TIME_US);
        framework
    }

    // Registers a timelock whose deadline is 10 minutes after the setup clock, outside
    // `create_auction`, with the framework signer as a temporary registrar. The package's
    // registrar is restored afterwards. Call after `setup`.
    public fun register_live_timelock(): u64 {
        let framework = account::create_signer_for_test(@0x1);
        ibe_config::set_timelock_registrar(&framework, @aptos_framework);
        ibe_config::register_timelock(&framework, BID_TIME_US + 10 * MIN);
        ibe_config::set_timelock_registrar(&framework, auction::timelock_registrar_address());
        ibe_config::get_next_timelock_id() - 1
    }

    // The golden bidder's FakeUSD receipt, bound to window AUCTION_ID of `pair()`.
    fun insert_golden_receipt() {
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
            GOLDEN_LOCK, golden_bidder(), COLLATERAL, AUCTION_ID, auction::pair_hash(pair()),
        );
    }

    // A test window bound to timelock 11 holding one claimed seller lock of SUPPLY.
    // `create_auction` cannot make it: timelock 11 fails the timing order (see
    // `register_live_timelock`).
    fun insert_window_with_seller(atomica: &signer) {
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
            SELLER_LOCK, @atomica, SUPPLY, AUCTION_ID, auction::pair_hash(pair()),
        );
        lock_receipt::claim<Ethereum, FakeETH>(@atomica, SELLER_LOCK);
        auction::test_insert_window_with_timelock(atomica, AUCTION_ID, pair(), SUPPLY, false, 0, TIMELOCK_ID);
        auction::test_add_seller_lock(atomica, AUCTION_ID, pair(), SELLER_LOCK);
    }

    // Registry plus an auction window bound to timelock 11 with one seller lock, and one
    // FakeUSD receipt of the golden bidder. Receipt registries live at @atomica.
    fun setup_window(atomica: &signer): signer {
        let framework = setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        insert_golden_receipt();
        insert_window_with_seller(atomica);
        framework
    }

    // Submits golden bid 0 of window 5 for `quantity` wei. It passes the submission check.
    // Its plaintext is not an 8-byte price, so `open_bids` marks it invalid.
    fun submit_golden(bidder: &signer, quantity: u256) {
        auction::submit_bid(bidder, AUCTION_ID, pair(), golden_ct(), GOLDEN_LOCK, quantity);
    }

    // ---- registry drivers ----

    fun shares(n: u64): vector<vector<u8>> {
        let out = vector[];
        let i = 0;
        while (i < n) {
            out.push_back(x"aa");
            i = i + 1;
        };
        out
    }

    // Deadline passes, validators reach the threshold, the key checks out: status Revealed.
    public fun reveal_timelock() {
        timestamp::update_global_time_for_test(DEADLINE_US);
        ibe_config::submit_dk_shares_for_testing(TIMELOCK_ID, shares(2), 0, @0xB0, 3);
        ibe_config::submit_dk_shares_for_testing(TIMELOCK_ID, shares(1), 1, @0xB1, 3);
        assert!(ibe_config::finalize_for_testing(TIMELOCK_ID, fixtures::timelock_basic_reconstructed_dk()), 900);
    }

    // The key check fails: status Expired(key-check-failed).
    fun expire_key_check_failed() {
        timestamp::update_global_time_for_test(DEADLINE_US);
        ibe_config::submit_dk_shares_for_testing(TIMELOCK_ID, shares(2), 0, @0xB0, 3);
        ibe_config::submit_dk_shares_for_testing(TIMELOCK_ID, shares(1), 1, @0xB1, 3);
        assert!(!ibe_config::finalize_for_testing(TIMELOCK_ID, x"00"), 901);
    }

    // No key by the end of the reveal window: Expired(reveal-window-elapsed). The status
    // reads expired from the reveal expiry on, with no block queue step.
    fun expire_reveal_window() {
        timestamp::update_global_time_for_test(DEADLINE_US + 10 * MIN);
    }

    // The epoch changes before the reveal: Expired(epoch-ended).
    fun expire_epoch_ended() {
        timestamp::update_global_time_for_test(DEADLINE_US - MIN);
        reconfiguration::reconfigure_for_test_custom();
    }

    // ===================== Fixtures against the chain =====================

    // The on-chain associated data equals the golden `bid_ad()` byte for byte.
    #[test(atomica = @atomica)]
    fun associated_data_matches_golden_vector(atomica: &signer) {
        setup_window(atomica);
        let ad = auction::bid_associated_data(TIMELOCK_ID, AUCTION_ID, golden_bidder());
        assert!(ad == fixtures::bid_ad(), 1);
        assert!(ibe::verify_bid_ct(golden_ct(), ad), 2);
    }

    // ===================== submit_bid: V2 ciphertext check =====================

    // The bid asks for exactly the window supply, the largest quantity `submit_bid` accepts
    // (see `submit_bid_above_supply_aborts`).
    #[test(atomica = @atomica)]
    fun submit_bid_accepts_the_golden_ciphertext(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);

        assert!(auction::get_bid_count(AUCTION_ID, pair()) == 1, 1);
        assert!(lock_receipt::is_lock_claimed<Ethereum, FakeUSD>(GOLDEN_LOCK), 2);
        let (who, ct, opened, price, valid) = auction::get_bid_info(AUCTION_ID, pair(), 0);
        assert!(who == golden_bidder(), 3);
        assert!(ct == golden_ct(), 4);
        assert!(!opened && price == 0, 6);
        assert!(valid, 7);
    }

    // Malformed ciphertext: a flipped byte in the golden ciphertext.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::auction)] // E_INVALID_CIPHERTEXT
    fun submit_bid_rejects_flipped_byte(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        let bad = *vector::borrow(&fixtures::bid_case_cts(), 2);
        assert!(!*vector::borrow(&fixtures::bid_case_verifies(), 2), 1);
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), bad,
            GOLDEN_LOCK, 5u256,
        );
    }

    // Malformed ciphertext: truncated.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::auction)] // E_INVALID_CIPHERTEXT
    fun submit_bid_rejects_truncated_ciphertext(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        let bad = *vector::borrow(&fixtures::bid_case_cts(), 13);
        assert!(!*vector::borrow(&fixtures::bid_case_verifies(), 13), 1);
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), bad,
            GOLDEN_LOCK, 5u256,
        );
    }

    // Malformed ciphertext: empty.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::auction)] // E_INVALID_CIPHERTEXT
    fun submit_bid_rejects_empty_ciphertext(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), vector::empty<u8>(),
            GOLDEN_LOCK, 5u256,
        );
    }

    // Wrong associated data: the golden ciphertext was made for another bidder.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::auction)] // E_INVALID_CIPHERTEXT
    fun submit_bid_rejects_ciphertext_of_another_bidder(atomica: &signer) {
        setup_window(atomica);
        let thief_addr = @0x7777;
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_thief_32bytes__________", thief_addr, COLLATERAL, 1);
        let thief = account::create_signer_for_test(thief_addr);
        auction::submit_bid(
            &thief, AUCTION_ID, pair(), golden_ct(),
            b"usd_lock_thief_32bytes__________", 5u256,
        );
    }

    // Wrong associated data: the golden ciphertext was made for auction id 5.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::auction)] // E_INVALID_CIPHERTEXT
    fun submit_bid_rejects_ciphertext_of_another_auction(atomica: &signer) {
        setup_window(atomica);
        auction::test_insert_window_with_timelock(atomica, AUCTION_ID + 1, pair(), SUPPLY, false, 0, TIMELOCK_ID);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID + 1, pair(), golden_ct(),
            GOLDEN_LOCK, 5u256,
        );
    }

    // Wrong associated data: the golden ciphertext was made for timelock 11.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::auction)] // E_INVALID_CIPHERTEXT
    fun submit_bid_rejects_ciphertext_of_another_timelock(atomica: &signer) {
        setup_window(atomica);
        // Timelock 12 has the same epoch and deadline. Only its id differs.
        auction::test_insert_window_with_timelock(atomica, AUCTION_ID + 1, pair(), SUPPLY, false, 0, TIMELOCK_ID + 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID + 1, pair(), golden_ct(),
            GOLDEN_LOCK, 5u256,
        );
    }

    // Wrong associated data: another epoch. A timelock of epoch 3 is registered, then the
    // registry moves on; a timelock registered in epoch 4 carries epoch 4 in its AD.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::auction)] // E_INVALID_CIPHERTEXT
    fun submit_bid_rejects_ciphertext_of_another_epoch(atomica: &signer) {
        let framework = setup_window(atomica);
        timestamp::update_global_time_for_test(BID_TIME_US + MIN);
        reconfiguration::reconfigure_for_test_custom();
        ibe_config::set_epoch_config_for_testing(
            &framework, 4, fixtures::timelock_basic_mpk(), 3, vector[2, 1, 2], EPOCH_INTERVAL_US,
        );
        ibe_config::set_timelock_registrar(&framework, @aptos_framework);
        ibe_config::register_timelock(&framework, DEADLINE_US);
        let epoch4_timelock = ibe_config::get_next_timelock_id() - 1;
        assert!(ibe_config::get_timelock_epoch(epoch4_timelock) == 4, 1);
        auction::test_insert_window_with_timelock(atomica, AUCTION_ID, b"epoch4", SUPPLY, false, 0, epoch4_timelock);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID, b"epoch4", golden_ct(),
            GOLDEN_LOCK, 5u256,
        );
    }

    // ---- other submission rules ----

    // A bid at the deadline is too late. The registry is still Pending then.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 13, location = atomica::auction)] // E_BID_AFTER_DEADLINE
    fun submit_bid_aborts_at_the_deadline(atomica: &signer) {
        setup_window(atomica);
        timestamp::update_global_time_for_test(DEADLINE_US);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);
    }

    // One microsecond before the deadline is accepted.
    #[test(atomica = @atomica)]
    fun submit_bid_accepts_one_microsecond_before_the_deadline(atomica: &signer) {
        setup_window(atomica);
        timestamp::update_global_time_for_test(DEADLINE_US - 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);
        assert!(auction::get_bid_count(AUCTION_ID, pair()) == 1, 1);
    }

    // A timelock that is no longer Pending takes no bids (epoch ended before the deadline).
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 14, location = atomica::auction)] // E_TIMELOCK_NOT_PENDING
    fun submit_bid_aborts_when_timelock_expired(atomica: &signer) {
        setup_window(atomica);
        expire_epoch_ended();
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);
    }

    // A second bid with the same ciphertext is rejected, even with another receipt.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 15, location = atomica::auction)] // E_DUPLICATE_BID
    fun submit_bid_rejects_duplicate_ciphertext(atomica: &signer) {
        setup_window(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_second_32bytes_________", golden_bidder(), COLLATERAL, 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), golden_ct(),
            b"usd_lock_second_32bytes_________", 5u256,
        );
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 25, location = atomica::auction)] // E_WINDOW_FULL
    fun submit_bid_aborts_when_window_is_full(atomica: &signer) {
        setup_window(atomica);
        let i = 0;
        while (i < 100) {
            auction::test_insert_bid(atomica, AUCTION_ID, pair(), @0x1234, bcs_u64(i), b"lock");
            i = i + 1;
        };
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);
    }

    fun bcs_u64(i: u64): vector<u8> {
        aptos_std::bcs::to_bytes(&i)
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 11, location = atomica::auction)] // E_WINDOW_ALREADY_SETTLED
    fun submit_bid_aborts_after_window_settled(atomica: &signer) {
        setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(GOLDEN_LOCK, golden_bidder(), COLLATERAL, 1);
        auction::test_insert_window_with_timelock(atomica, AUCTION_ID, pair(), SUPPLY, true, 2000, TIMELOCK_ID);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);
    }

    // ===================== Bid validity at submission =====================

    // A zero quantity aborts at submission.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 37, location = atomica::auction)] // E_ZERO_QUANTITY
    fun submit_bid_zero_quantity_aborts(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 0);
    }

    // One wei above the window supply aborts at submission. A bid of exactly the supply
    // succeeds: `submit_bid_accepts_the_golden_ciphertext` submits SUPPLY. The golden
    // ciphertext can be submitted once per window, so the two cases are separate tests.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 38, location = atomica::auction)] // E_QUANTITY_ABOVE_SUPPLY
    fun submit_bid_above_supply_aborts(atomica: &signer) {
        setup_window(atomica);
        let (_, total_supply, _, _, _) = auction::get_auction(AUCTION_ID, pair());
        assert!(total_supply == SUPPLY, 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, total_supply + 1);
    }

    // A window with one seller lock, and a golden receipt holding `collateral` FakeUSD units.
    fun setup_window_with_collateral(atomica: &signer, collateral: u256) {
        setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
            GOLDEN_LOCK, golden_bidder(), collateral, AUCTION_ID, auction::pair_hash(pair()),
        );
        insert_window_with_seller(atomica);
    }

    // Collateral one base unit below the minimum bid collateral aborts at submission.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 41, location = atomica::auction)] // E_COLLATERAL_TOO_SMALL
    fun submit_bid_below_min_collateral_aborts(atomica: &signer) {
        let (_, _, _, min_collateral) = auction::get_window_limits();
        assert!(min_collateral == MIN_COLLATERAL, 1);
        setup_window_with_collateral(atomica, MIN_COLLATERAL - 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 1);
    }

    // Collateral exactly at the minimum bid collateral is accepted.
    #[test(atomica = @atomica)]
    fun submit_bid_at_min_collateral_succeeds(atomica: &signer) {
        setup_window_with_collateral(atomica, MIN_COLLATERAL);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 1);
        assert!(auction::get_bid_count(AUCTION_ID, pair()) == 1, 1);
        assert!(lock_receipt::is_lock_claimed<Ethereum, FakeUSD>(GOLDEN_LOCK), 2);
    }

    // The registry never reopens: a revealed timelock stays revealed after its window, and a
    // second reveal aborts in the registry.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 11, location = aptos_framework::ibe_config)] // E_NOT_PENDING
    fun registry_reveals_a_timelock_once(atomica: &signer) {
        setup_window(atomica);
        reveal_timelock();
        assert!(timelock::get_status(TIMELOCK_ID) == timelock::status_revealed(), 1);
        expire_reveal_window();
        assert!(timelock::get_status(TIMELOCK_ID) == timelock::status_revealed(), 2);
        assert!(timelock::get_expiry_reason(TIMELOCK_ID) == 0, 3);
        ibe_config::finalize_for_testing(TIMELOCK_ID, fixtures::timelock_basic_reconstructed_dk());
    }

    // ===================== open_bids and finalize_window =====================
    //
    // The price window is window 9 bound to timelock 11, as the fork's price bids are. It
    // holds 3 ETH of supply. The price bids ask 1, 2 and 2 ETH at the fixture prices
    // 1_000_000, 2_500_000_000 and 7_000_000_000_000. Sorted by price: 0xc3 fills 2 ETH,
    // 0xb2 takes the last 1 ETH and sets the clearing price 2_500_000_000, 0xa1 loses.

    const PRICE_WINDOW: u64 = 9;
    const ETH: u256 = 1_000_000_000_000_000_000;
    const PRICE_SUPPLY: u256 = 3_000_000_000_000_000_000;
    const PRICE_SELLER_LOCK: vector<u8> = b"eth_lock_price_seller_32bytes___";
    const PRICE_COLLATERAL: u256 = 100_000_000_000_000_000_000;
    const EXPECTED_CLEARING_PRICE: u64 = 2_500_000_000;
    const MAX_OPEN_BIDS: u64 = 12;
    const U64_MAX: u64 = 18_446_744_073_709_551_615;

    fun price_quantities(): vector<u256> { vector[ETH, 2 * ETH, 2 * ETH] }

    // The 32-byte collateral lock id of bidder index `i` (0 to 3).
    fun price_lock(i: u64): vector<u8> {
        let id = b"usd_lock_price_bidder_32bytes__";
        vector::push_back(&mut id, (48 + i as u8));
        id
    }

    // The price window with its claimed seller lock, inside the `setup` chain state.
    fun insert_price_window(atomica: &signer) {
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeETH>(
            PRICE_SELLER_LOCK, @atomica, PRICE_SUPPLY, PRICE_WINDOW, auction::pair_hash(pair()),
        );
        lock_receipt::claim<Ethereum, FakeETH>(@atomica, PRICE_SELLER_LOCK);
        auction::test_insert_window_with_timelock(
            atomica, PRICE_WINDOW, pair(), PRICE_SUPPLY, false, 0, TIMELOCK_ID,
        );
        auction::test_add_seller_lock(atomica, PRICE_WINDOW, pair(), PRICE_SELLER_LOCK);
    }

    // Submits a ciphertext of the fork's price section through `submit_bid` from `bidder`.
    fun submit_price_ct(bidder: address, ct: vector<u8>, lock_index: u64, quantity: u256) {
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
            price_lock(lock_index), bidder, PRICE_COLLATERAL, PRICE_WINDOW, auction::pair_hash(pair()),
        );
        let signer = account::create_signer_for_test(bidder);
        auction::submit_bid(&signer, PRICE_WINDOW, pair(), ct, price_lock(lock_index), quantity);
    }

    // `setup` plus the price window holding the three golden price bids, submitted through
    // `submit_bid`, and the timelock revealed.
    fun setup_price_bids(atomica: &signer) {
        setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        insert_price_window(atomica);
        let bidders = fixtures::price_bid_bidders();
        let cts = fixtures::price_bid_cts();
        let i = 0;
        while (i < 3) {
            submit_price_ct(*bidders.borrow(i), *cts.borrow(i), i, *price_quantities().borrow(i));
            i = i + 1;
        };
        reveal_timelock();
    }

    // The price window of `setup_price_bids` with `n` more bids whose ciphertexts do not
    // decrypt, inserted with the test helper.
    fun insert_junk_bids(atomica: &signer, n: u64) {
        let i = 0;
        while (i < n) {
            auction::test_insert_bid_with_qty(
                atomica, PRICE_WINDOW, pair(), @0x7000, bcs_u64(i), b"junk", 1u256,
            );
            i = i + 1;
        };
    }

    fun open_cursor(): (u64, u64) {
        auction::get_open_cursor(PRICE_WINDOW, pair())
    }

    fun relayer(): signer {
        account::create_signer_for_test(@0x9999)
    }

    // Every price bid is opened at its fixture price and valid.
    fun assert_price_bids_opened() {
        let prices = fixtures::price_bid_prices();
        let i = 0;
        while (i < 3) {
            let (who, _, opened, price, valid) = auction::get_bid_info(PRICE_WINDOW, pair(), i);
            assert!(who == *fixtures::price_bid_bidders().borrow(i), 100 + i);
            assert!(opened && valid, 110 + i);
            assert!(price == *prices.borrow(i), 120 + i);
            i = i + 1;
        };
    }

    // The window is final and cleared as the fixtures predict: 0xc3 fills 2 ETH, 0xb2 the
    // last 1 ETH at 2_500_000_000, 0xa1 nothing.
    fun assert_price_window_cleared() {
        let (_, reveal_final, _) = auction::get_window_status(PRICE_WINDOW, pair());
        assert!(reveal_final, 130);
        let (_, _, _, _, clearing_price) = auction::get_auction(PRICE_WINDOW, pair());
        assert!(clearing_price == EXPECTED_CLEARING_PRICE, 131);
        let results = auction::get_bid_results(PRICE_WINDOW, pair());
        let (w0, f0, p0) = auction::test_bid_result_fields(results.borrow(0));
        let (w1, f1, p1) = auction::test_bid_result_fields(results.borrow(1));
        let (w2, f2, p2) = auction::test_bid_result_fields(results.borrow(2));
        assert!(!w0 && f0 == 0, 132);
        assert!(w1 && f1 == ETH && p1 == EXPECTED_CLEARING_PRICE, 133);
        assert!(w2 && f2 == 2 * ETH && p2 == EXPECTED_CLEARING_PRICE, 134);
        assert!(p0 == EXPECTED_CLEARING_PRICE, 135);
    }

    // Three golden price bids from three bidders: a relayer that bid nothing opens them in
    // one `open_bids` call and clears with `finalize_window`.
    #[test(atomica = @atomica)]
    fun open_bids_then_finalize_window_clears_three_golden_price_bids(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), MAX_OPEN_BIDS);
        assert_price_bids_opened();
        auction::finalize_window(&relayer(), PRICE_WINDOW, pair());
        assert_price_window_cleared();
        assert!(event::emitted_events<auction::BidInvalid>().length() == 0, 1);
    }

    // The call that opens the last bid only moves the cursor: nothing is final or cleared.
    // `settle` still aborts (`settle_aborts_until_every_bid_is_opened_and_the_window_is_finalized_*`)
    // and so does another `open_bids` (`open_bids_aborts_in_a_wrong_state_every_bid_opened`).
    #[test(atomica = @atomica)]
    fun open_bids_does_not_clear_the_window(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 2);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 2);
        let (next, total) = open_cursor();
        assert!(next == 3 && total == 3, 1);
        let (_, reveal_final, _) = auction::get_window_status(PRICE_WINDOW, pair());
        assert!(!reveal_final, 2);
        assert!(auction::get_bid_results(PRICE_WINDOW, pair()).length() == 0, 3);
        let (_, _, _, _, clearing_price) = auction::get_auction(PRICE_WINDOW, pair());
        assert!(clearing_price == 0, 4);
    }

    // Once every bid is opened, a relayer's `finalize_window` sets `reveal_final` and fills
    // the bid results at the expected clearing price.
    #[test(atomica = @atomica)]
    fun finalize_window_clears_after_all_bids_opened(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 3);
        auction::finalize_window(&relayer(), PRICE_WINDOW, pair());
        assert_price_window_cleared();
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 44, location = atomica::auction)] // E_BIDS_NOT_ALL_OPENED
    fun finalize_window_clears_after_all_bids_opened_aborts_while_a_bid_is_unopened(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 2);
        auction::finalize_window(&relayer(), PRICE_WINDOW, pair());
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 20, location = atomica::auction)] // E_REVEAL_FINAL
    fun finalize_window_clears_after_all_bids_opened_aborts_on_a_second_call(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 3);
        auction::finalize_window(&relayer(), PRICE_WINDOW, pair());
        auction::finalize_window(&relayer(), PRICE_WINDOW, pair());
    }

    // Golden case 11 (re-signed body: it verifies but does not decrypt) in window 5, and the
    // bad-length price case (11-byte plaintext) in the price window. Both are invalid with
    // reason 3, never fill, and neither aborts `open_bids`. The honest price bids still clear.
    #[test(atomica = @atomica)]
    fun open_bids_marks_undecryptable_and_wrong_length_bids_invalid(atomica: &signer) {
        setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        insert_golden_receipt();
        insert_window_with_seller(atomica);
        insert_price_window(atomica);
        // Window 5: golden case 11.
        assert!(*fixtures::bid_case_verifies().borrow(11), 1);
        assert!(!*fixtures::bid_case_opens().borrow(11), 2);
        let golden = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &golden, AUCTION_ID, pair(), *fixtures::bid_case_cts().borrow(11), GOLDEN_LOCK, SUPPLY,
        );
        // Price window: the three price bids, then the bad-length bid.
        let bidders = fixtures::price_bid_bidders();
        let cts = fixtures::price_bid_cts();
        let i = 0;
        while (i < 3) {
            submit_price_ct(*bidders.borrow(i), *cts.borrow(i), i, *price_quantities().borrow(i));
            i = i + 1;
        };
        let bad_bidder = @0xd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4;
        assert!(
            auction::bid_associated_data(TIMELOCK_ID, PRICE_WINDOW, bad_bidder) == fixtures::bad_length_bid_ad(),
            3,
        );
        submit_price_ct(bad_bidder, fixtures::bad_length_bid_ct(), 3, PRICE_SUPPLY);
        reveal_timelock();

        auction::open_bids(&relayer(), AUCTION_ID, pair(), MAX_OPEN_BIDS);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), MAX_OPEN_BIDS);

        let (_, _, opened, price, valid) = auction::get_bid_info(AUCTION_ID, pair(), 0);
        assert!(opened && price == 0 && !valid, 4);
        let (_, _, opened, price, valid) = auction::get_bid_info(PRICE_WINDOW, pair(), 3);
        assert!(opened && price == 0 && !valid, 5);
        assert_price_bids_opened();

        let events = event::emitted_events<auction::BidInvalid>();
        assert!(events.length() == 2, 6);
        let (w0, _, i0, b0, r0) = auction::test_bid_invalid_fields(events.borrow(0));
        assert!(w0 == AUCTION_ID && i0 == 0 && b0 == golden_bidder() && r0 == 3, 7);
        let (w1, _, i1, b1, r1) = auction::test_bid_invalid_fields(events.borrow(1));
        assert!(w1 == PRICE_WINDOW && i1 == 3 && b1 == bad_bidder && r1 == 3, 8);

        auction::finalize_window(&relayer(), AUCTION_ID, pair());
        let results = auction::get_bid_results(AUCTION_ID, pair());
        let (win, fill, _) = auction::test_bid_result_fields(results.borrow(0));
        assert!(!win && fill == 0, 9);

        // The bad-length bid asks for the whole supply. It takes nothing.
        auction::finalize_window(&relayer(), PRICE_WINDOW, pair());
        assert_price_window_cleared();
        let results = auction::get_bid_results(PRICE_WINDOW, pair());
        let (win, fill, _) = auction::test_bid_result_fields(results.borrow(3));
        assert!(!win && fill == 0, 10);
    }

    // Opening one bid per call, then the rest, ends in the same bid states and clearing as
    // one full call (`open_bids_then_finalize_window_clears_three_golden_price_bids`).
    #[test(atomica = @atomica)]
    fun open_bids_in_batches_equals_one_full_call(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 1);
        let (_, _, opened, _, _) = auction::get_bid_info(PRICE_WINDOW, pair(), 1);
        assert!(!opened, 1);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 1);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 1);
        assert_price_bids_opened();
        auction::finalize_window(&relayer(), PRICE_WINDOW, pair());
        assert_price_window_cleared();
    }

    // Before the reveal nothing opens.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 16, location = atomica::auction)] // E_TIMELOCK_NOT_REVEALED
    fun open_bids_aborts_in_a_wrong_state_pending(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);
        timestamp::update_global_time_for_test(DEADLINE_US);
        auction::open_bids(&relayer(), AUCTION_ID, pair(), MAX_OPEN_BIDS);
    }

    // An expired timelock never releases a key.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 27, location = atomica::auction)] // E_TIMELOCK_EXPIRED
    fun open_bids_aborts_in_a_wrong_state_expired(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);
        expire_key_check_failed();
        auction::open_bids(&relayer(), AUCTION_ID, pair(), MAX_OPEN_BIDS);
    }

    // A refunded window opens nothing.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 24, location = atomica::auction)] // E_WINDOW_REFUNDED
    fun open_bids_aborts_in_a_wrong_state_refunded(atomica: &signer) {
        setup_funded_window(atomica);
        expire_reveal_window();
        assert_refunded(2);
        auction::open_bids(&relayer(), AUCTION_ID, pair(), MAX_OPEN_BIDS);
    }

    // Every bid is opened: another call aborts, before and after `finalize_window`.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 20, location = atomica::auction)] // E_REVEAL_FINAL
    fun open_bids_aborts_in_a_wrong_state_every_bid_opened(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), MAX_OPEN_BIDS);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), MAX_OPEN_BIDS);
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 20, location = atomica::auction)] // E_REVEAL_FINAL
    fun open_bids_aborts_in_a_wrong_state_finalized(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), MAX_OPEN_BIDS);
        auction::finalize_window(&relayer(), PRICE_WINDOW, pair());
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), MAX_OPEN_BIDS);
    }

    // `settle` aborts while bids are unopened.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 21, location = atomica::auction)] // E_REVEAL_NOT_FINAL
    fun settle_aborts_until_every_bid_is_opened_and_the_window_is_finalized_unopened(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 1);
        auction::settle(&relayer(), PRICE_WINDOW, pair());
    }

    // `settle` aborts with every bid opened before `finalize_window`.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 21, location = atomica::auction)] // E_REVEAL_NOT_FINAL
    fun settle_aborts_until_every_bid_is_opened_and_the_window_is_finalized_opened(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), MAX_OPEN_BIDS);
        auction::settle(&relayer(), PRICE_WINDOW, pair());
    }

    // After `finalize_window`, `settle` succeeds: the winners fill and the loser's
    // collateral goes back to its depositor.
    #[test(atomica = @atomica)]
    fun settle_aborts_until_every_bid_is_opened_and_the_window_is_finalized_then_settles(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), MAX_OPEN_BIDS);
        auction::finalize_window(&relayer(), PRICE_WINDOW, pair());
        auction::settle(&relayer(), PRICE_WINDOW, pair());
        assert!(auction::is_settled(PRICE_WINDOW, pair()), 1);
        assert!(
            lock_receipt::get_receipt_status<Ethereum, FakeUSD>(price_lock(0)) == lock_receipt::status_revoked(),
            2,
        );
        assert!(
            lock_receipt::get_receipt_status<Ethereum, FakeUSD>(price_lock(2)) == lock_receipt::status_filled(),
            3,
        );
        assert!(
            lock_receipt::get_receipt_status<Ethereum, FakeETH>(PRICE_SELLER_LOCK) == lock_receipt::status_filled(),
            4,
        );
    }

    #[test(atomica = @atomica)]
    fun get_open_cursor_tracks_batches(atomica: &signer) {
        setup_price_bids(atomica);
        let (next, total) = open_cursor();
        assert!(next == 0 && total == 3, 1);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 2);
        let (next, total) = open_cursor();
        assert!(next == 2 && total == 3, 2);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 2);
        let (next, total) = open_cursor();
        assert!(next == 3 && total == 3, 3);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = atomica::auction)] // E_AUCTION_NOT_FOUND
    fun get_open_cursor_aborts_for_an_unknown_window() {
        setup();
        auction::get_open_cursor(PRICE_WINDOW, pair());
    }

    // Five bids opened with `max_bids = 3`: two calls, two `BidsOpened` events.
    #[test(atomica = @atomica)]
    fun open_bids_emits_one_bids_opened_event_per_call(atomica: &signer) {
        setup_price_bids(atomica);
        insert_junk_bids(atomica, 2);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 3);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), 3);
        let events = event::emitted_events<auction::BidsOpened>();
        assert!(events.length() == 2, 1);
        let (w0, p0, from0, to0) = auction::test_bids_opened_fields(events.borrow(0));
        assert!(w0 == PRICE_WINDOW && p0 == pair() && from0 == 0 && to0 == 3, 2);
        let (w1, p1, from1, to1) = auction::test_bids_opened_fields(events.borrow(1));
        assert!(w1 == PRICE_WINDOW && p1 == pair() && from1 == 3 && to1 == 5, 3);
    }

    // A window of MAX + 1 bids that do not decrypt: `max_bids = u64::MAX` opens MAX of them
    // without aborting. A bid that does not decrypt still moves the cursor.
    #[test(atomica = @atomica)]
    fun open_bids_clamps_max_bids_above_the_cap(atomica: &signer) {
        setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        insert_price_window(atomica);
        insert_junk_bids(atomica, MAX_OPEN_BIDS + 1);
        reveal_timelock();
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), U64_MAX);
        let (next, total) = open_cursor();
        assert!(next == MAX_OPEN_BIDS && total == MAX_OPEN_BIDS + 1, 1);
        assert!(auction::get_max_open_bids() == MAX_OPEN_BIDS, 2);
    }

    // The fork test `largest_decrypt_batch_fits_max_execution_gas` (decrypt native issue 227,
    // fork revision 245937376b) asserts B = 13 decrypts fit `max_execution_gas` and 14 do not;
    // the doc of `ibe::decrypt_bid` names it ("largest batch: 13"). The cap is B - 1.
    #[test]
    fun max_open_bids_is_one_below_the_decrypt_batch_limit() {
        let largest_decrypt_batch = 13;
        assert!(auction::get_max_open_bids() == largest_decrypt_batch - 1, 1);
        assert!(auction::get_max_open_bids() == 12, 2);
    }

    // ---- clearing and unopened bids ----

    // Clearing needs a finalized window when the window has bids.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 21, location = atomica::auction)] // E_REVEAL_NOT_FINAL
    fun clearing_aborts_before_the_reveal_is_final(atomica: &signer) {
        setup_window(atomica);
        auction::test_insert_bid_with_qty(atomica, AUCTION_ID, pair(), @0x2222, b"ct2", b"lock2", 5u256);
        auction::clear_uniform_price(AUCTION_ID, pair());
    }

    // clear_uniform_price on an already-cleared window does not abort and changes nothing.
    #[test(atomica = @atomica)]
    fun clear_uniform_price_is_a_no_op_on_a_cleared_window(atomica: &signer) {
        setup_price_bids(atomica);
        auction::open_bids(&relayer(), PRICE_WINDOW, pair(), MAX_OPEN_BIDS);
        auction::finalize_window(&relayer(), PRICE_WINDOW, pair());
        let results_before = auction::get_bid_results(PRICE_WINDOW, pair());

        auction::clear_uniform_price(PRICE_WINDOW, pair());
        auction::clear_uniform_price(PRICE_WINDOW, pair());

        let (_, _, _, _, price_after) = auction::get_auction(PRICE_WINDOW, pair());
        assert!(price_after == EXPECTED_CLEARING_PRICE, 1);
        assert!(auction::get_bid_results(PRICE_WINDOW, pair()) == results_before, 2);
    }

    // ===================== Refund after Expired =====================

    // A window with one seller lock and one bid submitted through `submit_bid`.
    fun setup_funded_window(atomica: &signer): signer {
        let framework = setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        insert_golden_receipt();
        insert_window_with_seller(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);
        framework
    }

    fun assert_refunded(reason: u8) {
        let caller = account::create_signer_for_test(@0x9999);
        assert!(timelock::get_status(TIMELOCK_ID) == timelock::status_expired(), 1);
        assert!(timelock::get_expiry_reason(TIMELOCK_ID) == reason, 2);
        auction::refund_expired_window(&caller, AUCTION_ID, pair());
        let (_, _, refunded) = auction::get_window_status(AUCTION_ID, pair());
        assert!(refunded, 3);
        let revoked = lock_receipt::status_revoked();
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeUSD>(GOLDEN_LOCK) == revoked, 4);
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeETH>(SELLER_LOCK) == revoked, 5);
    }

    // The relayer reads the seller and collateral lock ids of a refunded window.
    #[test(atomica = @atomica)]
    fun window_lock_ids_name_seller_and_collateral_locks(atomica: &signer) {
        setup_funded_window(atomica);
        expire_epoch_ended();
        assert_refunded(1);
        let (seller_ids, collateral_ids) = auction::get_window_lock_ids(AUCTION_ID, pair());
        assert!(seller_ids == vector[SELLER_LOCK], 10);
        assert!(collateral_ids == vector[GOLDEN_LOCK], 11);
    }

    #[test(atomica = @atomica)]
    fun refund_after_epoch_ended(atomica: &signer) {
        setup_funded_window(atomica);
        expire_epoch_ended();
        assert_refunded(1);
    }

    #[test(atomica = @atomica)]
    fun refund_after_reveal_window_elapsed(atomica: &signer) {
        setup_funded_window(atomica);
        expire_reveal_window();
        assert_refunded(2);
    }

    #[test(atomica = @atomica)]
    fun refund_after_key_check_failed(atomica: &signer) {
        setup_funded_window(atomica);
        expire_key_check_failed();
        assert_refunded(3);
    }

    // Refund works once: a second call aborts.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 24, location = atomica::auction)] // E_WINDOW_REFUNDED
    fun refund_runs_once(atomica: &signer) {
        setup_funded_window(atomica);
        expire_reveal_window();
        assert_refunded(2);
        let caller = account::create_signer_for_test(@0x9999);
        auction::refund_expired_window(&caller, AUCTION_ID, pair());
    }

    // No refund while the timelock is pending.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 23, location = atomica::auction)] // E_TIMELOCK_NOT_EXPIRED
    fun refund_aborts_while_pending(atomica: &signer) {
        setup_funded_window(atomica);
        let caller = account::create_signer_for_test(@0x9999);
        auction::refund_expired_window(&caller, AUCTION_ID, pair());
    }

    // No refund once the key is out: bids are opened instead.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 23, location = atomica::auction)] // E_TIMELOCK_NOT_EXPIRED
    fun refund_aborts_after_reveal(atomica: &signer) {
        setup_funded_window(atomica);
        reveal_timelock();
        let caller = account::create_signer_for_test(@0x9999);
        auction::refund_expired_window(&caller, AUCTION_ID, pair());
    }

    // A refunded window takes no bids, openings, clearing or settlement.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 24, location = atomica::auction)] // E_WINDOW_REFUNDED
    fun refunded_window_cannot_settle(atomica: &signer) {
        setup_funded_window(atomica);
        expire_reveal_window();
        assert_refunded(2);
        let caller = account::create_signer_for_test(@0x9999);
        auction::settle(&caller, AUCTION_ID, pair());
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 24, location = atomica::auction)] // E_WINDOW_REFUNDED
    fun refunded_window_cannot_clear(atomica: &signer) {
        setup_funded_window(atomica);
        expire_reveal_window();
        assert_refunded(2);
        auction::clear_uniform_price(AUCTION_ID, pair());
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 24, location = atomica::auction)] // E_WINDOW_REFUNDED
    fun refunded_window_takes_no_bids(atomica: &signer) {
        setup_funded_window(atomica);
        expire_reveal_window();
        assert_refunded(2);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_late_32bytes___________", golden_bidder(), COLLATERAL, 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), golden_ct(),
            b"usd_lock_late_32bytes___________", 5u256,
        );
    }

    // A window refunded by refund_expired_window already has every outcome: each receipt
    // returns its whole amount to its depositor, and one all-refund AuctionOutcome covers
    // both locks. Unwind after the stuck deadline finds nothing held.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 34, location = atomica::auction)] // E_WINDOW_FINAL
    fun unwind_after_refund(atomica: &signer) {
        setup_funded_window(atomica);
        expire_reveal_window();
        assert_refunded(2);
        let revoked = lock_receipt::status_revoked();
        let (k, w, r, a) = lock_receipt::get_lock_outcome<Ethereum, FakeUSD>(GOLDEN_LOCK);
        assert!(k == revoked && w == AUCTION_ID, 1);
        assert!(r == vector[lock_receipt::test_eth_owner(golden_bidder())] && a == vector[COLLATERAL], 2);
        let (k, _, r, a) = lock_receipt::get_lock_outcome<Ethereum, FakeETH>(SELLER_LOCK);
        assert!(k == revoked && r == vector[lock_receipt::test_eth_owner(@atomica)] && a == vector[SUPPLY], 3);
        let outcomes = aptos_framework::event::emitted_events<auction::AuctionOutcome>();
        assert!(vector::length(&outcomes) == 1, 4);
        let (_, _, _, _, leaf_count) = auction::test_auction_outcome_fields(vector::borrow(&outcomes, 0));
        assert!(leaf_count == 2, 5);

        timestamp::update_global_time_for_test(auction::get_stuck_deadline_us(AUCTION_ID, pair()));
        let caller = account::create_signer_for_test(@0x9999);
        auction::unwind(&caller, AUCTION_ID, pair());
    }

    // Collateral bound to another window cannot back a bid here.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::lock_receipt)] // E_WRONG_BINDING
    fun submit_bid_rejects_collateral_bound_to_another_window(atomica: &signer) {
        setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
            GOLDEN_LOCK, golden_bidder(), COLLATERAL, AUCTION_ID + 1, auction::pair_hash(pair()),
        );
        insert_window_with_seller(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, SUPPLY);
    }

    // ===================== settle and create_auction guards =====================
    //
    // Regression tests for review finding 6 (`docs/code-reviews/aptos-1-49-6-upgrade-review.md`,
    // task T2.4): `settle` had no timelock or deadline check and passed with 0 bids, and
    // `create_auction` accepted an unregistered timelock. The `review_` tests replay those
    // attacks and pin the abort code that now stops each one. `create_auction` now takes no
    // timelock id: it registers the window id's timelock itself, so the unregistered-timelock
    // attack has no entry point.


    // The published auction package (registry and pair allowlist), lock registries, and one
    // FakeETH seller receipt of SUPPLY at @atomica.
    fun setup_seller_receipt(atomica: &signer) {
        auction::init_for_test(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(SELLER_LOCK, @atomica, SUPPLY, 1);
    }

    // A seller joins the current window id after its timelock was stored as `timelock_id`.
    // A window of another pair stores it, as if an earlier seller had registered it, so
    // `create_auction` checks the stored timelock instead of registering one.
    fun join_window_bound_to(atomica: &signer, timelock_id: u64) {
        let window_id = auction::current_window_id();
        auction::test_insert_window_with_timelock(atomica, window_id, b"earlier", SUPPLY, false, 0, timelock_id);
        auction::create_auction(atomica, window_id, pair(), SELLER_LOCK);
    }

    // A window with one seller lock and no bids.
    fun setup_empty_window(atomica: &signer) {
        setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        insert_window_with_seller(atomica);
    }

    fun seller_lock_status(): u8 {
        lock_receipt::get_receipt_status<Ethereum, FakeETH>(SELLER_LOCK)
    }

    // Attack: settle an empty window in the block after create_auction. It would block all
    // bids and strand the seller lock.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 31, location = atomica::auction)] // E_DEADLINE_NOT_PASSED
    fun review_settle_empty_window_before_deadline_aborts(atomica: &signer) {
        setup_empty_window(atomica);
        let attacker = account::create_signer_for_test(@0xBAD);
        auction::settle(&attacker, AUCTION_ID, pair());
    }

    // Past the deadline the key is not out yet: settle waits for the reveal.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 16, location = atomica::auction)] // E_TIMELOCK_NOT_REVEALED
    fun review_settle_pending_timelock_after_deadline_aborts(atomica: &signer) {
        setup_empty_window(atomica);
        timestamp::update_global_time_for_test(DEADLINE_US);
        let attacker = account::create_signer_for_test(@0xBAD);
        auction::settle(&attacker, AUCTION_ID, pair());
    }

    // An expired timelock goes through refund_expired_window, never settle.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 27, location = atomica::auction)] // E_TIMELOCK_EXPIRED
    fun review_settle_expired_timelock_aborts(atomica: &signer) {
        setup_funded_window(atomica);
        expire_reveal_window();
        let attacker = account::create_signer_for_test(@0xBAD);
        auction::settle(&attacker, AUCTION_ID, pair());
    }

    // With bids, settle needs closed openings even after the reveal.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 21, location = atomica::auction)] // E_REVEAL_NOT_FINAL
    fun review_settle_bids_before_reveal_final_aborts(atomica: &signer) {
        setup_funded_window(atomica);
        reveal_timelock();
        let attacker = account::create_signer_for_test(@0xBAD);
        auction::settle(&attacker, AUCTION_ID, pair());
    }

    // Empty-auction rule: after the reveal an empty window settles and the seller lock goes
    // back to the seller.
    #[test(atomica = @atomica)]
    fun settle_empty_window_releases_the_seller_lock(atomica: &signer) {
        setup_empty_window(atomica);
        assert!(seller_lock_status() == lock_receipt::status_claimed(), 1);
        reveal_timelock();
        let caller = account::create_signer_for_test(@0x9999);
        auction::clear_uniform_price(AUCTION_ID, pair());
        auction::settle(&caller, AUCTION_ID, pair());
        assert!(auction::is_settled(AUCTION_ID, pair()), 2);
        assert!(seller_lock_status() == lock_receipt::status_revoked(), 3);
    }

    // No valid bid fills: the seller lock goes back to the seller even though bids exist.
    // Golden bid 0 opens to a 21-byte plaintext, so it is invalid.
    #[test(atomica = @atomica)]
    fun settle_without_fill_releases_the_seller_lock(atomica: &signer) {
        setup_funded_window(atomica);
        reveal_timelock();
        let caller = account::create_signer_for_test(@0x9999);
        auction::open_bids(&caller, AUCTION_ID, pair(), 1);
        auction::finalize_window(&caller, AUCTION_ID, pair());
        auction::clear_uniform_price(AUCTION_ID, pair());
        auction::settle(&caller, AUCTION_ID, pair());
        assert!(seller_lock_status() == lock_receipt::status_revoked(), 1);
    }

    // A filled window marks the seller lock filled: the supply goes to the winner. The test
    // helper stands in for the decryption of the bid to the price 2010.
    #[test(atomica = @atomica)]
    fun settle_with_fill_marks_the_seller_lock_filled(atomica: &signer) {
        setup_funded_window(atomica);
        reveal_timelock();
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::test_open_with_plaintexts(AUCTION_ID, pair(), vector[auction::test_price_plaintext(2010)]);
        auction::finalize_window(&bidder, AUCTION_ID, pair());
        auction::settle(&bidder, AUCTION_ID, pair());
        assert!(auction::is_settled(AUCTION_ID, pair()), 1);
        assert!(seller_lock_status() == lock_receipt::status_filled(), 2);
    }

    // create_auction: the timelock was registered in an earlier epoch.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 29, location = atomica::auction)] // E_TIMELOCK_WRONG_EPOCH
    fun create_auction_rejects_a_timelock_of_an_earlier_epoch(atomica: &signer) {
        setup();
        setup_seller_receipt(atomica);
        expire_epoch_ended();
        join_window_bound_to(atomica, TIMELOCK_ID);
    }

    // create_auction: the timelock is no longer Pending.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 14, location = atomica::auction)] // E_TIMELOCK_NOT_PENDING
    fun create_auction_rejects_a_revealed_timelock(atomica: &signer) {
        setup();
        setup_seller_receipt(atomica);
        reveal_timelock();
        join_window_bound_to(atomica, TIMELOCK_ID);
    }

    // create_auction: the deadline has passed, so the window could take no bids.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 30, location = atomica::auction)] // E_TIMELOCK_DEADLINE_PASSED
    fun create_auction_rejects_a_passed_deadline(atomica: &signer) {
        setup();
        setup_seller_receipt(atomica);
        timestamp::update_global_time_for_test(DEADLINE_US);
        join_window_bound_to(atomica, TIMELOCK_ID);
    }

    // create_auction: no timelock registry and no registrar at all. The framework
    // registration refuses first.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 17, location = aptos_framework::ibe_config)] // E_NOT_REGISTRAR
    fun create_auction_rejects_a_missing_registry(atomica: &signer) {
        let framework = account::create_signer_for_test(@0x1);
        timestamp::set_time_has_started_for_testing(&framework);
        setup_seller_receipt(atomica);
        auction::create_auction(atomica, auction::current_window_id(), pair(), SELLER_LOCK);
    }

    // ===================== timelock facade =====================

    #[test(atomica = @atomica)]
    fun timelock_facade_reports_status_and_reasons(atomica: &signer) {
        setup_window(atomica);
        assert!(timelock::get_status(TIMELOCK_ID) == 0, 1);
        assert!(!timelock::is_timelock_expired(TIMELOCK_ID), 2);
        assert!(!timelock::is_deadline_passed(TIMELOCK_ID), 3);
        assert!(timelock::get_timelock_epoch(TIMELOCK_ID) == 3, 4);
        assert!(timelock::get_deadline(TIMELOCK_ID) == DEADLINE_US, 5);

        // The deadline passing is not expiry.
        timestamp::update_global_time_for_test(DEADLINE_US);
        assert!(timelock::is_deadline_passed(TIMELOCK_ID), 6);
        assert!(!timelock::is_timelock_expired(TIMELOCK_ID), 7);

        expire_reveal_window();
        assert!(timelock::is_timelock_expired(TIMELOCK_ID), 8);
        assert!(timelock::get_expiry_reason(TIMELOCK_ID) == 2, 9);
    }
}
