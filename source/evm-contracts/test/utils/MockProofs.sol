// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";

library MockProofs {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function generateBlockHeader(bytes32 stateRoot, uint256 blockNumber) internal view returns (
        bytes32 parentHash,
        bytes32 uncleHash,
        address coinbase,
        bytes32 newStateRoot,
        bytes32 transactionsRoot,
        bytes32 receiptsRoot,
        bytes32 logsBloom,
        uint256 difficulty,
        uint256 number,
        uint256 gasLimit,
        uint256 gasUsed,
        uint256 timestamp,
        bytes32 extraData,
        uint256 baseFeePerGas
    ) {
        parentHash = keccak256("parent");
        uncleHash = keccak256("uncles");
        coinbase = address(0);
        newStateRoot = stateRoot;
        transactionsRoot = keccak256("txs");
        receiptsRoot = keccak256("receipts");
        logsBloom = bytes32(0);
        difficulty = 0;
        number = blockNumber;
        gasLimit = 30000000;
        gasUsed = 0;
        timestamp = block.timestamp;
        extraData = bytes32(0);
        baseFeePerGas = 0;
    }

    function signBlockHeader(
        bytes32 stateRoot,
        uint256 blockNumber,
        uint256 privateKey
    ) internal pure returns (bytes32 hash, bytes memory signature) {
        hash = keccak256(abi.encode(stateRoot, blockNumber));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, hash);
        signature = abi.encode(r, s, v);
    }

    function computeStorageKey(uint64 auctionId, address depositor, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(auctionId, depositor, nonce));
    }

    function encodeDeposit(
        uint64 auctionId,
        address depositor,
        uint8 assetType,
        uint256 amount,
        uint256 nonce,
        uint8 status,
        uint256 timestamp
    ) internal pure returns (bytes memory) {
        return abi.encode(
            auctionId,
            depositor,
            assetType,
            amount,
            nonce,
            status,
            timestamp
        );
    }

    function generateAccountProof() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0x00));
    }

    function generateStorageProof(bytes32 storageKey, bytes memory depositValue) internal pure returns (
        bytes32 key,
        bytes memory value,
        bytes[] memory proof
    ) {
        key = storageKey;
        value = depositValue;
        proof = new bytes[](1);
        proof[0] = abi.encodePacked(bytes1(0x00));
    }

    function createDepositState(
        uint64 auctionId,
        address depositor,
        uint8 assetType,
        uint256 amount,
        uint256 nonce
    ) internal view returns (bytes memory) {
        return encodeDeposit(
            auctionId,
            depositor,
            assetType,
            amount,
            nonce,
            0, // PENDING
            block.timestamp
        );
    }

    function hashAuctionRegistration(
        address registry,
        uint64 auctionId,
        uint64 deadline
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(registry, auctionId, deadline));
    }

    function hashSettlement(
        bytes32 stateRoot,
        uint256 clearingPrice,
        address[] calldata winners,
        uint256[] calldata amounts
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(stateRoot, clearingPrice, winners, amounts));
    }

    function hashValidatorUpdate(
        uint64 newEpoch,
        bytes32 pubkeysHash
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode("ATOMICA_VALIDATOR_UPDATE", newEpoch, pubkeysHash));
    }

    function parseBlockNumber(bytes memory hexNumber) internal pure returns (uint256) {
        return abi.decode(hexNumber, (uint256));
    }

    function bufferToHex(bytes memory buffer) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory result = new bytes(2 + buffer.length * 2);
        result[0] = "0";
        result[1] = "x";
        for (uint256 i = 0; i < buffer.length; i++) {
            result[2 + i * 2] = hexChars[uint8(buffer[i]) >> 4];
            result[3 + i * 2] = hexChars[uint8(buffer[i]) & 0x0f];
        }
        return string(result);
    }
}

library MockBLSKeys {
    uint256 private constant CURVE_ORDER = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;

    struct ValidatorKeyPair {
        uint256 privateKey;
        bytes publicKey;
    }

    function generateValidatorSet(uint256 count) internal pure returns (ValidatorKeyPair[] memory) {
        ValidatorKeyPair[] memory keys = new ValidatorKeyPair[](count);
        for (uint256 i = 0; i < count; i++) {
            keys[i] = generateKeyPair(i + 1);
        }
        return keys;
    }

    function generateKeyPair(uint256 seed) internal pure returns (ValidatorKeyPair memory) {
        uint256 privateKey = uint256(keccak256(abi.encode(seed)));
        privateKey = privateKey % CURVE_ORDER;
        if (privateKey == 0) privateKey = 1;

        bytes memory publicKey = derivePublicKey(privateKey);

        return ValidatorKeyPair({privateKey: privateKey, publicKey: publicKey});
    }

    function derivePublicKey(uint256 privateKey) internal pure returns (bytes memory) {
        bytes memory g1Generator = abi.encode(
            uint256(1),
            uint256(2)
        );

        bytes memory publicKeyX = new bytes(48);
        bytes memory publicKeyY = new bytes(48);

        (uint256 x, uint256 y) = g1Mul(
            1,
            2,
            privateKey
        );

        bytes32 xBytes = bytes32(x);
        bytes32 yBytes = bytes32(y);

        for (uint256 i = 0; i < 32; i++) {
            publicKeyX[i] = xBytes[i];
            publicKeyY[i] = yBytes[i];
        }

        for (uint256 i = 32; i < 48; i++) {
            publicKeyX[i] = bytes32(x >> (8 * (i - 32)))[0];
            publicKeyY[i] = bytes32(y >> (8 * (i - 32)))[0];
        }

        bytes memory compressed = new bytes(48);
        for (uint256 i = 0; i < 48; i++) {
            compressed[i] = publicKeyX[i];
        }

        if ((publicKeyY[47] & 0x80) != 0) {
            compressed[0] = bytes1(uint8(compressed[0]) | 0x80);
        }

        return compressed;
    }

    function sign(uint256 privateKey, bytes32 message) internal pure returns (bytes memory) {
        bytes32 msgHash = keccak256(abi.encode(message));
        uint256 msgVal = uint256(msgHash) % CURVE_ORDER;

        (uint256 x, uint256 y) = g1Mul(1, 2, msgVal);

        bytes memory signature = new bytes(48);
        bytes32 xBytes = bytes32(x);

        for (uint256 i = 0; i < 48; i++) {
            signature[i] = xBytes[i];
        }

        return signature;
    }

    function aggregateSignatures(bytes[] memory signatures) internal pure returns (bytes memory) {
        if (signatures.length == 0) return new bytes(48);

        bytes memory aggregated = new bytes(48);
        for (uint256 i = 0; i < 48; i++) {
            uint256 sum = 0;
            for (uint256 j = 0; j < signatures.length; j++) {
                sum += uint256(uint8(signatures[j][i]));
            }
            aggregated[i] = bytes1(uint8(sum % 256));
        }

        return aggregated;
    }

    function g1Mul(
        uint256 x,
        uint256 y,
        uint256 scalar
    ) internal pure returns (uint256 resultX, uint256 resultY) {
        uint256 MODULUS = CURVE_ORDER;
        resultX = 0;
        resultY = 0;
        uint256 baseX = x;
        uint256 baseY = y;
        uint256 exp = scalar;

        while (exp > 0) {
            if (exp & 1 == 1) {
                (resultX, resultY) = g1Add(resultX, resultY, baseX, baseY, MODULUS);
            }
            (baseX, baseY) = g1Double(baseX, baseY, MODULUS);
            exp >>= 1;
        }
    }

    function g1Add(
        uint256 x1,
        uint256 y1,
        uint256 x2,
        uint256 y2,
        uint256 MODULUS
    ) internal pure returns (uint256 x3, uint256 y3) {
        if (x1 == 0 && y1 == 0) return (x2, y2);
        if (x2 == 0 && y2 == 0) return (x1, y1);

        if (x1 == x2) {
            if (y1 == y2) {
                return g1Double(x1, y1, MODULUS);
            }
            return (0, 0);
        }

        uint256 lambda = ((y2 + MODULUS - y1) % MODULUS) * modInv((x2 + MODULUS - x1) % MODULUS, MODULUS) % MODULUS;
        x3 = (lambda * lambda + MODULUS - x1 + MODULUS - x2) % MODULUS;
        y3 = (lambda * ((x1 + MODULUS - x3) % MODULUS) + MODULUS - y1) % MODULUS;

        return (x3, y3);
    }

    function g1Double(uint256 x, uint256 y, uint256 MODULUS) internal pure returns (uint256 x2, uint256 y2) {
        uint256 lambda = (3 * mulMod(x, x, MODULUS) % MODULUS) * modInv(2 * y % MODULUS, MODULUS) % MODULUS;
        x2 = (mulMod(lambda, lambda, MODULUS) + MODULUS - 2 * x) % MODULUS;
        y2 = (lambda * ((x + MODULUS - x2) % MODULUS) + MODULUS - y) % MODULUS;
        return (x2, y2);
    }

    function mulMod(uint256 a, uint256 b, uint256 mod) internal pure returns (uint256) {
        return mulmod(a, b, mod);
    }

    function modInv(uint256 a, uint256 mod) internal pure returns (uint256) {
        if (a == 0) return 0;
        uint256 t = 0;
        uint256 newT = 1;
        uint256 r = mod;
        uint256 newR = a;

        while (newR != 0) {
            uint256 quotient = r / newR;
            (t, newT) = (newT, t - quotient * newT);
            (r, newR) = (newR, r - quotient * newR);
        }

        if (t > mod) t = t % mod;
        return t;
    }
}
