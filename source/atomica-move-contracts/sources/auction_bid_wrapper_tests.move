// V2 bid wrapper, reveal, expiry and refund tests for `atomica::auction`.
//
// Environment: the framework golden vectors. `bid_ad()` is the associated data of golden
// bid 0: chain id 7, epoch 3, timelock id 11, auction id 5, bidder 0x01..01 (32 bytes) and
// deadline 1_700_000_000_000_000 us. `setup` rebuilds exactly that chain state, so the
// golden ciphertext passes `ibe::verify_bid_ct` through `auction::submit_bid`.
//
// The pairing and AES-GCM wrapper are not opened here: Move cannot decrypt the wrapper. The
// contract opens a bid against its price commitment, so the tests open bids with
// `(price, salt)` pairs they commit to themselves. The golden ciphertext only has to pass
// the submission check.
//
// Design: atomica/docs/decisions/auction-v2-bid-wrapper.md
#[test_only]
module atomica::auction_bid_wrapper_tests {
    use std::vector;
    use aptos_framework::account;
    use aptos_framework::chain_id;
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
    // SCOUT(#218) EDIT: the 5 wei seller locks (SUPPLY) and the 1000-unit FakeUSD receipts of this file are below the proposed minimums; 56 of the 63 tests of this file go through `submit_bid` or `create_auction` and need new amounts.
    const SUPPLY: u256 = 5u256;

    // The launch pair bytes, on the allowlist after `init_module`.
    fun pair(): vector<u8> { auction::launch_pair_bcs() }

    const GOLDEN_LOCK: vector<u8> = b"usd_lock_golden_bidder_32bytes__";
    const SELLER_LOCK: vector<u8> = b"eth_lock_seller_32bytes_________";

    fun golden_bidder(): address {
        @0x0101010101010101010101010101010101010101010101010101010101010101
    }

    fun salt(b: u8): vector<u8> {
        let s = vector::empty<u8>();
        let i = 0;
        while (i < 32) {
            vector::push_back(&mut s, b);
            i = i + 1;
        };
        s
    }

    fun golden_ct(): vector<u8> {
        *vector::borrow(&fixtures::bid_case_cts(), 0)
    }

    // SCOUT(#228) REMOVE: `commitment_for` and `salt` above.
    fun commitment_for(price: u64, s: u8, bidder: address): vector<u8> {
        let ad = auction::bid_associated_data(TIMELOCK_ID, AUCTION_ID, bidder);
        auction::compute_bid_commitment(price, salt(s), ad)
    }

    // SCOUT(#225) EDIT: once the pin holds the fork registrar change, `ibe_config::register_timelock` aborts `E_NOT_REGISTRAR` for the framework signer; `setup` must set a registrar first. This breaks at the first pin bump past that change, whichever product issue makes it.
    // SCOUT(#231) EDIT: if epoch ends become UTC anchored, the epoch config and the golden deadline of `setup` must still pass the 15 minute guard after the pin bump.
    // SCOUT(#243) EDIT: `setup` sets the package's registrar address before any registration.
    // Chain state of the golden bid: chain id 7, epoch 3, timelock id 11 pending with the
    // golden deadline, clock inside auction window 5. Public so `auction_tests` can bind
    // windows to a real registered timelock.
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
        let n = 0;
        while (n < 13) {
            ibe_config::register_timelock(&framework, DEADLINE_US);
            n = n + 1;
        };
        timestamp::update_global_time_for_test(BID_TIME_US);
        framework
    }

    // Registers a timelock whose deadline is 10 minutes after the setup clock, so a window
    // of the setup clock meets the timing order `create_auction` checks (stuck deadline plus
    // carrier margin before `eth_lock_deadline(window_id)`). The golden timelock 11 has a
    // 2023 deadline and fails it. Call after `setup`.
    public fun register_live_timelock(): u64 {
        let framework = account::create_signer_for_test(@0x1);
        ibe_config::register_timelock(&framework, BID_TIME_US + 10 * MIN);
        ibe_config::get_next_timelock_id() - 1
    }

    // The golden bidder's FakeUSD receipt, bound to window AUCTION_ID of `pair()`.
    fun insert_golden_receipt() {
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
            GOLDEN_LOCK, golden_bidder(), 1000u256, AUCTION_ID, auction::pair_hash(pair()),
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

    // SCOUT(#228) EDIT: `submit_golden` passes no commitment; the bid becomes one of the fork's price-plaintext golden ciphertexts.
    // Submits the golden bid committed to `(price, salt(s))` for `quantity` wei.
    fun submit_golden(bidder: &signer, price: u64, s: u8, quantity: u256) {
        auction::submit_bid(
            bidder, AUCTION_ID, pair(), golden_ct(),
            commitment_for(price, s, golden_bidder()),
            GOLDEN_LOCK, quantity,
        );
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

    // SCOUT(#243) EDIT: once the pin holds the fork status change, the status reads expired at the reveal expiry without the `on_new_block_for_testing` call of `expire_reveal_window`.
    // No key by the end of the reveal window: Expired(reveal-window-elapsed).
    fun expire_reveal_window() {
        timestamp::update_global_time_for_test(DEADLINE_US + 10 * MIN);
        ibe_config::on_new_block_for_testing();
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

    // SCOUT(#228) REMOVE: `commitment_known_answer_matches_sdk`, and its twin in the SDK `ibe-bid.test.ts`.
    // Known answer shared with the TypeScript SDK test (`ibe-bid.test.ts`): the commitment of
    // price 2010 with salt 0x07 * 32 under the golden associated data.
    #[test]
    fun commitment_known_answer_matches_sdk() {
        assert!(
            auction::compute_bid_commitment(2010, salt(7), fixtures::bid_ad())
                == x"ad4005855d20995dfe6a36716d9550844b9565ae1a0713f1c0e77128a7b7e8ee",
            1
        );
    }

    // ===================== submit_bid: V2 ciphertext check =====================

    // SCOUT(#228) EDIT: `submit_bid_accepts_the_golden_ciphertext` destructures `get_bid_info`; the tuple loses `commitment`.
    // The bid asks for exactly the window supply, the largest quantity `submit_bid` accepts
    // (see `submit_bid_above_supply_aborts`).
    #[test(atomica = @atomica)]
    fun submit_bid_accepts_the_golden_ciphertext(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);

        assert!(auction::get_bid_count(AUCTION_ID, pair()) == 1, 1);
        assert!(lock_receipt::is_lock_claimed<Ethereum, FakeUSD>(GOLDEN_LOCK), 2);
        let (who, ct, commitment, opened, price, valid) = auction::get_bid_info(AUCTION_ID, pair(), 0);
        assert!(who == golden_bidder(), 3);
        assert!(ct == golden_ct(), 4);
        assert!(commitment == commitment_for(2010, 7, golden_bidder()), 5);
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
            commitment_for(2010, 7, golden_bidder()),
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
            commitment_for(2010, 7, golden_bidder()),
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
            commitment_for(2010, 7, golden_bidder()),
            GOLDEN_LOCK, 5u256,
        );
    }

    // Wrong associated data: the golden ciphertext was made for another bidder.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::auction)] // E_INVALID_CIPHERTEXT
    fun submit_bid_rejects_ciphertext_of_another_bidder(atomica: &signer) {
        setup_window(atomica);
        let thief_addr = @0x7777;
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_thief_32bytes__________", thief_addr, 1000u256, 1);
        let thief = account::create_signer_for_test(thief_addr);
        auction::submit_bid(
            &thief, AUCTION_ID, pair(), golden_ct(),
            auction::compute_bid_commitment(
                2010, salt(7), auction::bid_associated_data(TIMELOCK_ID, AUCTION_ID, thief_addr)
            ),
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
            commitment_for(2010, 7, golden_bidder()),
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
            commitment_for(2010, 7, golden_bidder()),
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
        // SCOUT(#225) EDIT: second direct `register_timelock` of this file; it needs the registrar signer after the pin bump.
        ibe_config::register_timelock(&framework, DEADLINE_US);
        let epoch4_timelock = ibe_config::get_next_timelock_id() - 1;
        assert!(ibe_config::get_timelock_epoch(epoch4_timelock) == 4, 1);
        auction::test_insert_window_with_timelock(atomica, AUCTION_ID, b"epoch4", SUPPLY, false, 0, epoch4_timelock);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID, b"epoch4", golden_ct(),
            commitment_for(2010, 7, golden_bidder()),
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
        submit_golden(&bidder, 2010, 7, SUPPLY);
    }

    // One microsecond before the deadline is accepted.
    #[test(atomica = @atomica)]
    fun submit_bid_accepts_one_microsecond_before_the_deadline(atomica: &signer) {
        setup_window(atomica);
        timestamp::update_global_time_for_test(DEADLINE_US - 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        assert!(auction::get_bid_count(AUCTION_ID, pair()) == 1, 1);
    }

    // A timelock that is no longer Pending takes no bids (epoch ended before the deadline).
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 14, location = atomica::auction)] // E_TIMELOCK_NOT_PENDING
    fun submit_bid_aborts_when_timelock_expired(atomica: &signer) {
        setup_window(atomica);
        expire_epoch_ended();
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
    }

    // A second bid with the same ciphertext is rejected, even with another receipt.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 15, location = atomica::auction)] // E_DUPLICATE_BID
    fun submit_bid_rejects_duplicate_ciphertext(atomica: &signer) {
        setup_window(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_second_32bytes_________", golden_bidder(), 1000u256, 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), golden_ct(),
            commitment_for(2010, 7, golden_bidder()),
            b"usd_lock_second_32bytes_________", 5u256,
        );
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 26, location = atomica::auction)] // E_INVALID_COMMITMENT
    fun submit_bid_rejects_short_commitment(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), golden_ct(), x"00",
            GOLDEN_LOCK, 5u256,
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
        submit_golden(&bidder, 2010, 7, SUPPLY);
    }

    fun bcs_u64(i: u64): vector<u8> {
        aptos_std::bcs::to_bytes(&i)
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 11, location = atomica::auction)] // E_WINDOW_ALREADY_SETTLED
    fun submit_bid_aborts_after_window_settled(atomica: &signer) {
        setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(GOLDEN_LOCK, golden_bidder(), 1000u256, 1);
        auction::test_insert_window_with_timelock(atomica, AUCTION_ID, pair(), SUPPLY, true, 2000, TIMELOCK_ID);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
    }

    // SCOUT(#228) REMOVE: the 23 tests of this file that call `open_bid`, `submit_cleartext_and_clear` or `finalize_reveal` (18 in this section, 3 under "Expiry", 2 under the settle guards); the `open_bids` tests named below replace them.
    // SCOUT(#228) TEST: open_bids_clears_three_golden_price_bids
    // SCOUT(#228) TEST: open_bids_marks_undecryptable_and_wrong_length_bids_invalid
    // SCOUT(#228) TEST: open_bids_in_batches_equals_one_full_call
    // SCOUT(#228) TEST: open_bids_aborts_in_a_wrong_state (pending, expired, refunded, every bid opened)
    // SCOUT(#228) TEST: settle_aborts_until_every_bid_is_opened
    // ===================== Reveal: opening against the commitment =====================

    // Before the registry reveals, nothing opens.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 16, location = atomica::auction)] // E_TIMELOCK_NOT_REVEALED
    fun open_bid_aborts_before_reveal(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        timestamp::update_global_time_for_test(DEADLINE_US);
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
    }

    // The opened price of every bid of the window, from `get_bid_info` (zero when unopened).
    fun bid_prices(): vector<u64> {
        let prices = vector::empty<u64>();
        let i = 0u64;
        let n = auction::get_bid_count(AUCTION_ID, pair());
        while (i < n) {
            let (_, _, _, _, price, _) = auction::get_bid_info(AUCTION_ID, pair(), i);
            vector::push_back(&mut prices, price);
            i = i + 1;
        };
        prices
    }

    #[test(atomica = @atomica)]
    fun open_bid_accepts_the_committed_price_and_finalizes(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        reveal_timelock();

        // Anyone can open: a relayer that decrypted the ciphertext off chain.
        let relayer = account::create_signer_for_test(@0x9999);
        auction::open_bid(&relayer, AUCTION_ID, pair(), 0, 2010, salt(7));

        let (_, _, _, opened, price, _) = auction::get_bid_info(AUCTION_ID, pair(), 0);
        assert!(opened && price == 2010, 1);
        let (_, reveal_final, refunded) = auction::get_window_status(AUCTION_ID, pair());
        assert!(reveal_final && !refunded, 2);
        assert!(bid_prices() == vector[2010u64], 3);
    }

    // A relayer cannot lie about a price: the commitment pins it.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 10, location = atomica::auction)] // E_INVALID_CLEARTEXT
    fun open_bid_rejects_a_wrong_price(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 9999, salt(7));
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 10, location = atomica::auction)] // E_INVALID_CLEARTEXT
    fun open_bid_rejects_a_wrong_salt(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(8));
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 18, location = atomica::auction)] // E_INVALID_SALT
    fun open_bid_rejects_a_short_salt(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, x"07");
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 19, location = atomica::auction)] // E_BID_INDEX_OUT_OF_RANGE
    fun open_bid_rejects_an_unknown_index(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 1, 2010, salt(7));
    }

    // One opening per bid. With two bids the window stays open after the first opening.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 17, location = atomica::auction)] // E_BID_ALREADY_OPENED
    fun open_bid_opens_each_bid_once(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        auction::test_insert_committed_bid(atomica, AUCTION_ID, pair(), @0x2222, b"ct2", x"00", b"lock2", 1u256);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
    }

    // One reveal per timelock: once openings finalize, no opening runs again.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 20, location = atomica::auction)] // E_REVEAL_FINAL
    fun open_bid_aborts_after_the_reveal_is_final(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
        auction::submit_cleartext_and_clear(&bidder, AUCTION_ID, pair(), vector[2010u64], vector[salt(7)]);
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

    // ===================== Bid validity =====================

    // A zero quantity aborts at submission.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 37, location = atomica::auction)] // E_ZERO_QUANTITY
    fun submit_bid_zero_quantity_aborts(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, 0);
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
        submit_golden(&bidder, 2010, 7, total_supply + 1);
    }

    // The golden bid plus a dust-collateral bid for the whole supply at the top price and
    // a small honest bid. The batch call opens all three without abort and finalizes.
    #[test(atomica = @atomica)]
    fun batch_opening_with_invalid_bid_finalizes(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        let max_price = 18_446_744_073_709_551_615u64;
        let dust = @0x2222;
        auction::test_insert_committed_bid(
            atomica, AUCTION_ID, pair(), dust, b"ct2",
            commitment_for(max_price, 9, dust), b"lock2", SUPPLY,
        );
        // The dust bid holds one base unit less than its quote at its own price.
        let quote = auction::quote_for_fill(SUPPLY, max_price);
        assert!(quote == 92_233_720, 1);
        auction::test_set_bid_collateral(atomica, AUCTION_ID, pair(), 1, quote - 1);
        let other = @0x3333;
        auction::test_insert_committed_bid(
            atomica, AUCTION_ID, pair(), other, b"ct3",
            commitment_for(1500, 8, other), b"lock3", 1u256,
        );
        reveal_timelock();

        auction::submit_cleartext_and_clear(
            &bidder, AUCTION_ID, pair(),
            vector[2010u64, max_price, 1500u64], vector[salt(7), salt(9), salt(8)],
        );
        let (_, reveal_final, _) = auction::get_window_status(AUCTION_ID, pair());
        assert!(reveal_final, 2);
        let (_, _, _, opened, _, valid) = auction::get_bid_info(AUCTION_ID, pair(), 1);
        assert!(opened && !valid, 3);
        let invalid = aptos_framework::event::emitted_events<auction::BidInvalid>();
        assert!(vector::length(&invalid) == 1, 4);
        let (window_id, pair_bcs, bid_index, who, reason) =
            auction::test_bid_invalid_fields(vector::borrow(&invalid, 0));
        assert!(window_id == AUCTION_ID && pair_bcs == pair() && bid_index == 1, 5);
        assert!(who == dust && reason == 2, 6);

        // The golden bid takes the whole supply at its own price; the dust bid takes nothing.
        let (_, _, _, _, clearing_price) = auction::get_auction(AUCTION_ID, pair());
        assert!(clearing_price == 2010, 7);
        let results = auction::get_bid_results(AUCTION_ID, pair());
        let (golden_win, golden_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 0));
        assert!(golden_win && golden_fill == SUPPLY, 8);
        let (dust_win, dust_fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 1));
        assert!(!dust_win && dust_fill == 0, 9);
    }

    // A golden bid whose collateral (50 base units) is below its quote at the top price
    // (92,233,720) is invalid. `settle` succeeds and the outcome returns all 50 to the depositor.
    #[test(atomica = @atomica)]
    fun settle_returns_invalid_bid_collateral_to_depositor(atomica: &signer) {
        setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_bound_test_receipt<Ethereum, FakeUSD>(
            GOLDEN_LOCK, golden_bidder(), 50u256, AUCTION_ID, auction::pair_hash(pair()),
        );
        insert_window_with_seller(atomica);
        let max_price = 18_446_744_073_709_551_615u64;
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, max_price, 7, SUPPLY);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, max_price, salt(7));
        let (_, _, _, opened, _, valid) = auction::get_bid_info(AUCTION_ID, pair(), 0);
        assert!(opened && !valid, 1);

        auction::settle(&bidder, AUCTION_ID, pair());
        assert!(auction::is_settled(AUCTION_ID, pair()), 2);
        let (_, _, to, amounts) = lock_receipt::get_lock_outcome<Ethereum, FakeUSD>(GOLDEN_LOCK);
        assert!(to == vector[lock_receipt::test_eth_owner(golden_bidder())], 3);
        assert!(amounts == vector[50u256], 4);
        // No fill: the seller lock goes back to the seller.
        assert!(seller_lock_status() == lock_receipt::status_revoked(), 5);
    }

    // ---- batch entry ----

    #[test(atomica = @atomica)]
    fun batch_open_skips_empty_salts_and_finalizes_when_all_open(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        let other = @0x2222;
        let other_ad = auction::bid_associated_data(TIMELOCK_ID, AUCTION_ID, other);
        auction::test_insert_committed_bid(
            atomica, AUCTION_ID, pair(), other, b"ct2",
            auction::compute_bid_commitment(1500, salt(9), other_ad), b"lock2", 1u256,
        );
        reveal_timelock();

        // First call opens bid 0 only. Bid 1 is skipped with an empty salt.
        auction::submit_cleartext_and_clear(
            &bidder, AUCTION_ID, pair(), vector[2010u64, 0u64], vector[salt(7), vector::empty<u8>()],
        );
        let (_, reveal_final, _) = auction::get_window_status(AUCTION_ID, pair());
        assert!(!reveal_final, 1);

        // Second call skips the opened bid and opens the other: the reveal finalizes.
        auction::submit_cleartext_and_clear(
            &bidder, AUCTION_ID, pair(), vector[0u64, 1500u64], vector[vector::empty<u8>(), salt(9)],
        );
        let (_, reveal_final, _) = auction::get_window_status(AUCTION_ID, pair());
        assert!(reveal_final, 2);
        assert!(bid_prices() == vector[2010u64, 1500u64], 3);
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 9, location = atomica::auction)] // E_CLEARTEXT_COUNT_MISMATCH
    fun batch_open_rejects_a_count_mismatch(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        reveal_timelock();
        auction::submit_cleartext_and_clear(&bidder, AUCTION_ID, pair(), vector[2010u64, 1u64], vector[salt(7)]);
    }

    // A wrong opening aborts the whole batch: no partial state.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 10, location = atomica::auction)] // E_INVALID_CLEARTEXT
    fun batch_open_aborts_on_one_wrong_opening(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        reveal_timelock();
        auction::submit_cleartext_and_clear(&bidder, AUCTION_ID, pair(), vector[2011u64], vector[salt(7)]);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = atomica::auction)] // E_AUCTION_NOT_FOUND
    fun batch_open_aborts_when_auction_not_found() {
        let settler = account::create_signer_for_test(@0x9999);
        auction::submit_cleartext_and_clear(&settler, AUCTION_ID, pair(), vector::empty<u64>(), vector::empty<vector<u8>>());
    }

    // ---- finalize_reveal and unopened bids ----

    // Some bids are unopened: openings stay open until the opening window ends.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 22, location = atomica::auction)] // E_OPENING_WINDOW_OPEN
    fun finalize_reveal_waits_for_the_opening_window(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        auction::test_insert_committed_bid(atomica, AUCTION_ID, pair(), @0x2222, b"ct2", x"00", b"lock2", 1u256);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
        auction::finalize_reveal(&bidder, AUCTION_ID, pair());
    }

    // After the opening window an unopened bid is invalid: it never fills and settle returns
    // its collateral to the depositor.
    #[test(atomica = @atomica)]
    fun unopened_bid_is_invalid_and_its_collateral_goes_home(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        let ghost_lock = b"usd_lock_ghost_32bytes__________";
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(ghost_lock, @0x2222, 1000u256, 1);
        lock_receipt::claim<Ethereum, FakeUSD>(@0x2222, ghost_lock);
        auction::test_insert_committed_bid(atomica, AUCTION_ID, pair(), @0x2222, b"ct2", x"00", ghost_lock, 5u256);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));

        // Opening window: reveal_expiry (deadline + 10 min) plus 10 min.
        timestamp::update_global_time_for_test(DEADLINE_US + 20 * MIN);
        auction::finalize_reveal(&bidder, AUCTION_ID, pair());
        assert!(bid_prices() == vector[2010u64, 0u64], 1);

        auction::clear_uniform_price(AUCTION_ID, pair());
        let results = auction::test_get_bid_results(AUCTION_ID, pair());
        let (win0, fill0, price0) = auction::test_bid_result_fields(vector::borrow(&results, 0));
        let (win1, fill1, _) = auction::test_bid_result_fields(vector::borrow(&results, 1));
        assert!(win0 && fill0 == 5 && price0 == 2010, 2);
        assert!(!win1 && fill1 == 0, 3);

        auction::settle(&bidder, AUCTION_ID, pair());
        assert!(auction::is_settled(AUCTION_ID, pair()), 4);
        // The ghost bid never opened: its collateral goes back to its depositor.
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeUSD>(ghost_lock) == lock_receipt::status_revoked(), 5);
    }

    // With no valid bid at all nobody wins, even when invalid bids exist.
    #[test(atomica = @atomica)]
    fun clearing_with_only_unopened_bids_has_no_winner(atomica: &signer) {
        setup_window(atomica);
        let caller = account::create_signer_for_test(@0x9999);
        auction::test_insert_committed_bid(atomica, AUCTION_ID, pair(), @0x2222, b"ct2", x"00", b"lock2", 5u256);
        reveal_timelock();
        timestamp::update_global_time_for_test(DEADLINE_US + 20 * MIN);
        auction::finalize_reveal(&caller, AUCTION_ID, pair());
        auction::clear_uniform_price(AUCTION_ID, pair());
        let results = auction::test_get_bid_results(AUCTION_ID, pair());
        let (win, fill, _) = auction::test_bid_result_fields(vector::borrow(&results, 0));
        assert!(!win && fill == 0, 1);
    }

    // Clearing needs closed openings when the window has bids.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 21, location = atomica::auction)] // E_REVEAL_NOT_FINAL
    fun clearing_aborts_before_the_reveal_is_final(atomica: &signer) {
        setup_window(atomica);
        auction::test_insert_committed_bid(atomica, AUCTION_ID, pair(), @0x2222, b"ct2", x"00", b"lock2", 5u256);
        auction::clear_uniform_price(AUCTION_ID, pair());
    }

    // ---- clearing runs when the reveal finalizes (decision D3) ----

    // Two bids on a supply of 5: the golden bid (2010, qty 5) and a second bid (1500, qty 1)
    // whose collateral receipt is real and claimed, so `settle` can release it.
    fun setup_two_bid_window(atomica: &signer): signer {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        let other = @0x2222;
        let other_lock = b"usd_lock_other_bidder_32bytes___";
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(other_lock, other, 1000u256, 1);
        lock_receipt::claim<Ethereum, FakeUSD>(other, other_lock);
        let other_ad = auction::bid_associated_data(TIMELOCK_ID, AUCTION_ID, other);
        auction::test_insert_committed_bid(
            atomica, AUCTION_ID, pair(), other, b"ct2",
            auction::compute_bid_commitment(1500, salt(9), other_ad), other_lock, 1u256,
        );
        reveal_timelock();
        bidder
    }

    // Opening every bid in one batch call finalizes the reveal and clears in that call.
    // `settle` then succeeds with no `clear_uniform_price` call.
    #[test(atomica = @atomica)]
    fun batch_open_of_every_bid_clears_and_settle_needs_no_clearing_call(atomica: &signer) {
        let bidder = setup_two_bid_window(atomica);
        let (_, _, _, _, before) = auction::get_auction(AUCTION_ID, pair());
        assert!(before == 0 && auction::test_get_bid_results(AUCTION_ID, pair()).length() == 0, 1);

        auction::submit_cleartext_and_clear(
            &bidder, AUCTION_ID, pair(), vector[2010u64, 1500u64], vector[salt(7), salt(9)],
        );

        let (_, reveal_final, _) = auction::get_window_status(AUCTION_ID, pair());
        assert!(reveal_final, 2);
        let (_, _, _, _, clearing_price) = auction::get_auction(AUCTION_ID, pair());
        assert!(clearing_price == 2010, 3);
        let results = auction::test_get_bid_results(AUCTION_ID, pair());
        assert!(results.length() == 2, 4);
        let (win0, fill0, price0) = auction::test_bid_result_fields(vector::borrow(&results, 0));
        let (win1, fill1, _) = auction::test_bid_result_fields(vector::borrow(&results, 1));
        assert!(win0 && fill0 == 5 && price0 == 2010, 5);
        assert!(!win1 && fill1 == 0, 6);

        auction::settle(&bidder, AUCTION_ID, pair());
        assert!(auction::is_settled(AUCTION_ID, pair()), 7);
        assert!(
            lock_receipt::get_receipt_status<Ethereum, FakeUSD>(b"usd_lock_other_bidder_32bytes___")
                == lock_receipt::status_revoked(),
            8,
        );
    }

    // finalize_reveal on a partly opened window clears it: the unopened bid gets no fill.
    #[test(atomica = @atomica)]
    fun finalize_reveal_clears_a_partly_opened_window(atomica: &signer) {
        let bidder = setup_two_bid_window(atomica);
        // Open only the second bid. The golden bid stays unopened.
        auction::open_bid(&bidder, AUCTION_ID, pair(), 1, 1500, salt(9));
        timestamp::update_global_time_for_test(DEADLINE_US + 20 * MIN);
        auction::finalize_reveal(&bidder, AUCTION_ID, pair());

        let (_, _, _, _, clearing_price) = auction::get_auction(AUCTION_ID, pair());
        assert!(clearing_price == 1500, 1);
        let results = auction::test_get_bid_results(AUCTION_ID, pair());
        assert!(results.length() == 2, 2);
        let (win0, fill0, _) = auction::test_bid_result_fields(vector::borrow(&results, 0));
        let (win1, fill1, price1) = auction::test_bid_result_fields(vector::borrow(&results, 1));
        assert!(!win0 && fill0 == 0, 3);
        assert!(win1 && fill1 == 1 && price1 == 1500, 4);

        auction::settle(&bidder, AUCTION_ID, pair());
        assert!(auction::is_settled(AUCTION_ID, pair()), 5);
    }

    // clear_uniform_price on an already-cleared window does not abort and changes nothing.
    #[test(atomica = @atomica)]
    fun clear_uniform_price_is_a_no_op_on_a_cleared_window(atomica: &signer) {
        let bidder = setup_two_bid_window(atomica);
        auction::submit_cleartext_and_clear(
            &bidder, AUCTION_ID, pair(), vector[2010u64, 1500u64], vector[salt(7), salt(9)],
        );
        let (_, _, _, _, price_before) = auction::get_auction(AUCTION_ID, pair());
        let results_before = auction::test_get_bid_results(AUCTION_ID, pair());

        auction::clear_uniform_price(AUCTION_ID, pair());
        auction::clear_uniform_price(AUCTION_ID, pair());

        let (_, _, _, _, price_after) = auction::get_auction(AUCTION_ID, pair());
        assert!(price_after == price_before && price_after == 2010, 1);
        assert!(auction::test_get_bid_results(AUCTION_ID, pair()) == results_before, 2);
    }

    // ===================== Expiry: no reveal after Expired =====================

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 27, location = atomica::auction)] // E_TIMELOCK_EXPIRED
    fun open_bid_is_impossible_after_reveal_window_elapsed(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        expire_reveal_window();
        assert!(timelock::get_status(TIMELOCK_ID) == timelock::status_expired(), 1);
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 27, location = atomica::auction)] // E_TIMELOCK_EXPIRED
    fun open_bid_is_impossible_after_epoch_ended(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        expire_epoch_ended();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 27, location = atomica::auction)] // E_TIMELOCK_EXPIRED
    fun batch_open_is_impossible_after_key_check_failed(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
        expire_key_check_failed();
        auction::submit_cleartext_and_clear(&bidder, AUCTION_ID, pair(), vector[2010u64], vector[salt(7)]);
    }

    // SCOUT(#243) EDIT: `setup_funded_window` below binds the golden timelock 11 through `create_auction`; that stops working. The unwind pull request (213) already replaces the call with a test insert.
    // ===================== Refund after Expired =====================

    // A window with one seller lock and one bid submitted through `submit_bid`.
    fun setup_funded_window(atomica: &signer): signer {
        let framework = setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        insert_golden_receipt();
        insert_window_with_seller(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
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
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_late_32bytes___________", golden_bidder(), 1000u256, 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), golden_ct(),
            commitment_for(2010, 7, golden_bidder()),
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
        assert!(r == vector[lock_receipt::test_eth_owner(golden_bidder())] && a == vector[1000u256], 2);
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
            GOLDEN_LOCK, golden_bidder(), 1000u256, AUCTION_ID + 1, auction::pair_hash(pair()),
        );
        insert_window_with_seller(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7, SUPPLY);
    }

    // ===================== settle and create_auction guards =====================
    //
    // Regression tests for review finding 6 (`docs/code-reviews/aptos-1-49-6-upgrade-review.md`,
    // task T2.4): `settle` had no timelock or deadline check and passed with 0 bids, and
    // `create_auction` accepted an unregistered timelock. The `review_` tests replay those
    // attacks and pin the abort code that now stops each one.


    // The published auction package (registry and pair allowlist), lock registries, and one
    // FakeETH seller receipt of 5 at @atomica.
    fun setup_seller_receipt(atomica: &signer) {
        auction::init_for_test(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(SELLER_LOCK, @atomica, 5u256, 1);
    }

    // SCOUT(#243) EDIT: `create_with_timelock` cannot pick a timelock by id any more; the five `create_auction_rejects_*` and `review_create_auction_*` tests below need a new shape.
    fun create_with_timelock(atomica: &signer, timelock_id: u64) {
        auction::create_auction(
            atomica, auction::current_window_id(), pair(), SELLER_LOCK, timelock_id,
        );
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

    // SCOUT(#243) REMOVE: `review_create_auction_unregistered_timelock_aborts`; with no caller-supplied id the attack has no entry point.
    // Attack: bind a window to a timelock id the registry never issued (setup issues 0 to 12).
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 28, location = atomica::auction)] // E_TIMELOCK_NOT_REGISTERED
    fun review_create_auction_unregistered_timelock_aborts(atomica: &signer) {
        setup();
        setup_seller_receipt(atomica);
        create_with_timelock(atomica, 13);
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
    #[test(atomica = @atomica)]
    fun settle_without_fill_releases_the_seller_lock(atomica: &signer) {
        setup_funded_window(atomica);
        reveal_timelock();
        timestamp::update_global_time_for_test(DEADLINE_US + 20 * MIN);
        let caller = account::create_signer_for_test(@0x9999);
        auction::finalize_reveal(&caller, AUCTION_ID, pair());
        auction::clear_uniform_price(AUCTION_ID, pair());
        auction::settle(&caller, AUCTION_ID, pair());
        assert!(seller_lock_status() == lock_receipt::status_revoked(), 1);
    }

    // A filled window marks the seller lock filled: the supply goes to the winner.
    #[test(atomica = @atomica)]
    fun settle_with_fill_marks_the_seller_lock_filled(atomica: &signer) {
        setup_funded_window(atomica);
        reveal_timelock();
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
        auction::clear_uniform_price(AUCTION_ID, pair());
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
        create_with_timelock(atomica, TIMELOCK_ID);
    }

    // create_auction: the timelock is no longer Pending.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 14, location = atomica::auction)] // E_TIMELOCK_NOT_PENDING
    fun create_auction_rejects_a_revealed_timelock(atomica: &signer) {
        setup();
        setup_seller_receipt(atomica);
        reveal_timelock();
        create_with_timelock(atomica, TIMELOCK_ID);
    }

    // create_auction: the deadline has passed, so the window could take no bids.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 30, location = atomica::auction)] // E_TIMELOCK_DEADLINE_PASSED
    fun create_auction_rejects_a_passed_deadline(atomica: &signer) {
        setup();
        setup_seller_receipt(atomica);
        timestamp::update_global_time_for_test(DEADLINE_US);
        create_with_timelock(atomica, TIMELOCK_ID);
    }

    // SCOUT(#243) EDIT: in `create_auction_rejects_a_missing_registry` the abort then comes from the framework registration, not from `E_TIMELOCK_NOT_REGISTERED`.
    // create_auction: no timelock registry at all.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 28, location = atomica::auction)] // E_TIMELOCK_NOT_REGISTERED
    fun create_auction_rejects_a_missing_registry(atomica: &signer) {
        let framework = account::create_signer_for_test(@0x1);
        timestamp::set_time_has_started_for_testing(&framework);
        setup_seller_receipt(atomica);
        create_with_timelock(atomica, 0);
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
