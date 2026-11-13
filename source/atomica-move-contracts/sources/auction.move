// SCOUT(#217) DOC: state the price unit in this header: whole USD per whole base token, an unsigned integer with no decimal shift.
// SCOUT(#228) DOC: rewrite "Bid lifecycle" steps 2, 4 and 5 and delete the "Cleartext" section: the chain opens bids with `ibe::decrypt_bid`, with no commitment, salt or opening window.
/// Auction module: global-registry sealed-bid batch auction with V2 timelock bids.
///
/// Design: `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md` (sections 6 to 8) and
/// `atomica/docs/decisions/auction-v2-bid-wrapper.md` (this contract's decisions).
///
/// ## Bid lifecycle
///
/// 1. `create_auction` registers sellers' supply for a `(window_id, pair)` window. The
///    first `create_auction` of a window id registers that window id's one timelock, whose
///    deadline is the window close; every later seller of the window id, of any pair, joins it.
/// 2. `submit_bid` takes a V2 bid ciphertext (`BCS(vk, U, nonce, C, sig)`), builds the
///    associated data on chain (tag, chain id, epoch, timelock id, auction id, bidder,
///    deadline) and aborts unless `ibe::verify_bid_ct(ct, ad)` accepts. Bids are accepted
///    only while the timelock is `Pending` and strictly before its deadline. The bid also
///    carries a 32-byte commitment to the price (see "Cleartext" below).
/// 3. Validators release one verified key per timelock into the registry (status `Revealed`).
/// 4. Anyone opens a bid with `(price, salt)` through `open_bid` or the batch entry
///    `submit_cleartext_and_clear`. The contract checks the opening against the commitment.
///    Openings are accepted only while the registry status is `Revealed`.
/// 5. `finalize_reveal` closes openings. Unopened bids are invalid. `clear_uniform_price`
///    and `settle` follow.
/// 6. If the timelock ends `Expired` (epoch ended, reveal window elapsed, key check failed)
///    nothing can be opened and `refund_expired_window` returns every receipt of the window.
/// 7. `settle` (until the stuck deadline), `refund_expired_window` or `unwind` (after the
///    stuck deadline) finalizes the window: every claimed lock gets a terminal outcome
///    record (`lock_receipt::record_outcome`) and the window emits its one `AuctionOutcome`,
///    the `outcome_tree` root Ethereum LockBox releases the locks by.
///
/// ## Deadlines (docs/specifications/auction-timing.md)
///
/// The stuck deadline of a window is its timelock's reveal expiry plus `OPENING_WINDOW_US`
/// plus `timelock_config::get_unwind_grace_us`. `create_auction` requires
/// `stuck deadline + carrier margin < eth_lock_deadline(window_id)`, so unwind and the
/// carrying of the outcome to Ethereum finish before LockBox reclaim opens.
///
/// ## Cleartext (open decision, see the decision doc)
///
/// Move cannot decrypt the AES-GCM wrapper. The verified decryption key therefore lets
/// anyone decrypt every bid off chain, but the chain cannot check a decryption. The bid
/// plaintext is `price_le8 || salt32`. The bidder commits on chain to
/// `sha3_256(tag || bcs(price) || salt || sha3_256(AD))` at submission. A cleartext counts
/// only when it matches that commitment, so a relayer cannot lie about a price and nobody
/// can change a price after the key is public. The ciphertext gives liveness: any relayer
/// can decrypt and open a bid for an offline bidder. A bid whose ciphertext does not hold
/// the committed price cannot be opened by a relayer. Only the bidder can open it, and an
/// unopened bid is invalid.
module atomica::auction {
    use std::signer;
    use std::vector;
    use std::hash::sha3_256;
    use aptos_framework::event;
    use aptos_framework::object;
    use aptos_framework::timestamp;
    use aptos_framework::table::{Self, Table};
    use aptos_std::bcs;
    use aptos_framework::chain_id;
    use aptos_std::ibe;
    use aptos_framework::ibe_config;
    use aptos_framework::reconfiguration;
    use atomica::eth_proof;
    use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};
    use atomica::outcome_tree;
    use atomica::timelock;
    use atomica::timelock_config;

    // ===================== Error Codes =====================

    const E_AUCTION_NOT_FOUND: u64 = 1;
    const E_AUCTION_NOT_ENDED: u64 = 3;

    /// Caller supplied a window_id that is strictly less than the current window.
    /// Only the current window and the immediately next window are accepted.
    const E_STALE_WINDOW_ID: u64 = 6;

    // SCOUT(#228) REMOVE: `E_CLEARTEXT_COUNT_MISMATCH`; only `submit_cleartext_and_clear` raises it.
    /// The number of cleartext prices or salts does not match the number of sealed bids.
    /// The settler must supply exactly one entry per bid, index-aligned. An empty salt skips a bid.
    const E_CLEARTEXT_COUNT_MISMATCH: u64 = 9;

    // SCOUT(#228) REMOVE: `E_INVALID_CLEARTEXT`; only `open_one` raises it.
    /// A cleartext `(price, salt)` does not match the bid's on-chain commitment.
    const E_INVALID_CLEARTEXT: u64 = 10;

    /// The window has already been settled.
    const E_WINDOW_ALREADY_SETTLED: u64 = 11;

    /// Scout stub sentinel. These stubs abort with it until their issues build them:
    /// `get_window_limits` (caps, 218) and `open_bids` (ciphertext opening, 228). The issue
    /// that builds the last stub deletes it.
    const E_NOT_IMPLEMENTED: u64 = 99;

    // New abort codes. The unwind pull request (213) took 32 to 36, so these start at 37.
    /// A bid quantity must be above zero.
    const E_ZERO_QUANTITY: u64 = 37;
    /// A bid quantity must not be above the window's supply at submission.
    const E_QUANTITY_ABOVE_SUPPLY: u64 = 38;
    // SCOUT(#218) ADD: `create_auction` aborts with `E_SELLER_LOCKS_FULL` when the window holds `MAX_SELLER_LOCKS_PER_WINDOW` locks.
    /// The window holds the maximum number of seller locks.
    const E_SELLER_LOCKS_FULL: u64 = 39;
    // SCOUT(#218) ADD: `create_auction` aborts with `E_SELLER_LOCK_TOO_SMALL` when the claimed lock is below `MIN_SELLER_LOCK_AMOUNT`.
    /// The seller lock is below the minimum lock size.
    const E_SELLER_LOCK_TOO_SMALL: u64 = 40;
    // SCOUT(#218) ADD: `submit_bid` aborts with `E_COLLATERAL_TOO_SMALL` when the claimed collateral is below `MIN_BID_COLLATERAL`.
    /// The bid collateral is below the minimum collateral size.
    const E_COLLATERAL_TOO_SMALL: u64 = 41;
    /// `create_auction`: the pair bytes are not on the allowlist.
    const E_PAIR_NOT_ALLOWED: u64 = 42;
    /// `allow_pair`: only the package account may add a pair.
    const E_NOT_PACKAGE_ACCOUNT: u64 = 43;

    /// `ibe::verify_bid_ct` rejected the ciphertext for the associated data built on chain.
    const E_INVALID_CIPHERTEXT: u64 = 12;
    /// The bid is at or after the timelock deadline.
    const E_BID_AFTER_DEADLINE: u64 = 13;
    /// The timelock is not `Pending`, so it cannot take bids.
    const E_TIMELOCK_NOT_PENDING: u64 = 14;
    /// A bid with the same ciphertext id (`H(vk, AD)`) is already in the window.
    const E_DUPLICATE_BID: u64 = 15;
    /// The registry status is not `Revealed`, so no bid can be opened yet.
    const E_TIMELOCK_NOT_REVEALED: u64 = 16;
    // SCOUT(#228) REMOVE: `E_BID_ALREADY_OPENED`; only `open_one` raises it.
    /// The bid is already opened.
    const E_BID_ALREADY_OPENED: u64 = 17;
    // SCOUT(#228) REMOVE: `E_INVALID_SALT`; only `open_one` raises it.
    /// A salt must be exactly 32 bytes.
    const E_INVALID_SALT: u64 = 18;
    /// The bid index is out of range.
    const E_BID_INDEX_OUT_OF_RANGE: u64 = 19;
    // SCOUT(#228) EDIT: keep `E_REVEAL_FINAL` for `open_bids` on a window whose bids are all opened; reword the doc, `finalize_reveal` is gone.
    /// Openings are closed. `finalize_reveal` already ran for this window.
    const E_REVEAL_FINAL: u64 = 20;
    /// Clearing needs a finalized reveal when the window has bids.
    const E_REVEAL_NOT_FINAL: u64 = 21;
    // SCOUT(#228) REMOVE: `E_OPENING_WINDOW_OPEN`; only `finalize_reveal` raises it.
    /// Openings are still open: some bids are unopened and the opening window has not elapsed.
    const E_OPENING_WINDOW_OPEN: u64 = 22;
    /// The timelock status is not `Expired`, so there is nothing to refund.
    const E_TIMELOCK_NOT_EXPIRED: u64 = 23;
    /// The window was refunded after its timelock expired.
    const E_WINDOW_REFUNDED: u64 = 24;
    /// The window holds the maximum number of bids.
    const E_WINDOW_FULL: u64 = 25;
    // SCOUT(#228) REMOVE: `E_INVALID_COMMITMENT`; only the commitment check of `submit_bid` raises it.
    /// A bid commitment must be exactly 32 bytes.
    const E_INVALID_COMMITMENT: u64 = 26;
    /// The timelock is `Expired`: the key will never be released, so openings are impossible.
    const E_TIMELOCK_EXPIRED: u64 = 27;
    /// The window id's timelock was registered in an earlier epoch.
    const E_TIMELOCK_WRONG_EPOCH: u64 = 29;
    /// The window id's timelock deadline has passed, so the window could take no bids.
    const E_TIMELOCK_DEADLINE_PASSED: u64 = 30;
    /// `settle` ran before the timelock deadline.
    const E_DEADLINE_NOT_PASSED: u64 = 31;
    /// `create_auction` got a timelock whose stuck deadline plus the carrier margin is not
    /// before `eth_lock_deadline(window_id)`: Ethereum reclaim could race the outcome.
    const E_STUCK_AFTER_LOCK_DEADLINE: u64 = 32;
    /// `unwind` ran before the window's stuck deadline.
    const E_NOT_STUCK: u64 = 33;
    /// `unwind` found nothing left to return: the window is final.
    const E_WINDOW_FINAL: u64 = 34;
    /// `settle` ran at or after the window's stuck deadline. Call `unwind`.
    const E_PAST_STUCK_DEADLINE: u64 = 35;
    /// The cleared fills do not fit the locks: a fill above the seller supply, or a
    /// payment above a winner's collateral. Settle aborts; after the stuck deadline
    /// `unwind` returns every lock to its depositor.
    const E_UNPAYABLE_FILL: u64 = 36;

    // ===================== Bid Constants =====================

    /// Domain tag of the V2 bid associated data (spec section 6).
    const BID_AD_TAG: vector<u8> = b"atomica/timelock-bid/v2";
    // SCOUT(#228) REMOVE: `BID_COMMIT_TAG`; the price commitment goes away.
    /// Domain tag of the price commitment.
    const BID_COMMIT_TAG: vector<u8> = b"atomica/bid-commitment/v1";
    /// Bytes of the one-time Ed25519 verification key at the start of a V2 ciphertext.
    const CT_VK_LEN: u64 = 32;
    /// Per-window bid cap. The clearing sort is quadratic.
    const MAX_BIDS_PER_WINDOW: u64 = 100;
    // SCOUT(#218) ADD: cap on seller locks per window. The value waits for the owner (proposed: 100).
    /// Per-window seller lock cap. Settle, refund and unwind loop over every seller lock.
    const MAX_SELLER_LOCKS_PER_WINDOW: u64 = 100;
    // SCOUT(#218) ADD: minimum seller lock in FakeETH wei. The value waits for the owner (proposed: 0.01 FakeETH).
    /// Minimum amount of one seller lock, in FakeETH wei (18 decimals).
    const MIN_SELLER_LOCK_AMOUNT: u256 = 10_000_000_000_000_000;
    // SCOUT(#218) ADD: minimum bid collateral in FakeUSD base units. The value waits for the owner (proposed: 10 FakeUSD).
    /// Minimum collateral of one bid, in FakeUSD base units (6 decimals).
    const MIN_BID_COLLATERAL: u256 = 10_000_000;
    /// Seed of the timelock registrar object under `@atomica`. The SDK
    /// (`TIMELOCK_REGISTRAR_SEED`) and the docker genesis `timelock_registrar` field derive
    /// the same address from it.
    const TIMELOCK_REGISTRAR_SEED: vector<u8> = b"atomica/timelock-registrar";
    // SCOUT(#228) REMOVE: `OPENING_WINDOW_US`; the stuck deadline of the unwind pull request (213) drops this term.
    /// Time after the registry's `reveal_expiry_us` during which unopened bids can still be opened.
    const OPENING_WINDOW_US: u64 = 600_000_000;
    /// `BidInvalid` reason: the opened price is zero.
    const INVALID_ZERO_PRICE: u8 = 1;
    /// `BidInvalid` reason: `quote_for_fill(quantity, price)` is above the bid's collateral.
    const INVALID_COLLATERAL_BELOW_QUOTE: u8 = 2;
    /// FakeUSD base units per whole FakeUSD (6 decimals).
    const QUOTE_UNIT: u256 = 1_000_000;
    /// FakeETH wei per whole FakeETH (18 decimals).
    const BASE_UNIT: u256 = 1_000_000_000_000_000_000;

    // ===================== Types =====================

    /// Trading pair descriptor.
    /// @see docs/architecture/v0-architecture.md §2.4
    struct Pair has copy, drop, store {
        base_chain:  vector<u8>,   // e.g. b"ethereum"
        base_token:  vector<u8>,   // e.g. b"FakeETH"
        quote_chain: vector<u8>,   // e.g. b"ethereum"
        quote_token: vector<u8>,   // e.g. b"FakeUSD"
    }

    /// Pairs a window may be created for, stored at `@atomica`. Key: the BCS bytes of the
    /// `Pair`, so the key is always `bcs::to_bytes` of its value. `init_module` seeds the
    /// launch pair, and `allow_pair` adds more.
    /// @see docs/architecture/v0-architecture.md §2.4
    struct PairAllowlist has key {
        pairs: Table<vector<u8>, Pair>,
    }

    /// The package's timelock registrar, stored at `@atomica`: the `ExtendRef` of a named
    /// object under `@atomica` that only this module signs for, and the timelock id it
    /// registered for each window id. Genesis names the object's address as the chain's one
    /// timelock registrar (`ibe_config::timelock_registrar`).
    struct TimelockRegistrar has key {
        extend_ref:       object::ExtendRef,
        window_timelocks: Table<u64, u64>,
    }

    // SCOUT(#217) DOC: state the unit of `SealedBid.price`: whole USD per whole base token, no decimal shift.
    // SCOUT(#228) REMOVE: `SealedBid.commitment`; `open_bids` sets `opened` and `price` from the decrypted 8-byte plaintext.
    /// IBE sealed bid — plaintext price never stored on-chain during live window.
    /// @see docs/architecture/v0-architecture.md §2.5
    struct SealedBid has store {
        bidder:             address,
        /// V2 bid ciphertext `BCS(vk, U, nonce, C, sig)`, accepted by `ibe::verify_bid_ct`.
        ciphertext:         vector<u8>,
        /// `H(vk, AD)`. Rejects a second bid with the same ciphertext in the window.
        ct_id:              vector<u8>,
        /// 32-byte commitment to the price. See `compute_bid_commitment`.
        commitment:         vector<u8>,
        collateral_lock_id: vector<u8>,   // FakeUSD LockReceipt ID held as margin
        quantity:           u256,         // bid quantity in wei (FakeETH base token)
        /// FakeUSD base units `claim_for_window` returned at submission. The receipt holds
        /// the same amount; storing it saves a cross-module read at opening.
        collateral:         u256,
        /// True once a cleartext matching `commitment` was accepted.
        opened:             bool,
        /// The opened price. Zero until `opened`.
        price:              u64,
        /// False once opening found a zero price or `quote_for_fill(quantity, price)` above
        /// `collateral`. An invalid bid never fills and its whole collateral goes back to
        /// its depositor. True for an unopened bid.
        valid:              bool,
    }

    // SCOUT(#217) DOC: state the unit of `BidResult.clearing_price`; the issue text does not list this struct.
    /// Per-bid fill result written by clear_uniform_price.
    ///
    /// After clearing, each bid in the window is assigned a BidResult recording
    /// whether it won, its fill amount, and the uniform clearing price it pays.
    /// Losing bids have fill_amount = 0 and is_winner = false.
    ///
    /// @see docs/architecture/v0-architecture.md §2.7
    struct BidResult has copy, drop, store {
        bidder:         address,
        is_winner:      bool,
        fill_amount:    u256,   // wei allocated to this bidder (0 for losers)
        clearing_price: u64,    // uniform clearing price all winners pay
    }

    // SCOUT(#217) DOC: state the unit of `WindowState.clearing_price`.
    // SCOUT(#228) EDIT: `WindowState` gains the opening cursor of `open_bids`; `reveal_final` then means every bid is opened.
    /// Per-window clearing state within the global registry.
    /// @see docs/architecture/v0-architecture.md §2.3
    struct WindowState has store {
        pair:             Pair,
        window_id:        u64,
        /// Registered timelock ID from ibe_config::register_timelock.
        /// Links this auction window to the on-chain DKG timelock that controls
        /// when the IBE decryption key is released.
        /// @see docs/architecture/v0-architecture.md §2.6
        timelock_id:      u64,
        total_supply:     u256,               // sum of all seller lock amounts (FakeETH wei)
        bids:             vector<SealedBid>,
        settled:          bool,
        clearing_price:   u64,
        lock_ids:         vector<vector<u8>>, // seller LockReceipt IDs consumed
        /// True once `finalize_reveal` ran. Openings are closed and clearing may run.
        reveal_final:     bool,
        /// True once the window was refunded because its timelock expired.
        refunded:         bool,
        /// Per-bid fill results written by clear_uniform_price.
        /// Index-aligned to bids. Empty until clear_uniform_price succeeds.
        /// @see docs/architecture/v0-architecture.md §2.7
        bid_results:      vector<BidResult>,
    }

    /// Global registry stored at the @atomica deployer address (not per-seller).
    ///
    /// Key: BCS-encoded (auction_window_id: u64, pair: Pair) via `make_window_key`.
    /// @see docs/architecture/v0-architecture.md §2.3
    struct AuctionRegistry has key {
        windows: Table<vector<u8>, WindowState>,
    }

    // ===================== Events =====================

    // SCOUT(#217) DOC: state the unit of `AuctionSettled.clearing_price`.
    // Emitted when settlement is complete for a window.
    // The Ethereum settlement contract (or off-chain relayer) reads this to
    // transfer assets on the cross-chain side.
    // @see docs/architecture/v0-architecture.md §2.9
    #[event]
    struct AuctionSettled has drop, store {
        window_id:      u64,
        pair:           Pair,
        pair_bcs:       vector<u8>,         // window key pair bytes (see AuctionRefunded)
        clearing_price: u64,
        total_filled:   u256,               // wei of base token allocated to winners
        winner_count:   u64,
        lock_ids:       vector<vector<u8>>, // seller receipt IDs consumed
    }

    // SCOUT(#217) DOC: state the unit of `BidOpened.price`.
    // SCOUT(#228) REMOVE: `BidOpened`. The issue names no event for a bid that `open_bids` opens.
    // Emitted when a bid cleartext matching its commitment is accepted.
    #[event]
    struct BidOpened has drop, store {
        window_id:  u64,
        bid_index:  u64,
        bidder:     address,
        price:      u64,
    }

    // SCOUT(#228) REMOVE: `RevealFinalized`.
    // Emitted when openings close for a window.
    #[event]
    struct RevealFinalized has drop, store {
        window_id:    u64,
        bid_count:    u64,
        opened_count: u64,
    }

    // Emitted by `unwind` with the number of locks it returned to their depositors.
    // `outcome_emitted` is true when this unwind finalized the window and emitted its
    // `AuctionOutcome`, false when it returned coins a finalized window still held.
    #[event]
    struct AuctionUnwound has drop, store {
        window_id:       u64,
        pair_bcs:        vector<u8>,
        returned_count:  u64,
        outcome_emitted: bool,
    }

    // Emitted when a window is refunded: after its timelock expired, or by `unwind` on a
    // window that never settled. `reason` is the registry expiry reason: 1 epoch-ended,
    // 2 reveal-window-elapsed, 3 key-check-failed, 0 when the timelock did not expire.
    #[event]
    struct AuctionRefunded has drop, store {
        window_id:        u64,
        // The window key's pair bytes, so a relayer skips windows it does not serve.
        pair_bcs:         vector<u8>,
        timelock_id:      u64,
        reason:           u8,
        bid_count:        u64,
        seller_lock_count: u64,
    }

    // The one outcome of an auction on Ethereum. `settle`, `refund_expired_window` or the
    // permissionless `unwind`, whichever finalizes the window first, emits it once. `dispositions_root` is the
    // `outcome_tree` root over every lock claimed into the window, and `leaf_count` its
    // number of leaves. LockBox `recordOutcome` verifies it through the Aptos light client
    // and rebuilds the auction key `auction_key(window_id, pair_hash)`. It decodes
    // `eth_lock_deadline` and ignores it: LockBox computes the deadline from the window id.
    // The field layout is pinned by the golden vectors of issue 201
    // (`0xcafe::auction::AuctionOutcome`); change it only together with those vectors.
    #[event]
    struct AuctionOutcome has drop, store {
        window_id:         u64,
        pair_hash:         vector<u8>,
        eth_lock_deadline: u64,
        dispositions_root: vector<u8>,
        leaf_count:        u64,
    }

    // Emitted when opening judges a bid invalid. `reason` is 1 for a zero price and 2 for
    // collateral below `quote_for_fill(quantity, price)` at the bid's own price. It carries
    // the window key's pair bytes, because a window id alone does not name a window.
    // SCOUT(#228) EDIT: `open_bids` adds a `BidInvalid` reason for a ciphertext that does not decrypt to exactly 8 bytes.
    #[event]
    struct BidInvalid has drop, store {
        window_id: u64,
        pair_bcs:  vector<u8>,
        bid_index: u64,
        bidder:    address,
        reason:    u8,
    }

    // ===================== Helpers =====================

    #[view]
    /// The Ethereum lock deadline of window `window_id` (window close plus
    /// `eth_proof::eth_reclaim_delay_secs`). A pure function of the window id.
    /// LockBox computes the same deadline for every lock of the window, and
    /// `lock_receipt::register_ethereum_lock` proves the lock against it.
    public fun eth_lock_deadline(window_id: u64): u64 {
        eth_proof::eth_lock_deadline(window_id)
    }

    #[view]
    /// The auction key LockBox binds a lock to:
    /// keccak256(abi.encode(window_id, pair_hash)).
    public fun auction_key(window_id: u64, pair_hash: vector<u8>): vector<u8> {
        eth_proof::auction_key(window_id, pair_hash)
    }

    #[view]
    /// The pair hash of a window: keccak256 of its pair BCS (the window key's pair bytes).
    public fun pair_hash(pair_bcs: vector<u8>): vector<u8> {
        aptos_std::aptos_hash::keccak256(pair_bcs)
    }

    #[view]
    /// FakeUSD base units a winner pays for `base_amount` FakeETH wei at `clearing_price`
    /// (USD per whole FakeETH). Rounds down. Mirrors the SDK `quoteForFill`.
    public fun quote_for_fill(base_amount: u256, clearing_price: u64): u256 {
        base_amount * (clearing_price as u256) * QUOTE_UNIT / BASE_UNIT
    }

    /// Stuck deadline of a window bound to `timelock_id`, in microseconds: the reveal
    /// expiry plus the opening window plus the unwind grace. `settle` runs strictly before
    /// it and `unwind` at or after it.
    fun stuck_deadline_us(timelock_id: u64): u64 {
        timelock::get_reveal_expiry(timelock_id) + OPENING_WINDOW_US + timelock_config::get_unwind_grace_us()
    }

    /// Compute `auction_window_id` from on-chain clock.
    ///
    ///   day       = unix_seconds / 86400
    ///   t         = unix_seconds % 86400
    ///   window_id = day * 2 + (t >= 27900 ? 1 : 0) + (t >= 58500 ? 1 : 0)
    ///
    /// The id changes at the morning close, 27 900 s (07:45 UTC), and at the
    /// afternoon close, 58 500 s (16:15 UTC). `eth_proof::window_id_at` owns
    /// the formula.
    ///
    /// @see docs/architecture/v0-architecture.md §2.2
    public fun current_window_id(): u64 {
        eth_proof::window_id_at(timestamp::now_seconds())
    }

    /// Build the BCS-encoded registry key for (window_id, pair_bcs).
    ///
    /// Callers pass `pair_bcs = bcs::to_bytes(&pair)` from TypeScript (already
    /// BCS-encoded). The key is `bcs::to_bytes(window_id) || pair_bcs`.
    fun make_window_key(window_id: u64, pair_bcs: vector<u8>): vector<u8> {
        let key = bcs::to_bytes(&window_id);
        vector::append(&mut key, pair_bcs);
        key
    }

    /// Aborts unless `timelock_id` can still take bids: current epoch, `Pending`, deadline in
    /// the future. A `Pending` timelock of an earlier epoch already reads as `Expired`; the
    /// explicit epoch check gives that case its own abort code.
    fun assert_timelock_open(timelock_id: u64) {
        assert!(
            timelock::get_timelock_epoch(timelock_id) == reconfiguration::current_epoch(),
            E_TIMELOCK_WRONG_EPOCH
        );
        assert!(timelock::get_status(timelock_id) == timelock::status_pending(), E_TIMELOCK_NOT_PENDING);
        assert!(timestamp::now_microseconds() < timelock::get_deadline(timelock_id), E_TIMELOCK_DEADLINE_PASSED);
    }

    /// The timelock of `window_id`. The first call for a window id registers it with the
    /// registrar signer through `ibe_config::register_timelock_with_id`, with the window close
    /// as its deadline, and stores its id. Later calls return the stored id. The framework
    /// aborts the registration unless the package is the chain's registrar (`E_NOT_REGISTRAR`),
    /// the epoch key is ready, and the close is at least 15 minutes before the epoch end.
    fun window_timelock_or_register(window_id: u64): u64 acquires TimelockRegistrar {
        let registrar = borrow_global_mut<TimelockRegistrar>(@atomica);
        if (table::contains(&registrar.window_timelocks, window_id)) {
            let timelock_id = *table::borrow(&registrar.window_timelocks, window_id);
            assert_timelock_open(timelock_id);
            timelock_id
        } else {
            let registrar_signer = object::generate_signer_for_extending(&registrar.extend_ref);
            let deadline_us = eth_proof::window_close_secs(window_id) * 1_000_000;
            let timelock_id = ibe_config::register_timelock_with_id(&registrar_signer, deadline_us);
            table::add(&mut registrar.window_timelocks, window_id, timelock_id);
            timelock_id
        }
    }

    // ===================== Entry Functions =====================

    /// Publish the global AuctionRegistry at @atomica when the package is
    /// published, so the first `create_auction` may come from any seller.
    /// Also publish the `PairAllowlist`, seeded with the launch pair, and the
    /// `TimelockRegistrar`, whose named object registers every window timelock.
    fun init_module(atomica: &signer) {
        move_to(atomica, AuctionRegistry { windows: table::new() });
        let pairs = table::new();
        table::add(&mut pairs, launch_pair_bcs(), launch_pair());
        move_to(atomica, PairAllowlist { pairs });
        let constructor_ref = object::create_named_object(atomica, TIMELOCK_REGISTRAR_SEED);
        move_to(atomica, TimelockRegistrar {
            extend_ref:       object::generate_extend_ref(&constructor_ref),
            window_timelocks: table::new(),
        });
    }

    /// The launch pair: FakeETH against FakeUSD, both locked on Ethereum. The token names
    /// match the receipt types `lock_receipt::FakeETH` and `lock_receipt::FakeUSD`.
    fun launch_pair(): Pair {
        Pair {
            base_chain:  b"ethereum",
            base_token:  b"FakeETH",
            quote_chain: b"ethereum",
            quote_token: b"FakeUSD",
        }
    }

    #[test_only]
    /// BCS of an `AuctionOutcome`, as its event payload.
    public fun test_auction_outcome_bcs(
        window_id: u64,
        pair_hash: vector<u8>,
        eth_lock_deadline: u64,
        dispositions_root: vector<u8>,
        leaf_count: u64,
    ): vector<u8> {
        bcs::to_bytes(&AuctionOutcome { window_id, pair_hash, eth_lock_deadline, dispositions_root, leaf_count })
    }

    #[test_only]
    /// Runs `init_module` for tests whose first seller is not @atomica.
    public fun init_for_test(atomica: &signer) {
        init_module(atomica);
    }

    /// Create (or join) a global-registry auction for `(window_id, pair)`.
    ///
    /// Consumes a seller's FakeETH LockReceipt to prove on-chain escrow, then
    /// adds the lock's supply to the window's `total_supply`. Multiple sellers
    /// calling this for the same `(window_id, pair)` accumulate into the same
    /// clearing pool.
    ///
    /// Pair: `pair_bcs` must be on the allowlist (E_PAIR_NOT_ALLOWED). A new window stores
    /// the `Pair` the allowlist holds for those bytes.
    ///
    /// Timelock: one per window id, shared by every pair. The first `create_auction` of a
    /// window id registers it with the package's registrar, with deadline
    /// `eth_proof::window_close_secs(window_id)` in microseconds; no caller argument changes
    /// it. The framework aborts that registration with its own code when the chain's stored
    /// registrar is not the package (`E_NOT_REGISTRAR`, 17), when the epoch has no key, or
    /// when the close is later than 15 minutes before the epoch end. A later seller joins the
    /// stored timelock, which must still be in the current epoch (E_TIMELOCK_WRONG_EPOCH),
    /// `Pending` (E_TIMELOCK_NOT_PENDING) and before its deadline
    /// (E_TIMELOCK_DEADLINE_PASSED); no second timelock is registered for the window id.
    ///
    /// Timing: the timelock's stuck deadline plus the carrier margin must be before
    /// `eth_lock_deadline(window_id)` (E_STUCK_AFTER_LOCK_DEADLINE). The seller lock must be
    /// bound to `(window_id, pair_hash(pair_bcs))` (lock_receipt E_WRONG_BINDING).
    ///
    /// Window validation: only the current window and the immediately next window
    /// are accepted. A stale `window_id` (strictly less than `current_window_id()`)
    /// aborts with E_STALE_WINDOW_ID (6). Windows more than one step ahead are
    /// also rejected (> current + 1) to prevent pre-registration of far-future
    /// windows.
    ///
    /// Multiple sellers may call `create_auction` with the same `(window_id,
    /// pair_bcs)`. Each call claims its `lock_id` receipt, adds the locked amount
    /// to `total_supply`, and appends the `lock_id` to `lock_ids`. There is no
    /// reserve price: clearing alone sets the price.
    ///
    /// Arguments after the signer: (window_id, pair_bcs, lock_id).
    ///
    /// @see docs/architecture/v0-architecture.md §2.3
    // SCOUT(#218) EDIT: `create_auction` aborts when the window holds `MAX_SELLER_LOCKS_PER_WINDOW` locks, or when the claimed lock is below `MIN_SELLER_LOCK_AMOUNT`.
    public entry fun create_auction(
        seller:    &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
        lock_id:   vector<u8>,
    ) acquires AuctionRegistry, PairAllowlist, TimelockRegistrar {
        // 1. Validate window_id: reject stale (< current) and far-future (> current + 1).
        let current = current_window_id();
        assert!(window_id >= current, E_STALE_WINDOW_ID);
        assert!(window_id <= current + 1, E_STALE_WINDOW_ID);

        // 1a. The pair must be on the allowlist. A new window stores the listed `Pair`.
        assert!(is_pair_allowed(pair_bcs), E_PAIR_NOT_ALLOWED);
        let listed_pair = *table::borrow(&borrow_global<PairAllowlist>(@atomica).pairs, pair_bcs);

        // 1b. The window id's timelock: registered here on first use, with the window close
        //     as deadline, or the stored one, which must still take bids. Otherwise the seller
        //     lock would back a window that can never clear.
        let timelock_id = window_timelock_or_register(window_id);

        // 1c. Timing order: the stuck deadline plus the carrier margin ends before the
        //     Ethereum lock deadline, so unwind and outcome carrying finish before reclaim.
        assert!(
            stuck_deadline_us(timelock_id) + timelock_config::get_carrier_margin_us()
                < eth_lock_deadline(window_id) * 1_000_000,
            E_STUCK_AFTER_LOCK_DEADLINE
        );

        // 2. Claim the seller's FakeETH LockReceipt to prove on-chain escrow. The lock must
        //    be bound to this window and pair, so it is a leaf of this auction's outcome.
        //    The claim marks the receipt STATUS_CLAIMED and returns the locked amount.
        let seller_addr = signer::address_of(seller);
        let locked_amount = lock_receipt::claim_for_window<Ethereum, FakeETH>(
            seller_addr, lock_id, window_id, pair_hash(pair_bcs),
        );

        // 3. The global AuctionRegistry must exist at @atomica (init_module publishes it).
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);

        // 4. Build the registry key and either create or update the window.
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);

        if (!table::contains(&registry.windows, key)) {
            // First seller for this (window_id, pair) — create a fresh WindowState.
            table::add(&mut registry.windows, key, WindowState {
                pair:            listed_pair,
                window_id,
                timelock_id,
                total_supply:    (locked_amount as u256),
                bids:            vector::empty(),
                settled:         false,
                clearing_price:  0,
                lock_ids:        vector::singleton(lock_id),
                reveal_final:    false,
                refunded:        false,
                bid_results:     vector::empty(),
            });
        } else {
            // Subsequent seller — accumulate supply and append metadata.
            let state = table::borrow_mut(&mut registry.windows, key);
            state.total_supply = state.total_supply + (locked_amount as u256);
            // SCOUT(#218) EDIT: check the seller lock cap before this push.
            vector::push_back(&mut state.lock_ids, lock_id);
        };
    }

    /// Adds a pair to the allowlist from its four fields. Only `@atomica` may call it
    /// (E_NOT_PACKAGE_ACCOUNT). The contract computes the key, `bcs::to_bytes` of the `Pair`.
    /// Adding a pair that is already listed is a no-op.
    public entry fun allow_pair(
        atomica:     &signer,
        base_chain:  vector<u8>,
        base_token:  vector<u8>,
        quote_chain: vector<u8>,
        quote_token: vector<u8>,
    ) acquires PairAllowlist {
        assert!(signer::address_of(atomica) == @atomica, E_NOT_PACKAGE_ACCOUNT);
        let pair = Pair { base_chain, base_token, quote_chain, quote_token };
        let key = bcs::to_bytes(&pair);
        let allowlist = borrow_global_mut<PairAllowlist>(@atomica);
        if (!table::contains(&allowlist.pairs, key)) {
            table::add(&mut allowlist.pairs, key, pair);
        };
    }

    #[view]
    /// Associated data of a V2 bid, built on chain (spec section 6):
    /// `BCS(tag, chain_id, epoch, timelock_id, auction_id, bidder, deadline_us)`.
    ///
    /// `auction_id` is the window id. `epoch` and `deadline_us` come from the registry, so a
    /// caller cannot pick them. `bidder` is the transaction sender at submission.
    public fun bid_associated_data(
        timelock_id: u64,
        window_id:   u64,
        bidder:      address,
    ): vector<u8> {
        let ad = bcs::to_bytes(&BID_AD_TAG);
        vector::append(&mut ad, bcs::to_bytes(&chain_id::get()));
        vector::append(&mut ad, bcs::to_bytes(&timelock::get_timelock_epoch(timelock_id)));
        vector::append(&mut ad, bcs::to_bytes(&timelock_id));
        vector::append(&mut ad, bcs::to_bytes(&window_id));
        vector::append(&mut ad, bcs::to_bytes(&bidder));
        vector::append(&mut ad, bcs::to_bytes(&timelock::get_deadline(timelock_id)));
        ad
    }

    #[view]
    /// Commitment to a bid price: `sha3_256(tag || bcs(price) || salt || sha3_256(ad))`.
    ///
    /// The bid plaintext is `price_le8 || salt32`. The bidder computes this off chain and
    /// passes it to `submit_bid`. The associated data binds the commitment to one bidder,
    /// auction, epoch and timelock.
    // SCOUT(#228) REMOVE: `compute_bid_commitment`.
    public fun compute_bid_commitment(
        price: u64,
        salt:  vector<u8>,
        ad:    vector<u8>,
    ): vector<u8> {
        let input = BID_COMMIT_TAG;
        vector::append(&mut input, bcs::to_bytes(&price));
        vector::append(&mut input, salt);
        vector::append(&mut input, sha3_256(ad));
        sha3_256(input)
    }

    /// `H(vk, AD)` of a ciphertext. `vk` is the first byte vector of the BCS ciphertext.
    /// Only called after `ibe::verify_bid_ct` accepted the shape.
    fun compute_ct_id(ciphertext: &vector<u8>, ad: &vector<u8>): vector<u8> {
        let input = vector::slice(ciphertext, 1, 1 + CT_VK_LEN);
        vector::append(&mut input, *ad);
        sha3_256(input)
    }

    /// Submit a sealed bid for `(window_id, pair)`.
    ///
    /// Claims the bidder's `LockReceipt<Ethereum, FakeUSD>` identified by
    /// `collateral_lock_id` as collateral margin, then checks and stores the bid.
    ///
    /// Rules:
    ///   - the window exists, is not settled or refunded, and has room (`MAX_BIDS_PER_WINDOW`);
    ///   - the window's timelock is `Pending` and now is strictly before its deadline;
    ///   - `commitment` is 32 bytes;
    ///   - `ibe::verify_bid_ct(ciphertext, AD)` accepts, where `AD` is built here from the
    ///     registry and the sender (`bid_associated_data`). A ciphertext made for another
    ///     bidder, auction, epoch, timelock or deadline is rejected;
    ///   - no bid with the same `H(vk, AD)` is in the window;
    ///   - the collateral lock is bound to `(window_id, pair_hash(pair_bcs))`;
    ///   - `quantity` is above zero (`E_ZERO_QUANTITY`) and at most the window's
    ///     `total_supply` now (`E_QUANTITY_ABOVE_SUPPLY`). Supply only grows before the
    ///     deadline, so a bid at or below the visible supply always passes.
    ///
    /// The claimed collateral amount is stored on the bid. Opening judges the bid against it.
    ///
    /// The timing order (stuck deadline plus carrier margin before the Ethereum lock
    /// deadline) holds for every window: `create_auction` checked it for the window's
    /// timelock, and neither the timelock nor the configured values change.
    ///
    /// `quantity` is the bid quantity in wei (FakeETH base token).
    ///
    /// @see docs/architecture/v0-architecture.md §2.5
    // SCOUT(#218) EDIT: `submit_bid` aborts when the claimed collateral is below `MIN_BID_COLLATERAL`.
    // SCOUT(#228) EDIT: `submit_bid` drops the `commitment` argument, its 32-byte check and the stored field.
    public entry fun submit_bid(
        bidder:             &signer,
        window_id:          u64,
        pair_bcs:           vector<u8>,
        ciphertext:         vector<u8>,
        commitment:         vector<u8>,
        collateral_lock_id: vector<u8>,
        quantity:           u256,
    ) acquires AuctionRegistry {
        let bidder_addr = signer::address_of(bidder);

        // 2. Locate the window in the global registry.
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);

        let state = table::borrow_mut(&mut registry.windows, key);
        assert!(!state.settled, E_WINDOW_ALREADY_SETTLED);
        assert!(!state.refunded, E_WINDOW_REFUNDED);
        assert!(vector::length(&state.bids) < MAX_BIDS_PER_WINDOW, E_WINDOW_FULL);

        // 3. The timelock must still be pending and the deadline must not have passed.
        let timelock_id = state.timelock_id;
        assert!(timelock::get_status(timelock_id) == timelock::status_pending(), E_TIMELOCK_NOT_PENDING);
        assert!(timestamp::now_microseconds() < timelock::get_deadline(timelock_id), E_BID_AFTER_DEADLINE);
        assert!(vector::length(&commitment) == 32, E_INVALID_COMMITMENT);

        // 4. Verify the V2 ciphertext against the associated data built from chain state.
        let ad = bid_associated_data(timelock_id, window_id, bidder_addr);
        assert!(ibe::verify_bid_ct(ciphertext, ad), E_INVALID_CIPHERTEXT);

        // 5. Reject a duplicate ciphertext.
        let ct_id = compute_ct_id(&ciphertext, &ad);
        let i = 0u64;
        let n = vector::length(&state.bids);
        while (i < n) {
            assert!(vector::borrow(&state.bids, i).ct_id != ct_id, E_DUPLICATE_BID);
            i = i + 1;
        };

        // 6. Consume the bidder's FakeUSD LockReceipt bound to this window as collateral.
        let collateral = lock_receipt::claim_for_window<Ethereum, FakeUSD>(
            bidder_addr, collateral_lock_id, window_id, pair_hash(pair_bcs),
        );

        // 7. Bid checks. A bounded quantity keeps `quote_for_fill` and clearing in range.
        assert!(quantity > 0, E_ZERO_QUANTITY);
        assert!(quantity <= state.total_supply, E_QUANTITY_ABOVE_SUPPLY);

        // 8. Store the sealed bid.
        vector::push_back(&mut state.bids, SealedBid {
            bidder: bidder_addr,
            ciphertext,
            ct_id,
            commitment,
            collateral_lock_id,
            quantity,
            collateral,
            opened: false,
            price: 0,
            valid: true,
        });
    }

    // ===================== Reveal =====================

    /// Aborts unless openings are allowed for this window right now.
    ///
    /// Openings need the registry status `Revealed`. An `Expired` timelock never releases a
    /// key, so an opening after expiry aborts with `E_TIMELOCK_EXPIRED`.
    // SCOUT(#228) EDIT: `open_bids` becomes the only caller of `assert_openings_allowed`.
    fun assert_openings_allowed(state: &WindowState) {
        assert!(!state.settled, E_WINDOW_ALREADY_SETTLED);
        assert!(!state.refunded, E_WINDOW_REFUNDED);
        assert!(!state.reveal_final, E_REVEAL_FINAL);
        let status = timelock::get_status(state.timelock_id);
        assert!(status != timelock::status_expired(), E_TIMELOCK_EXPIRED);
        assert!(status == timelock::status_revealed(), E_TIMELOCK_NOT_REVEALED);
    }

    /// Checks `(price, salt)` against the commitment of bid `idx` and marks it opened.
    /// The bid becomes invalid, without aborting, when the price is zero or
    /// `quote_for_fill(quantity, price)` is above its collateral, and `BidInvalid` is
    /// emitted. `quantity` is at most `total_supply`, so the quote cannot overflow.
    // SCOUT(#228) REMOVE: `open_one`; the decrypt step of `open_bids` replaces it and takes over the validity rule of the bid validity issue (216).
    fun open_one(state: &mut WindowState, pair_bcs: &vector<u8>, idx: u64, price: u64, salt: vector<u8>) {
        assert!(idx < vector::length(&state.bids), E_BID_INDEX_OUT_OF_RANGE);
        assert!(vector::length(&salt) == 32, E_INVALID_SALT);
        let window_id = state.window_id;
        let ad = bid_associated_data(
            state.timelock_id, window_id, vector::borrow(&state.bids, idx).bidder
        );
        let bid = vector::borrow_mut(&mut state.bids, idx);
        assert!(!bid.opened, E_BID_ALREADY_OPENED);
        assert!(compute_bid_commitment(price, salt, ad) == bid.commitment, E_INVALID_CLEARTEXT);
        bid.opened = true;
        bid.price = price;
        event::emit(BidOpened { window_id, bid_index: idx, bidder: bid.bidder, price });
        let reason = if (price == 0) {
            INVALID_ZERO_PRICE
        } else if (quote_for_fill(bid.quantity, price) > bid.collateral) {
            INVALID_COLLATERAL_BELOW_QUOTE
        } else {
            return
        };
        bid.valid = false;
        event::emit(BidInvalid { window_id, pair_bcs: *pair_bcs, bid_index: idx, bidder: bid.bidder, reason });
    }

    // SCOUT(#228) REMOVE: `count_opened`; the opening cursor replaces this scan.
    fun count_opened(state: &WindowState): u64 {
        let i = 0u64;
        let opened = 0u64;
        let n = vector::length(&state.bids);
        while (i < n) {
            if (vector::borrow(&state.bids, i).opened) { opened = opened + 1; };
            i = i + 1;
        };
        opened
    }

    /// Closes openings: sets `reveal_final` and clears the window at the uniform price
    /// on `bids[i].price` (zero for an unopened bid).
    /// Every finalizing path (`open_bid`, `submit_cleartext_and_clear`, `finalize_reveal`)
    /// therefore leaves the window ready for `settle`.
    ///
    /// @see docs/architecture/v0-architecture.md §2.6 and §2.7
    // SCOUT(#228) EDIT: `open_bids` calls `finalize_internal` when the cursor passes the last bid; the `RevealFinalized` event goes away.
    fun finalize_internal(state: &mut WindowState) {
        let n = vector::length(&state.bids);
        let opened_count = count_opened(state);
        state.reveal_final = true;
        event::emit(RevealFinalized { window_id: state.window_id, bid_count: n, opened_count });
        clear_internal(state);
    }

    /// Opens one bid. Anyone may call it, for any bid, with the bid's price and 32-byte salt.
    ///
    /// The registry status must be `Revealed`. The opening must match the commitment stored
    /// at submission. Each bid opens once. When the last bid opens, the reveal finalizes.
    // SCOUT(#228) REMOVE: `open_bid`.
    public entry fun open_bid(
        _caller:   &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
        bid_index: u64,
        price:     u64,
        salt:      vector<u8>,
    ) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let state = table::borrow_mut(&mut registry.windows, key);

        assert_openings_allowed(state);
        open_one(state, &pair_bcs, bid_index, price, salt);
        if (count_opened(state) == vector::length(&state.bids)) {
            finalize_internal(state);
        };
    }

    /// Opens many bids in one call, index-aligned to the window's bids.
    ///
    /// `cleartexts[i]` and `salts[i]` open bid `i`. An empty salt skips bid `i`: use it for
    /// a bid that is already opened, or one the caller cannot open. Any wrong opening aborts
    /// the whole call. When every bid is opened the reveal finalizes and the window clears
    /// at the uniform price in the same call. Otherwise call `finalize_reveal` after the
    /// opening window.
    ///
    /// Nothing here is trusted: the contract checks each opening against the commitment and
    /// the registry status. A settler cannot change a price.
    ///
    /// @see docs/architecture/v0-architecture.md §2.6
    // SCOUT(#228) REMOVE: `submit_cleartext_and_clear`.
    public entry fun submit_cleartext_and_clear(
        _settler:   &signer,
        window_id:  u64,
        pair_bcs:   vector<u8>,
        cleartexts: vector<u64>,
        salts:      vector<vector<u8>>,
    ) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let state = table::borrow_mut(&mut registry.windows, key);

        let bid_count = vector::length(&state.bids);
        assert!(vector::length(&cleartexts) == bid_count, E_CLEARTEXT_COUNT_MISMATCH);
        assert!(vector::length(&salts) == bid_count, E_CLEARTEXT_COUNT_MISMATCH);
        assert_openings_allowed(state);

        let i = 0u64;
        while (i < bid_count) {
            let salt = *vector::borrow(&salts, i);
            if (!vector::is_empty(&salt)) {
                open_one(state, &pair_bcs, i, *vector::borrow(&cleartexts, i), salt);
            };
            i = i + 1;
        };

        if (count_opened(state) == bid_count) {
            finalize_internal(state);
        };
    }

    /// Closes openings once every bid is opened or the opening window has elapsed.
    ///
    /// The opening window ends `OPENING_WINDOW_US` after the registry's `reveal_expiry_us`.
    /// Unopened bids never fill, and `settle` returns their whole collateral.
    /// The window clears at the uniform price in the same call.
    // SCOUT(#228) REMOVE: `finalize_reveal`.
    public entry fun finalize_reveal(
        _caller:   &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
    ) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let state = table::borrow_mut(&mut registry.windows, key);

        assert_openings_allowed(state);
        let all_opened = count_opened(state) == vector::length(&state.bids);
        let window_elapsed = timestamp::now_microseconds()
            >= timelock::get_reveal_expiry(state.timelock_id) + OPENING_WINDOW_US;
        assert!(all_opened || window_elapsed, E_OPENING_WINDOW_OPEN);
        finalize_internal(state);
    }

    // SCOUT(#228) ADD: any account opens up to `max_bids` bids in bid order from the stored cursor with `ibe::decrypt_bid`; the call that opens the last bid clears the window. The pinned framework has no `ibe::decrypt_bid` yet.
    /// Opens the next `max_bids` bids of a window from their ciphertexts.
    public entry fun open_bids(
        _caller:    &signer,
        _window_id: u64,
        _pair_bcs:  vector<u8>,
        _max_bids:  u64,
    ) {
        abort E_NOT_IMPLEMENTED
    }

    // ===================== Refund =====================

    /// Returns every receipt of a window whose timelock is `Expired` to its depositor.
    ///
    /// The registry status must be `Expired` for any reason (epoch ended, reveal window
    /// elapsed, key check failed). No key exists, so no bid can ever open. Each bidder's
    /// FakeUSD collateral and each seller's FakeETH lock gets the outcome record
    /// "whole amount to the depositor", and the window emits its one all-refund
    /// `AuctionOutcome`. The window is marked refunded and takes no more bids, openings,
    /// clearing or settlement. A second call aborts.
    public entry fun refund_expired_window(
        _caller:   &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
    ) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let state = table::borrow_mut(&mut registry.windows, key);

        assert!(!state.settled, E_WINDOW_ALREADY_SETTLED);
        assert!(!state.refunded, E_WINDOW_REFUNDED);
        let timelock_id = state.timelock_id;
        assert!(timelock::get_status(timelock_id) == timelock::status_expired(), E_TIMELOCK_NOT_EXPIRED);
        refund_internal(state, pair_bcs);
    }

    /// The all-refund finalization of a window that never settled: every claimed lock goes
    /// back to its depositor, the window emits its one `AuctionOutcome` and
    /// `AuctionRefunded`, and is marked refunded. Returns the number of locks returned.
    fun refund_internal(state: &mut WindowState, pair_bcs: vector<u8>): u64 {
        let lock_ids = vector::empty<vector<u8>>();
        let hashes = vector::empty<vector<u8>>();
        let bid_count = vector::length(&state.bids);
        let i = 0u64;
        while (i < bid_count) {
            let id = vector::borrow(&state.bids, i).collateral_lock_id;
            vector::push_back(&mut hashes, lock_receipt::return_to_depositor<Ethereum, FakeUSD>(id));
            vector::push_back(&mut lock_ids, id);
            i = i + 1;
        };
        let seller_lock_count = vector::length(&state.lock_ids);
        let j = 0u64;
        while (j < seller_lock_count) {
            let id = *vector::borrow(&state.lock_ids, j);
            vector::push_back(&mut hashes, lock_receipt::return_to_depositor<Ethereum, FakeETH>(id));
            vector::push_back(&mut lock_ids, id);
            j = j + 1;
        };

        state.refunded = true;
        let window_id = state.window_id;
        let timelock_id = state.timelock_id;
        emit_outcome(window_id, pair_bcs, lock_ids, hashes);
        event::emit(AuctionRefunded {
            window_id,
            pair_bcs,
            timelock_id,
            reason: timelock::get_expiry_reason(timelock_id),
            bid_count,
            seller_lock_count,
        });
        bid_count + seller_lock_count
    }

    /// Emits the window's one `AuctionOutcome`: the `outcome_tree` root over the leaves
    /// `(lock_ids[i], payouts_hashes[i])`. A window without locks has no Ethereum side, so
    /// it emits nothing (LockBox rejects an empty tree).
    fun emit_outcome(
        window_id:      u64,
        pair_bcs:       vector<u8>,
        lock_ids:       vector<vector<u8>>,
        payouts_hashes: vector<vector<u8>>,
    ) {
        let leaf_count = vector::length(&lock_ids);
        if (leaf_count == 0) return;
        let leaves = outcome_tree::sorted_leaves(lock_ids, payouts_hashes);
        event::emit(AuctionOutcome {
            window_id,
            pair_hash:         pair_hash(pair_bcs),
            eth_lock_deadline: eth_lock_deadline(window_id),
            dispositions_root: outcome_tree::root(&leaves),
            leaf_count,
        });
    }

    /// Unwind a finished or stuck window. Anyone may call it at or after the window's stuck
    /// deadline (E_NOT_STUCK before it).
    ///
    /// - A window that never settled or refunded gets the all-refund finalization of an
    ///   expired timelock, whatever its reveal state: every lock goes back to its depositor
    ///   and the window emits its one all-refund `AuctionOutcome`.
    /// - A settled or refunded window already emitted its outcome. Unwind returns only the
    ///   receipts it still holds (status CLAIMED) to their depositors and emits no second
    ///   `AuctionOutcome`. With nothing held it aborts E_WINDOW_FINAL.
    ///
    /// Emits `AuctionUnwound`.
    ///
    /// @see docs/specifications/auction-timing.md
    public entry fun unwind(
        _caller:   &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
    ) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let state = table::borrow_mut(&mut registry.windows, key);

        assert!(timestamp::now_microseconds() >= stuck_deadline_us(state.timelock_id), E_NOT_STUCK);

        let outcome_emitted = !state.settled && !state.refunded;
        let returned_count = if (outcome_emitted) {
            refund_internal(state, pair_bcs)
        } else {
            return_held(state)
        };
        assert!(returned_count > 0, E_WINDOW_FINAL);
        event::emit(AuctionUnwound { window_id, pair_bcs, returned_count, outcome_emitted });
    }

    /// Returns every receipt of a finalized window that is still CLAIMED to its depositor.
    /// Returns how many it returned.
    fun return_held(state: &WindowState): u64 {
        let count = 0u64;
        let claimed = lock_receipt::status_claimed();
        let i = 0u64;
        let n = vector::length(&state.bids);
        while (i < n) {
            let id = vector::borrow(&state.bids, i).collateral_lock_id;
            let (_, _, _, status, _) = lock_receipt::get_receipt<Ethereum, FakeUSD>(id);
            if (status == claimed) {
                lock_receipt::return_to_depositor<Ethereum, FakeUSD>(id);
                count = count + 1;
            };
            i = i + 1;
        };
        let j = 0u64;
        let m = vector::length(&state.lock_ids);
        while (j < m) {
            let id = *vector::borrow(&state.lock_ids, j);
            let (_, _, _, status, _) = lock_receipt::get_receipt<Ethereum, FakeETH>(id);
            if (status == claimed) {
                lock_receipt::return_to_depositor<Ethereum, FakeETH>(id);
                count = count + 1;
            };
            j = j + 1;
        };
        count
    }

    /// Clears a window whose reveal is final. Anyone may call it.
    ///
    /// Finalizing the reveal already clears the window (`finalize_internal`), so on a
    /// window with bids this call changes nothing: `clearing_price` and `bid_results` stay
    /// as they are. A window with no bids gets `clearing_price = 0`. Aborts on a settled or
    /// refunded window, and on a window with bids whose reveal is not final.
    ///
    /// @see docs/architecture/v0-architecture.md §2.7
    public entry fun clear_uniform_price(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);

        let state = table::borrow_mut(&mut registry.windows, key);
        assert!(!state.settled, E_WINDOW_ALREADY_SETTLED);
        assert!(!state.refunded, E_WINDOW_REFUNDED);
        let bid_count = vector::length(&state.bids);
        if (bid_count > 0) {
            // Openings must be closed. Unopened bids are invalid and never fill.
            assert!(state.reveal_final, E_REVEAL_NOT_FINAL);
            // Already cleared: finalization ran the clearing. Change nothing.
            if (vector::length(&state.bid_results) == bid_count) return
        };
        clear_internal(state);
    }

    /// Sort sealed bids descending by revealed price and compute the marginal
    /// (uniform) clearing price that allocates the full supply.  Partial fill
    /// is applied to the last qualifying bid so that total allocation equals
    /// `total_supply` exactly.
    ///
    /// Algorithm (§2.7):
    ///   1. Build an index array sorted descending by `bids[i].price`.
    ///   2. Walk sorted indices, accumulating quantity until total_supply is met.
    ///      Unopened and invalid bids are skipped: they never fill or set the price.
    ///   3. The last bid whose cumulative quantity does not exceed supply sets
    ///      the clearing price. If that bid would overfill, it gets a partial
    ///      fill equal to the remaining supply. All bids at higher prices win
    ///      fully; all bids below the clearing price are marked losing.
    ///   4. Write BidResult for each bid into WindowState.bid_results.
    ///   5. Write clearing_price into WindowState.clearing_price.
    ///
    /// Precondition: the reveal is final, so every opened bid holds its price.
    /// Callers: `finalize_internal` and `clear_uniform_price`.
    ///
    /// @see docs/architecture/v0-architecture.md §2.7
    fun clear_internal(state: &mut WindowState) {
        let bid_count = vector::length(&state.bids);

        // 1. Handle zero-bid case: no clearing possible — set clearing_price=0,
        //    bid_results stays empty, and return without aborting.
        if (bid_count == 0) {
            state.clearing_price = 0;
            return
        };

        // 2. Build a sorted index array (descending by revealed price).
        //    Insertion sort O(n^2) — acceptable for small auction windows (≤ 100 bids).
        //    sorted_idx[i] = original index of the i-th highest-priced bid.
        let sorted_idx = vector::empty<u64>();
        let k = 0u64;
        while (k < bid_count) {
            vector::push_back(&mut sorted_idx, k);
            k = k + 1;
        };

        // Insertion sort: sort sorted_idx descending by bids[sorted_idx[i]].price.
        let i = 1u64;
        while (i < bid_count) {
            let j = i;
            while (j > 0) {
                let idx_j   = *vector::borrow(&sorted_idx, j);
                let idx_j1  = *vector::borrow(&sorted_idx, j - 1);
                let price_j  = vector::borrow(&state.bids, idx_j).price;
                let price_j1 = vector::borrow(&state.bids, idx_j1).price;
                if (price_j > price_j1) {
                    // Swap
                    *vector::borrow_mut(&mut sorted_idx, j)     = idx_j1;
                    *vector::borrow_mut(&mut sorted_idx, j - 1) = idx_j;
                    j = j - 1;
                } else {
                    break
                };
            };
            i = i + 1;
        };

        // 3. Walk sorted bids and accumulate quantity to supply.
        let supply = state.total_supply;
        let accumulated: u256 = 0;
        let clearing_price: u64 = 0;
        // marginal_sorted_pos: the position in sorted_idx of the marginal bid
        // (the last bid that contributes to fill).
        let marginal_sorted_pos: u64 = 0;
        let marginal_fill: u256 = 0;  // partial fill for the marginal bid
        let winner_found = false;

        let s = 0u64;
        while (s < bid_count) {
            let orig_idx = *vector::borrow(&sorted_idx, s);
            if (!can_fill(vector::borrow(&state.bids, orig_idx))) {
                // Unopened or invalid bid: never fills.
                s = s + 1;
                continue
            };
            winner_found = true;
            let qty = vector::borrow(&state.bids, orig_idx).quantity;
            let price = vector::borrow(&state.bids, orig_idx).price;

            // accumulated <= supply here, so the subtraction cannot underflow and a huge
            // quantity cannot overflow.
            if (qty <= supply - accumulated) {
                // Full fill — this bid fits entirely.
                accumulated = accumulated + qty;
                clearing_price = price;
                marginal_sorted_pos = s;
                marginal_fill = qty;

                if (accumulated == supply) {
                    break
                };
            } else {
                // Partial fill — this bid overfills; allocate the remainder.
                let remaining = supply - accumulated;
                // accumulated is not read again after this point.
                let _ = accumulated;
                clearing_price = price;
                marginal_sorted_pos = s;
                marginal_fill = remaining;
                break
            };
            s = s + 1;
        };

        // If we exhausted all bids without filling supply, the last processed
        // bid is already recorded in marginal_sorted_pos / clearing_price /
        // marginal_fill above: the loop sets them on every iteration.

        // 4. Build BidResult vector aligned to bids (not to sorted order).
        //    Initialise all results as losing with fill_amount = 0.
        let results = vector::empty<BidResult>();
        let r = 0u64;
        while (r < bid_count) {
            let bidder_addr = vector::borrow(&state.bids, r).bidder;
            vector::push_back(&mut results, BidResult {
                bidder: bidder_addr,
                is_winner: false,
                fill_amount: 0,
                clearing_price,
            });
            r = r + 1;
        };

        // Mark winners: positions 0..marginal_sorted_pos-1 are full fills;
        // position marginal_sorted_pos gets marginal_fill.
        let w = 0u64;
        while (winner_found && w <= marginal_sorted_pos) {
            let orig_idx = *vector::borrow(&sorted_idx, w);
            if (!can_fill(vector::borrow(&state.bids, orig_idx))) {
                w = w + 1;
                continue
            };
            let result = vector::borrow_mut(&mut results, orig_idx);
            result.is_winner = true;
            if (w < marginal_sorted_pos) {
                result.fill_amount = vector::borrow(&state.bids, orig_idx).quantity;
            } else {
                result.fill_amount = marginal_fill;
            };
            w = w + 1;
        };

        // 5. Commit results.
        state.bid_results = results;
        state.clearing_price = clearing_price;
    }

    /// True when bid `bid` takes part in clearing: opened and valid.
    fun can_fill(bid: &SealedBid): bool {
        bid.opened && bid.valid
    }

    /// Settle the window: honour the cleared fills and give every lock its terminal outcome.
    ///
    /// Prerequisites: a window with bids must have a final reveal. Finalizing the reveal
    /// (`open_bid` or `submit_cleartext_and_clear` opening the last bid, or
    /// `finalize_reveal` after the opening window) clears the window, which populates
    /// `WindowState.bid_results`. If `bid_results` is not populated and there are bids,
    /// the function aborts with E_AUCTION_NOT_ENDED to signal that clearing has not yet
    /// occurred. A window with no bids needs no clearing call.
    ///
    /// Steps (§2.8, §2.9):
    ///   1. Validate window exists and has not already been settled or refunded.
    ///   1b. Timelock guards: the deadline has passed (E_DEADLINE_NOT_PASSED), the stuck
    ///       deadline has not (E_PAST_STUCK_DEADLINE: use `unwind`), the timelock is not
    ///       `Expired` (E_TIMELOCK_EXPIRED: use `refund_expired_window`) and it is
    ///       `Revealed` (E_TIMELOCK_NOT_REVEALED). A window with bids also needs
    ///       `reveal_final` (E_REVEAL_NOT_FINAL). Empty-auction rule: a window with no bids
    ///       settles once the key is revealed after the deadline, since no bid can arrive.
    ///   2. Verify clearing has run (bid_results length == bids length).
    ///   3. Allocate fills (the SDK `planSettlementReleases` order): winners in bid order
    ///      take supply from the seller locks in `lock_ids` order. Each chunk pays the
    ///      chunk of FakeETH to the winner's `eth_owner` and `quote_for_fill(chunk)` FakeUSD
    ///      to the seller's `eth_owner`. A winner's unused collateral (rounding dust
    ///      included), each seller's unsold supply, and the whole collateral of a losing,
    ///      unopened or invalid bid go back to the depositor. A fill that does not fit the locks aborts
    ///      E_UNPAYABLE_FILL.
    ///   4. Record each lock's outcome (`lock_receipt::record_outcome`), which refuses a
    ///      payout list LockBox could not pay.
    ///   5. Emit `AuctionSettled` and the window's one `AuctionOutcome` over every lock.
    ///   6. Mark the window settled.
    ///
    /// @see docs/architecture/v0-architecture.md §2.8 and §2.9
    // SCOUT(#228) EDIT: `settle` aborts until `open_bids` has opened every bid; no `finalize_reveal` is left to close a partly opened window.
    public entry fun settle(
        _caller:   &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
    ) acquires AuctionRegistry {
        // 1. Locate the window.
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);

        let state = table::borrow_mut(&mut registry.windows, key);

        // Guard against double-settle and settling a refunded window.
        assert!(!state.settled, E_WINDOW_ALREADY_SETTLED);
        assert!(!state.refunded, E_WINDOW_REFUNDED);

        // 1b. Timelock guards. Before the deadline the window still takes bids, so nobody
        //     may close it. From the stuck deadline on, only `unwind` finalizes it. An
        //     expired timelock goes through `refund_expired_window`.
        let timelock_id = state.timelock_id;
        let now = timestamp::now_microseconds();
        assert!(now >= timelock::get_deadline(timelock_id), E_DEADLINE_NOT_PASSED);
        assert!(now < stuck_deadline_us(timelock_id), E_PAST_STUCK_DEADLINE);
        let status = timelock::get_status(timelock_id);
        assert!(status != timelock::status_expired(), E_TIMELOCK_EXPIRED);
        assert!(status == timelock::status_revealed(), E_TIMELOCK_NOT_REVEALED);

        let bid_count    = vector::length(&state.bids);
        let result_count = vector::length(&state.bid_results);
        assert!(bid_count == 0 || state.reveal_final, E_REVEAL_NOT_FINAL);

        // 2. Verify clearing has been run.
        //    Finalizing the reveal clears the window, so bid_results is populated
        //    whenever reveal_final is set.
        assert!(result_count == bid_count, E_AUCTION_NOT_ENDED);

        // 3-4. Allocate the fills and record every lock's outcome.
        let (lock_ids, hashes, total_filled, winner_count) = settle_locks(state);

        // 5. Emit AuctionSettled and the one AuctionOutcome.
        event::emit(AuctionSettled {
            window_id,
            pair:           state.pair,
            pair_bcs,
            clearing_price: state.clearing_price,
            total_filled,
            winner_count,
            lock_ids:       state.lock_ids,
        });
        emit_outcome(window_id, pair_bcs, lock_ids, hashes);

        // 6. Mark window settled.
        state.settled = true;
    }

    /// Allocates the cleared fills of `state` to its locks and records each lock's outcome.
    /// Returns (lock ids, payouts hashes, total filled, winner count). See `settle` step 3.
    fun settle_locks(state: &WindowState): (vector<vector<u8>>, vector<vector<u8>>, u256, u64) {
        let lock_ids = vector::empty<vector<u8>>();
        let hashes = vector::empty<vector<u8>>();
        let clearing_price = state.clearing_price;

        // Seller locks: remaining supply, Ethereum owner, and payouts so far.
        let seller_count = vector::length(&state.lock_ids);
        let supply_left = vector::empty<u256>();
        let seller_owner = vector::empty<vector<u8>>();
        let seller_to = vector::empty<vector<vector<u8>>>();
        let seller_amounts = vector::empty<vector<u256>>();
        let s = 0u64;
        while (s < seller_count) {
            let (_, amount, _, _, owner) =
                lock_receipt::get_receipt<Ethereum, FakeETH>(*vector::borrow(&state.lock_ids, s));
            vector::push_back(&mut supply_left, amount);
            vector::push_back(&mut seller_owner, owner);
            vector::push_back(&mut seller_to, vector::empty());
            vector::push_back(&mut seller_amounts, vector::empty());
            s = s + 1;
        };

        // Bids in bid order. Winners take supply from the sellers in lock order.
        let total_filled: u256 = 0;
        let winner_count = 0u64;
        let bid_count = vector::length(&state.bids);
        let i = 0u64;
        while (i < bid_count) {
            let collateral_id = vector::borrow(&state.bids, i).collateral_lock_id;
            let (_, collateral, _, _, bidder_owner) =
                lock_receipt::get_receipt<Ethereum, FakeUSD>(collateral_id);
            let to = vector::empty<vector<u8>>();
            let amounts = vector::empty<u256>();
            let left = collateral;
            let result = vector::borrow(&state.bid_results, i);
            if (result.is_winner) {
                winner_count = winner_count + 1;
                total_filled = total_filled + result.fill_amount;
                let unfilled = result.fill_amount;
                let k = 0u64;
                while (unfilled > 0 && k < seller_count) {
                    let avail = *vector::borrow(&supply_left, k);
                    if (avail > 0) {
                        let chunk = if (unfilled < avail) { unfilled } else { avail };
                        let quote = quote_for_fill(chunk, clearing_price);
                        assert!(quote <= left, E_UNPAYABLE_FILL);
                        vector::push_back(vector::borrow_mut(&mut seller_to, k), bidder_owner);
                        vector::push_back(vector::borrow_mut(&mut seller_amounts, k), chunk);
                        if (quote > 0) {
                            vector::push_back(&mut to, *vector::borrow(&seller_owner, k));
                            vector::push_back(&mut amounts, quote);
                        };
                        *vector::borrow_mut(&mut supply_left, k) = avail - chunk;
                        unfilled = unfilled - chunk;
                        left = left - quote;
                    };
                    k = k + 1;
                };
                assert!(unfilled == 0, E_UNPAYABLE_FILL);
            };
            // Unused collateral, rounding dust, or a losing or unopened bid's whole
            // collateral goes back to the bidder.
            if (left > 0 || vector::is_empty(&to)) {
                vector::push_back(&mut to, bidder_owner);
                vector::push_back(&mut amounts, left);
            };
            vector::push_back(&mut hashes, lock_receipt::record_outcome<Ethereum, FakeUSD>(collateral_id, to, amounts));
            vector::push_back(&mut lock_ids, collateral_id);
            i = i + 1;
        };

        // Seller locks: unsold supply goes back to the seller.
        let t = 0u64;
        while (t < seller_count) {
            let id = *vector::borrow(&state.lock_ids, t);
            let to = *vector::borrow(&seller_to, t);
            let amounts = *vector::borrow(&seller_amounts, t);
            let unsold = *vector::borrow(&supply_left, t);
            if (unsold > 0 || vector::is_empty(&to)) {
                vector::push_back(&mut to, *vector::borrow(&seller_owner, t));
                vector::push_back(&mut amounts, unsold);
            };
            vector::push_back(&mut hashes, lock_receipt::record_outcome<Ethereum, FakeETH>(id, to, amounts));
            vector::push_back(&mut lock_ids, id);
            t = t + 1;
        };
        (lock_ids, hashes, total_filled, winner_count)
    }

    #[view]
    /// The stuck deadline of a window in microseconds: from it on, anyone may `unwind`
    /// the window and `settle` aborts.
    public fun get_stuck_deadline_us(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): u64 acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        stuck_deadline_us(table::borrow(&registry.windows, key).timelock_id)
    }

    // ===================== View Functions =====================

    // Return the WindowState fields for (window_id, pair_bcs).
    //
    // Returns (window_id, total_supply, bid_count, settled, clearing_price).
    // Aborts with E_AUCTION_NOT_FOUND if no entry exists.
    #[view]
    public fun get_auction(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): (u64, u256, u64, bool, u64) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let w = table::borrow(&registry.windows, key);
        (w.window_id, w.total_supply, vector::length(&w.bids), w.settled, w.clearing_price)
    }

    // Return (bidder, ciphertext, commitment, opened, price, valid) of bid `bid_index`.
    // `valid` is false once opening judged the bid invalid, and true for an unopened bid.
    // Off-chain relayers read ciphertexts here, decrypt them with the revealed key and
    // open the bids. Aborts with E_AUCTION_NOT_FOUND or E_BID_INDEX_OUT_OF_RANGE.
    #[view]
    // SCOUT(#228) EDIT: the `get_bid_info` tuple loses `commitment`, a second positional break for the same SDK reader.
    public fun get_bid_info(
        window_id: u64,
        pair_bcs:  vector<u8>,
        bid_index: u64,
    ): (address, vector<u8>, vector<u8>, bool, u64, bool) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let w = table::borrow(&registry.windows, key);
        assert!(bid_index < vector::length(&w.bids), E_BID_INDEX_OUT_OF_RANGE);
        let b = vector::borrow(&w.bids, bid_index);
        (b.bidder, b.ciphertext, b.commitment, b.opened, b.price, b.valid)
    }

    // Return the per-bid fill results of a window, index-aligned to bids. Empty until
    // clearing ran. The relayer joins them with `get_window_lock_ids` after `AuctionSettled`.
    #[view]
    public fun get_bid_results(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): vector<BidResult> acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        table::borrow(&registry.windows, key).bid_results
    }

    // Return (seller lock ids, bid collateral lock ids) of a window. Collateral ids are
    // index-aligned to bids and to `get_bid_results`. The relayer reads this to release
    // the matching Ethereum locks after `AuctionRefunded` or `AuctionSettled`.
    #[view]
    public fun get_window_lock_ids(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): (vector<vector<u8>>, vector<vector<u8>>) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let w = table::borrow(&registry.windows, key);
        let collateral = vector::empty<vector<u8>>();
        let i = 0u64;
        let n = vector::length(&w.bids);
        while (i < n) {
            vector::push_back(&mut collateral, vector::borrow(&w.bids, i).collateral_lock_id);
            i = i + 1;
        };
        (w.lock_ids, collateral)
    }

    // Return (timelock_id, reveal_final, refunded) of a window.
    #[view]
    // SCOUT(#228) EDIT: clients need the opening cursor to drive `open_bids` batches; return it from `get_window_status` or add a view. The issue text names neither.
    public fun get_window_status(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): (u64, bool, bool) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let w = table::borrow(&registry.windows, key);
        (w.timelock_id, w.reveal_final, w.refunded)
    }

    // Return the number of sealed bids submitted for (window_id, pair_bcs).
    // Returns 0 if the window does not exist.
    #[view]
    public fun get_bid_count(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): u64 acquires AuctionRegistry {
        if (!exists<AuctionRegistry>(@atomica)) return 0;
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        if (!table::contains(&registry.windows, key)) return 0;
        vector::length(&table::borrow(&registry.windows, key).bids)
    }

    // Return true if the window has been settled.
    // Returns false if the window does not exist.
    #[view]
    public fun is_settled(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): bool acquires AuctionRegistry {
        if (!exists<AuctionRegistry>(@atomica)) return false;
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        if (!table::contains(&registry.windows, key)) return false;
        table::borrow(&registry.windows, key).settled
    }

    // Return true if the AuctionRegistry exists at @atomica and contains an
    // entry for (window_id, pair_bcs).
    #[view]
    public fun auction_exists(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): bool acquires AuctionRegistry {
        if (!exists<AuctionRegistry>(@atomica)) return false;
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        table::contains(&registry.windows, key)
    }

    // SCOUT(#218) ADD: one view of the four window limits: (max bids, max seller locks, min seller lock amount, min bid collateral).
    #[view]
    public fun get_window_limits(): (u64, u64, u256, u256) {
        abort E_NOT_IMPLEMENTED
    }

    #[view]
    /// Whether `pair_bcs` is on the allowlist.
    public fun is_pair_allowed(pair_bcs: vector<u8>): bool acquires PairAllowlist {
        exists<PairAllowlist>(@atomica)
            && table::contains(&borrow_global<PairAllowlist>(@atomica).pairs, pair_bcs)
    }

    #[view]
    /// The BCS bytes of the launch pair (computed, reads no storage). The SDK exports the
    /// same bytes as `LAUNCH_PAIR_BCS`.
    public fun launch_pair_bcs(): vector<u8> {
        bcs::to_bytes(&launch_pair())
    }

    #[view]
    /// The package's timelock registrar address,
    /// `object::create_object_address(&@atomica, TIMELOCK_REGISTRAR_SEED)`. Genesis names it
    /// as the chain's registrar (`ibe_config::timelock_registrar`).
    public fun timelock_registrar_address(): address {
        object::create_object_address(&@atomica, TIMELOCK_REGISTRAR_SEED)
    }

    #[view]
    /// The timelock id registered for `window_id`, shared by every pair of the window id.
    /// Aborts with E_AUCTION_NOT_FOUND until a `create_auction` of the window id registered it:
    /// until then no window of that id exists, for any pair.
    public fun window_timelock(window_id: u64): u64 acquires TimelockRegistrar {
        assert!(exists<TimelockRegistrar>(@atomica), E_AUCTION_NOT_FOUND);
        let timelocks = &borrow_global<TimelockRegistrar>(@atomica).window_timelocks;
        assert!(table::contains(timelocks, window_id), E_AUCTION_NOT_FOUND);
        *table::borrow(timelocks, window_id)
    }

    #[view]
    /// The timelock deadline of `window_id` in microseconds: its window close. Bids are
    /// accepted strictly before it. Aborts like `window_timelock`.
    public fun window_deadline_us(window_id: u64): u64 acquires TimelockRegistrar {
        timelock::get_deadline(window_timelock(window_id))
    }

    // Return (clearing_price, total_filled) after settlement. `total_filled` is the
    // sum of the bid results' `fill_amount`.
    // Aborts with E_AUCTION_NOT_FOUND if no entry exists.
    // Returns (0, 0) if not yet settled.
    #[view]
    public fun get_settlement(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): (u64, u256) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let w = table::borrow(&registry.windows, key);
        if (!w.settled) return (0, 0);
        let total_filled: u256 = 0;
        let i = 0u64;
        let n = vector::length(&w.bid_results);
        while (i < n) {
            total_filled = total_filled + vector::borrow(&w.bid_results, i).fill_amount;
            i = i + 1;
        };
        (w.clearing_price, total_filled)
    }

    // ===================== Test helpers =====================

    // Append a SealedBid directly to an existing WindowState for unit tests,
    // bypassing submit_bid. Quantity defaults to 0; use test_insert_bid_with_qty
    // when the clearing algorithm needs a non-zero quantity.
    #[test_only]
    public fun test_insert_bid(
        atomica:            &signer,
        window_id:          u64,
        pair_bcs:           vector<u8>,
        bidder:             address,
        ciphertext:         vector<u8>,
        collateral_lock_id: vector<u8>,
    ) acquires AuctionRegistry {
        test_insert_bid_with_qty(atomica, window_id, pair_bcs, bidder, ciphertext, collateral_lock_id, 0u256);
    }

    // Append a SealedBid with an explicit quantity for clearing algorithm tests.
    // The bid is unopened with an empty commitment. Use test_set_revealed_prices to mark
    // bids opened with a price and close the reveal.
    #[test_only]
    public fun test_insert_bid_with_qty(
        atomica:            &signer,
        window_id:          u64,
        pair_bcs:           vector<u8>,
        bidder:             address,
        ciphertext:         vector<u8>,
        collateral_lock_id: vector<u8>,
        quantity:           u256,
    ) acquires AuctionRegistry {
        test_insert_committed_bid(
            atomica, window_id, pair_bcs, bidder, ciphertext, vector::empty(), collateral_lock_id, quantity
        );
    }

    // Append a SealedBid with an explicit commitment (test-only).
    #[test_only]
    // SCOUT(#228) REMOVE: the `commitment` argument of `test_insert_committed_bid`; fold the helper into `test_insert_bid_with_qty`.
    public fun test_insert_committed_bid(
        atomica:            &signer,
        window_id:          u64,
        pair_bcs:           vector<u8>,
        bidder:             address,
        ciphertext:         vector<u8>,
        commitment:         vector<u8>,
        collateral_lock_id: vector<u8>,
        quantity:           u256,
    ) acquires AuctionRegistry {
        let addr = signer::address_of(atomica);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(addr);
        let state = table::borrow_mut(&mut registry.windows, key);
        vector::push_back(&mut state.bids, SealedBid {
            bidder,
            ct_id: sha3_256(ciphertext),
            ciphertext,
            commitment,
            collateral_lock_id,
            quantity,
            collateral: 0,
            opened: false,
            price: 0,
            valid: true,
        });
    }

    // Set the stored collateral of bid `bid_index` (test-only). Inserted bids hold zero.
    #[test_only]
    public fun test_set_bid_collateral(
        atomica:    &signer,
        window_id:  u64,
        pair_bcs:   vector<u8>,
        bid_index:  u64,
        collateral: u256,
    ) acquires AuctionRegistry {
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(signer::address_of(atomica));
        let state = table::borrow_mut(&mut registry.windows, key);
        vector::borrow_mut(&mut state.bids, bid_index).collateral = collateral;
    }

    // Destructure a BidInvalid event into (window_id, pair_bcs, bid_index, bidder, reason)
    // (test-only).
    #[test_only]
    public fun test_bid_invalid_fields(e: &BidInvalid): (u64, vector<u8>, u64, address, u8) {
        (e.window_id, e.pair_bcs, e.bid_index, e.bidder, e.reason)
    }

    // Mark every bid opened with the given prices and close the reveal (test-only).
    // Use after inserting bids to set the prices that clear_uniform_price will read.
    // `prices` is index-aligned to the bids. Like `test_set_openings`, it bypasses the
    // validity rule of `open_one`: every bid it opens stays valid, whatever its collateral.
    #[test_only]
    public fun test_set_revealed_prices(
        atomica:   &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
        prices:    vector<u64>,
    ) acquires AuctionRegistry {
        let opened = vector::empty<bool>();
        let i = 0u64;
        while (i < vector::length(&prices)) {
            vector::push_back(&mut opened, true);
            i = i + 1;
        };
        test_set_openings(atomica, window_id, pair_bcs, prices, opened);
    }

    // Close the reveal with bid `i` opened at `prices[i]` when `opened[i]`, and unopened
    // (revealed price 0) otherwise (test-only). Both vectors are index-aligned to the bids.
    // It bypasses the validity rule: no collateral or zero-price check, no `BidInvalid`.
    #[test_only]
    public fun test_set_openings(
        atomica:   &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
        prices:    vector<u64>,
        opened:    vector<bool>,
    ) acquires AuctionRegistry {
        let addr = signer::address_of(atomica);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(addr);
        let state = table::borrow_mut(&mut registry.windows, key);
        let i = 0u64;
        while (i < vector::length(&prices)) {
            let bid = vector::borrow_mut(&mut state.bids, i);
            if (*vector::borrow(&opened, i)) {
                bid.opened = true;
                bid.price = *vector::borrow(&prices, i);
            };
            i = i + 1;
        };
        state.reveal_final = true;
    }

    // Destructure an AuctionOutcome event into (window_id, pair_hash, eth_lock_deadline,
    // dispositions_root, leaf_count) (test-only).
    #[test_only]
    public fun test_auction_outcome_fields(e: &AuctionOutcome): (u64, vector<u8>, u64, vector<u8>, u64) {
        (e.window_id, e.pair_hash, e.eth_lock_deadline, e.dispositions_root, e.leaf_count)
    }

    // Return the bid_results vector for a window (test-only).
    // Used to verify clear_uniform_price assigned fills correctly.
    #[test_only]
    public fun test_get_bid_results(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): vector<BidResult> acquires AuctionRegistry {
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        let state = table::borrow(&registry.windows, key);
        state.bid_results
    }

    // BCS of a `Pair` built from its four fields (test-only).
    #[test_only]
    public fun test_pair_bcs(
        base_chain:  vector<u8>,
        base_token:  vector<u8>,
        quote_chain: vector<u8>,
        quote_token: vector<u8>,
    ): vector<u8> {
        bcs::to_bytes(&Pair { base_chain, base_token, quote_chain, quote_token })
    }

    // Return the stored Pair of a window as (base_chain, base_token, quote_chain, quote_token)
    // (test-only).
    #[test_only]
    public fun test_get_window_pair(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): (vector<u8>, vector<u8>, vector<u8>, vector<u8>) acquires AuctionRegistry {
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let pair = table::borrow(&registry.windows, make_window_key(window_id, pair_bcs)).pair;
        (pair.base_chain, pair.base_token, pair.quote_chain, pair.quote_token)
    }

    // Destructure a BidResult into (is_winner, fill_amount, clearing_price).
    // Allows tests to inspect fields without requiring BidResult to have `drop` in scope.
    #[test_only]
    public fun test_bid_result_fields(r: &BidResult): (bool, u256, u64) {
        (r.is_winner, r.fill_amount, r.clearing_price)
    }

    // Insert a WindowState directly for unit tests, bypassing create_auction.
    // Allows tests to exercise view functions and the settle path without
    // claiming a seller lock through create_auction.
    #[test_only]
    public fun test_insert_window(
        atomica:        &signer,
        window_id:      u64,
        pair_bcs:       vector<u8>,
        total_supply:   u256,
        settled:        bool,
        clearing_price: u64,
    ) acquires AuctionRegistry, PairAllowlist, TimelockRegistrar {
        test_insert_window_with_timelock(atomica, window_id, pair_bcs, total_supply, settled, clearing_price, 0)
    }

    // Insert a WindowState with explicit timelock_id for unit tests.
    // Use this variant when testing submit_cleartext_and_clear to control
    // which timelock_id is associated with the window.
    #[test_only]
    // It bypasses the allowlist check: it stores the listed `Pair` when `pair_bcs` is listed,
    // and the launch `Pair` otherwise.
    // It also records `timelock_id` as the window id's timelock in `TimelockRegistrar`, when
    // the registrar exists and holds none for the window id yet, so a later `create_auction`
    // joins it.
    public fun test_insert_window_with_timelock(
        atomica:        &signer,
        window_id:      u64,
        pair_bcs:       vector<u8>,
        total_supply:   u256,
        settled:        bool,
        clearing_price: u64,
        timelock_id:    u64,
    ) acquires AuctionRegistry, PairAllowlist, TimelockRegistrar {
        let addr = signer::address_of(atomica);
        if (exists<TimelockRegistrar>(@atomica)) {
            let timelocks = &mut borrow_global_mut<TimelockRegistrar>(@atomica).window_timelocks;
            if (!table::contains(timelocks, window_id)) {
                table::add(timelocks, window_id, timelock_id);
            };
        };
        if (!exists<AuctionRegistry>(addr)) {
            move_to(atomica, AuctionRegistry {
                windows: table::new(),
            });
        };
        let pair = if (is_pair_allowed(pair_bcs)) {
            *table::borrow(&borrow_global<PairAllowlist>(@atomica).pairs, pair_bcs)
        } else {
            launch_pair()
        };
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(addr);
        table::add(&mut registry.windows, key, WindowState {
            pair,
            window_id,
            timelock_id,
            total_supply,
            bids:            vector::empty(),
            settled,
            clearing_price,
            lock_ids:        vector::empty(),
            reveal_final:    false,
            refunded:        false,
            bid_results:     vector::empty(),
        });
    }

    // Append a seller lock to a test window without touching total_supply (test-only).
    // The lock's receipt must already be CLAIMED.
    #[test_only]
    public fun test_add_seller_lock(
        atomica:   &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
        lock_id:   vector<u8>,
    ) acquires AuctionRegistry {
        let registry = borrow_global_mut<AuctionRegistry>(signer::address_of(atomica));
        let state = table::borrow_mut(&mut registry.windows, make_window_key(window_id, pair_bcs));
        vector::push_back(&mut state.lock_ids, lock_id);
    }

    // Mark a window settled without finalizing its receipts (test-only): the state a
    // window settled before issue 194 left behind, whose receipts are still CLAIMED.
    #[test_only]
    public fun test_mark_settled(
        atomica:   &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
    ) acquires AuctionRegistry {
        let registry = borrow_global_mut<AuctionRegistry>(signer::address_of(atomica));
        table::borrow_mut(&mut registry.windows, make_window_key(window_id, pair_bcs)).settled = true;
    }
}
