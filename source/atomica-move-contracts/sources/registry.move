module atomica::registry {
    use std::signer;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_std::table::{Self, Table};

    struct Registry has key {
        master_cap: SignerCapability,
        users: Table<vector<u8>, UserInfo>,
    }

    struct UserInfo has store {
        aptos_address: address,
        nonce: u64,
    }

    /// Initialize the registry.
    public entry fun initialize(account: &signer, seed: vector<u8>) {
        if (!exists<Registry>(signer::address_of(account))) {
            let (_master_signer, master_cap) = account::create_resource_account(account, seed);
            move_to(account, Registry {
                master_cap,
                users: table::new(),
            });
        };
    }

    #[view]
    public fun get_aptos_address(eth_address: vector<u8>): address acquires Registry {
        let registry = borrow_global<Registry>(@atomica);
        if (table::contains(&registry.users, eth_address)) {
            table::borrow(&registry.users, eth_address).aptos_address
        } else {
            @0x0
        }
    }

    #[view]
    public fun get_nonce(eth_address: vector<u8>): u64 acquires Registry {
        let registry = borrow_global<Registry>(@atomica);
        if (table::contains(&registry.users, eth_address)) {
            table::borrow(&registry.users, eth_address).nonce
        } else {
            0
        }
    }
}
