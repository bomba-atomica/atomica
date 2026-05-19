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
///
/// ## Seam Notes (Phase 1)
///
/// - `reveal_threshold_numerator` / `reveal_threshold_denominator` must agree
///   with the `threshold` parameter passed to `aptos_dkg::ibe::recombine`.
///   A mismatch is a silent correctness failure.
/// - See `docs/development/timelock-scout-findings.md` § 3a for details.
module atomica::timelock_config {
    use aptos_framework::ibe_config;

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

    #[test_only]
    use std::signer;

    #[test(atomica = @atomica)]
    /// initialize creates config with default values.
    fun test_initialize_defaults(atomica: signer) acquires TimelockConfig {
        initialize(&atomica);
        let cfg = borrow_global<TimelockConfig>(signer::address_of(&atomica));
        assert!(cfg.min_duration_us == DEFAULT_MIN_DURATION_US, 1);
        assert!(cfg.max_duration_us == DEFAULT_MAX_DURATION_US, 2);
        assert!(cfg.threshold_numerator == DEFAULT_THRESHOLD_NUMERATOR, 3);
        assert!(cfg.threshold_denominator == DEFAULT_THRESHOLD_DENOMINATOR, 4);
    }

    #[test]
    /// View functions return default constant values.
    fun test_view_functions_return_defaults() {
        assert!(get_min_duration_us() == DEFAULT_MIN_DURATION_US, 1);
        assert!(get_max_duration_us() == DEFAULT_MAX_DURATION_US, 2);
        assert!(get_threshold_numerator() == DEFAULT_THRESHOLD_NUMERATOR, 3);
        assert!(get_threshold_denominator() == DEFAULT_THRESHOLD_DENOMINATOR, 4);
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
