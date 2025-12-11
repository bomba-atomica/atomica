module atomica::auction {
    use std::signer;
    use std::vector;
    use std::error;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::account;
    use aptos_framework::timestamp;
    
    use aptos_std::crypto_algebra::{Self, Element};
    use aptos_std::bls12381_algebra::{Self, G1, G2, FormatG1Uncompr, FormatG1Compr, FormatG2Uncompr, FormatG2Compr};
    
    use atomica::fake_eth::FAKEETH;
    use atomica::fake_usd::FAKEUSD;
    use atomica::timelock_encryption::{Self, EncryptedMessage};

    /// Error codes
    const E_AUCTION_NOT_STARTED: u64 = 1;
    const E_AUCTION_ENDED: u64 = 2;
    const E_AUCTION_NOT_ENDED: u64 = 3;
    const E_BID_TOO_LOW: u64 = 4;
    const E_INVALID_DECRYPTION_KEY: u64 = 5;
    const E_BID_ALREADY_REVEALED: u64 = 6;
    const E_INVALID_PROOF: u64 = 7;

    /// Main Auction Resource
    struct Auction has key {
        seller: address,
        asset: Coin<FAKEETH>,
        min_price: u64,
        end_time: u64,
        mpk: Element<G1>, // Master Public Key (G1)
        bids: vector<EncryptedBid>,
        highest_bidder: address,
        highest_bid: u64,
        winner_declared: bool,
    }

    struct EncryptedBid has store {
        bidder: address,
        message: EncryptedMessage, // (U in G1, Ciphertext)
        payment: Coin<FAKEUSD>,
        revealed: bool,
    }

    /// Initialize the auction
    /// mpk_bytes: Serialized G1 element
    public entry fun create_auction(
        seller: &signer, 
        amount_eth: u64, 
        min_price: u64, 
        duration: u64,
        mpk_bytes: vector<u8>
    ) {
        let seller_addr = signer::address_of(seller);
        let eth_coins = coin::withdraw<FAKEETH>(seller, amount_eth);
        
        // Deserialize MPK (G1)
        let mpk_opt = crypto_algebra::deserialize<G1, FormatG1Uncompr>(&mpk_bytes);
        let mpk = if (std::option::is_some(&mpk_opt)) {
            std::option::extract(&mut mpk_opt)
        } else {
            let mpk_opt_c = crypto_algebra::deserialize<G1, FormatG1Compr>(&mpk_bytes);
            assert!(std::option::is_some(&mpk_opt_c), error::invalid_argument(E_INVALID_PROOF));
            std::option::extract(&mut mpk_opt_c)
        };

        move_to(seller, Auction {
            seller: seller_addr,
            asset: eth_coins,
            min_price,
            end_time: timestamp::now_seconds() + duration,
            mpk,
            bids: vector::empty(),
            highest_bidder: seller_addr,
            highest_bid: 0,
            winner_declared: false,
        });
    }

    /// Submit an encrypted bid
    /// u_bytes: Serialized G1 element U
    /// v_bytes: Encrypted bytes
    public entry fun submit_bid(
        bidder: &signer,
        seller_addr: address,
        amount_usd: u64,
        u_bytes: vector<u8>,
        v_bytes: vector<u8>
    ) acquires Auction {
        let auction = borrow_global_mut<Auction>(seller_addr);
        assert!(timestamp::now_seconds() < auction.end_time, error::invalid_state(E_AUCTION_ENDED));
        assert!(amount_usd >= auction.min_price, error::invalid_argument(E_BID_TOO_LOW));

        // Deserialize U (G1)
        let u_opt = crypto_algebra::deserialize<G1, FormatG1Uncompr>(&u_bytes);
        let u_element = if (std::option::is_some(&u_opt)) {
            std::option::extract(&mut u_opt)
        } else {
            let u_opt_c = crypto_algebra::deserialize<G1, FormatG1Compr>(&u_bytes);
            assert!(std::option::is_some(&u_opt_c), error::invalid_argument(E_INVALID_PROOF));
            std::option::extract(&mut u_opt_c)
        };

        // Construct EncryptedMessage
        let message = timelock_encryption::create_encrypted_message(u_element, v_bytes);

        // Lock funds
        let payment = coin::withdraw<FAKEUSD>(bidder, amount_usd);

        let bid = EncryptedBid {
            bidder: signer::address_of(bidder),
            message,
            payment,
            revealed: false,
        };

        vector::push_back(&mut auction.bids, bid);
    }

    /// Reveal bids using Timelock Secret
    public entry fun reveal_bids(
        sender: &signer,
        seller_addr: address,
        interval: u64
    ) acquires Auction {
        let auction = borrow_global_mut<Auction>(seller_addr);
        assert!(timestamp::now_seconds() >= auction.end_time, error::invalid_state(E_AUCTION_NOT_ENDED));
        assert!(!auction.winner_declared, error::invalid_state(E_AUCTION_ENDED));

        // 1. Fetch Decryption Key (Signature) from Timelock
        // Note: timelock::get_secret returns vector<u8>. We assume this is a serialized G2 element.
        let secret_opt = aptos_framework::timelock::get_secret(interval);
        assert!(std::option::is_some(&secret_opt), error::invalid_state(E_INVALID_DECRYPTION_KEY));
        let sig_bytes = std::option::extract(&mut secret_opt);

        // Deserialize Signature (G2)
        // BLS signatures are typically G2.
        let sig_opt = crypto_algebra::deserialize<G2, FormatG2Uncompr>(&sig_bytes);
        let signature = if (std::option::is_some(&sig_opt)) {
            std::option::extract(&mut sig_opt)
        } else {
            let sig_opt_c = crypto_algebra::deserialize<G2, FormatG2Compr>(&sig_bytes);
            assert!(std::option::is_some(&sig_opt_c), error::invalid_argument(E_INVALID_PROOF));
            std::option::extract(&mut sig_opt_c)
        };

        // 2. Decrypt Bids
        let i = 0;
        let best_bid_val = auction.highest_bid;
        let best_bidder = auction.highest_bidder;
        let len = vector::length(&auction.bids);

        while (i < len) {
            let bid = vector::borrow_mut(&mut auction.bids, i);
            if (!bid.revealed) {
                // Decrypt using helper module
                let decrypted_bytes = timelock_encryption::decrypt(&bid.message, &signature);
                
                // Parse U64
                if (vector::length(&decrypted_bytes) >= 8) {
                    let bid_amount = u64_from_bytes(&decrypted_bytes);
                    
                    if (bid_amount > best_bid_val) {
                        // Check if locked payment covers the bid value
                        if (coin::value(&bid.payment) >= bid_amount) {
                            best_bid_val = bid_amount;
                            best_bidder = bid.bidder;
                        }
                    }
                };
                bid.revealed = true;
            };
            i = i + 1;
        };

        auction.highest_bid = best_bid_val;
        auction.highest_bidder = best_bidder;
        auction.winner_declared = true;
    }

    fun u64_from_bytes(bytes: &vector<u8>): u64 {
        if (vector::length(bytes) < 8) return 0;
        let val: u64 = 0;
        let i = 0;
        while (i < 8) {
            let b = *vector::borrow(bytes, i);
            val = val | ((b as u64) << (i * 8));
            i = i + 1;
        };
        val
    }
}
