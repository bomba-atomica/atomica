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
///
/// Lifecycle (issue 194): ACTIVE, then CLAIMED into the auction window the
/// lock is bound to, then one terminal state with a stored outcome record:
/// FILLED (the lock pays a counterparty per the auction outcome) or REVOKED
/// (the whole amount returns to the depositor). A receipt no window claims
/// can be cancelled to REVOKED by anyone after the cancel delay.
module atomica::lock_receipt {
    use std::vector;
    use std::signer;
    use aptos_std::table::{Self, Table};
    use aptos_std::simple_map::{Self, SimpleMap};
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use aptos_std::type_info;
    use atomica::eth_proof;
    use atomica::outcome_tree;
    use atomica::timelock_config;

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
    /// The receipt's lock is bound to another auction window or pair
    const E_WRONG_BINDING: u64 = 12;
    /// An outcome payout list Ethereum LockBox could not pay: a recipient that
    /// is not a nonzero 20-byte address, mismatched lengths, or a sum other
    /// than the lock amount
    const E_UNPAYABLE_OUTCOME: u64 = 13;
    /// The receipt is younger than the cancel delay
    const E_CANCEL_TOO_EARLY: u64 = 14;
    /// The lock has no outcome record yet
    const E_NO_OUTCOME: u64 = 15;

    // Receipt status constants
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_CLAIMED: u8 = 1;
    /// Terminal: the whole amount returns to the depositor.
    const STATUS_REVOKED: u8 = 2;
    /// Terminal: the lock pays at least one counterparty per the auction outcome.
    const STATUS_FILLED: u8 = 3;

    // Public constant accessors — allow callers to compare against status values
    // without hardcoding magic numbers in external modules or tests.
    public fun status_active(): u8  { STATUS_ACTIVE }
    public fun status_claimed(): u8 { STATUS_CLAIMED }
    public fun status_revoked(): u8 { STATUS_REVOKED }
    public fun status_filled(): u8  { STATUS_FILLED }

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

        /// Status: 0 = Active, 1 = Claimed, 2 = Revoked (returned), 3 = Filled
        status: u8,
    }

    /// The terminal outcome of one lock. `recipients[i]` (20-byte Ethereum
    /// address) gets `amounts[i]`. The amounts sum to the lock amount. This is
    /// the payout list of the lock's `outcome_tree` leaf.
    struct LockOutcome has store, drop, copy {
        /// The terminal status: STATUS_REVOKED or STATUS_FILLED
        kind: u8,
        /// The auction window the lock is bound to
        window_id: u64,
        recipients: vector<vector<u8>>,
        amounts: vector<u256>,
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

        /// Map from lock_id -> terminal outcome record
        outcomes: Table<vector<u8>, LockOutcome>,
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

    // Emitted once per lock when it reaches its terminal state. The fields
    // equal the stored `LockOutcome` (`get_lock_outcome`).
    #[event]
    struct LockOutcomeRecorded<phantom Chain, phantom Asset> has drop, store {
        lock_id: vector<u8>,
        kind: u8,
        window_id: u64,
        recipients: vector<vector<u8>>,
        amounts: vector<u256>,
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
                outcomes: table::new(),
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

    /// Claim a lock receipt into auction window `window_id` of pair `pair_hash`.
    ///
    /// Called by `auction::create_auction` (seller FakeETH lock) and
    /// `auction::submit_bid` (bidder FakeUSD collateral). The lock must be bound
    /// to that window and pair on Ethereum, so it is a leaf of exactly the
    /// auction whose outcome can release it (E_WRONG_BINDING). Returns the
    /// lock amount.
    ///
    /// Package-only: `claimer` must be the address of a signer the calling
    /// @atomica entry function holds. A module outside the package could pass
    /// any owner's address, so it cannot call this.
    public(package) fun claim_for_window<Chain, Asset>(
        claimer: address,
        lock_id: vector<u8>,
        window_id: u64,
        pair_hash: vector<u8>,
    ): u256 acquires ReceiptRegistry {
        let (bound_window, bound_pair) = get_receipt_binding<Chain, Asset>(lock_id);
        assert!(bound_window == window_id && bound_pair == pair_hash, E_WRONG_BINDING);
        claim_internal<Chain, Asset>(claimer, lock_id)
    }

    fun claim_internal<Chain, Asset>(
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

    // ===================== Terminal Outcomes =====================

    /// Give a CLAIMED receipt its terminal outcome: `recipients[i]` gets
    /// `amounts[i]` of the lock on Ethereum. Returns the leaf's
    /// `outcome_tree::payouts_hash`.
    ///
    /// Aborts E_UNPAYABLE_OUTCOME unless every recipient is a nonzero 20-byte
    /// address and the amounts sum to the lock amount, the checks LockBox
    /// `releaseByOutcome` runs. A certified leaf LockBox cannot pay would
    /// leave the lock open forever, because reclaim refuses a lock in the tree.
    ///
    /// The status becomes STATUS_REVOKED when the only payout is the whole
    /// amount to the depositor, and STATUS_FILLED otherwise. Stores a
    /// `LockOutcome` and emits `LockOutcomeRecorded` with the same fields.
    ///
    /// Package-only: called by `auction` when settle, a refund or unwind
    /// finalizes a window.
    public(package) fun record_outcome<Chain, Asset>(
        lock_id: vector<u8>,
        recipients: vector<vector<u8>>,
        amounts: vector<u256>,
    ): vector<u8> acquires ReceiptRegistry {
        finalize<Chain, Asset>(lock_id, recipients, amounts, STATUS_CLAIMED)
    }

    /// Return a CLAIMED receipt's whole amount to its depositor
    /// (`record_outcome` with the single payout (eth_owner, amount)).
    /// Returns the leaf's payouts hash.
    public(package) fun return_to_depositor<Chain, Asset>(
        lock_id: vector<u8>,
    ): vector<u8> acquires ReceiptRegistry {
        let (_, amount, _, _, eth_owner) = get_receipt<Chain, Asset>(lock_id);
        finalize<Chain, Asset>(lock_id, vector[eth_owner], vector[amount], STATUS_CLAIMED)
    }

    /// Cancel a receipt that no auction window claimed. Anyone may call it.
    ///
    /// The receipt must be ACTIVE (E_INVALID_STATUS) and at least
    /// `timelock_config::get_receipt_cancel_delay_us` old (E_CANCEL_TOO_EARLY).
    /// It becomes STATUS_REVOKED with the outcome record (eth_owner, amount),
    /// so no window can claim it any more. The lock is in no auction's outcome
    /// tree, so on Ethereum it goes home by `LockBox.reclaim` after its deadline.
    public entry fun cancel_unauctioned<Chain, Asset>(
        _caller: &signer,
        lock_id: vector<u8>,
    ) acquires ReceiptRegistry {
        assert!(
            exists<ReceiptRegistry<Chain, Asset>>(@atomica),
            E_REGISTRY_NOT_INITIALIZED
        );
        let registry = borrow_global<ReceiptRegistry<Chain, Asset>>(@atomica);
        assert!(table::contains(&registry.receipts, lock_id), E_RECEIPT_NOT_FOUND);
        let receipt = table::borrow(&registry.receipts, lock_id);
        assert!(receipt.status == STATUS_ACTIVE, E_INVALID_STATUS);
        assert!(
            timestamp::now_microseconds()
                >= receipt.timestamp * 1_000_000 + timelock_config::get_receipt_cancel_delay_us(),
            E_CANCEL_TOO_EARLY
        );
        let eth_owner = receipt.eth_owner;
        let amount = receipt.amount;
        finalize<Chain, Asset>(lock_id, vector[eth_owner], vector[amount], STATUS_ACTIVE);
    }

    /// Moves a receipt in status `from` to its terminal state. See `record_outcome`.
    fun finalize<Chain, Asset>(
        lock_id: vector<u8>,
        recipients: vector<vector<u8>>,
        amounts: vector<u256>,
        from: u8,
    ): vector<u8> acquires ReceiptRegistry {
        assert!(
            exists<ReceiptRegistry<Chain, Asset>>(@atomica),
            E_REGISTRY_NOT_INITIALIZED
        );
        let registry = borrow_global_mut<ReceiptRegistry<Chain, Asset>>(@atomica);
        assert!(table::contains(&registry.receipts, lock_id), E_RECEIPT_NOT_FOUND);
        let receipt = table::borrow_mut(&mut registry.receipts, lock_id);
        assert!(receipt.status == from, E_INVALID_STATUS);

        let n = vector::length(&recipients);
        assert!(n == vector::length(&amounts), E_UNPAYABLE_OUTCOME);
        let sum: u256 = 0;
        let to_depositor_only = true;
        let i = 0;
        while (i < n) {
            let r = vector::borrow(&recipients, i);
            assert!(vector::length(r) == 20 && !is_zero(r), E_UNPAYABLE_OUTCOME);
            if (*r != receipt.eth_owner) { to_depositor_only = false; };
            sum = sum + *vector::borrow(&amounts, i);
            i = i + 1;
        };
        assert!(sum == receipt.amount, E_UNPAYABLE_OUTCOME);

        let kind = if (to_depositor_only) { STATUS_REVOKED } else { STATUS_FILLED };
        receipt.status = kind;
        let window_id = receipt.window_id;
        table::add(&mut registry.outcomes, lock_id, LockOutcome { kind, window_id, recipients, amounts });
        event::emit(LockOutcomeRecorded<Chain, Asset> { lock_id, kind, window_id, recipients, amounts });
        outcome_tree::payouts_hash(&recipients, &amounts)
    }

    fun is_zero(bytes: &vector<u8>): bool {
        let i = 0;
        let n = vector::length(bytes);
        while (i < n) {
            if (*vector::borrow(bytes, i) != 0) return false;
            i = i + 1;
        };
        true
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
    /// The terminal outcome record of a lock: (kind, window_id, recipients,
    /// amounts). `kind` is STATUS_REVOKED or STATUS_FILLED. Aborts
    /// E_NO_OUTCOME while the lock has none.
    public fun get_lock_outcome<Chain, Asset>(
        lock_id: vector<u8>
    ): (u8, u64, vector<vector<u8>>, vector<u256>) acquires ReceiptRegistry {
        assert!(
            exists<ReceiptRegistry<Chain, Asset>>(@atomica),
            E_REGISTRY_NOT_INITIALIZED
        );
        let registry = borrow_global<ReceiptRegistry<Chain, Asset>>(@atomica);
        assert!(table::contains(&registry.outcomes, lock_id), E_NO_OUTCOME);
        let o = table::borrow(&registry.outcomes, lock_id);
        (o.kind, o.window_id, o.recipients, o.amounts)
    }

    #[view]
    /// Check if registry is initialized for a Chain/Asset pair
    public fun is_registry_initialized<Chain, Asset>(): bool {
        exists<ReceiptRegistry<Chain, Asset>>(@atomica)
    }

    // ===================== Test-Only Functions =====================

    // Claim without the window binding check, for tests that drive a receipt
    // by hand. Production code claims through `claim_for_window`.
    #[test_only]
    public fun claim<Chain, Asset>(
        claimer: address,
        lock_id: vector<u8>,
    ): u256 acquires ReceiptRegistry {
        claim_internal<Chain, Asset>(claimer, lock_id)
    }

    // The test Ethereum owner of `user`: its last 20 bytes.
    #[test_only]
    public fun test_eth_owner(user: address): vector<u8> {
        vector::slice(&std::bcs::to_bytes(&user), 12, 32)
    }

    // Insert a receipt directly into the registry, bypassing proof verification.
    // Bound to window 0 and an empty pair hash; `eth_owner` is `test_eth_owner(user)`.
    #[test_only]
    public fun insert_test_receipt<Chain, Asset>(
        lock_id: vector<u8>,
        user: address,
        amount: u256,
        _block_number: u64,
    ) acquires ReceiptRegistry {
        insert_bound_test_receipt<Chain, Asset>(lock_id, user, amount, 0, vector::empty());
    }

    // Insert a receipt bound to `window_id` and `pair_hash`, so
    // `auction::create_auction` / `submit_bid` can claim it into that window.
    #[test_only]
    public fun insert_bound_test_receipt<Chain, Asset>(
        lock_id: vector<u8>,
        user: address,
        amount: u256,
        window_id: u64,
        pair_hash: vector<u8>,
    ) acquires ReceiptRegistry {
        let receipt = LockReceipt<Chain, Asset> {
            lock_id,
            user,
            eth_owner: test_eth_owner(user),
            amount,
            window_id,
            pair_hash,
            block_number: 1,
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

    // Destructure a LockOutcomeRecorded event into (lock_id, kind, window_id, recipients,
    // amounts) (test-only).
    #[test_only]
    public fun test_lock_outcome_event_fields<Chain, Asset>(
        e: &LockOutcomeRecorded<Chain, Asset>
    ): (vector<u8>, u8, u64, vector<vector<u8>>, vector<u256>) {
        (e.lock_id, e.kind, e.window_id, e.recipients, e.amounts)
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
