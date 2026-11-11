// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Bls12381} from "../../../src/aptos/Bls12381.sol";
import {AptosVectors} from "./AptosVectors.sol";

/// @notice Exposes the library so that vm.expectRevert sees its reverts.
contract Bls12381Harness {
    function hashToG2(bytes memory message) external view returns (bytes memory) {
        return Bls12381.hashToG2(message);
    }

    function aggregateKeys(bytes memory compressedKeys, bytes memory keys) external view returns (bytes memory) {
        return Bls12381.aggregateKeys(compressedKeys, keys);
    }

    function verifyAggregate(
        bytes memory compressedKeys,
        bytes memory keys,
        bytes memory message,
        bytes memory compressedSig,
        bytes memory sig
    ) external view {
        Bls12381.verifyAggregate(compressedKeys, keys, message, compressedSig, sig);
    }
}

/// @notice BLS12-381 against the golden vectors: the epoch 2 outcome LedgerInfo signed by validators 0 and 1.
contract Bls12381Test is AptosVectors {
    Bls12381Harness internal bls;

    string internal constant QUORUM = ".outcome_ledger_infos[0].signing";
    string internal constant FLIPPED = ".outcome_ledger_infos[2].signing";
    string internal constant SET2 = ".validator_sets[1].validators";

    function setUp() public {
        bls = new Bls12381Harness();
    }

    /// RFC 9380 hash to G2 of the signing message equals the vector point (EIP-2537 encoding).
    function test_hashToG2MatchesVector() public view {
        bytes memory message = _hex(string.concat(QUORUM, ".signing_message"));
        assertEq(bls.hashToG2(message), _hex(string.concat(QUORUM, ".hash_to_g2_eip2537")));
    }

    function test_hashToG2EpochChangeMessage() public view {
        bytes memory message = _hex(".epoch_change.signing.signing_message");
        assertEq(bls.hashToG2(message), _hex(".epoch_change.signing.hash_to_g2_eip2537"));
    }

    function test_aggregateKeyMatchesVector() public view {
        (bytes memory comp, bytes memory unc) = _keys(0, 1);
        assertEq(bls.aggregateKeys(comp, unc), _hex(string.concat(QUORUM, ".aggregate_public_key_eip2537")));
    }

    function test_quorumAggregateSignatureVerifies() public view {
        (bytes memory comp, bytes memory unc) = _keys(0, 1);
        bls.verifyAggregate(
            comp,
            unc,
            _hex(string.concat(QUORUM, ".signing_message")),
            _hex(string.concat(QUORUM, ".signature")),
            _hex(string.concat(QUORUM, ".signature_eip2537"))
        );
    }

    /// The golden flipped-bit signature decompresses to a point outside the G2 subgroup. PAIRING rejects it.
    function test_revertsOnFlippedSignatureBit() public {
        (bytes memory comp, bytes memory unc) = _keys(0, 1);
        bytes memory message = _hex(string.concat(FLIPPED, ".signing_message"));
        bytes memory flipped = _hex(string.concat(FLIPPED, ".signature"));
        bytes memory flippedUnc = _hex(string.concat(FLIPPED, ".signature_eip2537"));
        vm.expectRevert(abi.encodeWithSelector(Bls12381.PrecompileFailed.selector, Bls12381.PAIRING));
        bls.verifyAggregate{gas: 10_000_000}(comp, unc, message, flipped, flippedUnc);
    }

    /// The flipped compressed signature with the original uncompressed signature fails the encoding check.
    function test_revertsOnFlippedBitAgainstOriginalSignature() public {
        (bytes memory comp, bytes memory unc) = _keys(0, 1);
        bytes memory message = _hex(string.concat(FLIPPED, ".signing_message"));
        bytes memory flipped = _hex(string.concat(FLIPPED, ".signature"));
        bytes memory sig = _hex(string.concat(QUORUM, ".signature_eip2537"));
        vm.expectRevert(Bls12381.SignatureEncodingMismatch.selector);
        bls.verifyAggregate(comp, unc, message, flipped, sig);
    }

    function test_revertsOnWrongMessage() public {
        (bytes memory comp, bytes memory unc) = _keys(0, 1);
        bytes memory message = _hex(string.concat(QUORUM, ".signing_message"));
        message[message.length - 1] ^= 0x01;
        bytes memory compSig = _hex(string.concat(QUORUM, ".signature"));
        bytes memory sig = _hex(string.concat(QUORUM, ".signature_eip2537"));
        vm.expectRevert(Bls12381.InvalidSignature.selector);
        bls.verifyAggregate(comp, unc, message, compSig, sig);
    }

    /// Validator 1's uncompressed key paired with validator 0's compressed bytes.
    function test_revertsOnKeyEncodingMismatch() public {
        (bytes memory comp, bytes memory unc) = _keys(0, 1);
        bytes memory swapped = abi.encodePacked(
            _hex(string.concat(SET2, "[1].public_key_eip2537")), _hex(string.concat(SET2, "[1].public_key_eip2537"))
        );
        bytes memory message = _hex(string.concat(QUORUM, ".signing_message"));
        bytes memory compSig = _hex(string.concat(QUORUM, ".signature"));
        bytes memory sig = _hex(string.concat(QUORUM, ".signature_eip2537"));
        vm.expectRevert(abi.encodeWithSelector(Bls12381.KeyEncodingMismatch.selector, 0));
        bls.verifyAggregate(comp, swapped, message, compSig, sig);
        unc; // the matching keys are covered by test_quorumAggregateSignatureVerifies
    }

    /// The sign flag decides y: the negated key (same x) must not pass as the compressed key.
    function test_revertsOnNegatedKey() public {
        (bytes memory comp, bytes memory unc) = _keys(0, 1);
        bytes memory negated = _negateG1(unc, 1);
        bytes memory message = _hex(string.concat(QUORUM, ".signing_message"));
        bytes memory compSig = _hex(string.concat(QUORUM, ".signature"));
        bytes memory sig = _hex(string.concat(QUORUM, ".signature_eip2537"));
        vm.expectRevert(abi.encodeWithSelector(Bls12381.KeyEncodingMismatch.selector, 1));
        bls.verifyAggregate(comp, negated, message, compSig, sig);
    }

    function _keys(uint256 i, uint256 j) internal view returns (bytes memory comp, bytes memory unc) {
        string memory a = string.concat(SET2, "[", vm.toString(i), "]");
        string memory b = string.concat(SET2, "[", vm.toString(j), "]");
        comp = abi.encodePacked(_hex(string.concat(a, ".public_key")), _hex(string.concat(b, ".public_key")));
        unc = abi.encodePacked(
            _hex(string.concat(a, ".public_key_eip2537")), _hex(string.concat(b, ".public_key_eip2537"))
        );
    }

    /// Replaces y with p - y in the `index`th 128-byte key.
    function _negateG1(bytes memory keys, uint256 index) internal pure returns (bytes memory out) {
        out = bytes.concat(keys);
        uint256 pHi = 0x1a0111ea397fe69a4b1ba7b6434bacd7;
        uint256 pLo = 0x64774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab;
        uint256 off = index * 128 + 64;
        uint256 yHi;
        uint256 yLo;
        assembly {
            yHi := mload(add(add(out, 0x20), off))
            yLo := mload(add(add(out, 0x40), off))
        }
        uint256 nLo;
        uint256 nHi;
        unchecked {
            nLo = pLo - yLo;
            nHi = pHi - yHi - (pLo < yLo ? 1 : 0);
        }
        assembly {
            mstore(add(add(out, 0x20), off), nHi)
            mstore(add(add(out, 0x40), off), nLo)
        }
    }
}
