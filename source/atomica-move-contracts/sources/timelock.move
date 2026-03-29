/// Atomica Timelock view-function facade.
///
/// Provides four view functions that expose the Atomica-relevant subset of
/// `aptos_framework::ibe_config` state to off-chain clients and other on-chain
/// modules.
///
/// ## Why a separate module?
///
/// `aptos_framework::ibe_config` lives inside the framework git dependency
/// (`dev-atomica` branch). Exposing stable, Atomica-namespaced view functions
/// here decouples client code from the framework module path and makes it
/// easier to swap the underlying implementation in Phase 1.
///
/// ## Phase 0 scope
///
/// These four functions are stubs backed by `aptos_framework::ibe_config`.
/// Cryptographic correctness is deferred to Phase 1.
///
/// ## Seam notes (Phase 1)
///
/// - `get_timelock_identity` must produce byte-identical output to the
///   `identity` field used by `aptos_dkg::ibe::extract`. See scout findings
///   § 3b (docs/development/timelock-scout-findings.md).
/// - `get_decryption_key` returns a 48-byte compressed G1 point once
///   threshold shares are submitted and `finalize_timelock_reveal` is called.
module atomica::timelock {
    use aptos_framework::ibe_config;

    // ---------------------------------------------------------------------------
    // View functions (4 required by Phase 0 acceptance criteria)
    // ---------------------------------------------------------------------------

    /// Returns `true` if the IBE Master Public Key has been set by DKG.
    ///
    /// Clients should check this before submitting encrypted bids.
    #[view]
    public fun is_ibe_ready(): bool {
        ibe_config::is_ready()
    }

    /// Returns `true` if the given timelock's deadline has passed.
    ///
    /// `timelock_id` — identifier returned by `ibe_config::register_timelock`.
    #[view]
    public fun is_timelock_expired(timelock_id: u64): bool {
        ibe_config::is_expired(timelock_id)
    }

    /// Returns the 32-byte IBE identity for a registered timelock.
    ///
    /// Clients use this identity to encrypt bids:
    /// `ciphertext = IBE.Encrypt(mpk, identity, plaintext)`
    ///
    /// The returned bytes must be passed unchanged to the off-chain
    /// `aptos_dkg::ibe::extract(msk, identity)` call.
    ///
    /// `timelock_id` — identifier returned by `ibe_config::register_timelock`.
    #[view]
    public fun get_timelock_identity(timelock_id: u64): vector<u8> {
        ibe_config::get_identity(timelock_id)
    }

    /// Returns the decryption key for a revealed timelock.
    ///
    /// Aborts if the timelock has not yet been revealed (i.e. the threshold
    /// of DK shares has not been submitted and `finalize_timelock_reveal`
    /// called).
    ///
    /// Returns a 48-byte compressed G1 point that can be used as the IBE
    /// decryption key `d_ID = DK`.
    ///
    /// `timelock_id` — identifier returned by `ibe_config::register_timelock`.
    #[view]
    public fun get_decryption_key(timelock_id: u64): vector<u8> {
        ibe_config::get_decryption_key(timelock_id)
    }
}
