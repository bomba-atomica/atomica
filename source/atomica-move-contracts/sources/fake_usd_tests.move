#[test_only]
module atomica::fake_usd_tests {
    use std::signer;
    use aptos_framework::coin;
    use atomica::FAKEUSD::{Self, FAKEUSD};

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_initialize_and_mint(deployer: &signer, user: &signer) {
        // Initialize the FAKEUSD coin
        FAKEUSD::initialize(deployer);

        // Register the user for FAKEUSD
        coin::register<FAKEUSD>(user);

        // Mint 10000000 (10 FAKEUSD with 6 decimals)
        let mint_amount = 10000000;
        FAKEUSD::mint(user, mint_amount);

        // Verify the user received the correct amount
        let user_addr = signer::address_of(user);
        let balance = coin::balance<FAKEUSD>(user_addr);
        assert!(balance == mint_amount, 1);
    }

    #[test(deployer = @atomica, user1 = @0x123, user2 = @0x456)]
    public fun test_multiple_users_mint(deployer: &signer, user1: &signer, user2: &signer) {
        // Initialize the FAKEUSD coin
        FAKEUSD::initialize(deployer);

        // Register both users
        coin::register<FAKEUSD>(user1);
        coin::register<FAKEUSD>(user2);

        // Mint different amounts to each user
        let mint_amount1 = 5000000; // 5 FAKEUSD
        let mint_amount2 = 15000000; // 15 FAKEUSD

        FAKEUSD::mint(user1, mint_amount1);
        FAKEUSD::mint(user2, mint_amount2);

        // Verify both users received correct amounts
        let user1_addr = signer::address_of(user1);
        let user2_addr = signer::address_of(user2);
        
        let balance1 = coin::balance<FAKEUSD>(user1_addr);
        let balance2 = coin::balance<FAKEUSD>(user2_addr);

        assert!(balance1 == mint_amount1, 2);
        assert!(balance2 == mint_amount2, 3);
    }

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_multiple_mints_accumulate(deployer: &signer, user: &signer) {
        // Initialize the FAKEUSD coin
        FAKEUSD::initialize(deployer);

        // Register the user
        coin::register<FAKEUSD>(user);

        // Mint multiple times
        let mint_amount1 = 3000000; // 3 FAKEUSD
        let mint_amount2 = 7000000; // 7 FAKEUSD

        FAKEUSD::mint(user, mint_amount1);
        FAKEUSD::mint(user, mint_amount2);

        // Verify the balance accumulated correctly
        let user_addr = signer::address_of(user);
        let balance = coin::balance<FAKEUSD>(user_addr);
        let expected_balance = mint_amount1 + mint_amount2;

        assert!(balance == expected_balance, 4);
    }

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_zero_mint(deployer: &signer, user: &signer) {
        // Initialize the FAKEUSD coin
        FAKEUSD::initialize(deployer);

        // Register the user
        coin::register<FAKEUSD>(user);

        // Mint zero amount
        FAKEUSD::mint(user, 0);

        // Verify balance is zero
        let user_addr = signer::address_of(user);
        let balance = coin::balance<FAKEUSD>(user_addr);

        assert!(balance == 0, 5);
    }

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_coin_metadata(deployer: &signer, user: &signer) {
        // Initialize the FAKEUSD coin
        FAKEUSD::initialize(deployer);

        // Verify coin metadata
        let decimals = coin::decimals<FAKEUSD>();
        assert!(decimals == 6, 6);

        let name = coin::name<FAKEUSD>();
        assert!(name == std::string::utf8(b"Fake USD"), 7);

        let symbol = coin::symbol<FAKEUSD>();
        assert!(symbol == std::string::utf8(b"FAKEUSD"), 8);
    }
}
