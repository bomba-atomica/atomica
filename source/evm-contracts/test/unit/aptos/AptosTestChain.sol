// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Bls12381} from "../../../src/aptos/Bls12381.sol";
import {AptosHash} from "../../../src/aptos/AptosHash.sol";
import {Sha3_256} from "../../../src/aptos/Sha3_256.sol";
import {IAptosLightClient} from "../../../src/aptos/IAptosLightClient.sol";

/**
 * @title AptosTestChain
 * @notice Builds synthetic Aptos LedgerInfos, validator sets and proofs with real BLS signatures.
 * @dev Keys are sk * G1 (G1MSM). A quorum signature on one message is (sum of sk) * H(m) (G2MSM),
 *      which equals the aggregate of the signers' signatures. The BCS layouts are the ones the
 *      golden vectors pin. Used for cases the golden vectors do not cover: a committed failed
 *      transaction, a skipped epoch, and the gas ceilings.
 */
abstract contract AptosTestChain {
    struct ValidatorSet {
        uint64 epoch;
        uint256[] secretKeys;
        bytes[] compressedKeys;
        bytes[] keys;
        uint64[] votingPowers;
        bytes epochState;
    }

    struct LedgerInfoFields {
        uint64 epoch;
        uint64 round;
        bytes32 executedStateId;
        uint64 version;
        uint64 timestampUsecs;
        bytes nextEpochState; // empty for None
    }

    uint256 internal constant R = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;
    uint256 private constant HALF_HI = 0x0d0088f51cbff34d258dd3db21a5d66b;
    uint256 private constant HALF_LO = 0xb23ba5c279c2895fb39869507b587b120f55ffff58a9ffffdcff7fffffffd555;

    bytes internal constant G1_GENERATOR =
        hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb0000000000000000000000000000000008b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1";

    // ---------------------------------------------------------------- keys

    function makeSet(uint64 epoch, uint256 n, uint256 seed, uint64 votingPower)
        internal
        view
        returns (ValidatorSet memory set)
    {
        set.epoch = epoch;
        set.secretKeys = new uint256[](n);
        set.compressedKeys = new bytes[](n);
        set.keys = new bytes[](n);
        set.votingPowers = new uint64[](n);
        bytes memory infos;
        for (uint256 i = 0; i < n; i++) {
            uint256 sk = uint256(keccak256(abi.encode(seed, i))) % R;
            set.secretKeys[i] = sk;
            set.keys[i] = _g1Mul(sk);
            set.compressedKeys[i] = compressG1(set.keys[i]);
            set.votingPowers[i] = votingPower;
            infos = abi.encodePacked(
                infos, keccak256(abi.encode("addr", seed, i)), uint8(48), set.compressedKeys[i], le64(votingPower)
            );
        }
        set.epochState = abi.encodePacked(le64(epoch), uleb(n), infos);
    }

    function compressG1(bytes memory p) internal pure returns (bytes memory) {
        (uint256 xHi, uint256 xLo, uint256 yHi, uint256 yLo) = _words(p, 0);
        uint256 flags = 4 | (_gtHalf(yHi, yLo) ? 1 : 0);
        return abi.encodePacked(uint128(xHi | (flags << 125)), xLo);
    }

    function compressG2(bytes memory p) internal pure returns (bytes memory) {
        (uint256 x0Hi, uint256 x0Lo, uint256 x1Hi, uint256 x1Lo) = _words(p, 0);
        (uint256 y0Hi, uint256 y0Lo, uint256 y1Hi, uint256 y1Lo) = _words(p, 128);
        bool sign = (y1Hi | y1Lo) != 0 ? _gtHalf(y1Hi, y1Lo) : _gtHalf(y0Hi, y0Lo);
        uint256 flags = 4 | (sign ? 1 : 0);
        return abi.encodePacked(uint128(x1Hi | (flags << 125)), x1Lo, uint128(x0Hi), x0Lo);
    }

    // ---------------------------------------------------------------- signing

    /// @notice A LedgerInfoWithSignatures signed by `signers` of `set`, with the calldata the client needs.
    function signLedgerInfo(ValidatorSet memory set, bool[] memory signers, LedgerInfoFields memory f)
        internal
        view
        returns (IAptosLightClient.SignedLedgerInfo memory s)
    {
        bytes memory li = ledgerInfo(f);
        uint256 n = set.secretKeys.length;
        bytes memory bitmask = new bytes((n + 7) / 8);
        uint256 skSum;
        bytes memory keys;
        for (uint256 i = 0; i < n; i++) {
            if (signers[i]) {
                bitmask[i / 8] = bytes1(uint8(bitmask[i / 8]) | uint8(0x80 >> (i % 8)));
                skSum = addmod(skSum, set.secretKeys[i], R);
                keys = abi.encodePacked(keys, set.keys[i]);
            }
        }
        bytes memory sig = _g2Mul(Bls12381.hashToG2(abi.encodePacked(AptosHash.LEDGER_INFO_SEED, li)), skSum);
        s.ledgerInfoWithSignatures =
            abi.encodePacked(uint8(0), li, uleb(bitmask.length), bitmask, uint8(1), uint8(96), compressG2(sig));
        s.epochState = set.epochState;
        s.signerPublicKeys = keys;
        s.signature = sig;
    }

    function firstSigners(uint256 n, uint256 count) internal pure returns (bool[] memory signers) {
        signers = new bool[](n);
        for (uint256 i = 0; i < count; i++) {
            signers[i] = true;
        }
    }

    // ---------------------------------------------------------------- BCS

    function ledgerInfo(LedgerInfoFields memory f) internal pure returns (bytes memory) {
        bytes memory next = f.nextEpochState.length == 0 ? bytes(hex"00") : abi.encodePacked(uint8(1), f.nextEpochState);
        return abi.encodePacked(
            le64(f.epoch),
            le64(f.round),
            keccak256(abi.encode("block", f.epoch, f.round)),
            f.executedStateId,
            le64(f.version),
            le64(f.timestampUsecs),
            next,
            keccak256(abi.encode("consensus", f.epoch, f.round))
        );
    }

    /// @notice An unsigned genesis LedgerInfoWithSignatures (epoch 0) and its waypoint.
    function genesis(ValidatorSet memory first)
        internal
        pure
        returns (bytes memory liws, uint64 waypointVersion, bytes32 waypointHash)
    {
        LedgerInfoFields memory f;
        f.executedStateId = keccak256("genesis root");
        f.nextEpochState = first.epochState;
        liws = abi.encodePacked(uint8(0), ledgerInfo(f), uint8(0), uint8(0));
        waypointVersion = 0;
        waypointHash = Sha3_256.hash(
            abi.encodePacked(
                AptosHash.WAYPOINT_SEED, le64(0), f.executedStateId, le64(0), le64(0), uint8(1), first.epochState
            )
        );
    }

    /// @notice TransactionInfo V0 with status Success (0) or OutOfGas (1).
    function transactionInfo(bytes32 eventRoot, bool success) internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint8(0),
            le64(1000),
            uint8(success ? 0 : 1),
            keccak256("txn"),
            eventRoot,
            keccak256("state change"),
            uint8(0),
            uint8(0)
        );
    }

    function eventV2(bytes memory typeTag, bytes memory data) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(1), typeTag, uleb(data.length), data);
    }

    /// @notice A struct TypeTag `address::module::name` with no type arguments.
    function structTag(bytes32 addr, string memory module_, string memory name) internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint8(7), addr, uleb(bytes(module_).length), module_, uleb(bytes(name).length), name, uint8(0)
        );
    }

    /// @notice Siblings for a proof of depth `depth`, and the root they lead to from `leaf` at `index`.
    function accumulator(bytes32 seed, bytes32 leaf, uint256 index, uint256 depth)
        internal
        pure
        returns (bytes memory proof, bytes32 root)
    {
        proof = uleb(depth);
        root = leaf;
        for (uint256 i = 0; i < depth; i++) {
            bytes32 sibling = keccak256(abi.encode("sibling", seed, i));
            proof = abi.encodePacked(proof, sibling);
            root =
                (index >> i) & 1 == 0 ? Sha3_256.hashNode(seed, root, sibling) : Sha3_256.hashNode(seed, sibling, root);
        }
    }

    function le64(uint64 v) internal pure returns (bytes8 out) {
        uint64 r;
        for (uint256 i = 0; i < 8; i++) {
            r = (r << 8) | ((v >> (8 * i)) & 0xff);
        }
        out = bytes8(r);
    }

    function uleb(uint256 v) internal pure returns (bytes memory out) {
        do {
            uint8 b = uint8(v & 0x7f);
            v >>= 7;
            if (v != 0) b |= 0x80;
            out = abi.encodePacked(out, b);
        } while (v != 0);
    }

    // ---------------------------------------------------------------- precompiles

    function _g1Mul(uint256 sk) private view returns (bytes memory out) {
        (bool ok, bytes memory ret) = address(0x0c).staticcall(abi.encodePacked(G1_GENERATOR, sk));
        require(ok && ret.length == 128, "G1MSM failed");
        out = ret;
    }

    function _g2Mul(bytes memory p, uint256 sk) private view returns (bytes memory out) {
        (bool ok, bytes memory ret) = address(0x0e).staticcall(abi.encodePacked(p, sk));
        require(ok && ret.length == 256, "G2MSM failed");
        out = ret;
    }

    function _words(bytes memory p, uint256 off) private pure returns (uint256 a, uint256 b, uint256 c, uint256 d) {
        assembly {
            let s := add(add(p, 0x20), off)
            a := mload(s)
            b := mload(add(s, 0x20))
            c := mload(add(s, 0x40))
            d := mload(add(s, 0x60))
        }
    }

    function _gtHalf(uint256 hi, uint256 lo) private pure returns (bool) {
        return hi > HALF_HI || (hi == HALF_HI && lo > HALF_LO);
    }
}
