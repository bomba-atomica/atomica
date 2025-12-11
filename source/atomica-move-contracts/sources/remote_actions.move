module atomica::remote_actions {
    use std::vector;
    use std::bcs;
    use std::signer;
    use aptos_std::aptos_hash;
    
    use atomica::eth_auth;
    use atomica::registry;
    use atomica::fake_eth::{Self, FAKEETH};
    use atomica::fake_usd::{Self, FAKEUSD};
    use atomica::auction;

    /// Error codes
    const E_INVALID_NONCE: u64 = 2;

    /// Prefixes for domain separation
    const PREFIX_FAUCET: u8 = 1;
    const PREFIX_CREATE_AUCTION: u8 = 2;
    const PREFIX_BID: u8 = 3;

    fun get_user_and_check_nonce(eth_address: vector<u8>, nonce: u64): signer {
        let (user_signer, expected_nonce) = registry::get_user_signer_and_nonce(eth_address);
        assert!(nonce == expected_nonce, E_INVALID_NONCE);
        registry::increment_nonce(eth_address);
        user_signer
    }

    /// Wraps a 32-byte hash with the Ethereum Signed Message prefix for length 32.
    /// "\x19Ethereum Signed Message:\n32" + hash
    fun param_hash_to_eth_hash(param_hash: vector<u8>): vector<u8> {
        // Prefix bytes: "\x19Ethereum Signed Message:\n32"
        // \x19 = 25 (0x19)
        // "Ethereum Signed Message:\n" (25 bytes)
        // "32" (2 bytes)
        // Total prefix: 28 bytes
        
        let prefix = x"19457468657265756d205369676e6564204d6573736167653a0a3332";
        let payload = prefix;
        vector::append(&mut payload, param_hash);
        
        aptos_hash::keccak256(payload)
    }

    /// Faucet Entry
    public entry fun remote_faucet(
        _relayer: &signer,
        eth_address: vector<u8>,
        signature: vector<u8>,
        nonce: u64
    ) {
        let user_signer = get_user_and_check_nonce(eth_address, nonce);
        
        let payload = vector::empty<u8>();
        vector::push_back(&mut payload, PREFIX_FAUCET);
        vector::append(&mut payload, bcs::to_bytes(&nonce));
        let inner_hash = aptos_hash::keccak256(payload);
        
        let eth_hash = param_hash_to_eth_hash(inner_hash);

        eth_auth::verify_eth_sig(eth_hash, signature, eth_address);

        fake_eth::mint(&user_signer, 1000000000); 
        fake_usd::mint(&user_signer, 100000000000); 
    }

    /// Create Auction Entry
    public entry fun remote_create_auction(
        _relayer: &signer,
        eth_address: vector<u8>,
        signature: vector<u8>,
        nonce: u64,
        amount_eth: u64,
        min_price: u64,
        duration: u64,
        mpk_bytes: vector<u8>
    ) {
        let user_signer = get_user_and_check_nonce(eth_address, nonce);

        let payload = vector::empty<u8>();
        vector::push_back(&mut payload, PREFIX_CREATE_AUCTION);
        vector::append(&mut payload, bcs::to_bytes(&nonce));
        vector::append(&mut payload, bcs::to_bytes(&amount_eth));
        vector::append(&mut payload, bcs::to_bytes(&min_price));
        vector::append(&mut payload, bcs::to_bytes(&duration));
        vector::append(&mut payload, mpk_bytes);
        let inner_hash = aptos_hash::keccak256(payload);
        
        let eth_hash = param_hash_to_eth_hash(inner_hash);

        eth_auth::verify_eth_sig(eth_hash, signature, eth_address);

        auction::create_auction(&user_signer, amount_eth, min_price, duration, mpk_bytes);
    }

    /// Submit Bid Entry
    public entry fun remote_bid(
        _relayer: &signer,
        eth_address: vector<u8>,
        signature: vector<u8>,
        nonce: u64,
        seller_addr: address,
        amount_usd: u64,
        u_bytes: vector<u8>,
        v_bytes: vector<u8>
    ) {
        let user_signer = get_user_and_check_nonce(eth_address, nonce);

        let payload = vector::empty<u8>();
        vector::push_back(&mut payload, PREFIX_BID);
        vector::append(&mut payload, bcs::to_bytes(&nonce));
        vector::append(&mut payload, bcs::to_bytes(&seller_addr));
        vector::append(&mut payload, bcs::to_bytes(&amount_usd));
        vector::append(&mut payload, u_bytes);
        vector::append(&mut payload, v_bytes);
        let inner_hash = aptos_hash::keccak256(payload);
        
        let eth_hash = param_hash_to_eth_hash(inner_hash);

        eth_auth::verify_eth_sig(eth_hash, signature, eth_address);

        auction::submit_bid(&user_signer, seller_addr, amount_usd, u_bytes, v_bytes);
    }
}
