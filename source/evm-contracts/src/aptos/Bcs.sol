// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Bcs
 * @notice Bounds-checked readers for Aptos BCS (Binary Canonical Serialization) in memory.
 * @dev Each reader takes the buffer and a byte offset and returns the value and the next offset.
 *      Integers are little-endian. Sequence lengths are canonical ULEB128 of at most 2^31 - 1,
 *      as the Rust `bcs` crate requires.
 */
library Bcs {
    /// @notice The input ended before the value did.
    error BcsOutOfBounds();
    /// @notice A ULEB128 length was not canonical or was too large.
    error BcsBadLength();
    /// @notice A bool or Option tag was neither 0 nor 1.
    error BcsBadTag();

    uint256 internal constant MAX_SEQUENCE_LENGTH = (1 << 31) - 1;

    function _need(bytes memory b, uint256 off, uint256 n) private pure {
        if (off + n > b.length) revert BcsOutOfBounds();
    }

    /// @notice Reads one byte.
    function readU8(bytes memory b, uint256 off) internal pure returns (uint8 v, uint256 next) {
        _need(b, off, 1);
        v = uint8(b[off]);
        next = off + 1;
    }

    /// @notice Reads a little-endian u16.
    function readU16(bytes memory b, uint256 off) internal pure returns (uint16 v, uint256 next) {
        _need(b, off, 2);
        v = uint16(uint8(b[off])) | (uint16(uint8(b[off + 1])) << 8);
        next = off + 2;
    }

    /// @notice Reads a little-endian u64.
    function readU64(bytes memory b, uint256 off) internal pure returns (uint64 v, uint256 next) {
        _need(b, off, 8);
        uint256 w;
        assembly ("memory-safe") {
            w := shr(192, mload(add(add(b, 0x20), off)))
        }
        // Byte-swap the 8 bytes.
        w = ((w & 0xff00ff00ff00ff00) >> 8) | ((w & 0x00ff00ff00ff00ff) << 8);
        w = ((w & 0xffff0000ffff0000) >> 16) | ((w & 0x0000ffff0000ffff) << 16);
        w = (w >> 32) | ((w & 0xffffffff) << 32);
        v = uint64(w);
        next = off + 8;
    }

    /// @notice Reads 32 raw bytes, such as an Aptos HashValue or AccountAddress.
    function readBytes32(bytes memory b, uint256 off) internal pure returns (bytes32 v, uint256 next) {
        _need(b, off, 32);
        assembly ("memory-safe") {
            v := mload(add(add(b, 0x20), off))
        }
        next = off + 32;
    }

    /// @notice Reads a canonical ULEB128 sequence length.
    function readLength(bytes memory b, uint256 off) internal pure returns (uint256 v, uint256 next) {
        uint256 shift;
        while (true) {
            _need(b, off, 1);
            uint256 byt = uint8(b[off]);
            off++;
            v |= (byt & 0x7f) << shift;
            if (byt & 0x80 == 0) {
                // A last byte of zero after the first byte is a non-canonical encoding.
                if (byt == 0 && shift != 0) revert BcsBadLength();
                break;
            }
            shift += 7;
            if (shift > 28) revert BcsBadLength();
        }
        if (v > MAX_SEQUENCE_LENGTH) revert BcsBadLength();
        next = off;
    }

    /// @notice Reads an Option tag and returns whether a value follows.
    function readOptionTag(bytes memory b, uint256 off) internal pure returns (bool some, uint256 next) {
        uint8 tag;
        (tag, next) = readU8(b, off);
        if (tag > 1) revert BcsBadTag();
        some = tag == 1;
    }

    /// @notice Reads a length-prefixed byte vector and returns its start offset and length.
    function readBytesRange(bytes memory b, uint256 off)
        internal
        pure
        returns (uint256 start, uint256 len, uint256 next)
    {
        (len, start) = readLength(b, off);
        _need(b, start, len);
        next = start + len;
    }

    /// @notice Copies `len` bytes from `off` into a new buffer.
    function slice(bytes memory b, uint256 off, uint256 len) internal pure returns (bytes memory out) {
        _need(b, off, len);
        out = new bytes(len);
        assembly ("memory-safe") {
            mcopy(add(out, 0x20), add(add(b, 0x20), off), len)
        }
    }

    /// @notice keccak256 of `len` bytes at `off`, without a copy.
    function keccakRange(bytes memory b, uint256 off, uint256 len) internal pure returns (bytes32 h) {
        _need(b, off, len);
        assembly ("memory-safe") {
            h := keccak256(add(add(b, 0x20), off), len)
        }
    }

    /// @notice Whether `len` bytes at `off` equal `expected`.
    function rangeEquals(bytes memory b, uint256 off, bytes memory expected) internal pure returns (bool) {
        if (off + expected.length > b.length) return false;
        return keccakRange(b, off, expected.length) == keccak256(expected);
    }

    /// @notice Reverts unless `off` is the end of the buffer (no trailing bytes).
    function requireEnd(bytes memory b, uint256 off) internal pure {
        if (off != b.length) revert BcsOutOfBounds();
    }
}
