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
    // 120_000 s falls in window 5 (2 * 2 + 1).
    const BID_TIME_US: u64 = 120_000_000_000;
    const EPOCH_INTERVAL_US: u64 = 2_000_000_000_000_000;
    const TIMELOCK_ID: u64 = 11;
    const AUCTION_ID: u64 = 5;
    const SUPPLY: u256 = 5u256;

    fun pair(): vector<u8> { b"eth-fakeusd" }

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

    fun commitment_for(price: u64, s: u8, bidder: address): vector<u8> {
        let ad = auction::bid_associated_data(TIMELOCK_ID, AUCTION_ID, bidder);
        auction::compute_bid_commitment(price, salt(s), ad)
    }

    // Chain state of the golden bid: chain id 7, epoch 3, timelock id 11 pending with the
    // golden deadline, clock inside auction window 5.
    fun setup(): signer {
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

    // Registry plus an auction window bound to timelock 11 and one FakeUSD receipt of the
    // golden bidder. Receipt registries live at @atomica.
    fun setup_window(atomica: &signer): signer {
        let framework = setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_golden_bidder_32bytes___", golden_bidder(), 1000u256, 1);
        auction::test_insert_window_with_timelock(atomica, AUCTION_ID, pair(), SUPPLY, false, 0, TIMELOCK_ID);
        framework
    }

    fun submit_golden(bidder: &signer, price: u64, s: u8) {
        auction::submit_bid(
            bidder, AUCTION_ID, pair(), golden_ct(),
            commitment_for(price, s, golden_bidder()),
            b"usd_lock_golden_bidder_32bytes___", 5u256,
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
    fun reveal_timelock() {
        timestamp::update_global_time_for_test(DEADLINE_US);
        ibe_config::submit_dk_shares_for_testing(TIMELOCK_ID, shares(2), 0, @0xB0, 3);
        ibe_config::submit_dk_shares_for_testing(TIMELOCK_ID, shares(1), 1, @0xB1, 3);
        assert!(ibe_config::finalize_for_testing(TIMELOCK_ID, fixtures::timelock_basic_reconstructed_dk(), true), 900);
    }

    // The key check fails: status Expired(key-check-failed).
    fun expire_key_check_failed() {
        timestamp::update_global_time_for_test(DEADLINE_US);
        ibe_config::submit_dk_shares_for_testing(TIMELOCK_ID, shares(2), 0, @0xB0, 3);
        ibe_config::submit_dk_shares_for_testing(TIMELOCK_ID, shares(1), 1, @0xB1, 3);
        assert!(!ibe_config::finalize_for_testing(TIMELOCK_ID, fixtures::timelock_basic_reconstructed_dk(), false), 901);
    }

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

    #[test(atomica = @atomica)]
    fun submit_bid_accepts_the_golden_ciphertext(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);

        assert!(auction::get_bid_count(AUCTION_ID, pair()) == 1, 1);
        assert!(lock_receipt::is_lock_claimed<Ethereum, FakeUSD>(b"usd_lock_golden_bidder_32bytes___"), 2);
        let (who, ct, commitment, opened, price) = auction::get_bid_info(AUCTION_ID, pair(), 0);
        assert!(who == golden_bidder(), 3);
        assert!(ct == golden_ct(), 4);
        assert!(commitment == commitment_for(2010, 7, golden_bidder()), 5);
        assert!(!opened && price == 0, 6);
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
            b"usd_lock_golden_bidder_32bytes___", 5u256,
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
            b"usd_lock_golden_bidder_32bytes___", 5u256,
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
            b"usd_lock_golden_bidder_32bytes___", 5u256,
        );
    }

    // Wrong associated data: the golden ciphertext was made for another bidder.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 12, location = atomica::auction)] // E_INVALID_CIPHERTEXT
    fun submit_bid_rejects_ciphertext_of_another_bidder(atomica: &signer) {
        setup_window(atomica);
        let thief_addr = @0x7777;
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_thief_32bytes_________", thief_addr, 1000u256, 1);
        let thief = account::create_signer_for_test(thief_addr);
        auction::submit_bid(
            &thief, AUCTION_ID, pair(), golden_ct(),
            auction::compute_bid_commitment(
                2010, salt(7), auction::bid_associated_data(TIMELOCK_ID, AUCTION_ID, thief_addr)
            ),
            b"usd_lock_thief_32bytes_________", 5u256,
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
            b"usd_lock_golden_bidder_32bytes___", 5u256,
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
            b"usd_lock_golden_bidder_32bytes___", 5u256,
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
        ibe_config::register_timelock(&framework, DEADLINE_US);
        let epoch4_timelock = ibe_config::get_next_timelock_id() - 1;
        assert!(ibe_config::get_timelock_epoch(epoch4_timelock) == 4, 1);
        auction::test_insert_window_with_timelock(atomica, AUCTION_ID, b"epoch4", SUPPLY, false, 0, epoch4_timelock);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID, b"epoch4", golden_ct(),
            commitment_for(2010, 7, golden_bidder()),
            b"usd_lock_golden_bidder_32bytes___", 5u256,
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
        submit_golden(&bidder, 2010, 7);
    }

    // One microsecond before the deadline is accepted.
    #[test(atomica = @atomica)]
    fun submit_bid_accepts_one_microsecond_before_the_deadline(atomica: &signer) {
        setup_window(atomica);
        timestamp::update_global_time_for_test(DEADLINE_US - 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        assert!(auction::get_bid_count(AUCTION_ID, pair()) == 1, 1);
    }

    // A timelock that is no longer Pending takes no bids (epoch ended before the deadline).
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 14, location = atomica::auction)] // E_TIMELOCK_NOT_PENDING
    fun submit_bid_aborts_when_timelock_expired(atomica: &signer) {
        setup_window(atomica);
        expire_epoch_ended();
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
    }

    // A second bid with the same ciphertext is rejected, even with another receipt.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 15, location = atomica::auction)] // E_DUPLICATE_BID
    fun submit_bid_rejects_duplicate_ciphertext(atomica: &signer) {
        setup_window(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_second_32bytes________", golden_bidder(), 1000u256, 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), golden_ct(),
            commitment_for(2010, 7, golden_bidder()),
            b"usd_lock_second_32bytes________", 5u256,
        );
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 26, location = atomica::auction)] // E_INVALID_COMMITMENT
    fun submit_bid_rejects_short_commitment(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), golden_ct(), x"00",
            b"usd_lock_golden_bidder_32bytes___", 5u256,
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
        submit_golden(&bidder, 2010, 7);
    }

    fun bcs_u64(i: u64): vector<u8> {
        aptos_std::bcs::to_bytes(&i)
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 11, location = atomica::auction)] // E_WINDOW_ALREADY_SETTLED
    fun submit_bid_aborts_after_window_settled(atomica: &signer) {
        setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_golden_bidder_32bytes___", golden_bidder(), 1000u256, 1);
        auction::test_insert_window_with_timelock(atomica, AUCTION_ID, pair(), SUPPLY, true, 2000, TIMELOCK_ID);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
    }

    // ===================== Reveal: opening against the commitment =====================

    // Before the registry reveals, nothing opens.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 16, location = atomica::auction)] // E_TIMELOCK_NOT_REVEALED
    fun open_bid_aborts_before_reveal(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        timestamp::update_global_time_for_test(DEADLINE_US);
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
    }

    #[test(atomica = @atomica)]
    fun open_bid_accepts_the_committed_price_and_finalizes(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        reveal_timelock();

        // Anyone can open: a relayer that decrypted the ciphertext off chain.
        let relayer = account::create_signer_for_test(@0x9999);
        auction::open_bid(&relayer, AUCTION_ID, pair(), 0, 2010, salt(7));

        let (_, _, _, opened, price) = auction::get_bid_info(AUCTION_ID, pair(), 0);
        assert!(opened && price == 2010, 1);
        let (_, reveal_final, refunded) = auction::get_window_status(AUCTION_ID, pair());
        assert!(reveal_final && !refunded, 2);
        let prices = auction::test_get_revealed_prices(AUCTION_ID, pair());
        assert!(prices == vector[2010u64], 3);
    }

    // A relayer cannot lie about a price: the commitment pins it.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 10, location = atomica::auction)] // E_INVALID_CLEARTEXT
    fun open_bid_rejects_a_wrong_price(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 9999, salt(7));
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 10, location = atomica::auction)] // E_INVALID_CLEARTEXT
    fun open_bid_rejects_a_wrong_salt(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(8));
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 18, location = atomica::auction)] // E_INVALID_SALT
    fun open_bid_rejects_a_short_salt(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, x"07");
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 19, location = atomica::auction)] // E_BID_INDEX_OUT_OF_RANGE
    fun open_bid_rejects_an_unknown_index(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 1, 2010, salt(7));
    }

    // One opening per bid. With two bids the window stays open after the first opening.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 17, location = atomica::auction)] // E_BID_ALREADY_OPENED
    fun open_bid_opens_each_bid_once(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
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
        submit_golden(&bidder, 2010, 7);
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
        ibe_config::finalize_for_testing(TIMELOCK_ID, fixtures::timelock_basic_reconstructed_dk(), true);
    }

    // ---- batch entry ----

    #[test(atomica = @atomica)]
    fun batch_open_skips_empty_salts_and_finalizes_when_all_open(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
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
        assert!(auction::test_get_revealed_prices(AUCTION_ID, pair()) == vector[2010u64, 1500u64], 3);
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 9, location = atomica::auction)] // E_CLEARTEXT_COUNT_MISMATCH
    fun batch_open_rejects_a_count_mismatch(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        reveal_timelock();
        auction::submit_cleartext_and_clear(&bidder, AUCTION_ID, pair(), vector[2010u64, 1u64], vector[salt(7)]);
    }

    // A wrong opening aborts the whole batch: no partial state.
    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 10, location = atomica::auction)] // E_INVALID_CLEARTEXT
    fun batch_open_aborts_on_one_wrong_opening(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
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
        submit_golden(&bidder, 2010, 7);
        auction::test_insert_committed_bid(atomica, AUCTION_ID, pair(), @0x2222, b"ct2", x"00", b"lock2", 1u256);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
        auction::finalize_reveal(&bidder, AUCTION_ID, pair());
    }

    // After the opening window an unopened bid is invalid: it never fills and settle keeps
    // its collateral claimed.
    #[test(atomica = @atomica)]
    fun unopened_bid_is_invalid_and_keeps_its_collateral(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        let ghost_lock = b"usd_lock_ghost_32bytes_________";
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(ghost_lock, @0x2222, 1000u256, 1);
        lock_receipt::claim<Ethereum, FakeUSD>(@0x2222, ghost_lock);
        auction::test_insert_committed_bid(atomica, AUCTION_ID, pair(), @0x2222, b"ct2", x"00", ghost_lock, 5u256);
        reveal_timelock();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));

        // Opening window: reveal_expiry (deadline + 10 min) plus 10 min.
        timestamp::update_global_time_for_test(DEADLINE_US + 20 * MIN);
        auction::finalize_reveal(&bidder, AUCTION_ID, pair());
        assert!(auction::test_get_revealed_prices(AUCTION_ID, pair()) == vector[2010u64, 0u64], 1);

        auction::clear_uniform_price(AUCTION_ID, pair());
        let results = auction::test_get_bid_results(AUCTION_ID, pair());
        let (win0, fill0, price0) = auction::test_bid_result_fields(vector::borrow(&results, 0));
        let (win1, fill1, _) = auction::test_bid_result_fields(vector::borrow(&results, 1));
        assert!(win0 && fill0 == 5 && price0 == 2010, 2);
        assert!(!win1 && fill1 == 0, 3);

        auction::settle(&bidder, AUCTION_ID, pair());
        assert!(auction::is_settled(AUCTION_ID, pair()), 4);
        // Not released: the ghost bid never opened.
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeUSD>(ghost_lock) == lock_receipt::status_claimed(), 5);
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

    // ===================== Expiry: no reveal after Expired =====================

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 27, location = atomica::auction)] // E_TIMELOCK_EXPIRED
    fun open_bid_is_impossible_after_reveal_window_elapsed(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        expire_reveal_window();
        assert!(timelock::get_status(TIMELOCK_ID) == timelock::status_expired(), 1);
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 27, location = atomica::auction)] // E_TIMELOCK_EXPIRED
    fun open_bid_is_impossible_after_epoch_ended(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        expire_epoch_ended();
        auction::open_bid(&bidder, AUCTION_ID, pair(), 0, 2010, salt(7));
    }

    #[test(atomica = @atomica)]
    #[expected_failure(abort_code = 27, location = atomica::auction)] // E_TIMELOCK_EXPIRED
    fun batch_open_is_impossible_after_key_check_failed(atomica: &signer) {
        setup_window(atomica);
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
        expire_key_check_failed();
        auction::submit_cleartext_and_clear(&bidder, AUCTION_ID, pair(), vector[2010u64], vector[salt(7)]);
    }

    // ===================== Refund after Expired =====================

    // A window with one seller lock and one bid, created through the entry points.
    fun setup_funded_window(atomica: &signer): signer {
        let framework = setup();
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_golden_bidder_32bytes___", golden_bidder(), 1000u256, 1);
        lock_receipt::insert_test_receipt<Ethereum, FakeETH>(b"eth_lock_seller_32bytes________", @atomica, 5u256, 1);
        auction::create_auction(
            atomica, AUCTION_ID, pair(), b"eth_lock_seller_32bytes________", 2000, TIMELOCK_ID, vector::empty<u8>(),
        );
        let bidder = account::create_signer_for_test(golden_bidder());
        submit_golden(&bidder, 2010, 7);
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
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeUSD>(b"usd_lock_golden_bidder_32bytes___") == revoked, 4);
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeETH>(b"eth_lock_seller_32bytes________") == revoked, 5);
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
        lock_receipt::insert_test_receipt<Ethereum, FakeUSD>(b"usd_lock_late_32bytes__________", golden_bidder(), 1000u256, 1);
        let bidder = account::create_signer_for_test(golden_bidder());
        auction::submit_bid(
            &bidder, AUCTION_ID, pair(), golden_ct(),
            commitment_for(2010, 7, golden_bidder()),
            b"usd_lock_late_32bytes__________", 5u256,
        );
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
