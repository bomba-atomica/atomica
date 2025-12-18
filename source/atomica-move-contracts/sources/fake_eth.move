module atomica::fake_eth {
    use aptos_framework::fungible_asset::{Self, MintRef, TransferRef, BurnRef, Metadata};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;
    use std::string::utf8;
    use std::option;
    use std::signer;

    const ASSET_SYMBOL: vector<u8> = b"FAKEETH";

    /// Maximum amount that can be minted per transaction (10,000 FAKEETH with 8 decimals)
    const MAX_MINT_AMOUNT: u64 = 1_000_000_000_000;

    /// Error code when trying to mint more than the maximum allowed
    const E_EXCEEDS_MAX_MINT: u64 = 1;

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

    /// Mint FAKEETH to yourself
    /// Anyone can call this (it's a faucet for testing)
    /// Maximum 10,000 FAKEETH per mint transaction
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

    /// Get the metadata object for FAKEETH
    public fun get_metadata(): Object<Metadata> {
        let metadata_address = object::create_object_address(&@atomica, ASSET_SYMBOL);
        object::address_to_object<Metadata>(metadata_address)
    }
}
