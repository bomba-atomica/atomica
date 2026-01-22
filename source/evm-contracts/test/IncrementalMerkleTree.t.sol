// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/IncrementalMerkleTree.sol";

contract IncrementalMerkleTreeTest is Test {
    IncrementalMerkleTree merkleTree;

    function setUp() public {
        merkleTree = new IncrementalMerkleTree();
    }

    function testConstructor() public view {
        assertEq(merkleTree.root(), bytes32(0));
        assertEq(merkleTree.leafCount(), 0);
        assertEq(merkleTree.TREE_HEIGHT(), 32);
    }

    function testInsertSingleLeaf() public {
        bytes32 leaf = keccak256("leaf1");

        (uint256 index, bytes32 newRoot) = merkleTree.insert(leaf);

        assertEq(index, 0, "First leaf index should be 0");
        assertTrue(newRoot != bytes32(0), "Root should be non-zero");
        assertEq(merkleTree.leafCount(), 1);
    }

    function testInsertMultipleLeaves() public {
        bytes32 leaf1 = keccak256("leaf1");
        bytes32 leaf2 = keccak256("leaf2");
        bytes32 leaf3 = keccak256("leaf3");

        merkleTree.insert(leaf1);
        merkleTree.insert(leaf2);
        merkleTree.insert(leaf3);

        assertEq(merkleTree.leafCount(), 3);
    }

    function testInsertZeroLeaf() public {
        vm.expectRevert("MerkleTree: zero leaf");
        merkleTree.insert(bytes32(0));
    }

    function testVerifySingleLeaf() public {
        bytes32 leaf = keccak256("test leaf");

        merkleTree.insert(leaf);

        bytes32[] memory proof = new bytes32[](0);
        bool isValid = merkleTree.verify(leaf, proof, merkleTree.root());

        assertTrue(isValid, "Single leaf should verify");
    }

    function testVerifyWithProof() public {
        bytes32 leaf1 = keccak256("leaf1");
        bytes32 leaf2 = keccak256("leaf2");
        bytes32 leaf3 = keccak256("leaf3");

        merkleTree.insert(leaf1);
        merkleTree.insert(leaf2);
        merkleTree.insert(leaf3);

        bytes32[] memory proof = new bytes32[](32);

        bytes32 currentHash = leaf2;
        uint256 index = 1;

        for (uint8 i = 0; i < 32; i++) {
            uint256 branchBit = (index >> i) & 1;
            bytes32 siblingHash = merkleTree.branch(i);

            if (branchBit == 0) {
                currentHash = _hashPair(currentHash, siblingHash);
            } else {
                currentHash = _hashPair(siblingHash, currentHash);
            }

            proof[i] = siblingHash;
        }

        bool isValid = merkleTree.verify(leaf2, proof, merkleTree.root());

        assertTrue(isValid, "Proof should verify");
    }

    function testVerifyWrongProof() public {
        bytes32 leaf1 = keccak256("leaf1");
        bytes32 leaf2 = keccak256("leaf2");

        merkleTree.insert(leaf1);
        merkleTree.insert(leaf2);

        bytes32[] memory wrongProof = new bytes32[](1);
        wrongProof[0] = keccak256("wrong sibling");

        bool isValid = merkleTree.verify(leaf2, wrongProof, merkleTree.root());

        assertTrue(!isValid, "Wrong proof should not verify");
    }

    function testBatchInsert() public {
        bytes32[] memory leaves = new bytes32[](4);
        leaves[0] = keccak256("leaf0");
        leaves[1] = keccak256("leaf1");
        leaves[2] = keccak256("leaf2");
        leaves[3] = keccak256("leaf3");

        merkleTree.batchInsert(leaves);

        assertEq(merkleTree.leafCount(), 4);
    }

    function testGetState() public view {
        bytes32 leaf = keccak256("test");
        merkleTree.insert(leaf);

        (bytes32 root, uint256 count, bytes32[TREE_HEIGHT] memory branch) = merkleTree
            .getState();

        assertEq(root, merkleTree.root());
        assertEq(count, 1);
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        if (a < b) {
            return keccak256(abi.encodePacked(a, b));
        }
        return keccak256(abi.encodePacked(b, a));
    }
}
