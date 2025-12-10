module AtomicaAuction::FAKEETH {
    use std::string;
    use std::signer;
    use aptos_framework::coin::{Self, BurnCapability, FreezeCapability, MintCapability};

    /// Represents the FAKEETH coin.
    struct FAKEETH {}

    /// Stored capabilities for the coin.
    struct Capabilities has key {
        burn_cap: BurnCapability<FAKEETH>,
        freeze_cap: FreezeCapability<FAKEETH>,
        mint_cap: MintCapability<FAKEETH>,
    }

    /// Initialize the FAKEETH coin.
    public entry fun initialize(account: &signer) {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<FAKEETH>(
            account,
            string::utf8(b"Fake Ethereum"),
            string::utf8(b"FAKEETH"),
            8,
            true,
        );

        move_to(account, Capabilities {
            burn_cap,
            freeze_cap,
            mint_cap,
        });
    }

    /// Mint new FAKEETH coins.
    public entry fun mint(account: &signer, amount: u64) acquires Capabilities {
        let caps = borrow_global<Capabilities>(@AtomicaAuction);
        let coins = coin::mint<FAKEETH>(amount, &caps.mint_cap);
        coin::deposit(signer::address_of(account), coins);
    }
}
