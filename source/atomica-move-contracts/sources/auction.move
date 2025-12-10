module AtomicaAuction::Auction {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use AtomicaAuction::FAKEETH::FAKEETH;
    use AtomicaAuction::FAKEUSD::FAKEUSD;

    /// Error codes
    const E_AUCTION_NOT_STARTED: u64 = 1;
    const E_AUCTION_ENDED: u64 = 2;
    const E_BID_TOO_LOW: u64 = 3;
    const E_NOT_SELLER: u64 = 4;
    const E_INVALID_TIMELOCK: u64 = 5;

    struct Auction has key {
        seller: address,
        asset: Coin<FAKEETH>,
        min_price: u64,
        end_time: u64,
        bids: vector<Bid>,
        locked: bool,
    }

    struct Bid has store {
        bidder: address,
        encrypted_amount: vector<u8>,
        ciphertext: vector<u8>, 
    }

    public entry fun create_auction(
        seller: &signer,
        amount_eth: u64,
        min_price_usd: u64,
        duration_seconds: u64
    ) {
        let seller_addr = signer::address_of(seller);
        let assets = coin::withdraw<FAKEETH>(seller, amount_eth);
        
        move_to(seller, Auction {
            seller: seller_addr,
            asset: assets,
            min_price: min_price_usd,
            end_time: timestamp::now_seconds() + duration_seconds,
            bids: vector::empty(),
            locked: true,
        });
    }

    public entry fun submit_encrypted_bid(
        bidder: &signer,
        seller_addr: address,
        encrypted_amount: vector<u8>,
        ciphertext: vector<u8>
    ) acquires Auction {
        let auction = borrow_global_mut<Auction>(seller_addr);
        assert!(timestamp::now_seconds() < auction.end_time, E_AUCTION_ENDED);

        let bid = Bid {
            bidder: signer::address_of(bidder),
            encrypted_amount,
            ciphertext,
        };
        vector::push_back(&mut auction.bids, bid);
    }

    // TODO: Implement reveal and settle logic using onion timelock
}
