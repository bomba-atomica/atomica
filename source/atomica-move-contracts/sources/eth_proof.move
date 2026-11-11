/// Ethereum State Proof Verifier
///
/// Verifies that one LockBox lock exists on Ethereum with the fields the
/// caller names, using MPT (Merkle-Patricia Trie) proofs checked against a
/// validator-certified state root.
///
/// Trust anchors (none of them come from the caller of a proof):
/// - State roots: `aptos_framework::ethereum_headers`. Only a certificate
///   signed by validators with 2/3+ of the voting power writes a header there.
///   No entry function writes headers, and the `@atomica` account has no
///   header privilege. A proof names a block number and is checked against
///   that block's certified root only.
/// - Contract, tokens and SIWE domain: `initialize` pins the LockBox address,
///   the FakeETH / FakeUSD token addresses and the SIWE domain once.
/// - Storage slot: the proven slot is derived here from the user, the token
///   and the lock nonce: `commitments[lock_id]`, LockBox slot 0
///   (`LockBox.commitmentStorageKey`).
/// - Lock fields: the slot holds a commitment to the depositor, token,
///   amount, window id, pair hash and deadline (`LockBox.lockCommitment`).
///   It is recomputed here from the fields the caller names, so a wrong
///   amount or binding does not verify.
/// - Receipt owner: the depositor's Ethereum-derivable Aptos account
///   (`ethereum_account_address`), derived from the proven Ethereum address
///   and the pinned SIWE domain.
///
/// The verification process:
/// 1. Look up the certified state root of the proof block
/// 2. Verify the LockBox account proof against it
/// 3. Extract the LockBox storage root from the account data
/// 4. Verify the storage proof of `commitments[lock_id(user, token, nonce)]`
/// 5. Check that the proven value equals `lock_commitment` of the named fields
///
/// @see docs/architecture/v0-architecture.md §3 (Cross-Chain Settlement)
/// @see docs/decisions/trustless-v0-1-unwinding.md
/// @see source/evm-contracts/src/escrow/LockBox.sol (storage layout)
module atomica::eth_proof {
    use std::bcs;
    use std::vector;
    use std::signer;
    use std::string;
    use aptos_std::aptos_hash::keccak256;
    use aptos_framework::account_abstraction;
    use aptos_framework::ethereum_headers;
    use aptos_framework::function_info;
    use atomica::mpt;
    use atomica::rlp;

    /// Error codes
    const E_INVALID_PROOF: u64 = 1;
    const E_INVALID_ACCOUNT: u64 = 4;
    /// Only the @atomica admin may pin the config
    const E_NOT_ADMIN: u64 = 5;
    /// The LockBox config is pinned once and never changes
    const E_CONFIG_ALREADY_SET: u64 = 6;
    const E_CONFIG_NOT_SET: u64 = 7;
    /// An Ethereum address must be 20 bytes
    const E_INVALID_ADDRESS: u64 = 8;
    /// The validators have not certified a header for the proof block
    const E_UNKNOWN_HEADER: u64 = 9;
    /// The proven lock holds no tokens
    const E_EMPTY_LOCK: u64 = 12;
    /// The SIWE domain must not be empty
    const E_INVALID_DOMAIN: u64 = 13;
    /// The proven slot does not hold the commitment of the named lock fields
    const E_COMMITMENT_MISMATCH: u64 = 14;
    /// A pair hash must be 32 bytes
    const E_INVALID_PAIR_HASH: u64 = 15;

    /// Storage slot of `LockBox.commitments` (LockBox.sol storage layout).
    const LOCK_COMMITMENTS_SLOT: u8 = 0;

    // SCOUT(#220) REMOVE: `WINDOW_EPOCH_SECS` and `WINDOW_SPLIT_SECS`; the three constants below replace them.
    /// Seconds per auction epoch (`auction::current_window_id`).
    const WINDOW_EPOCH_SECS: u64 = 43200;
    /// Offset of the second window within an epoch (`auction::current_window_id`).
    const WINDOW_SPLIT_SECS: u64 = 28500;
    // SCOUT(#220) ADD: named constants of the two-closes-a-day formula. `auction::current_window_id` needs the same three numbers, and a Move constant is private to its module.
    /// Seconds per day.
    const WINDOW_DAY_SECS: u64 = 86400;
    /// Second of the day of the morning close, 07:45:00 UTC.
    const WINDOW_MORNING_CLOSE_SECS: u64 = 27900;
    /// Second of the day of the afternoon close, 16:15:00 UTC.
    const WINDOW_AFTERNOON_CLOSE_SECS: u64 = 58500;
    // SCOUT(#221) EDIT: LockBox freezes `ETH_RECLAIM_DELAY_SECS` as its reclaim delay; the owner decides the value first (review decision 36).
    /// Delay from a window's close to the Ethereum lock deadline of its locks:
    /// 72 hours. The auction's stuck deadline plus the outcome carrier margin
    /// must end before it (docs/specifications/auction-timing.md).
    const ETH_RECLAIM_DELAY_SECS: u64 = 259200;

    /// The pinned Ethereum side: the LockBox, the token behind each asset, and
    /// the SIWE domain of Ethereum-derivable accounts that own receipts.
    struct EthereumConfig has key {
        lockbox: vector<u8>,
        fake_eth_token: vector<u8>,
        fake_usd_token: vector<u8>,
        siwe_domain: vector<u8>,
    }

    // ==================== Admin ====================

    /// Pin the LockBox address, the FakeETH / FakeUSD token addresses and the
    /// SIWE domain (utf8, e.g. `app.example.com`) of receipt owners.
    /// Called once by the @atomica admin after both chains are deployed.
    public entry fun initialize(
        admin: &signer,
        lockbox: vector<u8>,
        fake_eth_token: vector<u8>,
        fake_usd_token: vector<u8>,
        siwe_domain: vector<u8>,
    ) {
        assert!(signer::address_of(admin) == @atomica, E_NOT_ADMIN);
        assert!(!exists<EthereumConfig>(@atomica), E_CONFIG_ALREADY_SET);
        assert!(vector::length(&lockbox) == 20, E_INVALID_ADDRESS);
        assert!(vector::length(&fake_eth_token) == 20, E_INVALID_ADDRESS);
        assert!(vector::length(&fake_usd_token) == 20, E_INVALID_ADDRESS);
        assert!(vector::length(&siwe_domain) > 0, E_INVALID_DOMAIN);
        move_to(admin, EthereumConfig { lockbox, fake_eth_token, fake_usd_token, siwe_domain });
    }

    // ==================== Views ====================

    #[view]
    /// Whether the validators certified a header for `block_number`.
    public fun has_header(block_number: u64): bool {
        ethereum_headers::is_certified(block_number)
    }

    #[view]
    /// The certified state root of `block_number`. Aborts with
    /// `E_UNKNOWN_HEADER` if the validators have not certified that block.
    public fun get_state_root(block_number: u64): vector<u8> {
        assert!(has_header(block_number), E_UNKNOWN_HEADER);
        ethereum_headers::get_state_root(block_number)
    }

    #[view]
    /// The pinned (lockbox, fake_eth_token, fake_usd_token) addresses.
    public fun get_config(): (vector<u8>, vector<u8>, vector<u8>) acquires EthereumConfig {
        assert!(exists<EthereumConfig>(@atomica), E_CONFIG_NOT_SET);
        let c = borrow_global<EthereumConfig>(@atomica);
        (c.lockbox, c.fake_eth_token, c.fake_usd_token)
    }

    #[view]
    /// The pinned SIWE domain (utf8 bytes).
    public fun siwe_domain(): vector<u8> acquires EthereumConfig {
        assert!(exists<EthereumConfig>(@atomica), E_CONFIG_NOT_SET);
        borrow_global<EthereumConfig>(@atomica).siwe_domain
    }

    #[view]
    /// The Ethereum-derivable Aptos account of `eth_address` (20 bytes) under
    /// the pinned SIWE domain: the account a SIWE signature of that Ethereum
    /// key controls (`0x1::ethereum_derivable_account`). Its identity is the
    /// lowercase `0x`-prefixed hex address, as the SDK's `getDerivedAddress`
    /// builds it.
    public fun ethereum_account_address(eth_address: vector<u8>): address acquires EthereumConfig {
        assert!(vector::length(&eth_address) == 20, E_INVALID_ADDRESS);
        // BCS of SIWEAbstractPublicKey { ethereum_address, domain }.
        let abstract_public_key = bcs::to_bytes(&lower_hex_0x(&eth_address));
        vector::append(&mut abstract_public_key, bcs::to_bytes(&siwe_domain()));
        account_abstraction::derive_account_address(
            function_info::new_function_info_from_address(
                @aptos_framework,
                string::utf8(b"ethereum_derivable_account"),
                string::utf8(b"authenticate"),
            ),
            &abstract_public_key,
        )
    }

    /// Pinned FakeETH token address.
    public fun fake_eth_token(): vector<u8> acquires EthereumConfig {
        let (_, token, _) = get_config();
        token
    }

    /// Pinned FakeUSD token address.
    public fun fake_usd_token(): vector<u8> acquires EthereumConfig {
        let (_, _, token) = get_config();
        token
    }

    // ==================== Lock ids and storage keys ====================

    /// Id of one LockBox lock: keccak256(user ‖ token ‖ uint256(nonce)).
    /// Equals `LockBox.getLockId(user, token, nonce)`.
    public fun lock_id(user: vector<u8>, token: vector<u8>, nonce: u64): vector<u8> {
        assert!(vector::length(&user) == 20, E_INVALID_ADDRESS);
        assert!(vector::length(&token) == 20, E_INVALID_ADDRESS);
        let data = user;
        vector::append(&mut data, token);
        vector::append(&mut data, u256_be((nonce as u256)));
        keccak256(data)
    }

    /// Storage key of `LockBox.commitments[lock_id(user, token, nonce)]`:
    /// keccak256(lock_id ‖ uint256(0)). Equals `LockBox.commitmentStorageKey`.
    public fun lock_storage_key(user: vector<u8>, token: vector<u8>, nonce: u64): vector<u8> {
        let data = lock_id(user, token, nonce);
        vector::append(&mut data, u256_be((LOCK_COMMITMENTS_SLOT as u256)));
        keccak256(data)
    }

    // ==================== Lock binding ====================

    /// The value LockBox stores for a lock:
    /// keccak256(abi.encode(user, token, amount, window_id, pair_hash, deadline)).
    /// Equals `LockBox.lockCommitment`.
    public fun lock_commitment(
        user: vector<u8>,
        token: vector<u8>,
        amount: u256,
        window_id: u64,
        pair_hash: vector<u8>,
        deadline: u64,
    ): vector<u8> {
        assert!(vector::length(&pair_hash) == 32, E_INVALID_PAIR_HASH);
        let data = address_word(user);
        vector::append(&mut data, address_word(token));
        vector::append(&mut data, u256_be(amount));
        vector::append(&mut data, u256_be((window_id as u256)));
        vector::append(&mut data, pair_hash);
        vector::append(&mut data, u256_be((deadline as u256)));
        keccak256(data)
    }

    /// The auction a lock is bound to:
    /// keccak256(abi.encode(uint64 window_id, bytes32 pair_hash, uint64 deadline)).
    /// Equals `LockBox.auctionKey`.
    // SCOUT(#221) EDIT: `eth_proof::auction_key` drops the `deadline` argument: keccak256(abi.encode(uint64 window_id, bytes32 pair_hash)).
    public fun auction_key(window_id: u64, pair_hash: vector<u8>, deadline: u64): vector<u8> {
        assert!(vector::length(&pair_hash) == 32, E_INVALID_PAIR_HASH);
        let data = u256_be((window_id as u256));
        vector::append(&mut data, pair_hash);
        vector::append(&mut data, u256_be((deadline as u256)));
        keccak256(data)
    }

    /// Unix second at which `window_id` stops being `auction::current_window_id`.
    // SCOUT(#220) EDIT: `window_close_secs` becomes (w / 2) * 86400 + (27900 for an even w, 58500 for an odd w).
    public fun window_close_secs(window_id: u64): u64 {
        let epoch_start = (window_id / 2) * WINDOW_EPOCH_SECS;
        if (window_id % 2 == 0) { epoch_start + WINDOW_SPLIT_SECS } else { epoch_start + WINDOW_EPOCH_SECS }
    }

    /// The Ethereum lock deadline of every lock of window `window_id`: window
    /// close plus ETH_RECLAIM_DELAY_SECS. A pure function of the window id,
    /// because a lock is made before its window or timelock exists.
    public fun eth_lock_deadline(window_id: u64): u64 {
        window_close_secs(window_id) + ETH_RECLAIM_DELAY_SECS
    }

    /// ETH_RECLAIM_DELAY_SECS.
    public fun eth_reclaim_delay_secs(): u64 {
        ETH_RECLAIM_DELAY_SECS
    }

    // ==================== Verification ====================

    /// Verify one LockBox lock and its fields at a certified block.
    ///
    /// The state root, the LockBox address and the storage key are all
    /// derived on chain. Aborts with `E_UNKNOWN_HEADER` if the validators have
    /// not certified the block, aborts if either proof does not match, aborts
    /// with `E_EMPTY_LOCK` for a zero amount, and aborts with
    /// `E_COMMITMENT_MISMATCH` if the slot does not hold the commitment of
    /// (user, token, amount, window_id, pair_hash, deadline).
    // SCOUT(#221) EDIT: `verify_lock` drops the `deadline` argument and commits to `eth_lock_deadline(window_id)`.
    public fun verify_lock(
        block_number: u64,
        user: vector<u8>,
        token: vector<u8>,
        nonce: u64,
        amount: u256,
        window_id: u64,
        pair_hash: vector<u8>,
        deadline: u64,
        account_proof: vector<vector<u8>>,
        storage_proof: vector<vector<u8>>,
    ) acquires EthereumConfig {
        assert!(amount > 0, E_EMPTY_LOCK);
        let expected = lock_commitment(user, token, amount, window_id, pair_hash, deadline);
        assert!(vector::length(&account_proof) > 0, E_INVALID_PROOF);
        assert!(vector::length(&storage_proof) > 0, E_INVALID_PROOF);
        let state_root = get_state_root(block_number);
        let (lockbox, _, _) = get_config();

        // 1. Verify the LockBox account against the certified state root.
        // The key for account proofs is keccak256(address).
        let account_rlp = mpt::verify_proof(account_proof, state_root, keccak256(lockbox));

        // 2. Extract storage root from account RLP
        // Ethereum account structure: [nonce, balance, storageRoot, codeHash]
        let account_items = rlp::decode_list(account_rlp);
        assert!(vector::length(&account_items) == 4, E_INVALID_ACCOUNT);
        let storage_root = *vector::borrow(&account_items, 2);
        assert!(vector::length(&storage_root) == 32, E_INVALID_ACCOUNT);

        // 3. Verify the storage proof of this lock's slot. The trie path is
        // keccak256 of the storage key.
        let storage_path = keccak256(lock_storage_key(user, token, nonce));
        let storage_value_rlp = mpt::verify_proof(storage_proof, storage_root, storage_path);

        // 4. Decode the RLP-encoded storage value
        let (is_list, items) = rlp::decode(storage_value_rlp);
        assert!(!is_list, E_INVALID_PROOF);
        assert!(vector::length(&items) == 1, E_INVALID_PROOF);
        let proven = decode_u256(*vector::borrow(&items, 0));
        assert!(proven == decode_u256(expected), E_COMMITMENT_MISMATCH);
    }

    // ==================== Helper Functions ====================

    /// `0x` followed by the lowercase hex of `bytes`, as utf8 bytes.
    fun lower_hex_0x(bytes: &vector<u8>): vector<u8> {
        let digits = b"0123456789abcdef";
        let out = b"0x";
        let i = 0;
        let n = vector::length(bytes);
        while (i < n) {
            let b = *vector::borrow(bytes, i);
            vector::push_back(&mut out, *vector::borrow(&digits, ((b >> 4) as u64)));
            vector::push_back(&mut out, *vector::borrow(&digits, ((b & 0x0f) as u64)));
            i = i + 1;
        };
        out
    }

    /// A 20-byte address as a 32-byte ABI word (Solidity abi.encode of address).
    fun address_word(addr: vector<u8>): vector<u8> {
        assert!(vector::length(&addr) == 20, E_INVALID_ADDRESS);
        let out = vector::empty<u8>();
        let i = 0;
        while (i < 12) {
            vector::push_back(&mut out, 0);
            i = i + 1;
        };
        vector::append(&mut out, addr);
        out
    }

    /// Encode a u256 as 32 big-endian bytes (Solidity abi.encode of uint256).
    fun u256_be(value: u256): vector<u8> {
        let out = vector::empty<u8>();
        let i = 0;
        while (i < 32) {
            vector::push_back(&mut out, ((value >> (8 * (31 - i) as u8)) & 0xff as u8));
            i = i + 1;
        };
        out
    }

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
}
