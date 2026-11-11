/// Lock Receipt Module
///
/// Provides a generic framework for verifying and registering cross-chain asset locks.
///
/// @see docs/architecture/v0-architecture.md §3 (Cross-Chain Settlement)
/// Uses phantom types to create type-safe receipts for any asset locked on any chain.
///
/// Example: A receipt for FakeETH locked on Ethereum is represented as:
///   LockReceipt<Ethereum, FakeETH>
///
/// This design enables:
/// - Zero code duplication across chains and assets
/// - Compile-time type safety
/// - Cryptographic verification of all locks
/// - Protection against replay attacks
///
/// Trust (docs/decisions/trustless-v0-1-unwinding.md): any account may carry a
/// lock proof. The proof names the depositor, and the receipt belongs to the
/// depositor's Ethereum-derivable Aptos account. Only that account may claim
/// it. The `@atomica` account has no registration or claim privilege.
module atomica::lock_receipt {
    use std::vector;
    use std::signer;
    use aptos_std::table::{Self, Table};
    use aptos_std::simple_map::{Self, SimpleMap};
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use aptos_std::type_info;
    use atomica::eth_proof;

    // ===================== Error Codes =====================

    const E_ALREADY_CLAIMED: u64 = 1;
    const E_RECEIPT_NOT_FOUND: u64 = 3;
    const E_RECEIPT_ALREADY_CLAIMED: u64 = 4;
    const E_NOT_RECEIPT_OWNER: u64 = 5;
    const E_REGISTRY_NOT_INITIALIZED: u64 = 6;
    const E_INVALID_STATUS: u64 = 7;
    const E_INVALID_ADDRESS_LENGTH: u64 = 8;
    /// Asset has no pinned Ethereum token
    const E_UNSUPPORTED_ASSET: u64 = 10;
    /// The lock deadline is not `auction::eth_lock_deadline(window_id)`
    const E_WRONG_DEADLINE: u64 = 11;

    // Receipt status constants
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_CLAIMED: u8 = 1;
    const STATUS_REVOKED: u8 = 2;

    // Public constant accessors — allow callers to compare against status values
    // without hardcoding magic numbers in external modules or tests.
    public fun status_active(): u8  { STATUS_ACTIVE }
    public fun status_claimed(): u8 { STATUS_CLAIMED }
    public fun status_revoked(): u8 { STATUS_REVOKED }

    // ===================== Phantom Type Markers =====================

    /// Ethereum chain marker
    struct Ethereum has copy, drop, store {}

    /// FakeETH asset marker
    struct FakeETH has copy, drop, store {}

    /// FakeUSD asset marker
    struct FakeUSD has copy, drop, store {}

    // ===================== Core Structs =====================

    /// A receipt representing a verified cross-chain lock
    struct LockReceipt<phantom Chain, phantom Asset> has store, drop {
        /// Unique identifier for this lock (prevents replay)
        lock_id: vector<u8>,

        /// The depositor's Ethereum-derivable Aptos account: the only claimer
        user: address,

        /// The depositor's Ethereum address (20 bytes), as proven
        eth_owner: vector<u8>,

        /// Amount of this one LockBox lock (in the asset's base units)
        amount: u256,

        /// Auction window the lock is bound to (LockBox lock field)
        window_id: u64,

        /// keccak256 of the window's pair BCS (LockBox lock field, 32 bytes)
        pair_hash: vector<u8>,

        /// Block number where the lock occurred
        block_number: u64,

        /// Timestamp when the receipt was created
        timestamp: u64,

        /// Status: 0 = Active, 1 = Claimed, 2 = Revoked
        status: u8,
    }

    /// Global registry for lock receipts
    struct ReceiptRegistry<phantom Chain, phantom Asset> has key {
        /// Map from lock_id -> receipt
        receipts: Table<vector<u8>, LockReceipt<Chain, Asset>>,

        /// Set of claimed lock IDs (for efficient replay checking)
        claimed_locks: SimpleMap<vector<u8>, bool>,

        /// Total value locked (for metrics)
        total_locked: u256,

        /// Total number of receipts
        receipt_count: u64,
    }

    // ===================== Events =====================

    #[event]
    struct LockRegistered<phantom Chain, phantom Asset> has drop, store {
        lock_id: vector<u8>,
        user: address,
        amount: u256,
        block_number: u64,
        timestamp: u64,
    }

    #[event]
    struct LockClaimed<phantom Chain, phantom Asset> has drop, store {
        lock_id: vector<u8>,
        claimer: address,
        amount: u256,
        timestamp: u64,
    }

    // ===================== Initialization =====================

    /// Initialize the receipt registry for a specific Chain/Asset pair
    /// Must be called before any receipts can be registered
    public entry fun initialize<Chain, Asset>(account: &signer) {
        let addr = signer::address_of(account);

        if (!exists<ReceiptRegistry<Chain, Asset>>(addr)) {
            move_to(account, ReceiptRegistry<Chain, Asset> {
                receipts: table::new(),
                claimed_locks: simple_map::create(),
                total_locked: 0,
                receipt_count: 0,
            });
        };
    }

    // ===================== Ethereum Lock Registration =====================

    /// Ethereum token address pinned for `Asset` in eth_proof's config.
    fun token_for<Asset>(): vector<u8> {
        let asset = type_info::type_of<Asset>();
        if (asset == type_info::type_of<FakeETH>()) {
            eth_proof::fake_eth_token()
        } else {
            assert!(asset == type_info::type_of<FakeUSD>(), E_UNSUPPORTED_ASSET);
            eth_proof::fake_usd_token()
        }
    }

    /// Register a lock from Ethereum
    ///
    /// This function:
    /// 1. Resolves the token of `Asset` from the pinned config
    /// 2. Rejects a deadline other than `auction::eth_lock_deadline(window_id)`
    ///    (eth_proof::eth_lock_deadline), so every registered lock of an
    ///    auction shares one deadline
    /// 3. Derives the lock id from the LockBox lock nonce and rejects a lock
    ///    already registered, so one lock gives exactly one receipt
    /// 4. Verifies the lock's MPT proof against the validator-certified state
    ///    root of `block_number`: the LockBox slot `commitments[lock_id]` must
    ///    hold the commitment of the named amount, window, pair and deadline
    /// 5. Creates and stores a LockReceipt for the amount of that one lock
    /// 6. Emits a LockRegistered event
    ///
    /// Any account may carry the proof: `_carrier` gains nothing. The receipt
    /// belongs to the depositor `user_address` named in the proof, through its
    /// Ethereum-derivable Aptos account (eth_proof::ethereum_account_address).
    ///
    /// Type parameter Asset determines which asset is being locked (FakeETH, FakeUSD).
    public entry fun register_ethereum_lock<Asset>(
        _carrier: &signer,
        block_number: u64,
        user_address: vector<u8>,
        lock_nonce: u64,
        amount: u256,
        window_id: u64,
        pair_hash: vector<u8>,
        deadline: u64,
        account_proof: vector<vector<u8>>,
        storage_proof: vector<vector<u8>>,
    ) acquires ReceiptRegistry {
        let token = token_for<Asset>();
        assert!(deadline == eth_proof::eth_lock_deadline(window_id), E_WRONG_DEADLINE);

        // 1. The depositor named in the proof owns the receipt, through the
        // Aptos account its Ethereum key controls. Whoever carries the proof
        // cannot redirect the receipt.
        assert!(vector::length(&user_address) == 20, E_INVALID_ADDRESS_LENGTH);
        let user = eth_proof::ethereum_account_address(user_address);

        // 2. One lock, one receipt: the id names the LockBox lock, not the block.
        let lock_id = eth_proof::lock_id(user_address, token, lock_nonce);
        assert!(
            !is_lock_claimed<Ethereum, Asset>(lock_id),
            E_ALREADY_CLAIMED
        );

        // 3. Verify the lock and its fields against the certified header.
        eth_proof::verify_lock(
            block_number,
            user_address,
            token,
            lock_nonce,
            amount,
            window_id,
            pair_hash,
            deadline,
            account_proof,
            storage_proof,
        );

        // 4. Create and store the receipt
        let receipt = LockReceipt<Ethereum, Asset> {
            lock_id,
            user,
            eth_owner: user_address,
            amount,
            window_id,
            pair_hash,
            block_number,
            timestamp: timestamp::now_seconds(),
            status: STATUS_ACTIVE,
        };
        store_receipt<Ethereum, Asset>(receipt, lock_id);

        // 5. Emit event
        event::emit(LockRegistered<Ethereum, Asset> {
            lock_id,
            user,
            amount,
            block_number,
            timestamp: timestamp::now_seconds(),
        });
    }

    // ===================== Storage Functions =====================

    /// Store a receipt in the registry
    fun store_receipt<Chain, Asset>(
        receipt: LockReceipt<Chain, Asset>,
        lock_id: vector<u8>,
    ) acquires ReceiptRegistry {
        let registry = borrow_global_mut<ReceiptRegistry<Chain, Asset>>(@atomica);

        // Extract amount before moving receipt
        let amount = receipt.amount;

        // Add to receipts table
        table::add(&mut registry.receipts, lock_id, receipt);

        // Mark as claimed in replay protection map
        simple_map::add(&mut registry.claimed_locks, lock_id, true);

        // Update metrics
        registry.total_locked = registry.total_locked + amount;
        registry.receipt_count = registry.receipt_count + 1;
    }

    // ===================== Claiming Functions =====================

    /// Release (return) a previously claimed lock receipt to its original owner.
    ///
    /// Called by auction::settle for losing bidders whose collateral receipt was
    /// consumed by submit_bid.  Marks the receipt STATUS_REVOKED so the off-chain
    /// relayer knows to release the underlying Ethereum collateral to the bidder.
    ///
    /// Only receipts in STATUS_CLAIMED state can be released — releasing an
    /// already-active or revoked receipt aborts with E_INVALID_STATUS.
    ///
    /// Package-only: a module outside @atomica cannot revoke a receipt a live
    /// window holds, so it cannot make settle or a refund abort.
    ///
    /// @see docs/architecture/v0-architecture.md §2.8
    public(package) fun release<Chain, Asset>(
        lock_id: vector<u8>,
    ) acquires ReceiptRegistry {
        assert!(
            exists<ReceiptRegistry<Chain, Asset>>(@atomica),
            E_REGISTRY_NOT_INITIALIZED
        );

        let registry = borrow_global_mut<ReceiptRegistry<Chain, Asset>>(@atomica);

        assert!(
            table::contains(&registry.receipts, lock_id),
            E_RECEIPT_NOT_FOUND
        );

        let receipt = table::borrow_mut(&mut registry.receipts, lock_id);

        // Only STATUS_CLAIMED receipts can be released (returned to owner).
        assert!(receipt.status == STATUS_CLAIMED, E_INVALID_STATUS);

        // Mark as revoked — signals to the off-chain relayer to return collateral.
        receipt.status = STATUS_REVOKED;
    }

    /// Claim a lock receipt
    ///
    /// This function is called by asset modules (fake_eth, fake_usd) to claim
    /// a receipt and mint the corresponding tokens.
    ///
    /// Returns the amount to be minted.
    ///
    /// Package-only: `claimer` must be the address of a signer the calling
    /// @atomica entry function holds. A module outside the package could pass
    /// any owner's address, so it cannot call this.
    public(package) fun claim<Chain, Asset>(
        claimer: address,
        lock_id: vector<u8>,
    ): u256 acquires ReceiptRegistry {
        assert!(
            exists<ReceiptRegistry<Chain, Asset>>(@atomica),
            E_REGISTRY_NOT_INITIALIZED
        );

        let registry = borrow_global_mut<ReceiptRegistry<Chain, Asset>>(@atomica);

        assert!(
            table::contains(&registry.receipts, lock_id),
            E_RECEIPT_NOT_FOUND
        );

        let receipt = table::borrow_mut(&mut registry.receipts, lock_id);

        // Verify receipt is active
        assert!(receipt.status == STATUS_ACTIVE, E_RECEIPT_ALREADY_CLAIMED);

        // Only the receipt owner (the depositor's Ethereum-derivable account) claims.
        assert!(receipt.user == claimer, E_NOT_RECEIPT_OWNER);

        // Mark as claimed
        receipt.status = STATUS_CLAIMED;

        // Emit event
        event::emit(LockClaimed<Chain, Asset> {
            lock_id,
            claimer,
            amount: receipt.amount,
            timestamp: timestamp::now_seconds(),
        });

        receipt.amount
    }

    // ===================== View Functions =====================

    #[view]
    /// Check if a lock has been claimed
    public fun is_lock_claimed<Chain, Asset>(lock_id: vector<u8>): bool acquires ReceiptRegistry {
        if (!exists<ReceiptRegistry<Chain, Asset>>(@atomica)) {
            return false
        };

        let registry = borrow_global<ReceiptRegistry<Chain, Asset>>(@atomica);
        simple_map::contains_key(&registry.claimed_locks, &lock_id)
    }

    #[view]
    /// Get total locked value for a Chain/Asset pair
    public fun get_total_locked<Chain, Asset>(): u256 acquires ReceiptRegistry {
        if (!exists<ReceiptRegistry<Chain, Asset>>(@atomica)) {
            return 0
        };

        let registry = borrow_global<ReceiptRegistry<Chain, Asset>>(@atomica);
        registry.total_locked
    }

    #[view]
    /// Get total receipt count for a Chain/Asset pair
    public fun get_receipt_count<Chain, Asset>(): u64 acquires ReceiptRegistry {
        if (!exists<ReceiptRegistry<Chain, Asset>>(@atomica)) {
            return 0
        };

        let registry = borrow_global<ReceiptRegistry<Chain, Asset>>(@atomica);
        registry.receipt_count
    }

    #[view]
    /// Get receipt details: (owner account, amount, block number, status,
    /// depositor Ethereum address).
    public fun get_receipt<Chain, Asset>(
        lock_id: vector<u8>
    ): (address, u256, u64, u8, vector<u8>) acquires ReceiptRegistry {
        assert!(
            exists<ReceiptRegistry<Chain, Asset>>(@atomica),
            E_REGISTRY_NOT_INITIALIZED
        );

        let registry = borrow_global<ReceiptRegistry<Chain, Asset>>(@atomica);

        assert!(
            table::contains(&registry.receipts, lock_id),
            E_RECEIPT_NOT_FOUND
        );

        let receipt = table::borrow(&registry.receipts, lock_id);

        (receipt.user, receipt.amount, receipt.block_number, receipt.status, receipt.eth_owner)
    }

    #[view]
    /// The auction binding of a receipt's lock: (window_id, pair_hash). Its
    /// deadline is `auction::eth_lock_deadline(window_id)`.
    public fun get_receipt_binding<Chain, Asset>(
        lock_id: vector<u8>
    ): (u64, vector<u8>) acquires ReceiptRegistry {
        assert!(
            exists<ReceiptRegistry<Chain, Asset>>(@atomica),
            E_REGISTRY_NOT_INITIALIZED
        );
        let registry = borrow_global<ReceiptRegistry<Chain, Asset>>(@atomica);
        assert!(
            table::contains(&registry.receipts, lock_id),
            E_RECEIPT_NOT_FOUND
        );
        let receipt = table::borrow(&registry.receipts, lock_id);
        (receipt.window_id, receipt.pair_hash)
    }

    #[view]
    /// Check if registry is initialized for a Chain/Asset pair
    public fun is_registry_initialized<Chain, Asset>(): bool {
        exists<ReceiptRegistry<Chain, Asset>>(@atomica)
    }

    // ===================== Test-Only Functions =====================

    // Insert a receipt directly into the registry, bypassing proof verification.
    // Used by auction_tests.move to set up receipts for testing create_auction.
    #[test_only]
    public fun insert_test_receipt<Chain, Asset>(
        lock_id: vector<u8>,
        user: address,
        amount: u256,
        block_number: u64,
    ) acquires ReceiptRegistry {
        let receipt = LockReceipt<Chain, Asset> {
            lock_id,
            user,
            eth_owner: vector::empty(),
            amount,
            window_id: 0,
            pair_hash: vector::empty(),
            block_number,
            timestamp: 0,
            status: STATUS_ACTIVE,
        };
        store_receipt<Chain, Asset>(receipt, lock_id);
    }

    #[test_only]
    public fun create_test_receipt<Chain, Asset>(
        lock_id: vector<u8>,
        user: address,
        amount: u256,
        block_number: u64,
    ): LockReceipt<Chain, Asset> {
        LockReceipt<Chain, Asset> {
            lock_id,
            user,
            eth_owner: vector::empty(),
            amount,
            window_id: 0,
            pair_hash: vector::empty(),
            block_number,
            timestamp: 0,
            status: STATUS_ACTIVE,
        }
    }

    #[test_only]
    public fun get_receipt_status<Chain, Asset>(
        lock_id: vector<u8>
    ): u8 acquires ReceiptRegistry {
        let registry = borrow_global<ReceiptRegistry<Chain, Asset>>(@atomica);
        let receipt = table::borrow(&registry.receipts, lock_id);
        receipt.status
    }
}
