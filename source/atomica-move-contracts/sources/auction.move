/// Auction module: global-registry sealed-bid batch auction with V2 timelock bids.
///
/// Design: `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md` (sections 6 to 8) and
/// `atomica/docs/decisions/auction-v2-bid-wrapper.md` (this contract's decisions).
///
/// ## Bid lifecycle
///
/// 1. `create_auction` registers sellers' supply for a `(window_id, pair)` window that is
///    bound to a registered timelock (`timelock_id`).
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
///    nothing can be opened and `refund_expired_window` releases every receipt of the window.
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
    use aptos_framework::timestamp;
    use aptos_framework::table::{Self, Table};
    use aptos_std::bcs;
    use aptos_framework::chain_id;
    use aptos_std::ibe;
    use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};
    use atomica::timelock;

    // ===================== Error Codes =====================

    const E_AUCTION_NOT_FOUND: u64 = 1;
    const E_AUCTION_ENDED: u64 = 2;
    const E_AUCTION_NOT_ENDED: u64 = 3;
    const E_BID_TOO_LOW: u64 = 4;
    const E_ALREADY_SETTLED: u64 = 5;

    /// Caller supplied a window_id that is strictly less than the current window.
    /// Only the current window and the immediately next window are accepted.
    const E_STALE_WINDOW_ID: u64 = 6;

    /// The number of cleartext prices or salts does not match the number of sealed bids.
    /// The settler must supply exactly one entry per bid, index-aligned. An empty salt skips a bid.
    const E_CLEARTEXT_COUNT_MISMATCH: u64 = 9;

    /// A cleartext `(price, salt)` does not match the bid's on-chain commitment.
    const E_INVALID_CLEARTEXT: u64 = 10;

    /// The window has already been settled.
    const E_WINDOW_ALREADY_SETTLED: u64 = 11;

    /// Scaffold stub sentinel — all Phase 3a entry function bodies abort with this
    /// code until their implementations land in #86b–#86f.
    const E_NOT_IMPLEMENTED: u64 = 99;

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
    /// The bid is already opened.
    const E_BID_ALREADY_OPENED: u64 = 17;
    /// A salt must be exactly 32 bytes.
    const E_INVALID_SALT: u64 = 18;
    /// The bid index is out of range.
    const E_BID_INDEX_OUT_OF_RANGE: u64 = 19;
    /// Openings are closed. `finalize_reveal` already ran for this window.
    const E_REVEAL_FINAL: u64 = 20;
    /// Clearing needs a finalized reveal when the window has bids.
    const E_REVEAL_NOT_FINAL: u64 = 21;
    /// Openings are still open: some bids are unopened and the opening window has not elapsed.
    const E_OPENING_WINDOW_OPEN: u64 = 22;
    /// The timelock status is not `Expired`, so there is nothing to refund.
    const E_TIMELOCK_NOT_EXPIRED: u64 = 23;
    /// The window was refunded after its timelock expired.
    const E_WINDOW_REFUNDED: u64 = 24;
    /// The window holds the maximum number of bids.
    const E_WINDOW_FULL: u64 = 25;
    /// A bid commitment must be exactly 32 bytes.
    const E_INVALID_COMMITMENT: u64 = 26;
    /// The timelock is `Expired`: the key will never be released, so openings are impossible.
    const E_TIMELOCK_EXPIRED: u64 = 27;

    // ===================== Bid Constants =====================

    /// Domain tag of the V2 bid associated data (spec section 6).
    const BID_AD_TAG: vector<u8> = b"atomica/timelock-bid/v2";
    /// Domain tag of the price commitment.
    const BID_COMMIT_TAG: vector<u8> = b"atomica/bid-commitment/v1";
    /// Bytes of the one-time Ed25519 verification key at the start of a V2 ciphertext.
    const CT_VK_LEN: u64 = 32;
    /// Per-window bid cap. The clearing sort is quadratic.
    const MAX_BIDS_PER_WINDOW: u64 = 100;
    /// Time after the registry's `reveal_expiry_us` during which unopened bids can still be opened.
    const OPENING_WINDOW_US: u64 = 600_000_000;

    // ===================== Fee/Rebate Constants =====================

    /// Distance-to-clearing rebate coefficient.
    /// Formula calibration is explicitly TBD in v0 — this placeholder will be
    /// replaced with a calibrated value in the Phase 3c implementation follow-up.
    /// @see docs/architecture/v0-architecture.md §2 (fee/rebate section)
    const REBATE_COEFFICIENT: u64 = 0; // TBD calibration Phase 3c impl

    // ===================== Types =====================

    /// Trading pair descriptor.
    /// @see docs/architecture/v0-architecture.md §2.4
    struct Pair has copy, drop, store {
        base_chain:  vector<u8>,   // e.g. b"ethereum"
        base_token:  vector<u8>,   // e.g. b"FakeETH"
        quote_chain: vector<u8>,   // e.g. b"aptos"
        quote_token: vector<u8>,   // e.g. b"FakeUSD"
    }

    /// Per-bidder rebate entry returned by `compute_rebates`.
    ///
    /// The rebate amount is proportional to the distance between the bidder's
    /// revealed price and the uniform clearing price.  Coefficient calibration
    /// is deferred to the Phase 3c implementation follow-up.
    ///
    /// @see docs/architecture/v0-architecture.md §2 (fee/rebate section)
    struct Rebate has copy, drop, store {
        bidder: address,
        amount: u64,
    }

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
        /// True once a cleartext matching `commitment` was accepted.
        opened:             bool,
        /// The opened price. Zero until `opened`.
        price:              u64,
    }

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
        lock_ids:         vector<vector<u8>>, // seller LockReceipt IDs consumed (index-aligned with min_prices)
        min_prices:       vector<u64>,        // per-seller minimum acceptable clearing price
        /// Revealed cleartext prices, index-aligned to bids.
        /// Populated by submit_cleartext_and_clear after IBE decryption key is released.
        /// Empty until submit_cleartext_and_clear succeeds.
        /// @see docs/architecture/v0-architecture.md §2.6
        revealed_prices:  vector<u64>,
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

    // Emitted when settlement is complete for a window.
    // The Ethereum settlement contract (or off-chain relayer) reads this to
    // transfer assets on the cross-chain side.
    // @see docs/architecture/v0-architecture.md §2.9
    #[event]
    struct AuctionSettled has drop, store {
        window_id:      u64,
        pair:           Pair,
        clearing_price: u64,
        total_filled:   u256,               // wei of base token allocated to winners
        winner_count:   u64,
        lock_ids:       vector<vector<u8>>, // seller receipt IDs consumed
    }

    // Emitted when a bid cleartext matching its commitment is accepted.
    #[event]
    struct BidOpened has drop, store {
        window_id:  u64,
        bid_index:  u64,
        bidder:     address,
        price:      u64,
    }

    // Emitted when openings close for a window.
    #[event]
    struct RevealFinalized has drop, store {
        window_id:    u64,
        bid_count:    u64,
        opened_count: u64,
    }

    // Emitted by `settle` for a bid that was never opened. Its collateral receipt is not
    // released. The relayer decides what happens to it.
    #[event]
    struct BidUnopened has drop, store {
        window_id:          u64,
        bidder:             address,
        collateral_lock_id: vector<u8>,
    }

    // Emitted when a window is refunded after its timelock expired.
    // `reason` is the registry expiry reason: 1 epoch-ended, 2 reveal-window-elapsed,
    // 3 key-check-failed.
    #[event]
    struct AuctionRefunded has drop, store {
        window_id:        u64,
        timelock_id:      u64,
        reason:           u8,
        bid_count:        u64,
        seller_lock_count: u64,
    }

    // ===================== Helpers =====================

    /// Compute `auction_window_id` from on-chain clock.
    ///
    ///   epoch_index   = unix_seconds / 43200
    ///   time_in_epoch = unix_seconds % 43200
    ///   window_offset = (time_in_epoch >= 28500) ? 1 : 0
    ///   window_id     = epoch_index * 2 + window_offset
    ///
    /// Morning window fires at offset 28 500 s (07:45 UTC).
    /// Afternoon window fires at offset 58 500 s (16:15 UTC).
    ///
    /// @see docs/architecture/v0-architecture.md §2.2
    public fun current_window_id(): u64 {
        let s = timestamp::now_seconds();
        let epoch = s / 43200;
        let tmod  = s % 43200;
        epoch * 2 + if (tmod >= 28500) { 1 } else { 0 }
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

    // ===================== Entry Functions =====================

    /// Create (or join) a global-registry auction for `(window_id, pair)`.
    ///
    /// Consumes a seller's FakeETH LockReceipt to prove on-chain escrow, then
    /// adds the lock's supply to the window's `total_supply`. Multiple sellers
    /// calling this for the same `(window_id, pair)` accumulate into the same
    /// clearing pool.
    ///
    /// Window validation: only the current window and the immediately next window
    /// are accepted. A stale `window_id` (strictly less than `current_window_id()`)
    /// aborts with E_STALE_WINDOW_ID (6). Windows more than one step ahead are
    /// also rejected (> current + 1) to prevent pre-registration of far-future
    /// windows.
    ///
    /// Multiple sellers may call `create_auction` with the same `(window_id,
    /// pair_bcs)`. Each call claims its `lock_id` receipt, adds the locked amount
    /// to `total_supply`, and appends the `lock_id` and `min_price` to the
    /// parallel vectors `lock_ids` / `min_prices`.
    ///
    /// `mpk_bytes` is accepted but not stored in Phase 3a — IBE MPK on-chain
    /// fetch is wired in follow-up issue #90.
    ///
    /// `timelock_id` is the on-chain timelock registered via
    /// `ibe_config::register_timelock` that controls IBE key release for this
    /// window. It must be registered before calling `create_auction`.
    ///
    /// Call-site break from Demo phase:
    ///   payloads.ts::getCreateAuctionPayload(lockId, minPrice, duration, mpk)
    ///   → (window_id, pair_bcs, lock_id, min_price, timelock_id, mpk_bytes)
    ///
    /// @see docs/architecture/v0-architecture.md §2.3
    public entry fun create_auction(
        seller:      &signer,
        window_id:   u64,
        pair_bcs:    vector<u8>,
        lock_id:     vector<u8>,
        min_price:   u64,
        timelock_id: u64,
        _mpk_bytes:  vector<u8>,  // reserved — IBE MPK wired in #90
    ) acquires AuctionRegistry {
        // 1. Validate window_id: reject stale (< current) and far-future (> current + 1).
        let current = current_window_id();
        assert!(window_id >= current, E_STALE_WINDOW_ID);
        assert!(window_id <= current + 1, E_STALE_WINDOW_ID);

        // 2. Claim the seller's FakeETH LockReceipt to prove on-chain escrow.
        //    `claim` marks the receipt STATUS_CLAIMED and returns the locked amount.
        let seller_addr = signer::address_of(seller);
        let locked_amount = lock_receipt::claim<Ethereum, FakeETH>(seller_addr, lock_id);

        // 3. Ensure the global AuctionRegistry exists at @atomica.
        //
        // On first call the registry is bootstrapped lazily. Only the @atomica
        // deployer can bootstrap it (move_to publishes at the signer's address,
        // so the registry lands at @atomica only when seller == @atomica). Non-
        // deployer sellers will find the registry already present after the
        // deployer has made the first create_auction call.
        if (!exists<AuctionRegistry>(@atomica)) {
            move_to(seller, AuctionRegistry {
                windows: table::new(),
            });
        };

        // 4. Build the registry key and either create or update the window.
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);

        if (!table::contains(&registry.windows, key)) {
            // First seller for this (window_id, pair) — create a fresh WindowState.
            let base_pair = Pair {
                base_chain:  b"ethereum",
                base_token:  b"FakeETH",
                quote_chain: b"aptos",
                quote_token: b"FakeUSD",
            };
            table::add(&mut registry.windows, key, WindowState {
                pair:            base_pair,
                window_id,
                timelock_id,
                total_supply:    (locked_amount as u256),
                bids:            vector::empty(),
                settled:         false,
                clearing_price:  0,
                lock_ids:        vector::singleton(lock_id),
                min_prices:      vector::singleton(min_price),
                revealed_prices: vector::empty(),
                reveal_final:    false,
                refunded:        false,
                bid_results:     vector::empty(),
            });
        } else {
            // Subsequent seller — accumulate supply and append metadata.
            let state = table::borrow_mut(&mut registry.windows, key);
            state.total_supply = state.total_supply + (locked_amount as u256);
            vector::push_back(&mut state.lock_ids, lock_id);
            vector::push_back(&mut state.min_prices, min_price);
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
    ///   - no bid with the same `H(vk, AD)` is in the window.
    ///
    /// `quantity` is the bid quantity in wei (FakeETH base token).
    ///
    /// @see docs/architecture/v0-architecture.md §2.5
    public entry fun submit_bid(
        bidder:             &signer,
        window_id:          u64,
        pair_bcs:           vector<u8>,
        ciphertext:         vector<u8>,
        commitment:         vector<u8>,
        collateral_lock_id: vector<u8>,
        quantity:           u256,
    ) acquires AuctionRegistry {
        // 1. Consume the bidder's FakeUSD LockReceipt as collateral margin.
        let bidder_addr = signer::address_of(bidder);
        let _collateral_amount = lock_receipt::claim<Ethereum, FakeUSD>(
            bidder_addr,
            collateral_lock_id,
        );

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

        // 6. Store the sealed bid. Zero-quantity and over-supply bids are allowed:
        //    the clearing step handles both.
        vector::push_back(&mut state.bids, SealedBid {
            bidder: bidder_addr,
            ciphertext,
            ct_id,
            commitment,
            collateral_lock_id,
            quantity,
            opened: false,
            price: 0,
        });
    }

    // ===================== Reveal =====================

    /// Aborts unless openings are allowed for this window right now.
    ///
    /// Openings need the registry status `Revealed`. An `Expired` timelock never releases a
    /// key, so an opening after expiry aborts with `E_TIMELOCK_EXPIRED`.
    fun assert_openings_allowed(state: &WindowState) {
        assert!(!state.settled, E_WINDOW_ALREADY_SETTLED);
        assert!(!state.refunded, E_WINDOW_REFUNDED);
        assert!(!state.reveal_final, E_REVEAL_FINAL);
        let status = timelock::get_status(state.timelock_id);
        assert!(status != timelock::status_expired(), E_TIMELOCK_EXPIRED);
        assert!(status == timelock::status_revealed(), E_TIMELOCK_NOT_REVEALED);
    }

    /// Checks `(price, salt)` against the commitment of bid `idx` and marks it opened.
    fun open_one(state: &mut WindowState, idx: u64, price: u64, salt: vector<u8>) {
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
    }

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

    /// Closes openings: copies the opened prices into `revealed_prices` (zero for an
    /// unopened bid) and sets `reveal_final`.
    fun finalize_internal(state: &mut WindowState) {
        let prices = vector::empty<u64>();
        let i = 0u64;
        let n = vector::length(&state.bids);
        while (i < n) {
            vector::push_back(&mut prices, vector::borrow(&state.bids, i).price);
            i = i + 1;
        };
        let opened_count = count_opened(state);
        state.revealed_prices = prices;
        state.reveal_final = true;
        event::emit(RevealFinalized { window_id: state.window_id, bid_count: n, opened_count });
    }

    /// Opens one bid. Anyone may call it, for any bid, with the bid's price and 32-byte salt.
    ///
    /// The registry status must be `Revealed`. The opening must match the commitment stored
    /// at submission. Each bid opens once. When the last bid opens, the reveal finalizes.
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
        open_one(state, bid_index, price, salt);
        if (count_opened(state) == vector::length(&state.bids)) {
            finalize_internal(state);
        };
    }

    /// Opens many bids in one call, index-aligned to the window's bids.
    ///
    /// `cleartexts[i]` and `salts[i]` open bid `i`. An empty salt skips bid `i`: use it for
    /// a bid that is already opened, or one the caller cannot open. Any wrong opening aborts
    /// the whole call. When every bid is opened the reveal finalizes. Otherwise call
    /// `finalize_reveal` after the opening window.
    ///
    /// Nothing here is trusted: the contract checks each opening against the commitment and
    /// the registry status. A settler cannot change a price.
    ///
    /// @see docs/architecture/v0-architecture.md §2.6
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
                open_one(state, i, *vector::borrow(&cleartexts, i), salt);
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
    /// Unopened bids become invalid: no fill, and `settle` does not release their collateral.
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

    // ===================== Refund =====================

    /// Releases every receipt of a window whose timelock is `Expired`.
    ///
    /// The registry status must be `Expired` for any reason (epoch ended, reveal window
    /// elapsed, key check failed). No key exists, so no bid can ever open. Each bidder's
    /// FakeUSD collateral and each seller's FakeETH lock is released so the relayer can
    /// return the funds on Ethereum. The window is marked refunded and takes no more bids,
    /// openings, clearing or settlement. A second call aborts.
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
        let reason = timelock::get_expiry_reason(timelock_id);

        let bid_count = vector::length(&state.bids);
        let i = 0u64;
        while (i < bid_count) {
            lock_receipt::release<Ethereum, FakeUSD>(vector::borrow(&state.bids, i).collateral_lock_id);
            i = i + 1;
        };
        let seller_lock_count = vector::length(&state.lock_ids);
        let j = 0u64;
        while (j < seller_lock_count) {
            lock_receipt::release<Ethereum, FakeETH>(*vector::borrow(&state.lock_ids, j));
            j = j + 1;
        };

        state.refunded = true;
        event::emit(AuctionRefunded { window_id, timelock_id, reason, bid_count, seller_lock_count });
    }

    /// Sort sealed bids descending by revealed price and compute the marginal
    /// (uniform) clearing price that allocates the full supply.  Partial fill
    /// is applied to the last qualifying bid so that total allocation equals
    /// `total_supply` exactly.
    ///
    /// Algorithm (§2.7):
    ///   1. Build an index array sorted descending by revealed_prices.
    ///   2. Walk sorted indices, accumulating quantity until total_supply is met.
    ///   3. The last bid whose cumulative quantity does not exceed supply sets
    ///      the clearing price. If that bid would overfill, it gets a partial
    ///      fill equal to the remaining supply. All bids at higher prices win
    ///      fully; all bids below the clearing price are marked losing.
    ///   4. Write BidResult for each bid into WindowState.bid_results.
    ///   5. Write clearing_price into WindowState.clearing_price.
    ///
    /// Precondition: submit_cleartext_and_clear must have already populated
    /// revealed_prices. Aborts with E_AUCTION_NOT_FOUND if window is missing.
    ///
    /// Called internally by `settle` after `submit_cleartext_and_clear` has
    /// populated the cleartext prices.  Exposed as a separate entry function
    /// so it can be invoked independently for testing or gas-profiling.
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

        // 1. Handle zero-bid case: no clearing possible — set clearing_price=0,
        //    bid_results stays empty, and return without aborting.
        if (bid_count == 0) {
            state.clearing_price = 0;
            return
        };

        // Openings must be closed. Unopened bids are invalid and never fill.
        assert!(state.reveal_final, E_REVEAL_NOT_FINAL);

        // 2. Build a sorted index array (descending by revealed price).
        //    Insertion sort O(n^2) — acceptable for small auction windows (≤ 100 bids).
        //    sorted_idx[i] = original index of the i-th highest-priced bid.
        let sorted_idx = vector::empty<u64>();
        let k = 0u64;
        while (k < bid_count) {
            vector::push_back(&mut sorted_idx, k);
            k = k + 1;
        };

        // Insertion sort: sort sorted_idx descending by revealed_prices[sorted_idx[i]].
        let i = 1u64;
        while (i < bid_count) {
            let j = i;
            while (j > 0) {
                let idx_j   = *vector::borrow(&sorted_idx, j);
                let idx_j1  = *vector::borrow(&sorted_idx, j - 1);
                let price_j  = *vector::borrow(&state.revealed_prices, idx_j);
                let price_j1 = *vector::borrow(&state.revealed_prices, idx_j1);
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
        let found_marginal = false;
        let winner_found = false;

        let s = 0u64;
        while (s < bid_count) {
            let orig_idx = *vector::borrow(&sorted_idx, s);
            if (!vector::borrow(&state.bids, orig_idx).opened) {
                // Invalid bid: never fills.
                s = s + 1;
                continue
            };
            winner_found = true;
            let qty = vector::borrow(&state.bids, orig_idx).quantity;
            let price = *vector::borrow(&state.revealed_prices, orig_idx);

            if (accumulated + qty <= supply) {
                // Full fill — this bid fits entirely.
                accumulated = accumulated + qty;
                clearing_price = price;
                marginal_sorted_pos = s;
                marginal_fill = qty;

                if (accumulated == supply) {
                    found_marginal = true;
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
                found_marginal = true;
                break
            };
            s = s + 1;
        };

        // If we exhausted all bids without filling supply, the last processed
        // bid is already recorded in marginal_sorted_pos / clearing_price /
        // marginal_fill above.  found_marginal may still be false if all bids
        // fit under supply without exactly hitting it — that is fine; the loop
        // above sets clearing_price / marginal_sorted_pos on every iteration.
        // Suppress unused variable warning.
        let _ = found_marginal;

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

    /// Settle the window: release losing collateral, emit AuctionSettled.
    ///
    /// Prerequisites: `submit_cleartext_and_clear` and `clear_uniform_price` must
    /// have already run so that `WindowState.bid_results` is populated.  If
    /// `bid_results` is empty and there are bids, the function aborts with
    /// E_AUCTION_NOT_ENDED to signal that clearing has not yet occurred.
    ///
    /// Steps (§2.8, §2.9):
    ///   1. Validate window exists and has not already been settled.
    ///   2. Verify clearing has run (bid_results length == bids length).
    ///   3. Release opened losing bidders' FakeUSD collateral receipts so the off-chain
    ///      relayer can return those assets to bidders on Ethereum. Unopened bids are
    ///      invalid: their receipts stay claimed and `BidUnopened` is emitted.
    ///   4. Compute fee/rebate amounts for winning bidders.
    ///   5. Emit `AuctionSettled` with window_id, pair, clearing_price,
    ///      total_filled, winner_count, and seller lock_ids.
    ///   6. Mark the window settled.
    ///
    /// FakeUSD proceeds to the seller and fee/rebate transfers happen on Ethereum
    /// after the relayer reads `AuctionSettled`; this function records and signals
    /// the settlement, it does not perform on-chain FakeUSD token transfers.
    ///
    /// @see docs/architecture/v0-architecture.md §2.8 and §2.9
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

        let bid_count    = vector::length(&state.bids);
        let result_count = vector::length(&state.bid_results);

        // 2. Verify clearing has been run.
        //    If there are bids but bid_results is not yet populated, the caller
        //    must run clear_uniform_price first.
        assert!(result_count == bid_count, E_AUCTION_NOT_ENDED);

        // 3. Release losing bidders' FakeUSD collateral receipts and tally totals.
        let total_filled:  u256 = 0;
        let winner_count:  u64  = 0;

        let i = 0u64;
        while (i < bid_count) {
            let result = vector::borrow(&state.bid_results, i);
            if (result.is_winner) {
                total_filled  = total_filled + result.fill_amount;
                winner_count  = winner_count + 1;
                // Winning bidder: collateral receipt was consumed — nothing to release.
            } else if (vector::borrow(&state.bids, i).opened) {
                // Losing bidder: release collateral receipt so the off-chain relayer
                // can return the underlying Ethereum FakeUSD to the bidder.
                let collateral_id = vector::borrow(&state.bids, i).collateral_lock_id;
                lock_receipt::release<Ethereum, FakeUSD>(collateral_id);
            } else {
                // Unopened bid: invalid. Its collateral stays claimed. The relayer
                // reads `BidUnopened` and decides.
                let bid = vector::borrow(&state.bids, i);
                event::emit(BidUnopened {
                    window_id,
                    bidder: bid.bidder,
                    collateral_lock_id: bid.collateral_lock_id,
                });
            };
            i = i + 1;
        };

        // 4. Compute fee/rebate vector (Phase 3c: coefficient = 0, all amounts are 0).
        //    The compute_rebates call is elided here because at REBATE_COEFFICIENT = 0
        //    all rebate amounts are zero and no additional transfers are needed.
        //    When Phase 3c calibrates the coefficient, this section must apply the
        //    rebate amounts by emitting per-winner rebate records or distributing
        //    FakeUSD on Ethereum via the settlement event payload.
        let _coeff = REBATE_COEFFICIENT; // TBD Phase 3c calibration

        // 5. Emit AuctionSettled — the off-chain BLS relayer reads this to trigger
        //    the Ethereum-side settlement (FakeUSD proceeds to seller, FakeETH to winners).
        let clearing_price = state.clearing_price;
        let pair_copy      = state.pair;
        let lock_ids_copy  = state.lock_ids;

        event::emit(AuctionSettled {
            window_id,
            pair:           pair_copy,
            clearing_price,
            total_filled,
            winner_count,
            lock_ids:       lock_ids_copy,
        });

        // 6. Mark window settled.
        state.settled = true;
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

    // Return (bidder, ciphertext, commitment, opened, price) of bid `bid_index`.
    // Off-chain relayers read ciphertexts here, decrypt them with the revealed key and
    // open the bids. Aborts with E_AUCTION_NOT_FOUND or E_BID_INDEX_OUT_OF_RANGE.
    #[view]
    public fun get_bid_info(
        window_id: u64,
        pair_bcs:  vector<u8>,
        bid_index: u64,
    ): (address, vector<u8>, vector<u8>, bool, u64) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);
        let w = table::borrow(&registry.windows, key);
        assert!(bid_index < vector::length(&w.bids), E_BID_INDEX_OUT_OF_RANGE);
        let b = vector::borrow(&w.bids, bid_index);
        (b.bidder, b.ciphertext, b.commitment, b.opened, b.price)
    }

    // Return (timelock_id, reveal_final, refunded) of a window.
    #[view]
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

    // Compute per-bidder fee/rebate curve for a cleared auction window.
    //
    // The rebate amount for each winning bidder is proportional to the distance
    // between the bidder's revealed price and the uniform clearing price,
    // scaled by REBATE_COEFFICIENT.  At the current coefficient of 0 all
    // rebate amounts are zero; Phase 3c will calibrate the coefficient.
    //
    // Returns a vector of Rebate { bidder, amount } for all bidders in the
    // specified window.  Non-winning bidders receive amount = 0.
    // Returns an empty vector if the window does not exist.
    //
    // @see docs/architecture/v0-architecture.md §2 (fee/rebate section)
    #[view]
    public fun compute_rebates(
        window_id:      u64,
        pair_bcs:       vector<u8>,
        _clearing_price: u64,
    ): vector<Rebate> acquires AuctionRegistry {
        if (!exists<AuctionRegistry>(@atomica)) return vector::empty();
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        if (!table::contains(&registry.windows, key)) return vector::empty();

        let state = table::borrow(&registry.windows, key);
        let bid_count    = vector::length(&state.bids);
        let result_count = vector::length(&state.bid_results);

        // If clearing has not yet run, return empty (no rebates computable).
        if (result_count != bid_count) return vector::empty();

        // REBATE_COEFFICIENT = 0 → all rebate amounts are 0.
        // Phase 3c will replace this with a calibrated formula:
        //   amount = REBATE_COEFFICIENT × (revealed_price - clearing_price) × fill_amount
        let _coeff = REBATE_COEFFICIENT;

        let rebates = vector::empty<Rebate>();
        let i = 0u64;
        while (i < bid_count) {
            let result  = vector::borrow(&state.bid_results, i);
            let bidder  = result.bidder;
            // Distance-to-clearing rebate is 0 until Phase 3c calibration.
            // Only winners receive rebates (positive distance means higher bid than clearing).
            let amount: u64 = 0; // TBD Phase 3c: calibrate with REBATE_COEFFICIENT
            vector::push_back(&mut rebates, Rebate { bidder, amount });
            i = i + 1;
        };
        rebates
    }

    // Return (clearing_price, total_filled) after settlement.
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
        (w.clearing_price, w.total_supply)
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
            opened: false,
            price: 0,
        });
    }

    // Mark every bid opened with the given prices and close the reveal (test-only).
    // Use after inserting bids to set the prices that clear_uniform_price will read.
    // `prices` is index-aligned to the bids.
    #[test_only]
    public fun test_set_revealed_prices(
        atomica:   &signer,
        window_id: u64,
        pair_bcs:  vector<u8>,
        prices:    vector<u64>,
    ) acquires AuctionRegistry {
        let addr = signer::address_of(atomica);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(addr);
        let state = table::borrow_mut(&mut registry.windows, key);
        let i = 0u64;
        while (i < vector::length(&prices)) {
            let bid = vector::borrow_mut(&mut state.bids, i);
            bid.opened = true;
            bid.price = *vector::borrow(&prices, i);
            i = i + 1;
        };
        state.revealed_prices = prices;
        state.reveal_final = true;
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

    // Destructure a BidResult into (is_winner, fill_amount, clearing_price).
    // Allows tests to inspect fields without requiring BidResult to have `drop` in scope.
    #[test_only]
    public fun test_bid_result_fields(r: &BidResult): (bool, u256, u64) {
        (r.is_winner, r.fill_amount, r.clearing_price)
    }

    // Insert a WindowState directly for unit tests, bypassing create_auction.
    // Allows tests to exercise view functions and settle path without
    // triggering E_NOT_IMPLEMENTED in create_auction.
    #[test_only]
    public fun test_insert_window(
        atomica:        &signer,
        window_id:      u64,
        pair_bcs:       vector<u8>,
        total_supply:   u256,
        settled:        bool,
        clearing_price: u64,
    ) acquires AuctionRegistry {
        test_insert_window_with_timelock(atomica, window_id, pair_bcs, total_supply, settled, clearing_price, 0)
    }

    // Insert a WindowState with explicit timelock_id for unit tests.
    // Use this variant when testing submit_cleartext_and_clear to control
    // which timelock_id is associated with the window.
    #[test_only]
    public fun test_insert_window_with_timelock(
        atomica:        &signer,
        window_id:      u64,
        pair_bcs:       vector<u8>,
        total_supply:   u256,
        settled:        bool,
        clearing_price: u64,
        timelock_id:    u64,
    ) acquires AuctionRegistry {
        let addr = signer::address_of(atomica);
        if (!exists<AuctionRegistry>(addr)) {
            move_to(atomica, AuctionRegistry {
                windows: table::new(),
            });
        };
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(addr);
        let base_pair = Pair {
            base_chain:  b"ethereum",
            base_token:  b"FakeETH",
            quote_chain: b"aptos",
            quote_token: b"FakeUSD",
        };
        table::add(&mut registry.windows, key, WindowState {
            pair:            base_pair,
            window_id,
            timelock_id,
            total_supply,
            bids:            vector::empty(),
            settled,
            clearing_price,
            lock_ids:        vector::empty(),
            min_prices:      vector::empty(),
            revealed_prices: vector::empty(),
            reveal_final:    false,
            refunded:        false,
            bid_results:     vector::empty(),
        });
    }

    // Destructure a Rebate into (bidder, amount).
    // Allows tests to inspect fields without a direct field accessor.
    #[test_only]
    public fun test_rebate_fields(r: &Rebate): (address, u64) {
        (r.bidder, r.amount)
    }

    // Return the revealed_prices vector for a window.
    // Used by tests to verify submit_cleartext_and_clear stored prices correctly.
    #[test_only]
    public fun test_get_revealed_prices(
        window_id: u64,
        pair_bcs:  vector<u8>,
    ): vector<u64> acquires AuctionRegistry {
        let registry = borrow_global<AuctionRegistry>(@atomica);
        let key = make_window_key(window_id, pair_bcs);
        let state = table::borrow(&registry.windows, key);
        state.revealed_prices
    }
}
