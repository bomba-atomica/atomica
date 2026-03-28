/// Auction module — Demo phase
///
/// Receipt-based auction using LockReceipts from Ethereum.
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
module atomica::auction {
    use std::signer;
    use std::vector;
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use atomica::lock_receipt::{Self, Ethereum, FakeETH};

    // ===================== Error Codes =====================

    const E_AUCTION_NOT_FOUND: u64 = 1;
    const E_AUCTION_ENDED: u64 = 2;
    const E_AUCTION_NOT_ENDED: u64 = 3;
    const E_BID_TOO_LOW: u64 = 4;
    const E_ALREADY_SETTLED: u64 = 5;

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
