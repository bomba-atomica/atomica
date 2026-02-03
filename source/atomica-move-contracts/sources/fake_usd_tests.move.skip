#[test_only]
module atomica::fake_usd_tests {
    use std::signer;
    use aptos_framework::primary_fungible_store;
    use atomica::fake_usd::{Self};

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_initialize_and_mint(deployer: &signer, user: &signer) {
        // Initialize the FAKEUSD fungible asset
        fake_usd::initialize(deployer);

        // Mint 10000000 (10 FAKEUSD with 6 decimals)
        let mint_amount = 10000000;
        let user_addr = signer::address_of(user);
        fake_usd::mint(deployer, user_addr, mint_amount);

        // Verify the user received the correct amount
        let metadata = fake_usd::get_metadata();
        let balance = primary_fungible_store::balance(user_addr, metadata);
        assert!(balance == mint_amount, 1);
    }

    #[test(deployer = @atomica, user1 = @0x123, user2 = @0x456)]
    public fun test_multiple_users_mint(deployer: &signer, user1: &signer, user2: &signer) {
        // Initialize the FAKEUSD fungible asset
        fake_usd::initialize(deployer);

        // Mint different amounts to each user
        let mint_amount1 = 5000000; // 5 FAKEUSD
        let mint_amount2 = 15000000; // 15 FAKEUSD

        let user1_addr = signer::address_of(user1);
        let user2_addr = signer::address_of(user2);

        fake_usd::mint(deployer, user1_addr, mint_amount1);
        fake_usd::mint(deployer, user2_addr, mint_amount2);

        // Verify both users received correct amounts
        let metadata = fake_usd::get_metadata();
        let balance1 = primary_fungible_store::balance(user1_addr, metadata);
        let balance2 = primary_fungible_store::balance(user2_addr, metadata);

        assert!(balance1 == mint_amount1, 2);
        assert!(balance2 == mint_amount2, 3);
    }

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_multiple_mints_accumulate(deployer: &signer, user: &signer) {
        // Initialize the FAKEUSD fungible asset
        fake_usd::initialize(deployer);

        // Mint multiple times
        let mint_amount1 = 3000000; // 3 FAKEUSD
        let mint_amount2 = 7000000; // 7 FAKEUSD

        let user_addr = signer::address_of(user);
        fake_usd::mint(deployer, user_addr, mint_amount1);
        fake_usd::mint(deployer, user_addr, mint_amount2);

        // Verify the balance accumulated correctly
        let metadata = fake_usd::get_metadata();
        let balance = primary_fungible_store::balance(user_addr, metadata);
        let expected_balance = mint_amount1 + mint_amount2;

        assert!(balance == expected_balance, 4);
    }

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_zero_mint(deployer: &signer, user: &signer) {
        // Initialize the FAKEUSD fungible asset
        fake_usd::initialize(deployer);

        // Mint zero amount
        let user_addr = signer::address_of(user);
        fake_usd::mint(deployer, user_addr, 0);

        // Verify balance is zero
        let metadata = fake_usd::get_metadata();
        let balance = primary_fungible_store::balance(user_addr, metadata);

        assert!(balance == 0, 5);
    }

    #[test(deployer = @atomica, _user = @0x123)]
    public fun test_metadata(deployer: &signer, _user: &signer) {
        // Initialize the FAKEUSD fungible asset
        fake_usd::initialize(deployer);

        // Verify metadata
        let metadata = fake_usd::get_metadata();
        
        // Check decimals
        let decimals = aptos_framework::fungible_asset::decimals(metadata);
        assert!(decimals == 6, 6);

        // Check name
        let name = aptos_framework::fungible_asset::name(metadata);
        assert!(name == std::string::utf8(b"Fake USD"), 7);

        // Check symbol
        let symbol = aptos_framework::fungible_asset::symbol(metadata);
        assert!(symbol == std::string::utf8(b"FAKEUSD"), 8);
    }
}
