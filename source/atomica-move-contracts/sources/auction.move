/// Auction module — Demo phase + v0 Beta Scaffold stubs
///
/// Receipt-based auction using LockReceipts from Ethereum.
///
/// @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
///
/// FakeETH and FakeUSD are ERC20 tokens that exist ONLY on Ethereum.
/// On Aptos, a lock is represented by a LockReceipt<Ethereum, FakeETH> stored in
/// the ReceiptRegistry. This module consumes those receipts to prove the seller
/// has locked assets on Ethereum, then records the auction result on-chain.
/// Actual asset delivery happens on the Ethereum side via the settlement contract.
///
/// Flow:
///   1. Seller locks FakeETH on Ethereum
///   2. Seller registers proof → LockReceipt<Ethereum, FakeETH> created in registry
///   3. Seller calls create_auction(lock_id, ...) → receipt claimed, auction opened
///   4. Bidders call submit_bid(seller_addr, bid_price) — Demo: no Aptos-side collateral
///   5. After end_time, anyone calls settle(seller_addr) → winner + clearing price recorded
///   6. Ethereum settlement contract reads the result and transfers assets
///
/// Demo limitations:
///   - No bidder collateral on Aptos (MVP: bidders also submit FakeUSD LockReceipts)
///   - Single seller per Aptos address (one active auction at a time)
///   - Plaintext bid prices (Production: IBE-encrypted sealed bids)
///   - No Ethereum settlement integration yet (Settlement.sol deferred to later phase)
///
/// ============================================================
/// v0 Beta Scaffold stubs (Phase 3a integration seams — #86)
/// ============================================================
///
/// The structs and entry functions below are compile-clean stubs for the
/// global AuctionRegistry shape described in:
///   docs/architecture/v0-architecture.md §2.3 – §2.6
///
/// INTEGRATION RISK (scout #96):
///
/// 1. Shape change breaks ALL current call sites:
///    - `atomica-sdk/src/aptos/payloads.ts`:
///        getCreateAuctionPayload(lockId, minPrice, duration, mpk)
///        → must become (window_id, pair_bcs, lock_id, min_price, mpk_bytes)
///        getBidPayload(sellerAddr, amountUsd, u, v)
///        → must become (window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id)
///        getSettlePayload(sellerAddr)
///        → must become (window_id, pair_bcs)
///        isSettled(sellerAddr) / getSettlement(sellerAddr)
///        → must become window-keyed queries against AuctionRegistry at @atomica
///    - `source/atomica-web-components/src/components/AuctionBidder.tsx`:
///        submitBid(account, sellerAddr, amountBn, u, v) call must change to
///        pass (window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id)
///    - `auction_tests.move`: all test calls to create_auction / submit_bid / settle
///        must be updated; existing tests will fail to compile after #86 merges
///
/// 2. Shared-file pressure (serialization constraint):
///    - AuctionBidder.tsx is edited by BOTH #87 (collateral wiring) and #90 (IBE
///        MPK on-chain fetch). These must merge in strict order: #86 → #87 → #90.
///    - bridge.ts (atomica-sdk/src/settlement/bridge.ts) is edited by BOTH #87
///        (submitBidPayload field flow) and #89 (queryAuctionSettledEvents /
///        submitSettlement scaffold). These must merge: #86 → #87 → #89.
///
/// 3. AuctionRegistry is stored at @atomica (the contract deployer address).
///    The current per-seller `Auction has key` stored at the seller's address.
///    TypeScript callers currently borrow_global<Auction>(sellerAddr) — these
///    must switch to `exists<AuctionRegistry>(@atomica)` after #86 merges.
///
/// 4. `submit_cleartext_and_clear` depends on timelock_config::get_decryption_key
///    (see timelock_config.move). That module must expose get_decryption_key before
///    #86 can compile the full reveal path.
///
/// None of the stub entry functions below contain real logic. All bodies abort
/// with E_NOT_IMPLEMENTED (code 99). Existing Demo-phase code (below this block)
/// is preserved unchanged until #86 rewrites it.
module atomica::auction {
    use std::signer;
    use std::vector;
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use aptos_framework::table::Table;
    use atomica::lock_receipt::{Self, Ethereum, FakeETH};

    // ===================== Error Codes =====================

    const E_AUCTION_NOT_FOUND: u64 = 1;
    const E_AUCTION_ENDED: u64 = 2;
    const E_AUCTION_NOT_ENDED: u64 = 3;
    const E_BID_TOO_LOW: u64 = 4;
    const E_ALREADY_SETTLED: u64 = 5;

    /// Scaffold stub sentinel — Phase 3a entry functions abort with this code
    /// until their bodies are implemented in issue #86.
    const E_NOT_IMPLEMENTED: u64 = 99;

    // ===================== v0 Beta Scaffold — AuctionRegistry types =====================
    //
    // These types implement docs/architecture/v0-architecture.md §2.3 – §2.6.
    // They coexist with the Demo-phase structs below and do NOT replace them yet.
    // Issue #86 will delete the Demo-phase structs once all call sites are updated.
    //
    // Call-site mapping (all break when #86 merges):
    //   payloads.ts::getCreateAuctionPayload   → create_auction_v1
    //   payloads.ts::getBidPayload             → submit_bid_v1
    //   payloads.ts::getSettlePayload          → settle_v1
    //   AuctionBidder.tsx::submitBid call      → submit_bid_v1 (shared with #90)
    //   bridge.ts::submitSettlement            → settle_v1 / queryAuctionSettledEvents (shared with #89)

    /// Trading pair descriptor.
    /// @see docs/architecture/v0-architecture.md §2.4
    struct Pair has copy, drop, store {
        base_chain:  vector<u8>,   // e.g. b"ethereum"
        base_token:  vector<u8>,   // e.g. b"FakeETH"
        quote_chain: vector<u8>,   // e.g. b"aptos"
        quote_token: vector<u8>,   // e.g. b"FakeUSD"
    }

    /// IBE sealed bid — plaintext price never stored on-chain.
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
        total_supply:   u256,              // sum of all seller lock amounts (FakeETH wei)
        bids:           vector<SealedBid>,
        settled:        bool,
        clearing_price: u64,
        lock_ids:       vector<vector<u8>>, // seller receipts
    }

    /// Global registry stored at the @atomica deployer address (not per-seller).
    /// Key: BCS-encoded (auction_window_id: u64, pair: Pair).
    /// @see docs/architecture/v0-architecture.md §2.3
    struct AuctionRegistry has key {
        windows: Table<vector<u8>, WindowState>,
    }

    // Settlement event for the v0 Beta shape (replaces the Demo AuctionSettled below).
    // @see docs/architecture/v0-architecture.md §2.9
    #[event]
    struct AuctionSettledV1 has drop, store {
        window_id:      u64,
        pair:           Pair,
        clearing_price: u64,
        total_filled:   u256,              // wei of base token transferred to winners
        winner_count:   u64,
        lock_ids:       vector<vector<u8>>, // seller receipt IDs consumed
    }

    // ===================== v0 Beta Scaffold — helper =====================

    /// Compute `auction_window_id` from on-chain clock.
    /// epoch_index = unix_seconds / 43200
    /// window_offset = 1 if time_in_epoch >= 28500, else 0
    /// window_id = epoch_index * 2 + window_offset
    /// @see docs/architecture/v0-architecture.md §2.2
    fun current_window_id(): u64 {
        let s = timestamp::now_seconds();
        let epoch = s / 43200;
        let tmod  = s % 43200;
        epoch * 2 + if (tmod >= 28500) { 1 } else { 0 }
    }

    // ===================== v0 Beta Scaffold — entry function stubs =====================
    //
    // All bodies abort with E_NOT_IMPLEMENTED (99). Signatures are final;
    // implementations land in issue #86.
    //
    // INTEGRATION RISK: these replace the Demo-phase entry functions below.
    // Callers in payloads.ts and AuctionBidder.tsx must be updated in #86 before
    // the Demo-phase entry functions are removed.

    /// Create a new global-registry auction for `(window_id, pair)`.
    ///
    /// Integration seam for issue #86.
    /// Call-site break: payloads.ts::getCreateAuctionPayload must pass
    ///   (window_id: u64, pair_bcs: vector<u8>, lock_id, min_price, mpk_bytes).
    public entry fun create_auction_v1(
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
    /// Integration seam for issues #86 and #87 (collateral wiring).
    /// Call-site break: payloads.ts::getBidPayload and AuctionBidder.tsx::submitBid
    ///   must pass (window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id).
    /// Shared-file pressure: AuctionBidder.tsx is also edited by #90 (IBE MPK fetch).
    public entry fun submit_bid_v1(
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
    /// Integration seam for issue #86.
    /// Consults timelock_config::get_decryption_key — timelock_config.move must
    /// expose that function before this body can be implemented.
    /// @see docs/architecture/v0-architecture.md §2.6
    public entry fun submit_cleartext_and_clear(
        _settler:    &signer,
        _window_id:  u64,
        _pair_bcs:   vector<u8>,
        _cleartexts: vector<u64>,
    ) {
        abort E_NOT_IMPLEMENTED
    }

    /// Settle the window and emit AuctionSettledV1.
    ///
    /// Integration seam for issue #86 and #89 (bridge.ts queryAuctionSettledEvents).
    /// Call-site break: payloads.ts::getSettlePayload must pass (window_id, pair_bcs).
    /// Shared-file pressure: bridge.ts is also edited by #87 (collateral refund path).
    public entry fun settle_v1(
        _caller:    &signer,
        _window_id: u64,
        _pair_bcs:  vector<u8>,
    ) {
        abort E_NOT_IMPLEMENTED
    }

    // ===================== Structs =====================

    /// A plaintext bid submitted by a buyer.
    /// Demo: no Aptos-side collateral. MVP will require FakeUSD LockReceipt.
    struct Bid has store {
        bidder: address,
        /// Quoted price (in FakeUSD base units per FakeETH unit)
        bid_price: u64,
    }

    /// An active auction. Stored at the seller's address.
    /// The seller's FakeETH is proven-locked on Ethereum — `amount` is the wei
    /// value from the claimed LockReceipt (18-decimal, same as Ethereum).
    struct Auction has key {
        seller: address,
        /// Amount of FakeETH being auctioned (in wei, from the LockReceipt)
        amount: u256,
        /// The lock_id of the consumed receipt (for reference / settlement)
        lock_id: vector<u8>,
        /// Minimum acceptable bid price
        min_price: u64,
        /// Auction close time (unix seconds)
        end_time: u64,
        /// Master Public Key bytes — forward-compatibility placeholder.
        /// Demo: stored but not validated. Production: used for IBE.
        mpk: vector<u8>,
        /// All submitted bids
        bids: vector<Bid>,
        /// True once settle() has been called
        settled: bool,
        /// Set after settlement: winning bidder (zero address = no winner)
        winner: address,
        /// Set after settlement: clearing price (0 = no winner)
        clearing_price: u64,
    }

    // ===================== Events =====================

    #[event]
    /// Emitted when settlement is complete. The Ethereum settlement contract
    /// (or an off-chain relayer) reads this to transfer assets on Ethereum.
    struct AuctionSettled has drop, store {
        seller: address,
        winner: address,
        amount: u256,
        clearing_price: u64,
        lock_id: vector<u8>,
    }

    // ===================== Entry Functions =====================

    /// Create a new auction by consuming a verified Ethereum lock receipt.
    ///
    /// Calls `lock_receipt::claim<Ethereum, FakeETH>` which:
    ///   - Verifies the receipt belongs to `seller`
    ///   - Marks it as claimed (preventing double-use)
    ///   - Returns the locked amount (in wei)
    ///
    /// The receipt claim is the seller's "deposit" — no FA transfer needed on Aptos.
    ///
    /// `lock_id`: keccak256 of (block_hash || contract_addr || user_addr || token_addr || storage_key)
    ///            as computed by lock_receipt::generate_lock_id.
    /// `mpk_bytes`: Master Public Key for forward-compatibility. Pass empty vector for Demo.
    public entry fun create_auction(
        seller: &signer,
        lock_id: vector<u8>,
        min_price: u64,
        duration: u64,
        mpk_bytes: vector<u8>,
    ) {
        let seller_addr = signer::address_of(seller);

        // Claim the receipt — proves the seller locked FakeETH on Ethereum,
        // and prevents the same lock from being used in multiple auctions.
        let amount = lock_receipt::claim<Ethereum, FakeETH>(seller_addr, lock_id);

        move_to(seller, Auction {
            seller: seller_addr,
            amount,
            lock_id,
            min_price,
            end_time: timestamp::now_seconds() + duration,
            mpk: mpk_bytes,
            bids: vector::empty(),
            settled: false,
            winner: @0x0,
            clearing_price: 0,
        });
    }

    /// Submit a plaintext bid for an auction.
    ///
    /// Demo: no Aptos-side collateral required.
    /// MVP: bidder must also submit a FakeUSD LockReceipt as collateral.
    public entry fun submit_bid(
        bidder: &signer,
        seller_addr: address,
        bid_price: u64,
    ) acquires Auction {
        assert!(exists<Auction>(seller_addr), E_AUCTION_NOT_FOUND);
        let auction = borrow_global_mut<Auction>(seller_addr);

        assert!(
            timestamp::now_seconds() < auction.end_time,
            E_AUCTION_ENDED,
        );
        assert!(!auction.settled, E_ALREADY_SETTLED);
        assert!(bid_price >= auction.min_price, E_BID_TOO_LOW);

        vector::push_back(&mut auction.bids, Bid {
            bidder: signer::address_of(bidder),
            bid_price,
        });
    }

    /// Settle the auction after end_time.
    ///
    /// Finds the highest bid >= min_price. Records winner + clearing price on-chain
    /// and emits an AuctionSettled event. The Ethereum settlement contract (or a
    /// relayer) reads this event to transfer FakeETH to the winner and FakeUSD to
    /// the seller on the Ethereum side.
    ///
    /// Anyone can call settle after end_time.
    ///
    /// @see docs/architecture/v0-architecture.md#§3-cross-chain-settlement-v01-bls-relayer-flow
    public entry fun settle(
        _caller: &signer,
        seller_addr: address,
    ) acquires Auction {
        assert!(exists<Auction>(seller_addr), E_AUCTION_NOT_FOUND);
        let auction = borrow_global_mut<Auction>(seller_addr);

        assert!(
            timestamp::now_seconds() >= auction.end_time,
            E_AUCTION_NOT_ENDED,
        );
        assert!(!auction.settled, E_ALREADY_SETTLED);

        auction.settled = true;

        // Find highest bid >= min_price
        let bid_count = vector::length(&auction.bids);
        let winner_addr = @0x0;
        let best_price: u64 = 0;
        let i = 0;
        while (i < bid_count) {
            let bid = vector::borrow(&auction.bids, i);
            if (bid.bid_price >= auction.min_price && bid.bid_price > best_price) {
                best_price = bid.bid_price;
                winner_addr = bid.bidder;
            };
            i = i + 1;
        };

        auction.winner = winner_addr;
        auction.clearing_price = best_price;

        // Emit settlement result — Ethereum side reads this to deliver assets
        event::emit(AuctionSettled {
            seller: auction.seller,
            winner: winner_addr,
            amount: auction.amount,
            clearing_price: best_price,
            lock_id: auction.lock_id,
        });
    }

    // ===================== View Functions =====================

    #[view]
    /// Returns (seller, amount_wei, lock_id, min_price, end_time, bid_count, settled, winner, clearing_price)
    public fun get_auction(seller_addr: address): (address, u256, vector<u8>, u64, u64, u64, bool, address, u64) acquires Auction {
        assert!(exists<Auction>(seller_addr), E_AUCTION_NOT_FOUND);
        let a = borrow_global<Auction>(seller_addr);
        (
            a.seller,
            a.amount,
            a.lock_id,
            a.min_price,
            a.end_time,
            vector::length(&a.bids),
            a.settled,
            a.winner,
            a.clearing_price,
        )
    }

    #[view]
    public fun get_bid_count(seller_addr: address): u64 acquires Auction {
        if (!exists<Auction>(seller_addr)) return 0;
        vector::length(&borrow_global<Auction>(seller_addr).bids)
    }

    #[view]
    public fun is_settled(seller_addr: address): bool acquires Auction {
        if (!exists<Auction>(seller_addr)) return false;
        borrow_global<Auction>(seller_addr).settled
    }

    #[view]
    public fun auction_exists(seller_addr: address): bool {
        exists<Auction>(seller_addr)
    }

    #[view]
    /// Returns (winner, clearing_price) after settlement.
    /// winner == @0x0 means no valid bid was found.
    public fun get_settlement(seller_addr: address): (address, u64) acquires Auction {
        assert!(exists<Auction>(seller_addr), E_AUCTION_NOT_FOUND);
        let a = borrow_global<Auction>(seller_addr);
        (a.winner, a.clearing_price)
    }
}
