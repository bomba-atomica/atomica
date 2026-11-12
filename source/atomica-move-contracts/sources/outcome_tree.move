// SCOUT(#222) DOC: the header sentence "Each leaf pays the lock's full amount" becomes "these payouts, and the remainder to the depositor"; hashes and vectors do not change.
/// Outcome tree: the keccak Merkle tree an `auction::AuctionOutcome` commits to.
///
/// One leaf per lock claimed into the auction window, sorted by lock id. Each
/// leaf pays the lock's full amount to (Ethereum recipient, amount) payouts.
/// Ethereum LockBox verifies leaves and non-membership against the root.
///
/// Mirrors, byte for byte, `source/evm-contracts/src/escrow/OutcomeTree.sol`
/// and `source/atomica-sdk/src/settlement/outcome-tree.ts`. The shared fixture
/// `source/atomica-sdk/tests/fixtures/outcome_tree_vectors.json` pins all three.
///
///   payouts_hash = keccak256(recipient_0 (20 bytes) || amount_0 (uint256 BE) || ...)
///   leaf         = keccak256(0x00 || lock_id || payouts_hash)
///   node         = keccak256(0x01 || left || right)
///
/// Each level pairs nodes (2i, 2i + 1). A last node without a partner moves up
/// unchanged. A proof lists the siblings from the leaf up and skips the levels
/// where the node moves up alone.
module atomica::outcome_tree {
    use std::vector;
    use aptos_std::aptos_hash::keccak256;

    /// Payout recipients and amounts differ in length
    const E_LENGTH_MISMATCH: u64 = 1;
    /// An Ethereum recipient must be 20 bytes
    const E_INVALID_RECIPIENT: u64 = 2;
    /// A lock id or hash must be 32 bytes
    const E_INVALID_HASH: u64 = 3;
    /// Two leaves share one lock id
    const E_DUPLICATE_LOCK: u64 = 4;
    /// The tree needs at least one leaf
    const E_EMPTY_TREE: u64 = 5;
    /// The leaf index is out of range
    const E_INDEX_OUT_OF_RANGE: u64 = 6;

    /// keccak256 of the packed (recipient, amount) payouts of one lock.
    public fun payouts_hash(recipients: &vector<vector<u8>>, amounts: &vector<u256>): vector<u8> {
        let n = vector::length(recipients);
        assert!(n == vector::length(amounts), E_LENGTH_MISMATCH);
        let packed = vector::empty<u8>();
        let i = 0;
        while (i < n) {
            let r = vector::borrow(recipients, i);
            assert!(vector::length(r) == 20, E_INVALID_RECIPIENT);
            vector::append(&mut packed, *r);
            vector::append(&mut packed, u256_be(*vector::borrow(amounts, i)));
            i = i + 1;
        };
        keccak256(packed)
    }

    /// keccak256(0x00 || lock_id || payouts_hash).
    public fun leaf_hash(lock_id: vector<u8>, payouts: vector<u8>): vector<u8> {
        assert!(vector::length(&lock_id) == 32, E_INVALID_HASH);
        assert!(vector::length(&payouts) == 32, E_INVALID_HASH);
        let data = vector[0u8];
        vector::append(&mut data, lock_id);
        vector::append(&mut data, payouts);
        keccak256(data)
    }

    /// keccak256(0x01 || left || right).
    public fun node_hash(left: vector<u8>, right: vector<u8>): vector<u8> {
        let data = vector[1u8];
        vector::append(&mut data, left);
        vector::append(&mut data, right);
        keccak256(data)
    }

    /// The leaves of `lock_ids` with their `payouts_hashes`, in tree order
    /// (ascending lock id). Aborts on a duplicate lock id.
    public fun sorted_leaves(
        lock_ids: vector<vector<u8>>,
        payouts_hashes: vector<vector<u8>>,
    ): vector<vector<u8>> {
        let n = vector::length(&lock_ids);
        assert!(n == vector::length(&payouts_hashes), E_LENGTH_MISMATCH);
        // Insertion sort of (lock id, payouts hash) pairs by lock id.
        let i = 1;
        while (i < n) {
            let j = i;
            while (j > 0 && less(vector::borrow(&lock_ids, j), vector::borrow(&lock_ids, j - 1))) {
                vector::swap(&mut lock_ids, j, j - 1);
                vector::swap(&mut payouts_hashes, j, j - 1);
                j = j - 1;
            };
            i = i + 1;
        };
        let leaves = vector::empty<vector<u8>>();
        let k = 0;
        while (k < n) {
            if (k > 0) {
                assert!(less(vector::borrow(&lock_ids, k - 1), vector::borrow(&lock_ids, k)), E_DUPLICATE_LOCK);
            };
            vector::push_back(
                &mut leaves,
                leaf_hash(*vector::borrow(&lock_ids, k), *vector::borrow(&payouts_hashes, k)),
            );
            k = k + 1;
        };
        leaves
    }

    /// Root of `leaves` (tree order).
    public fun root(leaves: &vector<vector<u8>>): vector<u8> {
        assert!(vector::length(leaves) > 0, E_EMPTY_TREE);
        let level = *leaves;
        while (vector::length(&level) > 1) {
            level = up(&level);
        };
        *vector::borrow(&level, 0)
    }

    /// Sibling path of the leaf at `index` (tree order).
    public fun proof(leaves: &vector<vector<u8>>, index: u64): vector<vector<u8>> {
        assert!(index < vector::length(leaves), E_INDEX_OUT_OF_RANGE);
        let path = vector::empty<vector<u8>>();
        let level = *leaves;
        let i = index;
        while (vector::length(&level) > 1) {
            let sibling = i ^ 1;
            if (sibling < vector::length(&level)) {
                vector::push_back(&mut path, *vector::borrow(&level, sibling));
            };
            level = up(&level);
            i = i / 2;
        };
        path
    }

    /// Whether `leaf` sits at `index` of a `count`-leaf tree with `root`
    /// (the check `OutcomeTree.verify` runs in LockBox).
    public fun verify(
        leaf: vector<u8>,
        index: u64,
        count: u64,
        proof: &vector<vector<u8>>,
        root: vector<u8>,
    ): bool {
        if (index >= count) return false;
        let node = leaf;
        let used = 0;
        let i = index;
        let n = count;
        while (n > 1) {
            if ((i ^ 1) < n) {
                if (used == vector::length(proof)) return false;
                let sibling = *vector::borrow(proof, used);
                used = used + 1;
                node = if (i % 2 == 0) { node_hash(node, sibling) } else { node_hash(sibling, node) };
            };
            i = i / 2;
            n = (n + 1) / 2;
        };
        used == vector::length(proof) && node == root
    }

    fun up(level: &vector<vector<u8>>): vector<vector<u8>> {
        let next = vector::empty<vector<u8>>();
        let n = vector::length(level);
        let i = 0;
        while (i < n) {
            if (i + 1 < n) {
                vector::push_back(
                    &mut next,
                    node_hash(*vector::borrow(level, i), *vector::borrow(level, i + 1)),
                );
            } else {
                vector::push_back(&mut next, *vector::borrow(level, i));
            };
            i = i + 2;
        };
        next
    }

    /// Big-endian comparison of two 32-byte ids (Solidity bytes32 `<`).
    fun less(a: &vector<u8>, b: &vector<u8>): bool {
        assert!(vector::length(a) == 32 && vector::length(b) == 32, E_INVALID_HASH);
        let i = 0;
        while (i < 32) {
            let x = *vector::borrow(a, i);
            let y = *vector::borrow(b, i);
            if (x != y) return x < y;
            i = i + 1;
        };
        false
    }

    fun u256_be(value: u256): vector<u8> {
        let out = vector::empty<u8>();
        let i = 0;
        while (i < 32) {
            vector::push_back(&mut out, (((value >> (8 * (31 - i) as u8)) & 0xff) as u8));
            i = i + 1;
        };
        out
    }
}
