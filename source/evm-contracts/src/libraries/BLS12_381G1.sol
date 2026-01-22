// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library BLS12_381G1 {
    uint256 public constant MODULUS = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;
    uint256 public constant CURVE_B = 0x0000000000000000000000000000000000000000000000000000000000000003;
    uint256 public constant G1_GENERATOR_X = 0x0000000000000000000000000000000000000000000000000000000000000001;
    uint256 public constant G1_GENERATOR_Y = 0x0000000000000000000000000000000000000000000000000000000000000002;
    uint256 public constant INF_X = 0;
    uint256 public constant INF_Y = 0;

    function isOnCurve(uint256 x, uint256 y) internal pure returns (bool) {
        if (x == INF_X && y == INF_Y) return true;

        uint256 y2 = mulMod(y, y);
        uint256 x3 = mulMod(mulMod(x, x), x);

        return addMod(y2, CURVE_B) == x3;
    }

    function g1Add(uint256 x1, uint256 y1, uint256 x2, uint256 y2)
        internal
        pure
        returns (uint256 x3, uint256 y3)
    {
        if (x1 == INF_X && y1 == INF_Y) return (x2, y2);
        if (x2 == INF_X && y2 == INF_Y) return (x1, y1);

        if (x1 == x2) {
            if (y1 == y2) {
                return g1Double(x1, y1);
            }
            return (INF_X, INF_Y);
        }

        uint256 lambda = mulMod(
            subMod(y2, y1),
            invMod(subMod(x2, x1))
        );

        x3 = subMod(
            subMod(mulMod(lambda, lambda), x1),
            x2
        );
        y3 = subMod(
            mulMod(lambda, subMod(x1, x3)),
            y1
        );

        return (x3, y3);
    }

    function g1Double(uint256 x, uint256 y)
        internal
        pure
        returns (uint256 x2, uint256 y2)
    {
        uint256 lambda = mulMod(
            mulMod(3, mulMod(x, x)),
            invMod(mulMod(2, y))
        );

        x2 = subMod(mulMod(lambda, lambda), mulMod(2, x));
        y2 = subMod(
            mulMod(lambda, subMod(x, x2)),
            y
        );

        return (x2, y2);
    }

    function g1Mul(uint256 x, uint256 y, uint256 scalar)
        internal
        pure
        returns (uint256 resultX, uint256 resultY)
    {
        (resultX, resultY) = (INF_X, INF_Y);
        uint256 baseX = x;
        uint256 baseY = y;

        while (scalar > 0) {
            if (scalar & 1 == 1) {
                (resultX, resultY) = g1Add(resultX, resultY, baseX, baseY);
            }
            (baseX, baseY) = g1Double(baseX, baseY);
            scalar >>= 1;
        }

        return (resultX, resultY);
    }

    function aggregateG1(uint256[] memory xs, uint256[] memory ys)
        internal
        pure
        returns (uint256 x, uint256 y)
    {
        (x, y) = (INF_X, INF_Y);

        for (uint256 i = 0; i < xs.length; i++) {
            (x, y) = g1Add(x, y, xs[i], ys[i]);
        }
    }

    function decodePoint(bytes calldata point)
        internal
        pure
        returns (uint256 x, uint256 y)
    {
        require(point.length == 48, "BLS: invalid point length");

        uint256 header = uint256(bytes32(point)[0]);
        require((header >> 7) == 0, "BLS: invalid encoding");

        x = 0;
        for (uint256 i = 1; i < 33; i++) {
            x = (x << 8) | uint256(uint8(point[i]));
        }

        y = 0;
        for (uint256 i = 33; i < 65; i++) {
            y = (y << 8) | uint256(uint8(point[i]));
        }

        require(isOnCurve(x, y), "BLS: point not on curve");
    }

    function encodePoint(uint256 x, uint256 y) internal pure returns (bytes memory) {
        bytes memory result = new bytes(48);

        uint256 header = 0;
        if (y & 1 == 1) {
            header = 0x80;
        }

        bytes32 xBytes = bytes32(x);
        bytes32 yBytes = bytes32(y);

        assembly {
            mstore8(add(result, 1), header)
            for { let i := 0 } lt(i, 32) { i := add(i, 1) } {
                mstore8(add(add(result, 1), add(i, 1)), byte(i, xBytes))
            }
            for { let i := 0 } lt(i, 32) { i := add(i, 1) } {
                mstore8(add(add(result, 33), add(i, 1)), byte(i, yBytes))
            }
        }

        return result;
    }

    function addMod(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        return c >= MODULUS ? c - MODULUS : c;
    }

    function subMod(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a - b : MODULUS + a - b;
    }

    function mulMod(uint256 a, uint256 b) internal pure returns (uint256) {
        return mulmod(a, b, MODULUS);
    }

    function invMod(uint256 a) internal pure returns (uint256) {
        return powMod(a, MODULUS - 2);
    }

    function powMod(uint256 base, uint256 exp) internal pure returns (uint256) {
        uint256 result = 1;
        while (exp > 0) {
            if (exp & 1 == 1) {
                result = mulMod(result, base);
            }
            base = mulMod(base, base);
            exp >>= 1;
        }
        return result;
    }
}
