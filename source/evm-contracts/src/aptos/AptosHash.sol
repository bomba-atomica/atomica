// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Sha3_256} from "./Sha3_256.sol";

/**
 * @title AptosHash
 * @notice Aptos CryptoHasher hashing and Merkle accumulator proofs.
 * @dev An Aptos hash of a value is SHA3-256(seed || BCS(value)), where
 *      seed = SHA3-256("APTOS::" || type name). The seeds below are those SHA3-256 values.
 *      Sha3_256.t.sol checks each one against the golden vectors from atomica-aptos.
 */
library AptosHash {
    /// @notice An accumulator proof did not lead to the expected root.
    error AccumulatorRootMismatch();
    /// @notice An accumulator proof was deeper than Aptos allows, or its leaf index did not fit its depth.
    error AccumulatorProofTooDeep();

    /// SHA3-256("APTOS::LedgerInfo")
    bytes32 internal constant LEDGER_INFO_SEED = 0x98274d3a1dfd01624eb9df4f2fc4e34fa24f18334a0091ec93d0ea833e1fbaa2;
    /// SHA3-256("APTOS::TransactionInfo")
    bytes32 internal constant TRANSACTION_INFO_SEED =
        0xa7571b1ac557d1d3f9e884d79f9174c9ff81fd091502dfad0008455b39eca471;
    /// SHA3-256("APTOS::ContractEvent")
    bytes32 internal constant CONTRACT_EVENT_SEED = 0x38f46bbd4b520466a91d4166cd85fa9c3c83ac6993bf65f8d90bad19c5e2f661;
    /// SHA3-256("APTOS::TransactionAccumulator")
    bytes32 internal constant TRANSACTION_ACCUMULATOR_SEED =
        0x9d054c84c0d2c98b618a1a3247e9979a72229dbd162985a2a924144b8aad0327;
    /// SHA3-256("APTOS::EventAccumulator")
    bytes32 internal constant EVENT_ACCUMULATOR_SEED =
        0x4dbe0448340a3095e1696708e4be4e93f4956d1f9f5755292767ef8a1344ac36;
    /// SHA3-256("APTOS::Ledger2WaypointConverter")
    bytes32 internal constant WAYPOINT_SEED = 0x2539380256a7df4f1a22fa5d30cd72c123103ad06479987c44b58b4d7a20efdf;

    /// Aptos `MAX_ACCUMULATOR_PROOF_DEPTH`.
    uint256 internal constant MAX_ACCUMULATOR_PROOF_DEPTH = 63;

    /// @notice SHA3-256(seed || data).
    function hashWithSeed(bytes32 seed, bytes memory data) internal pure returns (bytes32) {
        return Sha3_256.hash(abi.encodePacked(seed, data));
    }

    /**
     * @notice Checks a Merkle accumulator proof, as Aptos `AccumulatorProof::verify` does.
     * @param nodeSeed The accumulator's internal node seed.
     * @param root The expected root hash.
     * @param leaf The leaf hash.
     * @param index The leaf index. It must fit in `siblings.length` bits, so one proof never
     *        proves two indexes.
     * @param siblings Sibling hashes from the leaf level up to the root.
     */
    function verifyAccumulator(bytes32 nodeSeed, bytes32 root, bytes32 leaf, uint256 index, bytes32[] memory siblings)
        internal
        pure
    {
        uint256 depth = siblings.length;
        if (depth > MAX_ACCUMULATOR_PROOF_DEPTH || (index >> depth) != 0) revert AccumulatorProofTooDeep();
        bytes32 h = leaf;
        for (uint256 i = 0; i < depth; i++) {
            if (index & 1 == 0) {
                h = Sha3_256.hashNode(nodeSeed, h, siblings[i]);
            } else {
                h = Sha3_256.hashNode(nodeSeed, siblings[i], h);
            }
            index >>= 1;
        }
        if (h != root) revert AccumulatorRootMismatch();
    }
}
