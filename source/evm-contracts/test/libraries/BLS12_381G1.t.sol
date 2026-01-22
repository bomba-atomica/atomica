// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/libraries/BLS12_381G1.sol";

contract BLS12_381G1Test is Test {
    function testIsOnCurveGenerator() public view {
        (uint256 x, uint256 y) = (
            BLS12_381G1.G1_GENERATOR_X,
            BLS12_381G1.G1_GENERATOR_Y
        );
        assertTrue(BLS12_381G1.isOnCurve(x, y), "Generator should be on curve");
    }

    function testIsOnCurveInfinity() public view {
        assertTrue(
            BLS12_381G1.isOnCurve(BLS12_381G1.INF_X, BLS12_381G1.INF_Y),
            "Point at infinity should be valid"
        );
    }

    function testG1AddSamePoint() public view {
        (uint256 x1, uint256 y1) = (
            BLS12_381G1.G1_GENERATOR_X,
            BLS12_381G1.G1_GENERATOR_Y
        );

        (uint256 x2, uint256 y2) = BLS12_381G1.g1Add(x1, y1, x1, y1);
        (uint256 xDouble, uint256 yDouble) = BLS12_381G1.g1Double(x1, y1);

        assertEq(x2, xDouble, "Add same point should equal double");
        assertEq(y2, yDouble, "Add same point should equal double");
    }

    function testG1AddIdentity() public view {
        (uint256 x, uint256 y) = (
            BLS12_381G1.G1_GENERATOR_X,
            BLS12_381G1.G1_GENERATOR_Y
        );

        (uint256 xSum, uint256 ySum) = BLS12_381G1.g1Add(
            BLS12_381G1.INF_X,
            BLS12_381G1.INF_Y,
            x,
            y
        );

        assertEq(xSum, x, "Adding identity should return point");
        assertEq(ySum, y, "Adding identity should return point");
    }

    function testG1Double() public view {
        (uint256 x, uint256 y) = (
            BLS12_381G1.G1_GENERATOR_X,
            BLS12_381G1.G1_GENERATOR_Y
        );

        (uint256 x2, uint256 y2) = BLS12_381G1.g1Double(x, y);

        assertTrue(BLS12_381G1.isOnCurve(x2, y2), "Doubled point should be on curve");
    }

    function testG1MulByTwo() public view {
        (uint256 x, uint256 y) = (
            BLS12_381G1.G1_GENERATOR_X,
            BLS12_381G1.G1_GENERATOR_Y
        );

        (uint256 x2, uint256 y2) = BLS12_381G1.g1Mul(x, y, 2);
        (uint256 xDouble, uint256 yDouble) = BLS12_381G1.g1Double(x, y);

        assertEq(x2, xDouble, "Mul by 2 should equal double");
        assertEq(y2, yDouble, "Mul by 2 should equal double");
    }

    function testG1MulIdentity() public view {
        (uint256 x, uint256 y) = (
            BLS12_381G1.G1_GENERATOR_X,
            BLS12_381G1.G1_GENERATOR_Y
        );

        (uint256 xResult, uint256 yResult) = BLS12_381G1.g1Mul(x, y, 0);

        assertEq(xResult, BLS12_381G1.INF_X, "Mul by 0 should return infinity");
        assertEq(yResult, BLS12_381G1.INF_Y, "Mul by 0 should return infinity");
    }

    function testG1MulByOne() public view {
        (uint256 x, uint256 y) = (
            BLS12_381G1.G1_GENERATOR_X,
            BLS12_381G1.G1_GENERATOR_Y
        );

        (uint256 xResult, uint256 yResult) = BLS12_381G1.g1Mul(x, y, 1);

        assertEq(xResult, x, "Mul by 1 should return same point");
        assertEq(yResult, y, "Mul by 1 should return same point");
    }

    function testAddMod() public view {
        assertEq(BLS12_381G1.addMod(5, 3, 10), 8, "5 + 3 mod 10 = 8");
        assertEq(BLS12_381G1.addMod(8, 5, 10), 3, "8 + 5 mod 10 = 3 (wrap)");
    }

    function testSubMod() public view {
        assertEq(BLS12_381G1.subMod(5, 3, 10), 2, "5 - 3 mod 10 = 2");
        assertEq(BLS12_381G1.subMod(3, 5, 10), 8, "3 - 5 mod 10 = 8 (wrap)");
    }

    function testMulMod() public view {
        assertEq(BLS12_381G1.mulMod(3, 4, 10), 2, "3 * 4 mod 10 = 2");
        assertEq(BLS12_381G1.mulMod(7, 8, 13), 4, "7 * 8 mod 13 = 4");
    }

    function testPowMod() public view {
        assertEq(BLS12_381G1.powMod(2, 3, 10), 8, "2^3 mod 10 = 8");
        assertEq(BLS12_381G1.powMod(3, 4, 10), 1, "3^4 mod 10 = 1");
    }

    function testInvMod() public view {
        uint256 inv3mod10 = BLS12_381G1.invMod(3);
        assertEq(BLS12_381G1.mulMod(3, inv3mod10, 10), 1, "3 * inv(3) mod 10 = 1");
    }

    function testConstants() public view {
        assertTrue(BLS12_381G1.MODULUS > 0, "MODULUS should be non-zero");
        assertTrue(BLS12_381G1.CURVE_B > 0, "CURVE_B should be non-zero");
    }
}
