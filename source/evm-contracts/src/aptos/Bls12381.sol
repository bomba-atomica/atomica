// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Bls12381
 * @notice Aptos BLS12-381 multi-signature verification with the EIP-2537 precompiles (Prague).
 * @dev Aptos uses the min-pk scheme with proof of possession: 48-byte G1 public keys and 96-byte
 *      G2 signatures, hashed to G2 under `BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_`.
 *
 *      The EVM has no point decompression, so callers supply each key and the signature in the
 *      EIP-2537 uncompressed encoding and this library checks that it matches the ZCash
 *      compressed bytes that the validators signed over: the x coordinate, the compression and
 *      infinity flags, and the sign flag of y. The precompiles then reject any coordinate that is
 *      not a canonical field element or not on the curve, and PAIRING checks subgroup membership.
 *
 *      Encodings:
 *      - G1 compressed: 48 bytes, flags in the top 3 bits (0x80 compressed, 0x40 infinity, 0x20 sign).
 *      - G2 compressed: x.c1 || x.c0, 96 bytes, flags in the top 3 bits of x.c1.
 *      - EIP-2537 G1: x || y, each 64 bytes (16 zero bytes, then 48 big-endian bytes).
 *      - EIP-2537 G2: x.c0 || x.c1 || y.c0 || y.c1, each 64 bytes.
 */
library Bls12381 {
    /// @notice An uncompressed public key does not match its compressed form.
    error KeyEncodingMismatch(uint256 index);
    /// @notice The uncompressed signature does not match its compressed form.
    error SignatureEncodingMismatch();
    /// @notice A buffer had the wrong length.
    error BadEncodingLength();
    /// @notice A precompile call failed, for example on a point that is not on the curve.
    error PrecompileFailed(address precompile);
    /// @notice The pairing check failed: the signature is not valid for the key and message.
    error InvalidSignature();

    address internal constant SHA256 = address(0x02);
    address internal constant MODEXP = address(0x05);
    address internal constant G1ADD = address(0x0b);
    address internal constant G2ADD = address(0x0d);
    address internal constant PAIRING = address(0x0f);
    address internal constant MAP_FP2_TO_G2 = address(0x11);

    bytes internal constant DST = "BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_";

    // Field modulus p, split into its top 128 bits and low 256 bits.
    uint256 private constant P_HI = 0x1a0111ea397fe69a4b1ba7b6434bacd7;
    uint256 private constant P_LO = 0x64774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab;
    // (p - 1) / 2: y is "lexicographically largest" (sign flag set) when y > (p - 1) / 2.
    uint256 private constant HALF_HI = 0x0d0088f51cbff34d258dd3db21a5d66b;
    uint256 private constant HALF_LO = 0xb23ba5c279c2895fb39869507b587b120f55ffff58a9ffffdcff7fffffffd555;
    // The G1 generator with y negated.
    uint256 private constant G1_X_HI = 0x17f1d3a73197d7942695638c4fa9ac0f;
    uint256 private constant G1_X_LO = 0xc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb;
    uint256 private constant G1_NEG_Y_HI = 0x114d1d6855d545a8aa7d76c8cf2e21f2;
    uint256 private constant G1_NEG_Y_LO = 0x67816aef1db507c96655b9d5caac42364e6f38ba0ecb751bad54dcd6b939c2ca;

    uint256 private constant FLAGS_SHIFT = 125;
    uint256 private constant X_HI_MASK = (1 << 125) - 1;
    uint256 private constant FLAG_COMPRESSED = 4;
    uint256 private constant FLAG_INFINITY = 2;
    uint256 private constant FLAG_SIGN = 1;

    /**
     * @notice Verifies an aggregate signature by several signers on one message.
     * @param compressedKeys The signers' 48-byte compressed keys, concatenated.
     * @param keys The same keys in EIP-2537 encoding, 128 bytes each, in the same order.
     * @param message The signed bytes.
     * @param compressedSig The 96-byte compressed aggregate signature.
     * @param sig The same signature in EIP-2537 encoding, 256 bytes.
     */
    function verifyAggregate(
        bytes memory compressedKeys,
        bytes memory keys,
        bytes memory message,
        bytes memory compressedSig,
        bytes memory sig
    ) internal view {
        bytes memory aggregateKey = aggregateKeys(compressedKeys, keys);
        checkSignatureEncoding(compressedSig, sig);
        bytes memory hm = hashToG2(message);
        if (!pairingCheck(aggregateKey, hm, sig)) revert InvalidSignature();
    }

    /**
     * @notice Checks every uncompressed key against its compressed form and sums the keys with G1ADD.
     * @return sum The aggregate key in EIP-2537 encoding.
     */
    function aggregateKeys(bytes memory compressedKeys, bytes memory keys) internal view returns (bytes memory sum) {
        uint256 n = compressedKeys.length / 48;
        if (n == 0 || compressedKeys.length != n * 48 || keys.length != n * 128) revert BadEncodingLength();
        for (uint256 i = 0; i < n; i++) {
            if (!_g1Matches(compressedKeys, i * 48, keys, i * 128)) revert KeyEncodingMismatch(i);
        }
        sum = new bytes(128);
        bool ok = true;
        assembly ("memory-safe") {
            let out := add(sum, 0x20)
            let src := add(keys, 0x20)
            mcopy(out, src, 128)
            let buf := mload(0x40)
            for { let i := 1 } lt(i, n) { i := add(i, 1) } {
                mcopy(buf, out, 128)
                mcopy(add(buf, 128), add(src, mul(i, 128)), 128)
                if iszero(staticcall(gas(), 0x0b, buf, 256, out, 128)) {
                    ok := 0
                    break
                }
            }
        }
        if (!ok) revert PrecompileFailed(G1ADD);
    }

    /// @notice Reverts unless the 256-byte signature matches its 96-byte compressed form.
    function checkSignatureEncoding(bytes memory compressedSig, bytes memory sig) internal pure {
        if (compressedSig.length != 96 || sig.length != 256) revert BadEncodingLength();
        uint256 c1Hi;
        uint256 c1Lo;
        uint256 c0Hi;
        uint256 c0Lo;
        uint256 x0Hi;
        uint256 x0Lo;
        uint256 x1Hi;
        uint256 x1Lo;
        uint256 y0Hi;
        uint256 y0Lo;
        uint256 y1Hi;
        uint256 y1Lo;
        assembly ("memory-safe") {
            let c := add(compressedSig, 0x20)
            c1Hi := shr(128, mload(c))
            c1Lo := mload(add(c, 16))
            c0Hi := shr(128, mload(add(c, 48)))
            c0Lo := mload(add(c, 64))
            let s := add(sig, 0x20)
            x0Hi := mload(s)
            x0Lo := mload(add(s, 0x20))
            x1Hi := mload(add(s, 0x40))
            x1Lo := mload(add(s, 0x60))
            y0Hi := mload(add(s, 0x80))
            y0Lo := mload(add(s, 0xa0))
            y1Hi := mload(add(s, 0xc0))
            y1Lo := mload(add(s, 0xe0))
        }
        uint256 flags = c1Hi >> FLAGS_SHIFT;
        // y.c1 decides the sign unless it is zero, then y.c0 decides (ZCash "lexicographically largest").
        bool sign = (y1Hi | y1Lo) != 0 ? _gtHalf(y1Hi, y1Lo) : _gtHalf(y0Hi, y0Lo);
        if (
            flags & FLAG_COMPRESSED == 0 || flags & FLAG_INFINITY != 0 || (flags & FLAG_SIGN != 0) != sign
                || (c1Hi & X_HI_MASK) != x1Hi || c1Lo != x1Lo || c0Hi != x0Hi || c0Lo != x0Lo
        ) revert SignatureEncodingMismatch();
    }

    /**
     * @notice RFC 9380 hash_to_curve for G2 with expand_message_xmd (SHA-256) and the Aptos DST.
     * @return point The hashed point in EIP-2537 encoding, 256 bytes.
     */
    function hashToG2(bytes memory message) internal view returns (bytes memory point) {
        bytes memory uniform = expandMessageXmd(message);
        bytes memory u = new bytes(256);
        _modP(uniform, 0, u, 0);
        _modP(uniform, 64, u, 64);
        _modP(uniform, 128, u, 128);
        _modP(uniform, 192, u, 192);
        point = new bytes(256);
        bool ok;
        assembly ("memory-safe") {
            let buf := mload(0x40)
            let up := add(u, 0x20)
            ok := staticcall(gas(), 0x11, up, 128, buf, 256)
            if ok { ok := staticcall(gas(), 0x11, add(up, 128), 128, add(buf, 256), 256) }
            if ok { ok := staticcall(gas(), 0x0d, buf, 512, add(point, 0x20), 256) }
        }
        if (!ok) revert PrecompileFailed(MAP_FP2_TO_G2);
    }

    /// @notice RFC 9380 expand_message_xmd with SHA-256, 256 output bytes, DST `DST`.
    function expandMessageXmd(bytes memory message) internal view returns (bytes memory out) {
        bytes memory dstPrime = abi.encodePacked(DST, uint8(DST.length));
        // msg_prime = Z_pad (64 zero bytes) || msg || I2OSP(256, 2) || I2OSP(0, 1) || DST_prime
        bytes32 b0 = _sha256(abi.encodePacked(bytes32(0), bytes32(0), message, uint16(256), uint8(0), dstPrime));
        out = new bytes(256);
        bytes32 bi = _sha256(abi.encodePacked(b0, uint8(1), dstPrime));
        assembly ("memory-safe") {
            mstore(add(out, 0x20), bi)
        }
        for (uint256 i = 2; i <= 8; i++) {
            bi = _sha256(abi.encodePacked(b0 ^ bi, uint8(i), dstPrime));
            assembly ("memory-safe") {
                mstore(add(out, mul(i, 0x20)), bi)
            }
        }
    }

    /// @notice e(aggregateKey, hm) == e(G1, sig), checked as one PAIRING call with -G1.
    function pairingCheck(bytes memory aggregateKey, bytes memory hm, bytes memory sig) internal view returns (bool) {
        if (aggregateKey.length != 128 || hm.length != 256 || sig.length != 256) revert BadEncodingLength();
        bool ok;
        uint256 result;
        assembly ("memory-safe") {
            let buf := mload(0x40)
            mcopy(buf, add(aggregateKey, 0x20), 128)
            mcopy(add(buf, 128), add(hm, 0x20), 256)
            mstore(add(buf, 384), G1_X_HI)
            mstore(add(buf, 416), G1_X_LO)
            mstore(add(buf, 448), G1_NEG_Y_HI)
            mstore(add(buf, 480), G1_NEG_Y_LO)
            mcopy(add(buf, 512), add(sig, 0x20), 256)
            ok := staticcall(gas(), 0x0f, buf, 768, 0x00, 0x20)
            result := mload(0x00)
        }
        if (!ok) revert PrecompileFailed(PAIRING);
        return result == 1;
    }

    /// @notice Whether the 128-byte key at `keys[kOff]` matches the 48-byte key at `comp[cOff]`.
    function _g1Matches(bytes memory comp, uint256 cOff, bytes memory keys, uint256 kOff) private pure returns (bool) {
        uint256 cHi;
        uint256 cLo;
        uint256 xHi;
        uint256 xLo;
        uint256 yHi;
        uint256 yLo;
        assembly ("memory-safe") {
            let c := add(add(comp, 0x20), cOff)
            cHi := shr(128, mload(c))
            cLo := mload(add(c, 16))
            let k := add(add(keys, 0x20), kOff)
            xHi := mload(k)
            xLo := mload(add(k, 0x20))
            yHi := mload(add(k, 0x40))
            yLo := mload(add(k, 0x60))
        }
        uint256 flags = cHi >> FLAGS_SHIFT;
        return flags & FLAG_COMPRESSED != 0 && flags & FLAG_INFINITY == 0
            && (flags & FLAG_SIGN != 0) == _gtHalf(yHi, yLo) && (cHi & X_HI_MASK) == xHi && cLo == xLo;
    }

    /// @notice Whether the field element (hi, lo) is greater than (p - 1) / 2.
    function _gtHalf(uint256 hi, uint256 lo) private pure returns (bool) {
        return hi > HALF_HI || (hi == HALF_HI && lo > HALF_LO);
    }

    /// @notice Writes `src[sOff..sOff+64] mod p` into `dst[dOff..dOff+64]` (16 zero bytes, then 48 bytes).
    function _modP(bytes memory src, uint256 sOff, bytes memory dst, uint256 dOff) private view {
        bool ok;
        assembly ("memory-safe") {
            let buf := mload(0x40)
            mstore(buf, 64)
            mstore(add(buf, 0x20), 1)
            mstore(add(buf, 0x40), 48)
            mcopy(add(buf, 0x60), add(add(src, 0x20), sOff), 64)
            mstore8(add(buf, 0xa0), 1)
            // P_HI is 16 bytes: shift it to the top of its word, then write the low 32 bytes.
            mstore(add(buf, 0xa1), shl(128, P_HI))
            mstore(add(buf, 0xb1), P_LO)
            let d := add(add(dst, 0x20), dOff)
            mstore(d, 0)
            ok := staticcall(gas(), 0x05, buf, 0xd1, add(d, 16), 48)
        }
        if (!ok) revert PrecompileFailed(MODEXP);
    }

    function _sha256(bytes memory data) private view returns (bytes32 h) {
        bool ok;
        assembly ("memory-safe") {
            ok := staticcall(gas(), 0x02, add(data, 0x20), mload(data), 0x00, 0x20)
            h := mload(0x00)
        }
        if (!ok) revert PrecompileFailed(SHA256);
    }
}
