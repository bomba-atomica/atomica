// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title OutcomeTree
 * @notice Keccak Merkle tree over an auction's dispositions: one leaf per lock, sorted by lock id.
 * @dev Mirrored byte for byte by `atomica::outcome_tree` (Move) and
 *      source/atomica-sdk/src/settlement/outcome-tree.ts. Shared fixtures pin all three.
 *
 *      payoutsHash = keccak256(recipient_0 (20 bytes) || amount_0 (32 bytes BE) || ...)
 *      leaf        = keccak256(0x00 || lockId || payoutsHash)
 *      node        = keccak256(0x01 || left || right)
 *
 *      Leaves sit in strictly ascending lock id order. Each level pairs nodes (2i, 2i + 1). A last
 *      node without a partner moves up unchanged. The root of one leaf is that leaf. A proof lists
 *      the siblings from the leaf up and skips the levels where the node moves up alone, so the
 *      verifier needs the leaf index and the leaf count.
 */
library OutcomeTree {
    /// @notice One payout of a lock: `amount` of the lock's token to `recipient`.
    struct Payout {
        address recipient;
        uint256 amount;
    }

    /// @notice Index and sibling path of one leaf.
    struct LeafProof {
        uint256 index;
        bytes32[] proof;
    }

    /// @notice A leaf named by its lock id and payouts hash, with its proof.
    struct Neighbour {
        bytes32 lockId;
        bytes32 payoutsHash;
        uint256 index;
        bytes32[] proof;
    }

    function payoutsHash(Payout[] calldata payouts) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < payouts.length; i++) {
            packed = abi.encodePacked(packed, payouts[i].recipient, payouts[i].amount);
        }
        return keccak256(packed);
    }

    function leafHash(bytes32 lockId, bytes32 payouts) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x00), lockId, payouts));
    }

    function nodeHash(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x01), left, right));
    }

    /// @notice Whether `leaf` sits at `index` of a `count`-leaf tree with `root`.
    function verify(bytes32 leaf, uint256 index, uint256 count, bytes32[] calldata proof, bytes32 root)
        internal
        pure
        returns (bool)
    {
        if (index >= count) return false;
        bytes32 node = leaf;
        uint256 used;
        for (uint256 n = count; n > 1; n = (n + 1) / 2) {
            if ((index ^ 1) < n) {
                if (used == proof.length) return false;
                bytes32 sibling = proof[used++];
                node = index % 2 == 0 ? nodeHash(node, sibling) : nodeHash(sibling, node);
            }
            index /= 2;
        }
        return used == proof.length && node == root;
    }

    /**
     * @notice Whether `lockId` is absent from the sorted `count`-leaf tree with `root`.
     * @dev Two neighbours: adjacent leaves with left.lockId < lockId < right.lockId. One neighbour:
     *      the first leaf with lockId below it, or the last leaf with lockId above it.
     */
    function verifyAbsent(bytes32 lockId, Neighbour[] calldata neighbours, uint256 count, bytes32 root)
        internal
        pure
        returns (bool)
    {
        if (neighbours.length == 2) {
            Neighbour calldata left = neighbours[0];
            Neighbour calldata right = neighbours[1];
            return right.index == left.index + 1 && left.lockId < lockId && lockId < right.lockId
                && _verifyNeighbour(left, count, root) && _verifyNeighbour(right, count, root);
        }
        if (neighbours.length == 1) {
            Neighbour calldata edge = neighbours[0];
            bool below = edge.index == 0 && lockId < edge.lockId;
            bool above = edge.index == count - 1 && edge.lockId < lockId;
            return (below || above) && _verifyNeighbour(edge, count, root);
        }
        return false;
    }

    function _verifyNeighbour(Neighbour calldata nb, uint256 count, bytes32 root) private pure returns (bool) {
        return verify(leafHash(nb.lockId, nb.payoutsHash), nb.index, count, nb.proof, root);
    }
}
