// SCOUT(#242) DOC: the 67 percent reveal threshold in this header has no caller and disagrees with the fork's thresholds (review decision 31); the issue text lists only the five canonical docs.
/// Atomica Timelock Configuration module.
///
/// This module provides configurable timelock parameters for the Atomica
/// auction system. It wraps the on-chain IBE/timelock functionality from
/// `aptos_framework::ibe_config` and exposes Atomica-specific defaults.
///
/// ## Integration with aptos_framework::ibe_config
///
/// The core timelock registry and IBE public params live in
/// `aptos_framework::ibe_config` (available via the `dev-atomica` git
/// dependency in Move.toml). This module provides Atomica auction-level
/// configuration that sits on top of the framework primitives.
///
/// ## Configurable Parameters
///
/// | Parameter | Default | Description |
/// |-----------|---------|-------------|
/// | `min_timelock_duration_us` | 60 seconds | Minimum allowed timelock duration |
/// | `max_timelock_duration_us` | 30 days | Maximum allowed timelock duration |
/// | `reveal_threshold_numerator` | 67 | Numerator of threshold fraction |
/// | `reveal_threshold_denominator` | 100 | Denominator of threshold fraction |
/// | `unwind_grace_us` | 24 hours | Stuck deadline: reveal expiry + this grace. Only the local testing chain (chain id 4) may shorten it, for live unwind tests |
/// | `carrier_margin_us` | 24 hours | Time to carry an `AuctionOutcome` to Ethereum after the stuck deadline |
/// | `receipt_cancel_delay_us` | 24 hours | Age after which anyone may cancel a never-auctioned receipt |
///
/// The unwind grace and the carrier margin must fit in the Ethereum lock
/// delay (`eth_proof::ETH_RECLAIM_DELAY_SECS`, 72 hours) together with the
/// time to the reveal. `auction::create_auction`
/// enforces `stuck deadline + carrier margin < eth_lock_deadline(window_id)`
/// (docs/specifications/auction-timing.md).
///
/// ## Seam Notes (Phase 1)
///
/// - `reveal_threshold_numerator` / `reveal_threshold_denominator` must agree
///   with the `threshold` parameter passed to `aptos_dkg::ibe::recombine`.
///   A mismatch is a silent correctness failure.
/// - See `docs/development/timelock-scout-findings.md` § 3a for details.
module atomica::timelock_config {
    use aptos_framework::ibe_config;
    use aptos_framework::chain_id;
    use std::signer;

    // ---------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------

    /// Only the `atomica` account may set the test-chain unwind grace.
    const E_NOT_ATOMICA: u64 = 1;
    /// The unwind grace override exists only on the local testing chain.
    const E_NOT_TEST_CHAIN: u64 = 2;
    /// The override may only shorten the grace, never lengthen it.
    const E_GRACE_TOO_LONG: u64 = 3;

    /// Chain id of the local testing chain (`ChainId::test()`), which the docker
    /// testnet runs. Mainnet is 1 and testnet is 2.
    const TEST_CHAIN_ID: u8 = 4;

    // ---------------------------------------------------------------------------
    // Default constants
    // ---------------------------------------------------------------------------

    /// Minimum timelock duration: 60 seconds in microseconds.
    const DEFAULT_MIN_DURATION_US: u64 = 60_000_000;

    /// Maximum timelock duration: 30 days in microseconds.
    const DEFAULT_MAX_DURATION_US: u64 = 2_592_000_000_000;

    /// Default reveal threshold numerator (67%).
    const DEFAULT_THRESHOLD_NUMERATOR: u64 = 67;

    /// Default reveal threshold denominator (100).
    const DEFAULT_THRESHOLD_DENOMINATOR: u64 = 100;

    /// Unwind grace after the reveal expiry: 24 hours in microseconds.
    const DEFAULT_UNWIND_GRACE_US: u64 = 86_400_000_000;

    /// Carrier margin after the stuck deadline: 24 hours in microseconds.
    const DEFAULT_CARRIER_MARGIN_US: u64 = 86_400_000_000;

    /// Age of an ACTIVE receipt after which anyone may cancel it: 24 hours in microseconds.
    const DEFAULT_RECEIPT_CANCEL_DELAY_US: u64 = 86_400_000_000;

    // ---------------------------------------------------------------------------
    // Config resource
    // ---------------------------------------------------------------------------

    /// Per-auction-module timelock configuration.
    ///
    /// Stored at the `atomica` address. Created lazily by `get_config()`.
    struct TimelockConfig has key {
        min_duration_us: u64,
        max_duration_us: u64,
        threshold_numerator: u64,
        threshold_denominator: u64,
        unwind_grace_us: u64,
        carrier_margin_us: u64,
        receipt_cancel_delay_us: u64,
    }

    // ---------------------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------------------

    /// Initialise the config with default values.
    ///
    /// Can only be called when no config exists yet. Idempotent when called
    /// under the `atomica` signer address.
    public fun initialize(atomica: &signer) {
        if (!exists<TimelockConfig>(std::signer::address_of(atomica))) {
            move_to(atomica, TimelockConfig {
                min_duration_us: DEFAULT_MIN_DURATION_US,
                max_duration_us: DEFAULT_MAX_DURATION_US,
                threshold_numerator: DEFAULT_THRESHOLD_NUMERATOR,
                threshold_denominator: DEFAULT_THRESHOLD_DENOMINATOR,
                unwind_grace_us: DEFAULT_UNWIND_GRACE_US,
                carrier_margin_us: DEFAULT_CARRIER_MARGIN_US,
                receipt_cancel_delay_us: DEFAULT_RECEIPT_CANCEL_DELAY_US,
            });
        }
    }

    // ---------------------------------------------------------------------------
    // View functions (4 required by Phase 0 acceptance criteria)
    // ---------------------------------------------------------------------------

    #[view]
    /// Returns the minimum allowed timelock duration in microseconds.
    public fun get_min_duration_us(): u64 {
        DEFAULT_MIN_DURATION_US
    }

    #[view]
    /// Returns the maximum allowed timelock duration in microseconds.
    public fun get_max_duration_us(): u64 {
        DEFAULT_MAX_DURATION_US
    }

    #[view]
    /// Returns the reveal threshold numerator (default 67 for 67%).
    public fun get_threshold_numerator(): u64 {
        DEFAULT_THRESHOLD_NUMERATOR
    }

    #[view]
    /// Returns the reveal threshold denominator (default 100).
    public fun get_threshold_denominator(): u64 {
        DEFAULT_THRESHOLD_DENOMINATOR
    }

    #[view]
    /// Returns the unwind grace in microseconds. A window's stuck deadline is its
    /// reveal expiry plus this grace (`auction::unwind`).
    /// It is the 24 h default, except on the local testing chain after
    /// `set_unwind_grace_us_on_test_chain`.
    public fun get_unwind_grace_us(): u64 acquires TimelockConfig {
        if (exists<TimelockConfig>(@atomica)) {
            borrow_global<TimelockConfig>(@atomica).unwind_grace_us
        } else {
            DEFAULT_UNWIND_GRACE_US
        }
    }

    /// Shorten the unwind grace on the local testing chain (chain id 4) only, so a
    /// live test can stall a window past its stuck deadline in minutes. Aborts
    /// `E_NOT_TEST_CHAIN` on any other chain, so no deployed network can change its
    /// grace. Only the `atomica` account may call it, and only to shorten it.
    public entry fun set_unwind_grace_us_on_test_chain(
        atomica: &signer,
        grace_us: u64,
    ) acquires TimelockConfig {
        assert!(signer::address_of(atomica) == @atomica, E_NOT_ATOMICA);
        assert!(chain_id::get() == TEST_CHAIN_ID, E_NOT_TEST_CHAIN);
        assert!(grace_us <= DEFAULT_UNWIND_GRACE_US, E_GRACE_TOO_LONG);
        initialize(atomica);
        borrow_global_mut<TimelockConfig>(@atomica).unwind_grace_us = grace_us;
    }

    #[view]
    /// Returns the carrier margin in microseconds: the time any user has after the
    /// stuck deadline to carry the `AuctionOutcome` to Ethereum before reclaim opens.
    public fun get_carrier_margin_us(): u64 {
        DEFAULT_CARRIER_MARGIN_US
    }

    #[view]
    /// Returns the receipt cancel delay in microseconds: an ACTIVE receipt at least
    /// this old may be cancelled by anyone (`lock_receipt::cancel_unauctioned`).
    public fun get_receipt_cancel_delay_us(): u64 {
        DEFAULT_RECEIPT_CANCEL_DELAY_US
    }

    #[view]
    /// Returns the IBE Master Public Key (96-byte G2 compressed point) set by DKG.
    ///
    /// Returns an empty vector if the IBE MPK has not been set yet.
    /// Delegates to `aptos_framework::ibe_config::get_mpk`.
    ///
    /// @see docs/architecture/v0-architecture.md §2.6
    public fun get_mpk(): vector<u8> {
        ibe_config::get_mpk()
    }

    #[view]
    /// Returns `true` if the decryption key for `timelock_id` has been revealed.
    ///
    /// Returns `false` if the timelock does not exist or the threshold has not
    /// been reached yet. Delegates to `aptos_framework::ibe_config::is_revealed`.
    ///
    /// `timelock_id` — the ID returned by `ibe_config::register_timelock`.
    ///
    /// @see docs/architecture/v0-architecture.md §2.6
    public fun is_revealed(timelock_id: u64): bool {
        ibe_config::is_revealed(timelock_id)
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /// Validate that a proposed deadline is within the configured range.
    ///
    /// `current_time_us` — current chain timestamp in microseconds
    /// `deadline_us`     — proposed deadline in microseconds
    ///
    /// Returns `true` if the duration `(deadline_us - current_time_us)` falls
    /// within `[min_duration_us, max_duration_us]`.
    public fun is_valid_deadline(current_time_us: u64, deadline_us: u64): bool {
        if (deadline_us <= current_time_us) {
            return false
        };
        let duration = deadline_us - current_time_us;
        duration >= DEFAULT_MIN_DURATION_US && duration <= DEFAULT_MAX_DURATION_US
    }

    /// Compute the minimum threshold weight required for DK reconstruction.
    ///
    /// threshold = ceil(total_weight * numerator / denominator)
    public fun compute_threshold(total_weight: u64): u64 {
        (total_weight * DEFAULT_THRESHOLD_NUMERATOR + DEFAULT_THRESHOLD_DENOMINATOR - 1) / DEFAULT_THRESHOLD_DENOMINATOR
    }

    // ---------------------------------------------------------------------------
    // Tests
    // ---------------------------------------------------------------------------

    #[test(atomica = @atomica)]
    /// initialize creates config with default values.
    fun test_initialize_defaults(atomica: signer) acquires TimelockConfig {
        initialize(&atomica);
        let cfg = borrow_global<TimelockConfig>(signer::address_of(&atomica));
        assert!(cfg.min_duration_us == DEFAULT_MIN_DURATION_US, 1);
        assert!(cfg.max_duration_us == DEFAULT_MAX_DURATION_US, 2);
        assert!(cfg.threshold_numerator == DEFAULT_THRESHOLD_NUMERATOR, 3);
        assert!(cfg.threshold_denominator == DEFAULT_THRESHOLD_DENOMINATOR, 4);
        assert!(cfg.unwind_grace_us == DEFAULT_UNWIND_GRACE_US, 5);
        assert!(cfg.carrier_margin_us == DEFAULT_CARRIER_MARGIN_US, 6);
        assert!(cfg.receipt_cancel_delay_us == DEFAULT_RECEIPT_CANCEL_DELAY_US, 7);
    }

    #[test(framework = @aptos_framework, atomica = @atomica)]
    /// On the local testing chain the atomica account can shorten the grace.
    fun test_unwind_grace_override_on_test_chain(framework: signer, atomica: signer) acquires TimelockConfig {
        chain_id::initialize_for_test(&framework, TEST_CHAIN_ID);
        set_unwind_grace_us_on_test_chain(&atomica, 60_000_000);
        assert!(get_unwind_grace_us() == 60_000_000, 1);
    }

    #[test(framework = @aptos_framework, atomica = @atomica)]
    #[expected_failure(abort_code = E_NOT_TEST_CHAIN, location = Self)]
    /// Mainnet (chain id 1) cannot change its grace.
    fun test_unwind_grace_override_rejected_on_mainnet(framework: signer, atomica: signer) acquires TimelockConfig {
        chain_id::initialize_for_test(&framework, 1);
        set_unwind_grace_us_on_test_chain(&atomica, 60_000_000);
    }

    #[test(framework = @aptos_framework, other = @0xbad)]
    #[expected_failure(abort_code = E_NOT_ATOMICA, location = Self)]
    /// No other account may set it, even on the testing chain.
    fun test_unwind_grace_override_rejects_other_account(framework: signer, other: signer) acquires TimelockConfig {
        chain_id::initialize_for_test(&framework, TEST_CHAIN_ID);
        set_unwind_grace_us_on_test_chain(&other, 60_000_000);
    }

    #[test(framework = @aptos_framework, atomica = @atomica)]
    #[expected_failure(abort_code = E_GRACE_TOO_LONG, location = Self)]
    /// The override cannot lengthen the grace past the lock-delay budget.
    fun test_unwind_grace_override_cannot_lengthen(framework: signer, atomica: signer) acquires TimelockConfig {
        chain_id::initialize_for_test(&framework, TEST_CHAIN_ID);
        set_unwind_grace_us_on_test_chain(&atomica, DEFAULT_UNWIND_GRACE_US + 1);
    }

    #[test]
    /// View functions return default constant values.
    fun test_view_functions_return_defaults() acquires TimelockConfig {
        assert!(get_min_duration_us() == DEFAULT_MIN_DURATION_US, 1);
        assert!(get_max_duration_us() == DEFAULT_MAX_DURATION_US, 2);
        assert!(get_threshold_numerator() == DEFAULT_THRESHOLD_NUMERATOR, 3);
        assert!(get_threshold_denominator() == DEFAULT_THRESHOLD_DENOMINATOR, 4);
        assert!(get_unwind_grace_us() == DEFAULT_UNWIND_GRACE_US, 5);
        assert!(get_carrier_margin_us() == DEFAULT_CARRIER_MARGIN_US, 6);
        assert!(get_receipt_cancel_delay_us() == DEFAULT_RECEIPT_CANCEL_DELAY_US, 7);
    }

    #[test]
    /// The 72-hour Ethereum lock delay covers at most 23 h 50 min to the reveal
    /// deadline, the unwind grace and the carrier margin
    /// (docs/specifications/auction-timing.md).
    fun test_grace_and_margin_fit_the_lock_delay() acquires TimelockConfig {
        let budget_us = 259_200_000_000; // eth_proof::ETH_RECLAIM_DELAY_SECS
        let to_reveal_us = 85_800_000_000; // 23 h 50 min
        assert!(to_reveal_us + get_unwind_grace_us() + get_carrier_margin_us() <= budget_us, 1);
    }

    #[test]
    /// is_valid_deadline returns false when duration is below minimum.
    fun test_is_valid_deadline_below_min() {
        let now = 1_000_000_000_000u64;
        // duration = 30 seconds, below 60-second minimum
        let deadline = now + 30_000_000u64;
        assert!(!is_valid_deadline(now, deadline), 1);
    }

    #[test]
    /// compute_threshold rounds up correctly (ceiling division).
    fun test_compute_threshold_ceiling() {
        // 5 * 67 / 100 = 3.35 → ceil = 4
        let threshold = compute_threshold(5);
        assert!(threshold == 4, 1);

        // 3 * 67 / 100 = 2.01 → ceil = 3
        let threshold2 = compute_threshold(3);
        assert!(threshold2 == 3, 2);
    }
}
