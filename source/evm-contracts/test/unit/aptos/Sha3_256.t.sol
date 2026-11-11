// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Sha3_256} from "../../../src/aptos/Sha3_256.sol";
import {AptosVectors} from "./AptosVectors.sol";

/// @notice SHA3-256 against NIST FIPS 202 values and the Aptos CryptoHasher seeds in the golden vectors.
contract Sha3_256Test is Test, AptosVectors {
    function test_empty() public pure {
        assertEq(Sha3_256.hash(""), 0xa7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a);
    }

    function test_abc() public pure {
        assertEq(Sha3_256.hash("abc"), 0x3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532);
    }

    /// NIST SHA3-256 1600-bit message: 200 bytes of 0xa3.
    function test_200Bytes() public pure {
        assertEq(Sha3_256.hash(_repeat(0xa3, 200)), 0x79f38adec5c20307a98ef76e8324afbfd46cfd81b22e3973c65fa1bd9de31787);
    }

    /// 1000 bytes of 0xa3: eight blocks, the last one partial.
    function test_1000Bytes() public pure {
        assertEq(Sha3_256.hash(_repeat(0xa3, 1000)), 0x137072f2e5c641ea008ed29fc0e34adc170d0b62ae58072a880e2d38500b25ee);
    }

    /// The padding edges: one byte short of a block, exactly a block, one byte over.
    function test_blockBoundaries() public pure {
        assertEq(Sha3_256.hash(new bytes(135)), 0x7d080d7ba978a75c8a7d1f9be566c859084509c9c2b4928435c225d5777d98e3);
        assertEq(Sha3_256.hash(new bytes(136)), 0xe772c9cf9eb9c991cdfcf125001b454fdbc0a95f188d1b4c844aa032ad6e075e);
        assertEq(Sha3_256.hash(new bytes(137)), 0x9ed57188470a83b758cd71c00c6cc3beb984b36a6c35864b4e53017b24cf5699);
    }

    /// Every CryptoHasher seed in the golden vectors is SHA3-256 of its salt.
    function test_goldenHasherSeeds() public view {
        for (uint256 i = 0; i < 5; i++) {
            string memory p = string.concat(".hasher_seeds[", vm.toString(i), "]");
            string memory salt = vm.parseJsonString(vectors, string.concat(p, ".salt"));
            bytes32 seed = _b32(string.concat(p, ".seed"));
            assertEq(Sha3_256.hash(bytes(salt)), seed, salt);
        }
    }

    function test_hashNodeMatchesHash() public pure {
        bytes32 s = keccak256("s");
        bytes32 l = keccak256("l");
        bytes32 r = keccak256("r");
        assertEq(Sha3_256.hashNode(s, l, r), Sha3_256.hash(abi.encodePacked(s, l, r)));
    }

    function _repeat(uint8 b, uint256 n) internal pure returns (bytes memory out) {
        out = new bytes(n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = bytes1(b);
        }
    }
}
