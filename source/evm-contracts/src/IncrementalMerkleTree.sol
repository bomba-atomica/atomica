// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract IncrementalMerkleTree is Ownable {
    uint8 public constant TREE_HEIGHT = 32;
    uint256 public constant MAX_LEAVES = 2**TREE_HEIGHT;

    bytes32[TREE_HEIGHT] public branch;
    uint256 public leafCount;
    bytes32 public root;
    uint256 public lastUpdatedBlock;

    event LeafAdded(bytes32 leaf, uint256 index, bytes32 newRoot);
    event TreeReset(bytes32 newRoot);

    constructor() {
        branch[TREE_HEIGHT - 1] = bytes32(0);
        root = bytes32(0);
        leafCount = 0;
    }

    function insert(bytes32 leaf) external onlyOwner returns (uint256 index, bytes32 newRoot) {
        require(leafCount < MAX_LEAVES, "MerkleTree: tree is full");
        require(leaf != bytes32(0), "MerkleTree: zero leaf");

        index = leafCount;
        bytes32 currentHash = leaf;

        for (uint8 i = 0; i < TREE_HEIGHT; i++) {
            uint256 branchBit = (index >> i) & 1;
            bytes32 siblingHash = branch[i];

            if (branchBit == 0) {
                currentHash = _hashPair(currentHash, siblingHash);
            } else {
                currentHash = _hashPair(siblingHash, currentHash);
            }

            branch[i] = currentHash;
        }

        root = currentHash;
        leafCount++;
        lastUpdatedBlock = block.number;

        emit LeafAdded(leaf, index, newRoot);
    }

    function batchInsert(bytes32[] calldata leaves) external onlyOwner {
        for (uint256 i = 0; i < leaves.length; i++) {
            insert(leaves[i]);
        }
    }

    function verify(
        bytes32 leaf,
        bytes32[] calldata proof,
        bytes32 expectedRoot
    ) external pure returns (bool) {
        bytes32 computedHash = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];

            if (computedHash < proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }

        return computedHash == expectedRoot;
    }

    function verifyProof(
        bytes32 leaf,
        bytes32[] calldata proof,
        uint256 leafIndex,
        bytes32 expectedRoot
    ) external pure returns (bool) {
        require(proof.length == TREE_HEIGHT, "MerkleTree: invalid proof length");

        bytes32 computedHash = leaf;

        for (uint8 i = 0; i < TREE_HEIGHT; i++) {
            bytes32 proofElement = proof[i];
            uint256 proofBit = (leafIndex >> i) & 1;

            if (proofBit == 0) {
                computedHash = _hashPair(computedHash, proofElement);
            } else {
                computedHash = _hashPair(proofElement, computedHash);
            }
        }

        return computedHash == expectedRoot;
    }

    function getState()
        external
        view
        returns (
            bytes32 currentRoot,
            uint256 currentLeafCount,
            bytes32[TREE_HEIGHT] memory currentBranch
        )
    {
        return (root, leafCount, branch);
    }

    function getProof(uint256 leafIndex)
        external
        view
        returns (bytes32[] memory proof)
    {
        require(leafIndex < leafCount, "MerkleTree: invalid leaf index");

        proof = new bytes32[](TREE_HEIGHT);
        bytes32 currentHash = bytes32(0);

        for (uint8 i = 0; i < TREE_HEIGHT; i++) {
            uint256 branchBit = (leafIndex >> i) & 1;
            proof[i] = branch[i];
        }

        return proof;
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        if (a < b) {
            return keccak256(abi.encodePacked(a, b));
        }
        return keccak256(abi.encodePacked(b, a));
    }
}
