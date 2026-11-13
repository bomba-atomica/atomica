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
    use aptos_framework::chain_id;
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
    /// `set_window_schedule` runs only on a test chain (chain id 4)
    const E_NOT_TEST_CHAIN: u64 = 16;
    /// A window schedule is stored once: a change would shift every window id
    const E_SCHEDULE_ALREADY_SET: u64 = 17;
    /// A schedule needs one or two strictly increasing close offsets, the
    /// first above 0 and the last at most `day_secs` (LockBox `InvalidWindowSchedule`)
    const E_INVALID_SCHEDULE: u64 = 18;

    /// Storage slot of `LockBox.commitments` (LockBox.sol storage layout).
    const LOCK_COMMITMENTS_SLOT: u8 = 0;

    // Production window clock: two closes a day, at 07:45 and 16:15 UTC
    // (docs/specifications/auction-timing.md). It is in force while no
    // `WindowSchedule` is stored. `auction::current_window_id` reads the clock
    // through `window_id_at`, because a Move constant is private.
    /// Seconds per day.
    const WINDOW_DAY_SECS: u64 = 86400;
    /// Second of the day of the morning close, 07:45:00 UTC.
    const WINDOW_MORNING_CLOSE_SECS: u64 = 27900;
    /// Second of the day of the afternoon close, 16:15:00 UTC.
    const WINDOW_AFTERNOON_CLOSE_SECS: u64 = 58500;
    /// Delay from a window's close to the Ethereum lock deadline of its locks:
    /// 72 hours. The auction's stuck deadline plus the outcome carrier margin
    /// must end before it (docs/specifications/auction-timing.md). LockBox
    /// freezes the same value as `RECLAIM_DELAY`.
    const ETH_RECLAIM_DELAY_SECS: u64 = 259200;
    /// Chain id of the docker test chain, the only chain that may store a
    /// `WindowSchedule`.
    const TEST_CHAIN_ID: u8 = 4;

    /// The pinned Ethereum side: the LockBox, the token behind each asset, and
    /// the SIWE domain of Ethereum-derivable accounts that own receipts.
    struct EthereumConfig has key {
        lockbox: vector<u8>,
        fake_eth_token: vector<u8>,
        fake_usd_token: vector<u8>,
        siwe_domain: vector<u8>,
    }

    /// A test chain's window clock, stored at `@atomica` by
    /// `set_window_schedule`: each day of `day_secs` seconds holds one window
    /// close at each of `close_offsets_secs`. While none is stored the
    /// production clock applies (86400 s, closes at 27900 and 58500).
    struct WindowSchedule has key {
        day_secs: u64,
        close_offsets_secs: vector<u64>,
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

    /// Store a test window clock (for example `900, [900]`: one close every 15
    /// minutes), so live tests reach a window close in minutes. Only `@atomica`
    /// may call it (E_NOT_ADMIN), only on chain id 4 (E_NOT_TEST_CHAIN), and
    /// only once (E_SCHEDULE_ALREADY_SET), because a change would shift every
    /// window id. The offsets must be one or two, strictly increasing, the
    /// first above 0 and the last at most `day_secs` (E_INVALID_SCHEDULE): the
    /// rules of the LockBox constructor, so any schedule Aptos accepts LockBox
    /// accepts too. A production chain keeps the 07:45 and 16:15 UTC closes.
    public entry fun set_window_schedule(
        admin: &signer,
        day_secs: u64,
        close_offsets_secs: vector<u64>,
    ) {
        assert!(signer::address_of(admin) == @atomica, E_NOT_ADMIN);
        assert!(chain_id::get() == TEST_CHAIN_ID, E_NOT_TEST_CHAIN);
        assert!(!exists<WindowSchedule>(@atomica), E_SCHEDULE_ALREADY_SET);
        let n = vector::length(&close_offsets_secs);
        assert!(n == 1 || n == 2, E_INVALID_SCHEDULE);
        let first = *vector::borrow(&close_offsets_secs, 0);
        let last = *vector::borrow(&close_offsets_secs, n - 1);
        assert!(first > 0 && last <= day_secs, E_INVALID_SCHEDULE);
        assert!(n == 1 || first < last, E_INVALID_SCHEDULE);
        move_to(admin, WindowSchedule { day_secs, close_offsets_secs });
    }

    // ==================== Views ====================

    #[view]
    /// The window clock in force: `(day_secs, close_offsets_secs)`. The stored
    /// test schedule, or the production one, `(86400, [27900, 58500])`.
    public fun get_window_schedule(): (u64, vector<u64>) acquires WindowSchedule {
        if (exists<WindowSchedule>(@atomica)) {
            let schedule = borrow_global<WindowSchedule>(@atomica);
            (schedule.day_secs, schedule.close_offsets_secs)
        } else {
            (WINDOW_DAY_SECS, vector[WINDOW_MORNING_CLOSE_SECS, WINDOW_AFTERNOON_CLOSE_SECS])
        }
    }

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
    /// keccak256(abi.encode(uint64 window_id, bytes32 pair_hash)).
    /// Equals `LockBox.auctionKey`. The deadline is not part of the key: it is
    /// a function of the window id (`eth_lock_deadline`).
    public fun auction_key(window_id: u64, pair_hash: vector<u8>): vector<u8> {
        assert!(vector::length(&pair_hash) == 32, E_INVALID_PAIR_HASH);
        let data = u256_be((window_id as u256));
        vector::append(&mut data, pair_hash);
        keccak256(data)
    }

    /// Window id at unix second `secs` on the clock of `get_window_schedule`.
    /// With `n` closes a day:
    ///
    ///   day = secs / day_secs, t = secs % day_secs
    ///   id  = day * n + (number of close offsets <= t)
    ///
    /// On the production clock it changes exactly at 07:45:00 and 16:15:00 UTC:
    /// `day * 2 + (t >= 27900 ? 1 : 0) + (t >= 58500 ? 1 : 0)`.
    ///
    /// @see docs/architecture/v0-architecture.md §2.2
    public fun window_id_at(secs: u64): u64 acquires WindowSchedule {
        let (day_secs, offsets) = get_window_schedule();
        let n = vector::length(&offsets);
        let t = secs % day_secs;
        let id = (secs / day_secs) * n;
        let i = 0;
        while (i < n) {
            if (t >= *vector::borrow(&offsets, i)) { id = id + 1 };
            i = i + 1;
        };
        id
    }

    /// Unix second at which `window_id` stops being `auction::current_window_id`:
    /// with `n` closes a day, `(w / n) * day_secs + close_offsets_secs[w % n]`.
    /// On the production clock an even window closes at 07:45 UTC and an odd
    /// window at 16:15 UTC. It is the first second of `w + 1`.
    public fun window_close_secs(window_id: u64): u64 acquires WindowSchedule {
        let (day_secs, offsets) = get_window_schedule();
        let n = vector::length(&offsets);
        (window_id / n) * day_secs + *vector::borrow(&offsets, window_id % n)
    }

    /// The Ethereum lock deadline of every lock of window `window_id`: window
    /// close plus ETH_RECLAIM_DELAY_SECS. A pure function of the window id,
    /// because a lock is made before its window or timelock exists. Equals
    /// `LockBox.lockDeadline`, which computes it for every lock.
    public fun eth_lock_deadline(window_id: u64): u64 acquires WindowSchedule {
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
    /// (user, token, amount, window_id, pair_hash, eth_lock_deadline(window_id)).
    public fun verify_lock(
        block_number: u64,
        user: vector<u8>,
        token: vector<u8>,
        nonce: u64,
        amount: u256,
        window_id: u64,
        pair_hash: vector<u8>,
        account_proof: vector<vector<u8>>,
        storage_proof: vector<vector<u8>>,
    ) acquires EthereumConfig, WindowSchedule {
        assert!(amount > 0, E_EMPTY_LOCK);
        let expected = lock_commitment(user, token, amount, window_id, pair_hash, eth_lock_deadline(window_id));
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
