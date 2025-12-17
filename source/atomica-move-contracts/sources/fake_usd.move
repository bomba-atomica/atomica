module atomica::fake_usd {
    use aptos_framework::fungible_asset::{Self, MintRef, TransferRef, BurnRef, Metadata};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;
    use std::string::utf8;
    use std::option;
    use std::signer;

    const ASSET_SYMBOL: vector<u8> = b"FAKEUSD";

    /// Holds the refs for minting, transferring, and burning
    struct ManagingRefs has key {
        mint_ref: MintRef,
        transfer_ref: TransferRef,
        burn_ref: BurnRef,
    }

    /// Initialize the FAKEUSD fungible asset
    public entry fun initialize(admin: &signer) {
        // Create a non-deletable object with a named address
        let constructor_ref = &object::create_named_object(admin, ASSET_SYMBOL);
        
        // Create the FA's Metadata
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            constructor_ref,
            option::none(), // No maximum supply
            utf8(b"Fake USD"),
            utf8(ASSET_SYMBOL),
            6, // decimals
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

    /// Mint FAKEUSD to a recipient
    public entry fun mint(admin: &signer, recipient: address, amount: u64) acquires ManagingRefs {
        let admin_addr = signer::address_of(admin);
        let refs = borrow_global<ManagingRefs>(admin_addr);
        
        // Mint the fungible asset
        let fa = fungible_asset::mint(&refs.mint_ref, amount);
        
        // Deposit to the recipient's primary store
        primary_fungible_store::deposit(recipient, fa);
    }

    /// Get the metadata object for FAKEUSD
    public fun get_metadata(): Object<Metadata> {
        let metadata_address = object::create_object_address(&@atomica, ASSET_SYMBOL);
        object::address_to_object<Metadata>(metadata_address)
    }
}
