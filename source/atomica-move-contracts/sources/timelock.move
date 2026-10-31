/// Atomica Timelock view-function facade.
///
/// Exposes the Atomica-relevant subset of `aptos_framework::ibe_config` to
/// off-chain clients and to `atomica::auction`. The registry is epoch bound and
/// has a one-way status: `Pending`, then `Revealed` or `Expired(reason)`.
///
/// ## Why a separate module?
///
/// `aptos_framework::ibe_config` lives inside the framework git dependency
/// (`dev-atomica` branch). Atomica-namespaced view functions decouple client
/// code from the framework module path.
///
/// ## Status and expiry
///
/// - `is_deadline_passed` is true once `deadline_us` has passed. It says nothing
///   about the reveal.
/// - `is_timelock_expired` is true only for the `Expired` status, for any reason.
/// - `get_status` returns 0 pending, 1 revealed, 2 expired.
/// - `get_expiry_reason` returns 1 epoch-ended, 2 reveal-window-elapsed,
///   3 key-check-failed, and 0 when the timelock is not expired.
///
/// Design: `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md` sections 7 and 8.
module atomica::timelock {
    use aptos_framework::ibe_config;

    /// `get_status` value of a timelock that has not revealed or expired.
    const STATUS_PENDING: u8 = 0;
    /// `get_status` value of a timelock whose verified key is on chain.
    const STATUS_REVEALED: u8 = 1;
    /// `get_status` value of a timelock that expired. See `get_expiry_reason`.
    const STATUS_EXPIRED: u8 = 2;

    public fun status_pending(): u8 { STATUS_PENDING }
    public fun status_revealed(): u8 { STATUS_REVEALED }
    public fun status_expired(): u8 { STATUS_EXPIRED }

    #[view]
    /// True if the epoch's IBE master public key is set by the timelock DKG.
    /// Clients check this before they encrypt a bid.
    public fun is_ibe_ready(): bool {
        ibe_config::is_ready()
    }

    #[view]
    /// The master public key of the current epoch (96-byte compressed G2).
    public fun get_mpk(): vector<u8> {
        ibe_config::get_mpk()
    }

    #[view]
    /// True once the timelock deadline has passed. This is not the `Expired` status.
    public fun is_deadline_passed(timelock_id: u64): bool {
        ibe_config::is_deadline_passed(timelock_id)
    }

    #[view]
    /// True only when the timelock status is `Expired`, for any reason.
    public fun is_timelock_expired(timelock_id: u64): bool {
        ibe_config::is_expired(timelock_id)
    }

    #[view]
    /// True once the verified decryption key is on chain.
    public fun is_revealed(timelock_id: u64): bool {
        ibe_config::is_revealed(timelock_id)
    }

    #[view]
    /// `0` pending, `1` revealed, `2` expired. Aborts for an unknown timelock.
    public fun get_status(timelock_id: u64): u8 {
        ibe_config::get_status(timelock_id)
    }

    #[view]
    /// `1` epoch-ended, `2` reveal-window-elapsed, `3` key-check-failed, `0` when not expired.
    public fun get_expiry_reason(timelock_id: u64): u8 {
        ibe_config::get_expiry_reason(timelock_id)
    }

    #[view]
    /// The epoch the timelock was registered in. Bids are encrypted to this epoch's key.
    public fun get_timelock_epoch(timelock_id: u64): u64 {
        ibe_config::get_timelock_epoch(timelock_id)
    }

    #[view]
    public fun get_deadline(timelock_id: u64): u64 {
        ibe_config::get_deadline(timelock_id)
    }

    #[view]
    /// `min(deadline + 10 minutes, epoch end)`: the last moment a reveal can complete.
    public fun get_reveal_expiry(timelock_id: u64): u64 {
        ibe_config::get_reveal_expiry(timelock_id)
    }

    #[view]
    /// The 32-byte IBE identity of a registered timelock.
    public fun get_timelock_identity(timelock_id: u64): vector<u8> {
        ibe_config::get_identity(timelock_id)
    }

    #[view]
    /// The verified 48-byte compressed G1 decryption key. Aborts unless the status is `Revealed`.
    public fun get_decryption_key(timelock_id: u64): vector<u8> {
        ibe_config::get_decryption_key(timelock_id)
    }
}
