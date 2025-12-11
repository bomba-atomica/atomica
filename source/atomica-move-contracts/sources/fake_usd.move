module atomica::FAKEUSD {
    use std::string;
    use std::signer;
    use aptos_framework::coin::{Self, BurnCapability, FreezeCapability, MintCapability};

    /// Represents the FAKEUSD coin.
    struct FAKEUSD {}

    /// Stored capabilities for the coin.
    struct Capabilities has key {
        burn_cap: BurnCapability<FAKEUSD>,
        freeze_cap: FreezeCapability<FAKEUSD>,
        mint_cap: MintCapability<FAKEUSD>,
    }

    /// Initialize the FAKEUSD coin.
    public entry fun initialize(account: &signer) {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<FAKEUSD>(
            account,
            string::utf8(b"Fake USD"),
            string::utf8(b"FAKEUSD"),
            6,
            true,
        );

        move_to(account, Capabilities {
            burn_cap,
            freeze_cap,
            mint_cap,
        });
    }

    /// Mint new FAKEUSD coins.
    public entry fun mint(account: &signer, amount: u64) acquires Capabilities {
        let caps = borrow_global<Capabilities>(@atomica);
        let coins = coin::mint<FAKEUSD>(amount, &caps.mint_cap);
        coin::deposit(signer::address_of(account), coins);
    }
}
