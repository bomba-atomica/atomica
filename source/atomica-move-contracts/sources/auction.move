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
    use std::vector;
    use aptos_framework::timestamp;
    use aptos_framework::table::{Self, Table};
    use aptos_std::bcs;

    // ===================== Error Codes =====================

    const E_AUCTION_NOT_FOUND: u64 = 1;
    const E_AUCTION_ENDED: u64 = 2;
    const E_AUCTION_NOT_ENDED: u64 = 3;
    const E_BID_TOO_LOW: u64 = 4;
    const E_ALREADY_SETTLED: u64 = 5;

    /// Scaffold stub sentinel — all Phase 3a entry function bodies abort with this
    /// code until their implementations land in #86b–#86f.
    const E_NOT_IMPLEMENTED: u64 = 99;

    // ===================== Types =====================

    /// Trading pair descriptor.
    /// @see docs/architecture/v0-architecture.md §2.4
    struct Pair has copy, drop, store {
        base_chain:  vector<u8>,   // e.g. b"ethereum"
        base_token:  vector<u8>,   // e.g. b"FakeETH"
        quote_chain: vector<u8>,   // e.g. b"aptos"
        quote_token: vector<u8>,   // e.g. b"FakeUSD"
    }

    /// IBE sealed bid — plaintext price never stored on-chain during live window.
    /// @see docs/architecture/v0-architecture.md §2.5
    struct SealedBid has store {
        bidder:             address,
        u_bytes:            vector<u8>,   // IBE ephemeral point U = rG (48-byte G1)
        ciphertext:         vector<u8>,   // AES-GCM ciphertext of plaintext price
        collateral_lock_id: vector<u8>,   // FakeUSD LockReceipt ID held as margin
    }

    /// Per-window clearing state within the global registry.
    /// @see docs/architecture/v0-architecture.md §2.3
    struct WindowState has store {
        pair:           Pair,
        window_id:      u64,
        total_supply:   u256,               // sum of all seller lock amounts (FakeETH wei)
        bids:           vector<SealedBid>,
        settled:        bool,
        clearing_price: u64,
        lock_ids:       vector<vector<u8>>, // seller receipts consumed
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
    /// Body: scaffold — aborts with E_NOT_IMPLEMENTED (99).
    ///
    /// Call-site break from Demo phase:
    ///   payloads.ts::getCreateAuctionPayload(lockId, minPrice, duration, mpk)
    ///   → (window_id, pair_bcs, lock_id, min_price, mpk_bytes)
    ///
    /// @see docs/architecture/v0-architecture.md §2.3
    public entry fun create_auction(
        _seller:    &signer,
        _window_id: u64,
        _pair_bcs:  vector<u8>,
        _lock_id:   vector<u8>,
        _min_price: u64,
        _mpk_bytes: vector<u8>,
    ) {
        abort E_NOT_IMPLEMENTED
    }

    /// Submit a sealed bid for `(window_id, pair)`.
    ///
    /// Stores the IBE-encrypted bid without revealing the plaintext price.
    /// The `collateral_lock_id` links the bidder's FakeUSD LockReceipt (margin).
    ///
    /// Body: scaffold — aborts with E_NOT_IMPLEMENTED (99).
    ///
    /// Call-site break from Demo phase:
    ///   payloads.ts::getBidPayload(sellerAddr, amountUsd, u, v)
    ///   → (window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id)
    ///   AuctionBidder.tsx::submitBid(account, sellerAddr, amountBn, u, v)
    ///   → (window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id)
    ///
    /// @see docs/architecture/v0-architecture.md §2.5
    public entry fun submit_bid(
        _bidder:             &signer,
        _window_id:          u64,
        _pair_bcs:           vector<u8>,
        _u_bytes:            vector<u8>,
        _ciphertext:         vector<u8>,
        _collateral_lock_id: vector<u8>,
    ) {
        abort E_NOT_IMPLEMENTED
    }

    /// Reveal cleartexts and run uniform-price clearing for `(window_id, pair)`.
    ///
    /// After the window closes, the on-chain DKG releases the decryption key.
    /// The settler calls this function with the index-aligned cleartext prices.
    /// The function verifies each cleartext against the stored `(u_bytes, ciphertext)`
    /// using `timelock_config::get_decryption_key`, then runs the clearing algorithm.
    ///
    /// Body: scaffold — aborts with E_NOT_IMPLEMENTED (99).
    ///
    /// @see docs/architecture/v0-architecture.md §2.6
    public entry fun submit_cleartext_and_clear(
        _settler:    &signer,
        _window_id:  u64,
        _pair_bcs:   vector<u8>,
        _cleartexts: vector<u64>,
    ) {
        abort E_NOT_IMPLEMENTED
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

    #[test_only]
    use std::signer;

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
            pair:           base_pair,
            window_id,
            total_supply,
            bids:           vector::empty(),
            settled,
            clearing_price,
            lock_ids:       vector::empty(),
        });
    }
}
