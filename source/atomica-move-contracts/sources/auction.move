/// Auction module — v0.1 Beta global-registry sealed-bid scaffold
///
/// Implements the global AuctionRegistry shape from:
///   docs/architecture/v0-architecture.md §2 — Auction Mechanism (v0.1 Beta)
///
/// All entry function bodies abort with E_NOT_IMPLEMENTED (99). Implementations
/// land in sub-issues #86b (collateral wiring), #86c (fee/rebate), #86d
/// (cross-chain settlement), #86e (IBE identity and AuctionRevealer).
///
/// BREAKING CHANGES FROM DEMO PHASE:
///
/// | Old (Demo) function        | New (v0 Beta) function                   |
/// |---------------------------|------------------------------------------|
/// | create_auction(seller, lock_id, min_price, duration, mpk) | create_auction(seller, window_id, pair_bcs, lock_id, min_price, mpk_bytes) |
/// | submit_bid(bidder, seller_addr, amount) | submit_bid(bidder, window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id) |
/// | settle(caller, seller_addr) | settle(caller, window_id, pair_bcs) |
///
/// All call sites updated in this issue:
///   - atomica-sdk/src/aptos/payloads.ts
///   - source/atomica-web-components/src/components/AuctionCreator.tsx
///   - source/atomica-web-components/src/components/AuctionBidder.tsx
///   - source/atomica-web-components/src/components/SettleButton.tsx
///
/// INTEGRATION RISKS recorded by dev-scout #96:
///
/// 1. AuctionRegistry is stored at @atomica (deployer), not per-seller.
///    TypeScript callers that did `borrow_global<Auction>(sellerAddr)` must
///    switch to `exists<AuctionRegistry>(@atomica)` after this merges.
///
/// 2. `submit_cleartext_and_clear` depends on `timelock_config::get_decryption_key`
///    which is not yet implemented in timelock_config.move. The body aborts with
///    E_NOT_IMPLEMENTED until that function is exposed.
///
/// 3. Shared-file pressure: AuctionBidder.tsx is also edited by #87 (collateral
///    wiring) and #90 (IBE MPK on-chain fetch). Merge strictly in order:
///    #86 → #87 → #90.
///
/// 4. bridge.ts (atomica-sdk/src/settlement/bridge.ts) is shared with #87 and
///    #89. Merge order: #86 → #87 → #89.
///
/// @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
module atomica::auction {
    use std::signer;
    use std::vector;
    use std::hash::sha3_256;
    use aptos_framework::timestamp;
    use aptos_framework::table::{Self, Table};
    use aptos_std::bcs;
    use aptos_std::bls12381_algebra::{G1, G2, Gt, FormatG1Compr, FormatG2Compr, FormatGt};
    use aptos_std::crypto_algebra::{deserialize, pairing, serialize};
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

    /// The auction window has not yet closed. submit_cleartext_and_clear requires
    /// the timelock to be expired before decryption keys are released.
    const E_WINDOW_NOT_CLOSED: u64 = 7;

    /// The decryption key for this window's timelock has not been revealed yet.
    /// Validators must submit threshold shares before submit_cleartext_and_clear
    /// can proceed.
    const E_DECRYPTION_KEY_NOT_REVEALED: u64 = 8;

    /// The number of cleartext prices does not match the number of sealed bids.
    /// The settler must supply exactly one cleartext per bid, index-aligned.
    const E_CLEARTEXT_COUNT_MISMATCH: u64 = 9;

    /// A cleartext price fails IBE verification against the stored (u_bytes, ciphertext).
    /// The plaintext recovered from IBE decryption does not match the cleartext supplied
    /// by the settler.
    const E_INVALID_CLEARTEXT: u64 = 10;

    /// The window has already been settled.
    const E_WINDOW_ALREADY_SETTLED: u64 = 11;

    /// Scaffold stub sentinel — all Phase 3a entry function bodies abort with this
    /// code until their implementations land in #86b–#86f.
    const E_NOT_IMPLEMENTED: u64 = 99;

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
        u_bytes:            vector<u8>,   // IBE ephemeral point U = rG (48-byte G1)
        ciphertext:         vector<u8>,   // AES-GCM ciphertext of plaintext price
        collateral_lock_id: vector<u8>,   // FakeUSD LockReceipt ID held as margin
        quantity:           u256,         // bid quantity in wei (FakeETH base token)
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

    /// Submit a sealed bid for `(window_id, pair)`.
    ///
    /// Claims the bidder's `LockReceipt<Ethereum, FakeUSD>` identified by
    /// `collateral_lock_id` as collateral margin, then stores the IBE-encrypted
    /// bid in the window's bid list.  The receipt is consumed (status →
    /// STATUS_CLAIMED) so it cannot be double-spent.
    ///
    /// The window must exist (created via `create_auction`).  This function
    /// aborts with E_AUCTION_NOT_FOUND if no entry exists for (window_id,
    /// pair_bcs).
    ///
    /// `quantity` is the bid quantity in wei (FakeETH base token). It is stored
    /// in the SealedBid for use by clear_uniform_price after bids are revealed.
    ///
    /// Call-site break from Demo phase:
    ///   payloads.ts::getBidPayload(sellerAddr, amountUsd, u, v)
    ///   → (window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id, quantity)
    ///   AuctionBidder.tsx::submitBid(account, sellerAddr, amountBn, u, v)
    ///   → (window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id, quantity)
    ///
    /// @see docs/architecture/v0-architecture.md §2.5
    public entry fun submit_bid(
        bidder:             &signer,
        window_id:          u64,
        pair_bcs:           vector<u8>,
        u_bytes:            vector<u8>,
        ciphertext:         vector<u8>,
        collateral_lock_id: vector<u8>,
        quantity:           u256,
    ) acquires AuctionRegistry {
        // 1. Consume the bidder's FakeUSD LockReceipt as collateral margin.
        //    `lock_receipt::claim` marks the receipt STATUS_CLAIMED and returns
        //    the locked amount (informational — not stored in the bid for Phase 3b).
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

        // 3. Store the sealed bid with quantity.
        let state = table::borrow_mut(&mut registry.windows, key);
        vector::push_back(&mut state.bids, SealedBid {
            bidder: bidder_addr,
            u_bytes,
            ciphertext,
            collateral_lock_id,
            quantity,
        });
    }

    /// Reveal cleartexts and store them for the uniform-price clearing step.
    ///
    /// After the auction window closes, the on-chain DKG releases the IBE
    /// decryption key. The settler calls this function with index-aligned
    /// cleartext prices. The function:
    ///
    ///   1. Verifies the timelock is expired (`E_WINDOW_NOT_CLOSED` if not).
    ///   2. Fetches the 48-byte G1 decryption key via `timelock::get_decryption_key`
    ///      (aborts with `E_DECRYPTION_KEY_NOT_REVEALED` if DK not yet released).
    ///   3. Checks `len(cleartexts) == len(bids)` (`E_CLEARTEXT_COUNT_MISMATCH` if not).
    ///   4. For each bid, verifies the cleartext against the stored `(u_bytes, ciphertext)`
    ///      using pairing-based IBE decryption: computes `K = e(dk, U)` via BLS12-381
    ///      pairing, derives the XOR key `sha3_256(serialize(K))`, decrypts the
    ///      ciphertext, and compares the recovered price to the cleartext.
    ///      Aborts with `E_INVALID_CLEARTEXT` if any bid fails verification.
    ///   5. Stores the revealed prices in `WindowState.revealed_prices`.
    ///
    /// @see docs/architecture/v0-architecture.md §2.6
    public entry fun submit_cleartext_and_clear(
        _settler:   &signer,
        window_id:  u64,
        pair_bcs:   vector<u8>,
        cleartexts: vector<u64>,
    ) acquires AuctionRegistry {
        // 1. Locate the window.
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);

        let state = table::borrow_mut(&mut registry.windows, key);
        assert!(!state.settled, E_WINDOW_ALREADY_SETTLED);

        let timelock_id = state.timelock_id;

        // 2. Verify cleartext count matches bid count (fast fail before DK fetch).
        let bid_count = vector::length(&state.bids);
        assert!(vector::length(&cleartexts) == bid_count, E_CLEARTEXT_COUNT_MISMATCH);

        // 3. Verify timelock has expired — window must be closed before decryption.
        assert!(timelock::is_timelock_expired(timelock_id), E_WINDOW_NOT_CLOSED);

        // 4. Fetch the IBE decryption key — aborts if DK not yet revealed.
        //    `timelock::get_decryption_key` delegates to `ibe_config::get_decryption_key`
        //    which aborts with `E_DECRYPTION_KEY_NOT_REVEALED` (5) from ibe_config when
        //    `is_revealed == false`.
        let dk_bytes = timelock::get_decryption_key(timelock_id);

        // 5. Deserialize the 48-byte G1 decryption key (shared across all bids).
        let dk_opt = deserialize<G1, FormatG1Compr>(&dk_bytes);
        assert!(std::option::is_some(&dk_opt), E_INVALID_CLEARTEXT);
        let dk_point = std::option::destroy_some(dk_opt);

        // 6. Verify each cleartext via pairing-based IBE decryption.
        let i = 0;
        let revealed = vector::empty<u64>();
        while (i < bid_count) {
            let bid = vector::borrow(&state.bids, i);
            let cleartext = *vector::borrow(&cleartexts, i);

            // Deserialize the 96-byte G2 ephemeral point U from u_bytes.
            let u_opt = deserialize<G2, FormatG2Compr>(&bid.u_bytes);
            assert!(std::option::is_some(&u_opt), E_INVALID_CLEARTEXT);
            let u_point = std::option::destroy_some(u_opt);

            // Compute the shared secret K = e(dk, U) ∈ Gt.
            // BLS12-381 pairing: e: G1 × G2 → Gt
            let k_gt = pairing<G1, G2, Gt>(&dk_point, &u_point);

            // Derive the XOR key using the Atomica IBE key derivation scheme.
            // Matches `derive_key_stream` in aptos-dkg/src/ibe/mod.rs:
            //   gt_bytes = bcs::to_bytes(gt)  (FormatGt serialization)
            //   key_block = SHA3-256("APTOS_IBE_KEY_DERIVATION_DST" || gt_bytes || 0u32_le)
            let k_bytes = serialize<Gt, FormatGt>(&k_gt);
            let xor_key = ibe_derive_key_block(&k_bytes, 0u32);

            // Decrypt: msg_bytes = ciphertext XOR xor_key[:len(ciphertext)].
            let cipher = &bid.ciphertext;
            let cipher_len = vector::length(cipher);
            let msg_bytes = xor_prefix(cipher, &xor_key, cipher_len);

            // Parse the recovered price from the first 8 bytes (little-endian u64).
            let recovered_price = le_bytes_to_u64(&msg_bytes);

            // Reject if recovered price does not match the supplied cleartext.
            assert!(recovered_price == cleartext, E_INVALID_CLEARTEXT);

            vector::push_back(&mut revealed, cleartext);
            i = i + 1;
        };

        // 7. Store revealed prices in WindowState.
        state.revealed_prices = revealed;
    }

    /// Derives one 32-byte key block from a serialized Gt element.
    ///
    /// Matches the Atomica IBE key derivation from `aptos-dkg/src/ibe/mod.rs`:
    ///   `derive_key_stream(gt, len)` with counter-mode KDF:
    ///   `block = SHA3-256("APTOS_IBE_KEY_DERIVATION_DST" || gt_bytes || counter_le32)`
    ///
    /// For ciphertexts up to 32 bytes (e.g., a single u64 price), only counter=0
    /// is needed. Longer messages would require multiple blocks, but v0 Beta
    /// prices are always ≤ 8 bytes (u64 LE), so one block suffices.
    ///
    /// `gt_bytes` — output of `serialize<Gt, FormatGt>(&k_gt)` (576 bytes)
    /// `counter`  — 0 for the first (and for prices: only) block
    fun ibe_derive_key_block(gt_bytes: &vector<u8>, counter: u32): vector<u8> {
        // Domain separation tag matches Rust: b"APTOS_IBE_KEY_DERIVATION_DST"
        let dst = b"APTOS_IBE_KEY_DERIVATION_DST";
        let input = vector::empty<u8>();
        vector::append(&mut input, dst);
        vector::append(&mut input, *gt_bytes);
        // Append counter as little-endian u32 (4 bytes).
        vector::push_back(&mut input, (counter & 0xff) as u8);
        vector::push_back(&mut input, ((counter >> 8) & 0xff) as u8);
        vector::push_back(&mut input, ((counter >> 16) & 0xff) as u8);
        vector::push_back(&mut input, ((counter >> 24) & 0xff) as u8);
        sha3_256(input)
    }

    /// XOR the first `len` bytes of `data` against the prefix of `key`.
    ///
    /// Returns a new vector of length `len`.  Asserts `key` is at least `len` bytes.
    fun xor_prefix(data: &vector<u8>, key: &vector<u8>, len: u64): vector<u8> {
        assert!(vector::length(key) >= len, E_INVALID_CLEARTEXT);
        let result = vector::empty<u8>();
        let i = 0;
        while (i < len) {
            let d = *vector::borrow(data, i);
            let k = *vector::borrow(key, i);
            vector::push_back(&mut result, d ^ k);
            i = i + 1;
        };
        result
    }

    /// Decode a little-endian u64 from the first 8 bytes of `bytes`.
    ///
    /// BCS-encodes u64 as 8 bytes little-endian.
    fun le_bytes_to_u64(bytes: &vector<u8>): u64 {
        assert!(vector::length(bytes) >= 8, E_INVALID_CLEARTEXT);
        let result = 0u64;
        let i = 0u64;
        while (i < 8) {
            let byte = (*vector::borrow(bytes, i) as u64);
            result = result | (byte << (8 * (i as u8)));
            i = i + 1;
        };
        result
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

        let s = 0u64;
        while (s < bid_count) {
            let orig_idx = *vector::borrow(&sorted_idx, s);
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
                accumulated = supply;
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
        while (w <= marginal_sorted_pos) {
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

    /// Settle the window and emit `AuctionSettled`.
    ///
    /// Runs uniform-price clearing (sort descending, accumulate to supply,
    /// marginal price, partial fill) and emits one `AuctionSettled` event.
    /// The Ethereum settlement contract or off-chain relayer reads this event
    /// to deliver assets on the cross-chain side.
    ///
    /// Body: scaffold — aborts with E_NOT_IMPLEMENTED (99).
    ///
    /// Call-site break from Demo phase:
    ///   payloads.ts::getSettlePayload(sellerAddr) → (window_id, pair_bcs)
    ///   SettleButton.tsx::submitSettle(account, sellerAddress)
    ///   → (window_id, pair_bcs)
    ///
    /// @see docs/architecture/v0-architecture.md §2.7
    public entry fun settle(
        _caller:    &signer,
        _window_id: u64,
        _pair_bcs:  vector<u8>,
    ) {
        abort E_NOT_IMPLEMENTED
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
    // between the bidder's submitted price and the uniform clearing price,
    // scaled by REBATE_COEFFICIENT.  Coefficient calibration is TBD in v0 —
    // this scaffold defines the function signature and redistribution flow;
    // the body aborts with E_NOT_IMPLEMENTED (99) until Phase 3c impl lands.
    //
    // Returns a vector of Rebate { bidder, amount } for all bidders in the
    // specified window.  Non-winning bidders receive amount = 0.
    //
    // Body: scaffold — aborts with E_NOT_IMPLEMENTED (99).
    //
    // @see docs/architecture/v0-architecture.md §2 (fee/rebate section)
    #[view]
    public fun compute_rebates(
        _window_id:      u64,
        _pair_bcs:       vector<u8>,
        _clearing_price: u64,
    ): vector<Rebate> {
        // REBATE_COEFFICIENT is defined but calibration is TBD — body is a scaffold.
        let _coeff = REBATE_COEFFICIENT;
        abort E_NOT_IMPLEMENTED
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
        u_bytes:            vector<u8>,
        ciphertext:         vector<u8>,
        collateral_lock_id: vector<u8>,
    ) acquires AuctionRegistry {
        test_insert_bid_with_qty(atomica, window_id, pair_bcs, bidder, u_bytes, ciphertext, collateral_lock_id, 0u256);
    }

    // Append a SealedBid with an explicit quantity for clearing algorithm tests.
    // Also appends a revealed price placeholder (0) to keep revealed_prices length
    // in sync with bids. Callers must overwrite via test_set_revealed_prices.
    #[test_only]
    public fun test_insert_bid_with_qty(
        atomica:            &signer,
        window_id:          u64,
        pair_bcs:           vector<u8>,
        bidder:             address,
        u_bytes:            vector<u8>,
        ciphertext:         vector<u8>,
        collateral_lock_id: vector<u8>,
        quantity:           u256,
    ) acquires AuctionRegistry {
        let addr = signer::address_of(atomica);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(addr);
        let state = table::borrow_mut(&mut registry.windows, key);
        vector::push_back(&mut state.bids, SealedBid {
            bidder,
            u_bytes,
            ciphertext,
            collateral_lock_id,
            quantity,
        });
    }

    // Overwrite the revealed_prices vector for a window (test-only).
    // Use after inserting bids to set the prices that clear_uniform_price will read.
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
        state.revealed_prices = prices;
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
            bid_results:     vector::empty(),
        });
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

    // Test-only variant of submit_cleartext_and_clear that accepts the DK bytes
    // directly, bypassing the timelock expiry and ibe_config::get_decryption_key
    // checks. This is used to test the IBE pairing verification logic in isolation
    // without requiring the IBE DK reconstruction native function
    // (`reconstruct_ibe_dk_internal`), which is not available in the Move test VM.
    //
    // IMPORTANT: Do NOT use this in production code. The production path must
    // always fetch the DK from ibe_config after verifying the timelock is expired.
    //
    // @see submit_cleartext_and_clear for the production implementation.
    #[test_only]
    public fun test_submit_cleartext_with_dk(
        _settler:   &signer,
        window_id:  u64,
        pair_bcs:   vector<u8>,
        cleartexts: vector<u64>,
        dk_bytes:   vector<u8>,
    ) acquires AuctionRegistry {
        assert!(exists<AuctionRegistry>(@atomica), E_AUCTION_NOT_FOUND);
        let key = make_window_key(window_id, pair_bcs);
        let registry = borrow_global_mut<AuctionRegistry>(@atomica);
        assert!(table::contains(&registry.windows, key), E_AUCTION_NOT_FOUND);

        let state = table::borrow_mut(&mut registry.windows, key);
        assert!(!state.settled, E_WINDOW_ALREADY_SETTLED);

        let bid_count = vector::length(&state.bids);
        assert!(vector::length(&cleartexts) == bid_count, E_CLEARTEXT_COUNT_MISMATCH);

        // Deserialize the 48-byte G1 decryption key.
        let dk_opt = deserialize<G1, FormatG1Compr>(&dk_bytes);
        assert!(std::option::is_some(&dk_opt), E_INVALID_CLEARTEXT);
        let dk_point = std::option::destroy_some(dk_opt);

        let i = 0;
        let revealed = vector::empty<u64>();
        while (i < bid_count) {
            let bid = vector::borrow(&state.bids, i);
            let cleartext = *vector::borrow(&cleartexts, i);

            let u_opt = deserialize<G2, FormatG2Compr>(&bid.u_bytes);
            assert!(std::option::is_some(&u_opt), E_INVALID_CLEARTEXT);
            let u_point = std::option::destroy_some(u_opt);

            let k_gt = pairing<G1, G2, Gt>(&dk_point, &u_point);
            let k_bytes = serialize<Gt, FormatGt>(&k_gt);
            let xor_key = ibe_derive_key_block(&k_bytes, 0u32);

            let cipher = &bid.ciphertext;
            let cipher_len = vector::length(cipher);
            let msg_bytes = xor_prefix(cipher, &xor_key, cipher_len);

            let recovered_price = le_bytes_to_u64(&msg_bytes);
            assert!(recovered_price == cleartext, E_INVALID_CLEARTEXT);

            vector::push_back(&mut revealed, cleartext);
            i = i + 1;
        };

        state.revealed_prices = revealed;
    }
}
