// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OutcomeTree} from "../../src/escrow/OutcomeTree.sol";

/**
 * @title OutcomeTreeBuilder
 * @notice Test-side builder of the outcome tree that `OutcomeTree` verifies, and the BCS of the
 *         Aptos `AuctionOutcome` event that commits to its root.
 */
library OutcomeTreeBuilder {
    /// @notice One leaf before hashing.
    struct Entry {
        bytes32 lockId;
        OutcomeTree.Payout[] payouts;
    }

    function payoutsHash(OutcomeTree.Payout[] memory payouts) internal pure returns (bytes32) {
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

    /// @notice Sorts lock ids ascending (insertion sort) and returns the permutation.
    function sortedOrder(bytes32[] memory lockIds) internal pure returns (uint256[] memory order) {
        order = new uint256[](lockIds.length);
        for (uint256 i = 0; i < lockIds.length; i++) {
            order[i] = i;
        }
        for (uint256 i = 1; i < order.length; i++) {
            uint256 cur = order[i];
            uint256 j = i;
            while (j > 0 && lockIds[order[j - 1]] > lockIds[cur]) {
                order[j] = order[j - 1];
                j--;
            }
            order[j] = cur;
        }
    }

    function root(bytes32[] memory leaves) internal pure returns (bytes32) {
        require(leaves.length > 0, "empty tree");
        bytes32[] memory level = leaves;
        while (level.length > 1) {
            level = _up(level);
        }
        return level[0];
    }

    function proof(bytes32[] memory leaves, uint256 index) internal pure returns (bytes32[] memory out) {
        bytes32[] memory path = new bytes32[](256);
        uint256 len;
        bytes32[] memory level = leaves;
        while (level.length > 1) {
            uint256 sibling = index ^ 1;
            if (sibling < level.length) path[len++] = level[sibling];
            level = _up(level);
            index /= 2;
        }
        out = new bytes32[](len);
        for (uint256 i = 0; i < len; i++) {
            out[i] = path[i];
        }
    }

    /// @notice BCS of `auction::AuctionOutcome` (layout pinned by the 201 golden vectors).
    function outcomeBcs(uint64 windowId, bytes32 pairHash, uint64 deadline, bytes32 treeRoot, uint64 leafCount)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(
            le64(windowId), uint8(32), pairHash, le64(deadline), uint8(32), treeRoot, le64(leafCount)
        );
    }

    function le64(uint64 v) internal pure returns (bytes8 out) {
        uint64 r;
        for (uint256 i = 0; i < 8; i++) {
            r = (r << 8) | ((v >> (8 * i)) & 0xff);
        }
        out = bytes8(r);
    }

    function _up(bytes32[] memory level) private pure returns (bytes32[] memory next) {
        next = new bytes32[]((level.length + 1) / 2);
        for (uint256 i = 0; i < level.length; i += 2) {
            next[i / 2] = i + 1 < level.length ? nodeHash(level[i], level[i + 1]) : level[i];
        }
    }
}
