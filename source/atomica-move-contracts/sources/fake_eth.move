module atomica::fake_eth {
    use aptos_framework::fungible_asset::{Self, MintRef, TransferRef, BurnRef, Metadata};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;
    use std::string::utf8;
    use std::option;
    use std::signer;
    use atomica::lock_receipt::{Self, Ethereum, FakeETH};

    const ASSET_SYMBOL: vector<u8> = b"FAKEETH";

    /// Maximum amount that can be minted per transaction (10,000 FAKEETH with 8 decimals)
    const MAX_MINT_AMOUNT: u64 = 1_000_000_000_000;

    /// Error code when trying to mint more than the maximum allowed
    const E_EXCEEDS_MAX_MINT: u64 = 1;
    
    /// Error code when u256 to u64 conversion would overflow
    const E_AMOUNT_OVERFLOW: u64 = 2;

    /// Holds the refs for minting, transferring, and burning
    struct ManagingRefs has key {
        mint_ref: MintRef,
        transfer_ref: TransferRef,
        burn_ref: BurnRef,
    }

    /// Initialize the FAKEETH fungible asset
    public entry fun initialize(admin: &signer) {
        // Create a non-deletable object with a named address
        let constructor_ref = &object::create_named_object(admin, ASSET_SYMBOL);
        
        // Create the FA's Metadata
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            constructor_ref,
            option::none(), // No maximum supply
            utf8(b"Fake Ethereum"),
            utf8(ASSET_SYMBOL),
            8, // decimals
            utf8(b""),
            utf8(b""),
        );

        // Generate refs for minting, transferring, and burning
        let mint_ref = fungible_asset::generate_mint_ref(constructor_ref);
        let transfer_ref = fungible_asset::generate_transfer_ref(constructor_ref);
        let burn_ref = fungible_asset::generate_burn_ref(constructor_ref);

        // Store the refs
        move_to(admin, ManagingRefs {
            mint_ref,
            transfer_ref,
            burn_ref,
        });
    }

    /// Mint FAKEETH to yourself (legacy Aptos test helper).
    /// Anyone can call this (it's a faucet for testing).
    /// Maximum 10,000 FAKEETH per mint transaction.
    ///
    /// DEPRECATED: Canonical fake-token issuance is EVM-only.
    /// Aptos-side fake token minting is legacy prototype behavior.
    public entry fun mint(account: &signer, amount: u64) acquires ManagingRefs {
        // Enforce maximum mint amount per transaction
        assert!(amount <= MAX_MINT_AMOUNT, E_EXCEEDS_MAX_MINT);

        // Get refs from the contract address (where initialize was called)
        let refs = borrow_global<ManagingRefs>(@atomica);

        // Mint the fungible asset
        let fa = fungible_asset::mint(&refs.mint_ref, amount);

        // Deposit to the signer's primary store
        let recipient = signer::address_of(account);
        primary_fungible_store::deposit(recipient, fa);
    }

    /// Mint FAKEETH from a verified Ethereum lock receipt (legacy bridge prototype helper).
    /// DEPRECATED: In canonical flow, receipts are consumed for Aptos auction/settlement
    /// accounting and FakeETH/FakeUSD are not minted on Aptos.
    ///
    /// Process:
    /// 1. User locks ETH on Ethereum via LockBox contract
    /// 2. User generates Ethereum state proof off-chain
    /// 3. User registers lock on Aptos via lock_receipt::register_ethereum_lock<FakeETH>()
    /// 4. (Legacy only) user calls this function to claim and mint Aptos FA
    /// 
    /// Decimal conversion:
    /// - Ethereum ETH uses 18 decimals (wei)
    /// - FakeETH uses 8 decimals
    /// - We divide by 10^10 to convert
    /// 
    /// Example:
    /// - Lock 1 ETH = 1_000_000_000_000_000_000 wei (u256)
    /// - Mint 100_000_000 FakeETH (u64, 8 decimals = 1.00000000 FakeETH)
    public entry fun mint_from_lock(
        account: &signer,
        lock_id: vector<u8>,
    ) acquires ManagingRefs {
        let user = signer::address_of(account);
        
        // Claim the receipt (verifies ownership and marks as claimed)
        let amount_u256 = lock_receipt::claim<Ethereum, FakeETH>(user, lock_id);
        
        // Convert u256 to u64 with overflow check
        // Ethereum amounts are in wei (18 decimals), FakeETH uses 8 decimals
        // Divide by 10^10 to convert
        let divisor: u256 = 10000000000; // 10^10
        let amount_converted = amount_u256 / divisor;
        
        // Ensure the converted amount fits in u64
        assert!(amount_converted <= (18446744073709551615 as u256), E_AMOUNT_OVERFLOW);
        let amount = (amount_converted as u64);
        
        // Legacy prototype behavior: mint Aptos FA from claimed receipt amount.
        let refs = borrow_global<ManagingRefs>(@atomica);
        let fa = fungible_asset::mint(&refs.mint_ref, amount);
        primary_fungible_store::deposit(user, fa);
    }

    #[view]
    /// Get the metadata object for FAKEETH
    public fun get_metadata(): Object<Metadata> {
        let metadata_address = object::create_object_address(&@atomica, ASSET_SYMBOL);
        object::address_to_object<Metadata>(metadata_address)
    }

    #[view]
    /// Get the balance of FAKEETH directly
    public fun balance(owner: address): u64 {
        primary_fungible_store::balance(owner, get_metadata())
    }
}
