/// Registry module — Ethereum-to-Aptos address mapping.
///
/// Maintains a mapping from raw Ethereum address bytes (20 bytes) to the
/// derived Aptos address and per-user nonce. Used in the SIWE account
/// abstraction flow to look up the Aptos-side identity for a given
/// Ethereum signer.
///
/// @see docs/architecture/v0-architecture.md#§1-package-layout
module atomica::registry {
    use std::signer;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_std::table::{Self, Table};

    /// Singleton resource stored at `@atomica`.
    /// Holds the resource-account capability and the user mapping.
    struct Registry has key {
        master_cap: SignerCapability,
        users: Table<vector<u8>, UserInfo>,
    }

    /// Per-user record: derived Aptos address and replay-protection nonce.
    struct UserInfo has store {
        aptos_address: address,
        nonce: u64,
    }

    /// Initialize the registry.
    /// Creates a resource account under `account` using `seed` and stores
    /// the `Registry` singleton. Idempotent — no-ops if already initialized.
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
    /// Return the derived Aptos address for an Ethereum address.
    /// Returns `@0x0` if the address has not been registered.
    public fun get_aptos_address(eth_address: vector<u8>): address acquires Registry {
        let registry = borrow_global<Registry>(@atomica);
        if (table::contains(&registry.users, eth_address)) {
            table::borrow(&registry.users, eth_address).aptos_address
        } else {
            @0x0
        }
    }

    #[view]
    /// Return the current nonce for an Ethereum address.
    /// Returns `0` if the address has not been registered.
    public fun get_nonce(eth_address: vector<u8>): u64 acquires Registry {
        let registry = borrow_global<Registry>(@atomica);
        if (table::contains(&registry.users, eth_address)) {
            table::borrow(&registry.users, eth_address).nonce
        } else {
            0
        }
    }
}
