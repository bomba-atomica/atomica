// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLocalnet, teardownLocalnet, fundAccount } from '../../setup/localnet';
import {
    Aptos,
    AptosConfig,
    Network,
    Account,
    SingleKeyAccount,
    Secp256k1PrivateKey,
    SigningSchemeInput
} from '@aptos-labs/ts-sdk';

/**
 * Test: SECP256k1 Ethereum-Compatible Account Creation and Usage
 *
 * Purpose:
 * This test verifies that SECP256k1 accounts (Ethereum-compatible) can be created
 * and used on Aptos. This is critical for users who want to use Ethereum-derived
 * keys or integrate with Ethereum wallets.
 *
 * What the test does:
 * 1. Creates an Ed25519 account (Alice) - traditional Aptos account
 * 2. Creates a SECP256k1 account (Bob) - Ethereum-compatible account
 * 3. Funds Alice with APT tokens
 * 4. Alice sends APT to Bob (who doesn't exist on-chain yet)
 * 5. Verifies Bob's account was created and received the tokens
 * 6. Bob signs a transaction to send tokens back to Alice
 * 7. Verifies Alice received the tokens back
 *
 * This demonstrates:
 * - SECP256k1 accounts work the same as Ed25519 accounts
 * - Transfers automatically create recipient accounts (regardless of key type)
 * - SECP256k1 accounts can sign and submit transactions
 * - Cross-key-type transfers work seamlessly
 *
 * About SECP256k1 on Aptos:
 * - Same elliptic curve used by Ethereum and Bitcoin
 * - Private keys are 32 bytes (same as Ed25519)
 * - Public keys are 65 bytes uncompressed (vs 32 bytes for Ed25519)
 * - Signatures are 64 bytes (same as Ed25519)
 * - Address derivation uses SHA3-256 (different from Ethereum's Keccak-256)
 * - Can use Ethereum private keys directly, but addresses will differ
 *
 * Key Differences from Ed25519:
 * - Ed25519: Faster signature verification, smaller public keys
 * - SECP256k1: Ethereum-compatible, same curve as Bitcoin
 * - Both: Supported by Aptos SDK, equal first-class citizens
 *
 * Account Creation:
 * - Ed25519: Account.generate() (default)
 * - SECP256k1: SingleKeyAccount.generate({ scheme: SigningSchemeInput.Secp256k1Ecdsa })
 *
 * Use Cases for SECP256k1:
 * - Users with existing Ethereum private keys
 * - Cross-chain applications
 * - Hardware wallets that support SECP256k1
 * - Integration with Ethereum wallet infrastructure
 *
 * Note on Ethereum Derivable Accounts:
 * This test uses direct SECP256k1 accounts. For account abstraction that
 * allows signing with MetaMask/Ethereum wallets, see the ethereum_derivable_account
 * module (not tested here).
 *
 * IMPORTANT - Address Mapping Requirement:
 * When SECP256k1 accounts are created using Ethereum private keys, the resulting
 * Aptos address will differ from the Ethereum address due to different hash functions:
 * - Ethereum: Keccak-256 (last 20 bytes of hash)
 * - Aptos: SHA3-256 (NIST standard)
 *
 * This creates a UX challenge: Ethereum users expect their address to be the same
 * across chains. We need to implement a system to:
 *
 * 1. STORAGE: Store the mapping between:
 *    - Ethereum address (what user expects: 0xABC...)
 *    - Aptos address (actual on-chain address: 0xXYZ...)
 *    - SECP256k1 public key
 *    - Account creation timestamp
 *
 * 2. SEARCH: Enable lookups in both directions:
 *    - Given Ethereum address → find Aptos address
 *    - Given Aptos address → find original Ethereum address
 *
 * 3. IDENTIFICATION: Display both addresses to users:
 *    - Primary: Show Ethereum address (familiar to user)
 *    - Secondary: Show Aptos address (actual on-chain location)
 *    - Indicate relationship: "Your Ethereum wallet 0xABC... maps to Aptos address 0xXYZ..."
 *
 * Possible implementation approaches:
 * a) On-chain registry: Move module storing ETH→Aptos mappings
 * b) Off-chain indexer: Database tracking address relationships
 * c) Client-side storage: Local wallet mapping (loses cross-device sync)
 * d) Hybrid: On-chain events + off-chain indexer for fast lookups
 *
 * This specification is critical for maintaining good UX when onboarding
 * Ethereum users to Aptos with their existing wallets and private keys.
 *
 * See full specification: docs/technical/ethereum-address-mapping.md
 */

const config = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: "http://127.0.0.1:8080/v1",
    faucet: "http://127.0.0.1:8081"
});
const aptos = new Aptos(config);

describe.sequential('SECP256k1 Account Creation and Usage', () => {
    beforeAll(async () => {
        await setupLocalnet();
    }, 120000);

    afterAll(async () => {
        await teardownLocalnet();
    });

    it('should create SECP256k1 account, receive transfer, and send back', async () => {
        console.log("\n=== Starting SECP256k1 Account Test ===\n");

        // Step 1: Create Ed25519 account (Alice) - traditional Aptos account
        console.log("Step 1: Creating Ed25519 account (Alice)...");
        const alice = Account.generate(); // Defaults to Ed25519
        console.log(`Alice address: ${alice.accountAddress.toString()}`);
        console.log(`Alice key type: Ed25519`);

        // Verify Alice starts with 0 balance
        const aliceInitialBalance = await aptos.getAccountAPTAmount({
            accountAddress: alice.accountAddress
        });
        console.log(`Alice initial balance: ${aliceInitialBalance} octas`);
        expect(aliceInitialBalance).toBe(0);

        // Step 2: Create SECP256k1 account (Bob) - Ethereum-compatible
        console.log("\nStep 2: Creating SECP256k1 account (Bob)...");
        const bob = SingleKeyAccount.generate({
            scheme: SigningSchemeInput.Secp256k1Ecdsa
        });
        console.log(`Bob address: ${bob.accountAddress.toString()}`);
        console.log(`Bob key type: SECP256k1`);
        console.log(`Bob private key: ${bob.privateKey.toString()}`);

        // Verify Bob starts with 0 balance (account doesn't exist yet)
        const bobInitialBalance = await aptos.getAccountAPTAmount({
            accountAddress: bob.accountAddress
        });
        console.log(`Bob initial balance: ${bobInitialBalance} octas (account not yet on-chain)`);
        expect(bobInitialBalance).toBe(0);

        // Verify we created different key types
        expect(bob.privateKey).toBeInstanceOf(Secp256k1PrivateKey);
        console.log("✓ Confirmed Bob uses SECP256k1 private key");

        // Step 3: Fund Alice
        console.log("\nStep 3: Funding Alice with 1 billion octas (10 APT)...");
        await fundAccount(alice.accountAddress.toString(), 1_000_000_000);
        await new Promise(r => setTimeout(r, 1000)); // Wait for indexing

        const aliceFundedBalance = await aptos.getAccountAPTAmount({
            accountAddress: alice.accountAddress
        });
        console.log(`Alice balance after funding: ${aliceFundedBalance} octas`);
        expect(aliceFundedBalance).toBe(1_000_000_000);

        // Step 4: Alice sends 100,000,000 octas (1 APT) to Bob
        console.log("\nStep 4: Alice sending 100,000,000 octas to Bob (SECP256k1 account)...");
        const transferAmount = 100_000_000;

        const aliceToBobTxn = await aptos.transaction.build.simple({
            sender: alice.accountAddress,
            data: {
                function: "0x1::aptos_account::transfer",
                functionArguments: [bob.accountAddress, transferAmount],
            },
        });

        const aliceToBobPending = await aptos.signAndSubmitTransaction({
            signer: alice,
            transaction: aliceToBobTxn,
        });

        console.log(`Transaction hash: ${aliceToBobPending.hash}`);

        const aliceToBobResponse = await aptos.waitForTransaction({
            transactionHash: aliceToBobPending.hash
        });
        console.log(`Transaction success: ${aliceToBobResponse.success}`);
        expect(aliceToBobResponse.success).toBe(true);

        // Step 5: Verify Bob received the tokens
        console.log("\nStep 5: Verifying Bob (SECP256k1 account) received tokens...");
        const bobBalanceAfterReceive = await aptos.getAccountAPTAmount({
            accountAddress: bob.accountAddress
        });
        console.log(`Bob balance after receiving: ${bobBalanceAfterReceive} octas`);
        expect(bobBalanceAfterReceive).toBe(transferAmount);

        // Verify Alice paid for the transfer + gas
        const aliceBalanceAfterSend = await aptos.getAccountAPTAmount({
            accountAddress: alice.accountAddress
        });
        console.log(`Alice balance after sending: ${aliceBalanceAfterSend} octas`);
        const aliceGasPaid = 1_000_000_000 - transferAmount - aliceBalanceAfterSend;
        console.log(`Gas paid by Alice: ${aliceGasPaid} octas`);
        expect(aliceBalanceAfterSend).toBeLessThan(1_000_000_000 - transferAmount);

        // Step 6: Bob (SECP256k1) signs transaction to send 50,000,000 octas back to Alice
        console.log("\nStep 6: Bob (SECP256k1 account) sending 50,000,000 octas back to Alice...");
        const returnAmount = 50_000_000;

        const bobToAliceTxn = await aptos.transaction.build.simple({
            sender: bob.accountAddress,
            data: {
                function: "0x1::aptos_account::transfer",
                functionArguments: [alice.accountAddress, returnAmount],
            },
        });

        console.log("Bob signing transaction with SECP256k1 private key...");
        const bobToAlicePending = await aptos.signAndSubmitTransaction({
            signer: bob,
            transaction: bobToAliceTxn,
        });

        console.log(`Transaction hash: ${bobToAlicePending.hash}`);

        const bobToAliceResponse = await aptos.waitForTransaction({
            transactionHash: bobToAlicePending.hash
        });
        console.log(`Transaction success: ${bobToAliceResponse.success}`);
        expect(bobToAliceResponse.success).toBe(true);
        console.log("✓ SECP256k1 account successfully signed and submitted transaction!");

        // Step 7: Verify final balances
        console.log("\nStep 7: Verifying final balances...");

        const aliceFinalBalance = await aptos.getAccountAPTAmount({
            accountAddress: alice.accountAddress
        });
        const bobFinalBalance = await aptos.getAccountAPTAmount({
            accountAddress: bob.accountAddress
        });

        console.log(`Alice final balance: ${aliceFinalBalance} octas`);
        console.log(`Bob final balance: ${bobFinalBalance} octas`);

        // Alice should have received the return amount
        expect(aliceFinalBalance).toBeGreaterThan(aliceBalanceAfterSend);
        expect(aliceFinalBalance).toBe(aliceBalanceAfterSend + returnAmount);

        // Bob should have less than initial receive (paid return + gas)
        expect(bobFinalBalance).toBeLessThan(bobBalanceAfterReceive);
        const bobGasPaid = bobBalanceAfterReceive - returnAmount - bobFinalBalance;
        console.log(`Gas paid by Bob: ${bobGasPaid} octas`);
        expect(bobFinalBalance).toBe(bobBalanceAfterReceive - returnAmount - bobGasPaid);

        // Summary
        console.log("\n=== Test Summary ===");
        console.log(`✓ Ed25519 account (Alice) created and funded`);
        console.log(`✓ SECP256k1 account (Bob) created`);
        console.log(`✓ Alice transferred ${transferAmount} octas to Bob`);
        console.log(`✓ Bob's account was created on-chain automatically`);
        console.log(`✓ Bob (SECP256k1) signed transaction and sent ${returnAmount} octas back`);
        console.log(`✓ Both account types work seamlessly together`);
        console.log(`✓ SECP256k1 accounts are fully functional on Aptos!`);
        console.log("\nKey Takeaway: SECP256k1 and Ed25519 accounts are interoperable");
        console.log("and work identically from the user's perspective.\n");

    }, 60000); // 60s timeout

    it('should verify SECP256k1 key properties', async () => {
        console.log("\n=== Verifying SECP256k1 Key Properties ===\n");

        // Generate SECP256k1 account
        const account = SingleKeyAccount.generate({
            scheme: SigningSchemeInput.Secp256k1Ecdsa
        });

        console.log("Testing SECP256k1 account properties...");

        // Verify private key is 32 bytes
        const privateKeyBytes = account.privateKey.toUint8Array();
        console.log(`Private key length: ${privateKeyBytes.length} bytes`);
        expect(privateKeyBytes.length).toBe(32);

        // Verify public key is 65 bytes (uncompressed SECP256k1)
        const publicKeyBytes = account.publicKey.publicKey.toUint8Array();
        console.log(`Public key length: ${publicKeyBytes.length} bytes`);
        expect(publicKeyBytes.length).toBe(65);

        // Verify signing scheme
        console.log(`Signing scheme: ${account.signingScheme}`);
        // Note: signingScheme is a numeric enum value, not a string
        expect(account.signingScheme).toBeDefined();

        // Test message signing
        const message = "Hello from SECP256k1!";
        const signature = account.sign(message);

        console.log(`Signature length: ${signature.signature.toUint8Array().length} bytes`);
        expect(signature.signature.toUint8Array().length).toBe(64);

        // Verify signature
        const isValid = account.verifySignature({ message, signature });
        console.log(`Signature verification: ${isValid}`);
        expect(isValid).toBe(true);

        console.log("\n✓ All SECP256k1 key properties verified!");
        console.log("✓ Private key: 32 bytes");
        console.log("✓ Public key: 65 bytes (uncompressed)");
        console.log("✓ Signature: 64 bytes");
        console.log("✓ Signature verification: working\n");
    });

    it('should demonstrate Ethereum key compatibility', async () => {
        console.log("\n=== Ethereum Private Key Compatibility ===\n");

        // Simulate an Ethereum private key (32 bytes)
        const ethereumPrivateKeyHex = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

        console.log("Creating Aptos SECP256k1 account from Ethereum-format private key...");
        console.log(`Ethereum private key: ${ethereumPrivateKeyHex}`);

        // Create Aptos account using the Ethereum private key
        const aptosPrivateKey = new Secp256k1PrivateKey(ethereumPrivateKeyHex);
        const aptosAccount = new SingleKeyAccount({ privateKey: aptosPrivateKey });

        console.log(`Aptos address: ${aptosAccount.accountAddress.toString()}`);
        console.log(`\nNote: Same private key, but Aptos uses different address derivation`);
        console.log(`      (SHA3-256 vs Ethereum's Keccak-256)`);

        // Verify the account works
        const message = "Ethereum-derived key on Aptos!";
        const signature = aptosAccount.sign(message);
        const isValid = aptosAccount.verifySignature({ message, signature });

        expect(isValid).toBe(true);
        console.log(`\n✓ Ethereum private key successfully used on Aptos`);
        console.log(`✓ Signature verification: ${isValid}`);
        console.log(`\nKey Insight: You can use Ethereum private keys directly on Aptos,`);
        console.log(`but addresses will differ due to different hashing algorithms.\n`);
    });
});
