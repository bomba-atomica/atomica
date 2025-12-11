module atomica::registry {
    use std::vector;
    use std::signer;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_std::table::{Self, Table};

    friend atomica::remote_actions;

    /// Storage for user data.
    struct UserRecord has store {
        cap: SignerCapability,
        nonce: u64,
        aptos_address: address,
    }

    /// Global registry stored at @atomica
    struct Registry has key {
        master_cap: SignerCapability,
        users: Table<vector<u8>, UserRecord>,
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

    /// Retrieve the signer and current nonce for a user.
    /// Creates account if missing.
    public(friend) fun get_user_signer_and_nonce(eth_address: vector<u8>): (signer, u64) acquires Registry {
        let registry_addr = @atomica;
        let registry = borrow_global_mut<Registry>(registry_addr);

        if (!table::contains(&registry.users, eth_address)) {
            // Create User
            let master_signer = account::create_signer_with_capability(&registry.master_cap);
            let (user_signer, user_cap) = account::create_resource_account(&master_signer, eth_address);
            let aptos_address = signer::address_of(&user_signer);
            
            let record = UserRecord {
                cap: user_cap,
                nonce: 0,
                aptos_address,
            };
            table::add(&mut registry.users, eth_address, record);
        };

        let record = table::borrow(&registry.users, eth_address);
        let user_signer = account::create_signer_with_capability(&record.cap);
        (user_signer, record.nonce)
    }

    /// Increment user nonce.
    public(friend) fun increment_nonce(eth_address: vector<u8>) acquires Registry {
        let registry = borrow_global_mut<Registry>(@atomica);
        let record = table::borrow_mut(&mut registry.users, eth_address);
        record.nonce = record.nonce + 1;
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
