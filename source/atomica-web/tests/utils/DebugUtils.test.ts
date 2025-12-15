import { DebugUtils } from '../utils/DebugUtils';

describe('Debug Infrastructure Verification', () => {
    it('should generate and run a Move reproduction test from debug state', () => {
        // Values taken from the failed integration test log
        const debugState = {
            ethAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
            ethAddressBytes: [48, 120, 102, 51, 57, 102, 100, 54, 101, 53, 49, 97, 97, 100, 56, 56, 102, 54, 102, 52, 99, 101, 54, 97, 98, 56, 56, 50, 55, 50, 55, 57, 99, 102, 102, 102, 98, 57, 50, 50, 54, 54],
            digest: "0xda5eb47b75fadb93516a2f900bf03f9c2a23569d6ef2d6c6934b163ff7643e4c",
            digestBytes: [218, 94, 180, 123, 117, 250, 219, 147, 81, 106, 47, 144, 11, 240, 63, 156, 42, 35, 86, 157, 110, 242, 214, 198, 147, 75, 22, 63, 247, 100, 62, 76],
            scheme: "http",
            domain: "localhost:3000",
            issuedAt: "2025-12-13T22:14:41.446Z",
            siweMessage: "...",
            siweMessageLength: 441,
            siweMessageBytes: [],
            signature: "0x5ae636ff720fd12fbc4e1495dea909a6282b8e01ecba6de06fbc5580b5e0e9c60f2d2f4910dbcebb04eae62d318ada29bd4f0f2844469c95a0d4200ec4582a3a1b",
            signatureBytes: [],
            chain_id: 4,
            entryFunction: "0x1::aptos_account::transfer",
            origin: "http://localhost:3000",
            networkName: "local"
        };

        console.log("Generating reproduction package...");
        DebugUtils.generateReproPackage(debugState);

        console.log("Running Move test...");
        const result = DebugUtils.runMoveTest();

        // We expect the test to fail because the signature is indeed invalid in this context
        // But the key is that 'aptos move test' runs successfully and prints output
        if (result.stdout.includes("SUCCESS: Verified!")) {
            console.log("Unexpected success (verification passed?)");
        } else {
            console.log("Verification failed as expected (reproduced the error)");
        }

        // Assert that we saw the debug output
        if (!result.stdout.includes("=== Debug Reproduction ===")) {
            throw new Error("Did not find debug output in Move execution logs");
        }
    });
});
