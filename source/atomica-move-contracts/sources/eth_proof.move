/// Ethereum State Proof Verifier
///
/// Verifies Ethereum state proofs on Aptos using MPT (Merkle-Patricia Trie)
/// cryptographic verification. This enables cross-chain verification of locked
/// tokens on Ethereum for auction participation on Aptos.
///
/// The verification process:
/// 1. Verify account proof against Ethereum state root
/// 2. Extract storage root from account data
/// 3. Verify storage proof against storage root
/// 4. Extract and return the locked token amount
module atomica::eth_proof {
    use std::vector;
    use aptos_std::aptos_hash::keccak256;
    use atomica::mpt;
    use atomica::rlp;

    /// Error codes
    const E_INVALID_PROOF: u64 = 1;
    const E_INSUFFICIENT_LOCKED: u64 = 2;
    const E_PROOF_EXPIRED: u64 = 3;
    const E_INVALID_ACCOUNT: u64 = 4;

    /// Ethereum state proof
    struct StateProof has copy, drop, store {
        // Block information
        block_number: u64,
        block_hash: vector<u8>,
        state_root: vector<u8>,

        // Contract and user
        contract_address: vector<u8>,
        user_address: vector<u8>,
        token_address: vector<u8>,

        // Storage proof
        storage_key: vector<u8>,
        storage_value: u256,

        // MPT proofs
        account_proof: vector<vector<u8>>,
        storage_proof: vector<vector<u8>>,
    }

    /// Create a state proof
    public fun create_proof(
        block_number: u64,
        block_hash: vector<u8>,
        state_root: vector<u8>,
        contract_address: vector<u8>,
        user_address: vector<u8>,
        token_address: vector<u8>,
        storage_key: vector<u8>,
        storage_value: u256,
        account_proof: vector<vector<u8>>,
        storage_proof: vector<vector<u8>>
    ): StateProof {
        StateProof {
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
        }
    }

    /// Verify proof and extract locked amount using full MPT verification
    ///
    /// This function performs cryptographic verification of the Ethereum state proof:
    /// 1. Verifies the account exists at the contract address
    /// 2. Extracts the storage root from the account data
    /// 3. Verifies the storage value at the storage key
    /// 4. Decodes and returns the locked amount
    public fun verify_and_extract(proof: &StateProof): u256 {
        // Basic validation
        assert!(vector::length(&proof.block_hash) == 32, E_INVALID_PROOF);
        assert!(vector::length(&proof.state_root) == 32, E_INVALID_PROOF);
        assert!(vector::length(&proof.account_proof) > 0, E_INVALID_PROOF);
        assert!(vector::length(&proof.storage_proof) > 0, E_INVALID_PROOF);

        // 1. Verify account proof against state root
        // The key for account proofs is keccak256(address)
        let account_key = keccak256(proof.contract_address);
        let account_rlp = mpt::verify_proof(
            proof.account_proof,
            proof.state_root,
            account_key
        );

        // 2. Extract storage root from account RLP
        // Ethereum account structure: [nonce, balance, storageRoot, codeHash]
        let account_items = rlp::decode_list(account_rlp);
        assert!(vector::length(&account_items) == 4, E_INVALID_ACCOUNT);
        
        let storage_root = *vector::borrow(&account_items, 2);
        assert!(vector::length(&storage_root) == 32, E_INVALID_ACCOUNT);

        // 3. Verify storage proof against storage root
        // The storage key is already provided (calculated off-chain)
        let storage_value_rlp = mpt::verify_proof(
            proof.storage_proof,
            storage_root,
            proof.storage_key
        );

        // 4. Decode the storage value
        // Storage values are RLP-encoded
        let (is_list, items) = rlp::decode(storage_value_rlp);
        assert!(!is_list, E_INVALID_PROOF);
        assert!(vector::length(&items) == 1, E_INVALID_PROOF);
        
        let value_bytes = *vector::borrow(&items, 0);
        let locked_amount = decode_u256(value_bytes);

        // Verify it matches the claimed value (sanity check)
        assert!(locked_amount == proof.storage_value, E_INVALID_PROOF);

        locked_amount
    }

    /// Check if user has locked sufficient amount
    public fun has_sufficient_lock(
        proof: &StateProof,
        required_amount: u256
    ): bool {
        let locked = verify_and_extract(proof);
        locked >= required_amount
    }

    /// Get locked amount (for testing - does NOT verify proof)
    public fun get_locked_amount(proof: &StateProof): u256 {
        proof.storage_value
    }

    /// Get user address (for testing)
    public fun get_user_address(proof: &StateProof): vector<u8> {
        proof.user_address
    }

    /// Get token address (for testing)
    public fun get_token_address(proof: &StateProof): vector<u8> {
        proof.token_address
    }

    /// Get block number (for testing)
    public fun get_block_number(proof: &StateProof): u64 {
        proof.block_number
    }

    // ==================== Helper Functions ====================

    /// Decode u256 from big-endian bytes
    public fun decode_u256(bytes: vector<u8>): u256 {
        let len = vector::length(&bytes);
        if (len == 0) return 0;

        let result = decode_u256_loop(bytes, 0, len, 0);
        result
    }

    fun decode_u256_loop(
        bytes: vector<u8>,
        index: u64,
        len: u64,
        accumulator: u256
    ): u256 {
        if (index >= len) {
            accumulator
        } else {
            let byte = *vector::borrow(&bytes, index);
            let new_acc = accumulator * 256 + (byte as u256);
            decode_u256_loop(bytes, index + 1, len, new_acc)
        }
    }

    /// Decode u64 from big-endian bytes
    public fun decode_u64(bytes: vector<u8>): u64 {
        let len = vector::length(&bytes);
        if (len == 0) return 0;

        decode_u64_loop(bytes, 0, len, 0)
    }

    fun decode_u64_loop(
        bytes: vector<u8>,
        index: u64,
        len: u64,
        accumulator: u64
    ): u64 {
        if (index >= len) {
            accumulator
        } else {
            let byte = *vector::borrow(&bytes, index);
            let new_acc = accumulator * 256 + (byte as u64);
            decode_u64_loop(bytes, index + 1, len, new_acc)
        }
    }

    /// Destructure proof to access all fields
    /// Used by lock_receipt module to generate unique lock IDs
    public fun destructure_proof(proof: &StateProof): (
        u64,                    // block_number
        vector<u8>,             // block_hash
        vector<u8>,             // state_root
        vector<u8>,             // contract_address
        vector<u8>,             // user_address
        vector<u8>,             // token_address
        vector<u8>,             // storage_key
        u256,                   // storage_value
        vector<vector<u8>>,     // account_proof
        vector<vector<u8>>,     // storage_proof
    ) {
        (
            proof.block_number,
            proof.block_hash,
            proof.state_root,
            proof.contract_address,
            proof.user_address,
            proof.token_address,
            proof.storage_key,
            proof.storage_value,
            proof.account_proof,
            proof.storage_proof,
        )
    }
}
