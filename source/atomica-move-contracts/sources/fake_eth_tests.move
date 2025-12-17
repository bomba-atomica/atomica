#[test_only]
module atomica::fake_eth_tests {
    use std::signer;
    use aptos_framework::coin;
    use atomica::FAKEETH::{Self, FAKEETH};

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_initialize_and_mint(deployer: &signer, user: &signer) {
        // Initialize the FAKEETH coin
        FAKEETH::initialize(deployer);

        // Register the user for FAKEETH
        coin::register<FAKEETH>(user);

        // Mint 1000000000 (10 FAKEETH with 8 decimals)
        let mint_amount = 1000000000;
        FAKEETH::mint(user, mint_amount);

        // Verify the user received the correct amount
        let user_addr = signer::address_of(user);
        let balance = coin::balance<FAKEETH>(user_addr);
        assert!(balance == mint_amount, 1);
    }

    #[test(deployer = @atomica, user1 = @0x123, user2 = @0x456)]
    public fun test_multiple_users_mint(deployer: &signer, user1: &signer, user2: &signer) {
        // Initialize the FAKEETH coin
        FAKEETH::initialize(deployer);

        // Register both users
        coin::register<FAKEETH>(user1);
        coin::register<FAKEETH>(user2);

        // Mint different amounts to each user
        let mint_amount1 = 500000000; // 5 FAKEETH
        let mint_amount2 = 1500000000; // 15 FAKEETH

        FAKEETH::mint(user1, mint_amount1);
        FAKEETH::mint(user2, mint_amount2);

        // Verify both users received correct amounts
        let user1_addr = signer::address_of(user1);
        let user2_addr = signer::address_of(user2);
        
        let balance1 = coin::balance<FAKEETH>(user1_addr);
        let balance2 = coin::balance<FAKEETH>(user2_addr);

        assert!(balance1 == mint_amount1, 2);
        assert!(balance2 == mint_amount2, 3);
    }

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_multiple_mints_accumulate(deployer: &signer, user: &signer) {
        // Initialize the FAKEETH coin
        FAKEETH::initialize(deployer);

        // Register the user
        coin::register<FAKEETH>(user);

        // Mint multiple times
        let mint_amount1 = 300000000; // 3 FAKEETH
        let mint_amount2 = 700000000; // 7 FAKEETH

        FAKEETH::mint(user, mint_amount1);
        FAKEETH::mint(user, mint_amount2);

        // Verify the balance accumulated correctly
        let user_addr = signer::address_of(user);
        let balance = coin::balance<FAKEETH>(user_addr);
        let expected_balance = mint_amount1 + mint_amount2;

        assert!(balance == expected_balance, 4);
    }

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_zero_mint(deployer: &signer, user: &signer) {
        // Initialize the FAKEETH coin
        FAKEETH::initialize(deployer);

        // Register the user
        coin::register<FAKEETH>(user);

        // Mint zero amount
        FAKEETH::mint(user, 0);

        // Verify balance is zero
        let user_addr = signer::address_of(user);
        let balance = coin::balance<FAKEETH>(user_addr);

        assert!(balance == 0, 5);
    }

    #[test(deployer = @atomica, user = @0x123)]
    public fun test_coin_metadata(deployer: &signer, user: &signer) {
        // Initialize the FAKEETH coin
        FAKEETH::initialize(deployer);

        // Verify coin metadata
        let decimals = coin::decimals<FAKEETH>();
        assert!(decimals == 8, 6);

        let name = coin::name<FAKEETH>();
        assert!(name == std::string::utf8(b"Fake Ethereum"), 7);

        let symbol = coin::symbol<FAKEETH>();
        assert!(symbol == std::string::utf8(b"FAKEETH"), 8);
    }
}
