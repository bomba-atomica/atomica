/// Lock Receipt Module
///
/// Provides a generic framework for verifying and registering cross-chain asset locks.
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
module atomica::lock_receipt {
    use std::vector;
    use std::signer;
    use aptos_std::table::{Self, Table};
    use aptos_std::simple_map::{Self, SimpleMap};
    use aptos_std::from_bcs;
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use aptos_std::aptos_hash::keccak256;
    use atomica::eth_proof::{Self, StateProof};

    // ===================== Error Codes =====================

    const E_ALREADY_CLAIMED: u64 = 1;
    const E_AMOUNT_MISMATCH: u64 = 2;
    const E_RECEIPT_NOT_FOUND: u64 = 3;
    const E_RECEIPT_ALREADY_CLAIMED: u64 = 4;
    const E_NOT_RECEIPT_OWNER: u64 = 5;
    const E_REGISTRY_NOT_INITIALIZED: u64 = 6;
    const E_INVALID_STATUS: u64 = 7;
    const E_INVALID_ADDRESS_LENGTH: u64 = 8;
    const E_UNAUTHORIZED_SIGNER: u64 = 9;

    // Receipt status constants
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_CLAIMED: u8 = 1;
    const STATUS_REVOKED: u8 = 2;

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

        /// User who locked the assets on the remote chain
        user: address,

        /// Amount of assets locked (in the asset's base units)
        amount: u256,

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

    /// Convert Ethereum address (20 bytes) to Aptos address (32 bytes)
    /// Pads with zeros on the left to create a valid Aptos address
    fun address_from_bytes(eth_address: vector<u8>): address {
        assert!(vector::length(&eth_address) == 20, E_INVALID_ADDRESS_LENGTH);
        
        // Pad to 32 bytes (Aptos address length)
        let aptos_addr_bytes = vector::empty<u8>();
        let i = 0;
        while (i < 12) {
            vector::push_back(&mut aptos_addr_bytes, 0);
            i = i + 1;
        };
        vector::append(&mut aptos_addr_bytes, eth_address);
        
        // Deserialize bytes to address
        from_bcs::to_address(aptos_addr_bytes)
    }

    /// Register a lock from Ethereum
    ///
    /// This function:
    /// 1. Creates an Ethereum state proof from parameters
    /// 2. Verifies the proof cryptographically using MPT verification
    /// 3. Checks for replay attacks
    /// 4. Creates and stores a LockReceipt
    /// 5. Emits a LockRegistered event
    ///
    /// Type parameter Asset determines which asset is being locked (FakeETH, FakeUSD, etc.)
    public entry fun register_ethereum_lock<Asset>(
        account: &signer,
        // Ethereum proof parameters
        block_number: u64,
        block_hash: vector<u8>,
        state_root: vector<u8>,
        contract_address: vector<u8>,
        user_address: vector<u8>,
        token_address: vector<u8>,
        storage_key: vector<u8>,
        storage_value: u256,
        account_proof: vector<vector<u8>>,
        storage_proof: vector<vector<u8>>,
    ) acquires ReceiptRegistry {
        // 1. Create Ethereum state proof
        let proof = eth_proof::create_proof(
            block_number,
            block_hash,
            state_root,
            contract_address,
            user_address,
            token_address,
            storage_key,
            storage_value,
            account_proof,
            storage_proof,
        );

        // 2. Verify proof and get unique lock ID
        let lock_id = verify_ethereum_lock<Asset>(&proof, storage_value);

        // 3. Extract the verified user address from the proof
        // This prevents frontrunning attacks where someone could steal the receipt
        let user = address_from_bytes(user_address);
        
        // 4. Verify the signer is authorized.
        //
        // Demo: The @atomica admin (fee-payer) signs on behalf of the user.
        // The user-derived Aptos address (SHA3-256 of SIWE pubkey + domain) does
        // not match the zero-padded Ethereum address, so user self-signing is not
        // supported here. MVP must implement proper user-signer auth (I-M4).
        let signer_addr = signer::address_of(account);
        assert!(
            signer_addr == user || signer_addr == @atomica,
            E_UNAUTHORIZED_SIGNER
        );

        // 5. Check for replay attack
        assert!(
            !is_lock_claimed<Ethereum, Asset>(lock_id),
            E_ALREADY_CLAIMED
        );

        // 6. Create receipt
        let receipt = LockReceipt<Ethereum, Asset> {
            lock_id,
            user,
            amount: storage_value,
            block_number,
            timestamp: timestamp::now_seconds(),
            status: STATUS_ACTIVE,
        };

        // 7. Store receipt
        store_receipt<Ethereum, Asset>(receipt, lock_id);

        // 8. Emit event
        event::emit(LockRegistered<Ethereum, Asset> {
            lock_id,
            user,
            amount: storage_value,
            block_number,
            timestamp: timestamp::now_seconds(),
        });
    }

    // ===================== Verification Functions =====================

    /// Verify an Ethereum lock proof and return unique lock ID
    ///
    /// This function:
    /// 1. Calls eth_proof::verify_and_extract() for cryptographic MPT verification
    /// 2. Validates the verified amount matches the claimed amount
    /// 3. Generates a unique lock ID to prevent replays
    fun verify_ethereum_lock<Asset>(
        proof: &StateProof,
        expected_amount: u256,
    ): vector<u8> {
        // Verify MPT proof cryptographically
        let verified_amount = eth_proof::verify_and_extract(proof);

        // Ensure amount matches
        assert!(verified_amount == expected_amount, E_AMOUNT_MISMATCH);

        // Generate unique lock ID from proof components
        generate_lock_id(proof)
    }

    /// Generate a unique lock ID from proof
    ///
    /// The lock ID is a hash of:
    /// - block_hash (ensures uniqueness per block)
    /// - contract_address (LockBox contract)
    /// - user_address (who locked)
    /// - token_address (which token)
    /// - storage_key (specific storage slot)
    ///
    /// This prevents the same lock from being registered twice
    fun generate_lock_id(proof: &StateProof): vector<u8> {
        let (
            _block_num,
            block_hash,
            _state_root,
            contract_addr,
            user_addr,
            token_addr,
            storage_key,
            _storage_value,
            _account_proof,
            _storage_proof
        ) = eth_proof::destructure_proof(proof);

        // Concatenate all components
        let data = vector::empty<u8>();
        vector::append(&mut data, block_hash);
        vector::append(&mut data, contract_addr);
        vector::append(&mut data, user_addr);
        vector::append(&mut data, token_addr);
        vector::append(&mut data, storage_key);

        // Hash to create unique ID
        keccak256(data)
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

    /// Claim a lock receipt
    ///
    /// This function is called by asset modules (fake_eth, fake_usd) to claim
    /// a receipt and mint the corresponding tokens.
    ///
    /// Returns the amount to be minted.
    public fun claim<Chain, Asset>(
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

        // Verify claimer is the receipt owner or the atomica admin.
        //
        // Demo: The @atomica admin (fee-payer) calls create_auction on behalf of
        // the user. The user's Aptos address (zero-padded Ethereum address) differs
        // from the admin's native Aptos address, so we allow @atomica as an
        // authorized claimer in this phase. MVP must implement proper user-signer
        // auth (I-M4) and remove this bypass.
        assert!(receipt.user == claimer || claimer == @atomica, E_NOT_RECEIPT_OWNER);

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
    /// Get receipt details
    public fun get_receipt<Chain, Asset>(
        lock_id: vector<u8>
    ): (address, u256, u64, u8) acquires ReceiptRegistry {
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

        (receipt.user, receipt.amount, receipt.block_number, receipt.status)
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
            amount,
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
            amount,
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
