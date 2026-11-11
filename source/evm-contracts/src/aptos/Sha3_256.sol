// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Sha3_256
 * @notice FIPS 202 SHA3-256 for the EVM.
 * @dev The EVM KECCAK256 opcode uses the original Keccak padding (0x01). Aptos hashes with
 *      SHA3-256, which pads with 0x06. This library runs Keccak-f[1600] in Yul with SHA3 padding.
 *      Lanes are 64-bit little-endian words, held one per 256-bit memory word.
 *      Scratch memory past the free memory pointer holds the state (A), the rho/pi buffer (B),
 *      the round constants and the padded last block. It is never claimed, so it is memory-safe.
 */
library Sha3_256 {
    /// @notice SHA3-256 of `data`.
    function hash(bytes memory data) internal pure returns (bytes32 digest) {
        uint256 ptr;
        uint256 len = data.length;
        assembly ("memory-safe") {
            ptr := add(data, 0x20)
        }
        digest = hashMemory(ptr, len);
    }

    /// @notice SHA3-256 of `seed || left || right`, the Aptos accumulator node hash.
    function hashNode(bytes32 seed, bytes32 left, bytes32 right) internal pure returns (bytes32 digest) {
        uint256 ptr;
        assembly ("memory-safe") {
            ptr := mload(0x40)
            mstore(ptr, seed)
            mstore(add(ptr, 0x20), left)
            mstore(add(ptr, 0x40), right)
            mstore(0x40, add(ptr, 0x60))
        }
        digest = hashMemory(ptr, 0x60);
    }

    /// @notice SHA3-256 of `len` bytes of memory at `ptr`. The bytes must sit below the free memory pointer.
    function hashMemory(uint256 ptr, uint256 len) internal pure returns (bytes32 digest) {
        assembly ("memory-safe") {
            // Reverses the byte order inside each 64-bit lane of a 256-bit word.
            function bswap64x4(w) -> v {
                v := or(
                    shr(8, and(w, 0xff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00)),
                    shl(8, and(w, 0x00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff))
                )
                v := or(
                    shr(16, and(v, 0xffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000)),
                    shl(16, and(v, 0x0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff))
                )
                v := or(
                    shr(32, and(v, 0xffffffff00000000ffffffff00000000ffffffff00000000ffffffff00000000)),
                    shl(32, and(v, 0x00000000ffffffff00000000ffffffff00000000ffffffff00000000ffffffff))
                )
            }

            // XORs one 136-byte block at p into the first 17 lanes.
            function absorb(a, p) {
                let m := 0xffffffffffffffff
                for { let k := 0 } lt(k, 4) { k := add(k, 1) } {
                    let w := bswap64x4(mload(add(p, shl(5, k))))
                    let l := add(a, shl(7, k))
                    mstore(l, xor(mload(l), shr(192, w)))
                    mstore(add(l, 0x20), xor(mload(add(l, 0x20)), and(shr(128, w), m)))
                    mstore(add(l, 0x40), xor(mload(add(l, 0x40)), and(shr(64, w), m)))
                    mstore(add(l, 0x60), xor(mload(add(l, 0x60)), and(w, m)))
                }
                let l16 := add(a, 0x200)
                mstore(l16, xor(mload(l16), shr(192, bswap64x4(mload(add(p, 0x80))))))
            }

            // Keccak-f[1600]: 24 rounds of theta, rho, pi, chi and iota.
            function permute(a, b, rc) {
                let t := 0
                for { let i := 0 } lt(i, 24) { i := add(i, 1) } {
                    let c0 :=
                        xor(
                            xor(xor(xor(mload(a), mload(add(a, 0xa0))), mload(add(a, 0x140))), mload(add(a, 0x1e0))),
                            mload(add(a, 0x280))
                        )
                    let c1 :=
                        xor(
                            xor(
                                xor(xor(mload(add(a, 0x20)), mload(add(a, 0xc0))), mload(add(a, 0x160))),
                                mload(add(a, 0x200))
                            ),
                            mload(add(a, 0x2a0))
                        )
                    let c2 :=
                        xor(
                            xor(
                                xor(xor(mload(add(a, 0x40)), mload(add(a, 0xe0))), mload(add(a, 0x180))),
                                mload(add(a, 0x220))
                            ),
                            mload(add(a, 0x2c0))
                        )
                    let c3 :=
                        xor(
                            xor(
                                xor(xor(mload(add(a, 0x60)), mload(add(a, 0x100))), mload(add(a, 0x1a0))),
                                mload(add(a, 0x240))
                            ),
                            mload(add(a, 0x2e0))
                        )
                    let c4 :=
                        xor(
                            xor(
                                xor(xor(mload(add(a, 0x80)), mload(add(a, 0x120))), mload(add(a, 0x1c0))),
                                mload(add(a, 0x260))
                            ),
                            mload(add(a, 0x300))
                        )
                    let d0 := xor(c4, and(or(shl(1, c1), shr(63, c1)), 0xffffffffffffffff))
                    let d1 := xor(c0, and(or(shl(1, c2), shr(63, c2)), 0xffffffffffffffff))
                    let d2 := xor(c1, and(or(shl(1, c3), shr(63, c3)), 0xffffffffffffffff))
                    let d3 := xor(c2, and(or(shl(1, c4), shr(63, c4)), 0xffffffffffffffff))
                    let d4 := xor(c3, and(or(shl(1, c0), shr(63, c0)), 0xffffffffffffffff))
                    mstore(b, xor(mload(a), d0))
                    t := xor(mload(add(a, 0x20)), d1)
                    mstore(add(b, 0x140), and(or(shl(1, t), shr(63, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x40)), d2)
                    mstore(add(b, 0x280), and(or(shl(62, t), shr(2, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x60)), d3)
                    mstore(add(b, 0xa0), and(or(shl(28, t), shr(36, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x80)), d4)
                    mstore(add(b, 0x1e0), and(or(shl(27, t), shr(37, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0xa0)), d0)
                    mstore(add(b, 0x200), and(or(shl(36, t), shr(28, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0xc0)), d1)
                    mstore(add(b, 0x20), and(or(shl(44, t), shr(20, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0xe0)), d2)
                    mstore(add(b, 0x160), and(or(shl(6, t), shr(58, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x100)), d3)
                    mstore(add(b, 0x2a0), and(or(shl(55, t), shr(9, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x120)), d4)
                    mstore(add(b, 0xc0), and(or(shl(20, t), shr(44, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x140)), d0)
                    mstore(add(b, 0xe0), and(or(shl(3, t), shr(61, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x160)), d1)
                    mstore(add(b, 0x220), and(or(shl(10, t), shr(54, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x180)), d2)
                    mstore(add(b, 0x40), and(or(shl(43, t), shr(21, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x1a0)), d3)
                    mstore(add(b, 0x180), and(or(shl(25, t), shr(39, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x1c0)), d4)
                    mstore(add(b, 0x2c0), and(or(shl(39, t), shr(25, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x1e0)), d0)
                    mstore(add(b, 0x2e0), and(or(shl(41, t), shr(23, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x200)), d1)
                    mstore(add(b, 0x100), and(or(shl(45, t), shr(19, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x220)), d2)
                    mstore(add(b, 0x240), and(or(shl(15, t), shr(49, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x240)), d3)
                    mstore(add(b, 0x60), and(or(shl(21, t), shr(43, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x260)), d4)
                    mstore(add(b, 0x1a0), and(or(shl(8, t), shr(56, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x280)), d0)
                    mstore(add(b, 0x1c0), and(or(shl(18, t), shr(46, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x2a0)), d1)
                    mstore(add(b, 0x300), and(or(shl(2, t), shr(62, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x2c0)), d2)
                    mstore(add(b, 0x120), and(or(shl(61, t), shr(3, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x2e0)), d3)
                    mstore(add(b, 0x260), and(or(shl(56, t), shr(8, t)), 0xffffffffffffffff))
                    t := xor(mload(add(a, 0x300)), d4)
                    mstore(add(b, 0x80), and(or(shl(14, t), shr(50, t)), 0xffffffffffffffff))
                    c0 := mload(b)
                    c1 := mload(add(b, 0x20))
                    c2 := mload(add(b, 0x40))
                    c3 := mload(add(b, 0x60))
                    c4 := mload(add(b, 0x80))
                    mstore(a, xor(c0, and(not(c1), c2)))
                    mstore(add(a, 0x20), xor(c1, and(not(c2), c3)))
                    mstore(add(a, 0x40), xor(c2, and(not(c3), c4)))
                    mstore(add(a, 0x60), xor(c3, and(not(c4), c0)))
                    mstore(add(a, 0x80), xor(c4, and(not(c0), c1)))
                    c0 := mload(add(b, 0xa0))
                    c1 := mload(add(b, 0xc0))
                    c2 := mload(add(b, 0xe0))
                    c3 := mload(add(b, 0x100))
                    c4 := mload(add(b, 0x120))
                    mstore(add(a, 0xa0), xor(c0, and(not(c1), c2)))
                    mstore(add(a, 0xc0), xor(c1, and(not(c2), c3)))
                    mstore(add(a, 0xe0), xor(c2, and(not(c3), c4)))
                    mstore(add(a, 0x100), xor(c3, and(not(c4), c0)))
                    mstore(add(a, 0x120), xor(c4, and(not(c0), c1)))
                    c0 := mload(add(b, 0x140))
                    c1 := mload(add(b, 0x160))
                    c2 := mload(add(b, 0x180))
                    c3 := mload(add(b, 0x1a0))
                    c4 := mload(add(b, 0x1c0))
                    mstore(add(a, 0x140), xor(c0, and(not(c1), c2)))
                    mstore(add(a, 0x160), xor(c1, and(not(c2), c3)))
                    mstore(add(a, 0x180), xor(c2, and(not(c3), c4)))
                    mstore(add(a, 0x1a0), xor(c3, and(not(c4), c0)))
                    mstore(add(a, 0x1c0), xor(c4, and(not(c0), c1)))
                    c0 := mload(add(b, 0x1e0))
                    c1 := mload(add(b, 0x200))
                    c2 := mload(add(b, 0x220))
                    c3 := mload(add(b, 0x240))
                    c4 := mload(add(b, 0x260))
                    mstore(add(a, 0x1e0), xor(c0, and(not(c1), c2)))
                    mstore(add(a, 0x200), xor(c1, and(not(c2), c3)))
                    mstore(add(a, 0x220), xor(c2, and(not(c3), c4)))
                    mstore(add(a, 0x240), xor(c3, and(not(c4), c0)))
                    mstore(add(a, 0x260), xor(c4, and(not(c0), c1)))
                    c0 := mload(add(b, 0x280))
                    c1 := mload(add(b, 0x2a0))
                    c2 := mload(add(b, 0x2c0))
                    c3 := mload(add(b, 0x2e0))
                    c4 := mload(add(b, 0x300))
                    mstore(add(a, 0x280), xor(c0, and(not(c1), c2)))
                    mstore(add(a, 0x2a0), xor(c1, and(not(c2), c3)))
                    mstore(add(a, 0x2c0), xor(c2, and(not(c3), c4)))
                    mstore(add(a, 0x2e0), xor(c3, and(not(c4), c0)))
                    mstore(add(a, 0x300), xor(c4, and(not(c0), c1)))
                    mstore(a, xor(mload(a), mload(add(rc, shl(5, i)))))
                }
            }

            let a := mload(0x40)
            let b := add(a, 0x320)
            let rc := add(b, 0x320)
            let pad := add(rc, 0x300)
            for { let i := 0 } lt(i, 25) { i := add(i, 1) } {
                mstore(add(a, shl(5, i)), 0)
            }
            mstore(add(rc, 0), 0x0000000000000001)
            mstore(add(rc, 0x20), 0x0000000000008082)
            mstore(add(rc, 0x40), 0x800000000000808a)
            mstore(add(rc, 0x60), 0x8000000080008000)
            mstore(add(rc, 0x80), 0x000000000000808b)
            mstore(add(rc, 0xa0), 0x0000000080000001)
            mstore(add(rc, 0xc0), 0x8000000080008081)
            mstore(add(rc, 0xe0), 0x8000000000008009)
            mstore(add(rc, 0x100), 0x000000000000008a)
            mstore(add(rc, 0x120), 0x0000000000000088)
            mstore(add(rc, 0x140), 0x0000000080008009)
            mstore(add(rc, 0x160), 0x000000008000000a)
            mstore(add(rc, 0x180), 0x000000008000808b)
            mstore(add(rc, 0x1a0), 0x800000000000008b)
            mstore(add(rc, 0x1c0), 0x8000000000008089)
            mstore(add(rc, 0x1e0), 0x8000000000008003)
            mstore(add(rc, 0x200), 0x8000000000008002)
            mstore(add(rc, 0x220), 0x8000000000000080)
            mstore(add(rc, 0x240), 0x000000000000800a)
            mstore(add(rc, 0x260), 0x800000008000000a)
            mstore(add(rc, 0x280), 0x8000000080008081)
            mstore(add(rc, 0x2a0), 0x8000000000008080)
            mstore(add(rc, 0x2c0), 0x0000000080000001)
            mstore(add(rc, 0x2e0), 0x8000000080008008)

            // Full blocks.
            for {} iszero(lt(len, 136)) {} {
                absorb(a, ptr)
                permute(a, b, rc)
                ptr := add(ptr, 136)
                len := sub(len, 136)
            }

            // Last block: the remaining bytes, then SHA3 padding 0x06 ... 0x80.
            mstore(pad, 0)
            mstore(add(pad, 0x20), 0)
            mstore(add(pad, 0x40), 0)
            mstore(add(pad, 0x60), 0)
            mstore(add(pad, 0x80), 0)
            mcopy(pad, ptr, len)
            mstore8(add(pad, len), 0x06)
            mstore8(add(pad, 135), or(byte(0, mload(add(pad, 135))), 0x80))
            absorb(a, pad)
            permute(a, b, rc)

            digest := bswap64x4(
                or(
                    or(shl(192, mload(a)), shl(128, mload(add(a, 0x20)))),
                    or(shl(64, mload(add(a, 0x40))), mload(add(a, 0x60)))
                )
            )
        }
    }
}
