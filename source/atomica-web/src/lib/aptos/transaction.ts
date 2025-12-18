import {
    Serializer,
    AccountAuthenticator,
    AccountAddress,
} from "@aptos-labs/ts-sdk";
import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import { ethers } from "ethers";
import { sha3_256 } from "@noble/hashes/sha3";
import { aptos } from "./config";
import {
    getDerivedAddress,
    calculateAbstractDigest,
    constructSIWEMessage,
    serializeSIWEAbstractSignature,
    serializeSIWEAbstractPublicKey,
    SIWEAccountAuthenticator,
} from "./siwe";

function sha3(bytes: Uint8Array): Uint8Array {
    return sha3_256(bytes);
}

export interface PreparedTransaction {
    transaction: any;
    auth: AccountAuthenticator;
    senderAddress: AccountAddress;
    debugState: any;
    payload: InputGenerateTransactionPayloadData;
}

export async function prepareNativeTransaction(
    ethAddress: string,
    payload: InputGenerateTransactionPayloadData,
): Promise<PreparedTransaction> {
    if (!window.ethereum) throw new Error("MetaMask not found");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    // Use lowercase address to match Rust smoke test behavior
    const checksummedAddress = ethAddress.toLowerCase();
    const senderAddress = await getDerivedAddress(checksummedAddress);

    // Check if account exists (logging only)
    try {
        const accountInfo = await aptos.getAccountInfo({
            accountAddress: senderAddress,
        });
        console.log("=== Account Info ===");
        console.log("  Account exists: true");
        console.log("  Sequence number:", accountInfo.sequence_number);
    } catch (e: any) {
        console.warn("Account may not exist yet (will be created on first tx)");
    }

    // 1. Build Transaction
    // Set expiration to 5 minutes from now (300 seconds)
    const expirationTimestamp = Math.floor(Date.now() / 1000) + 300;

    const transaction = await aptos.transaction.build.simple({
        sender: senderAddress,
        data: payload,
        options: {
            expireTimestamp: expirationTimestamp,
        },
    });

    // 2. Get Signing Message (Prefix + BCS)
    const rawTxn = transaction.rawTransaction;
    const rawTxnBytes = new Serializer();
    rawTxn.serialize(rawTxnBytes);
    const rawTxnBcs = rawTxnBytes.toUint8Array();

    const rawTxnSalt = sha3(new TextEncoder().encode("APTOS::RawTransaction"));
    const originalSigningMessage = new Uint8Array(
        rawTxnSalt.length + rawTxnBcs.length,
    );
    originalSigningMessage.set(rawTxnSalt);
    originalSigningMessage.set(rawTxnBcs, rawTxnSalt.length);

    // 3. Calculate Abstract Digest
    const digest = calculateAbstractDigest(originalSigningMessage);
    const digestHex = ethers.hexlify(digest);

    // 4. SIWE
    const ledgerInfo = await aptos.getLedgerInfo();
    const issuedAt = new Date().toISOString();
    // Protocol has trailing colon, e.g. "http:", we want "http"
    const scheme = window.location.protocol.slice(0, -1);
    const domain = window.location.host;

    // Determine Network Name based on Chain ID
    let networkName = `custom network: ${ledgerInfo.chain_id}`;
    if (ledgerInfo.chain_id === 1) networkName = "mainnet";
    else if (ledgerInfo.chain_id === 2) networkName = "testnet";
    else if (ledgerInfo.chain_id === 4) networkName = "local";

    // Extract Entry Function Name
    const entryFunction = (payload as any).function;
    if (!entryFunction)
        throw new Error("Could not determine entry function name from payload");

    // Construct Strict Statement
    const statement = `Please confirm you explicitly initiated this request from ${domain}. You are approving to execute transaction ${entryFunction} on Aptos blockchain (${networkName}).`;

    const siwe = constructSIWEMessage(
        domain,
        checksummedAddress,
        statement,
        window.location.origin,
        "1",
        ledgerInfo.chain_id,
        digestHex,
        issuedAt,
    );

    // 5. Sign
    const signature = await signer.signMessage(siwe);

    // 6. Create Authenticator
    const signatureBytes = ethers.getBytes(signature);
    const ethAddressBytes = new TextEncoder().encode(checksummedAddress);

    // DEBUG LOGGING START
    const siweBytes = new TextEncoder().encode(siwe);
    const debugState = {
        ethAddress: checksummedAddress,
        ethAddressBytes: Array.from(ethAddressBytes),
        digest: digestHex,
        digestBytes: Array.from(digest),
        scheme: scheme,
        domain: domain,
        issuedAt: issuedAt,
        siweMessage: siwe,
        siweMessageLength: siweBytes.length,
        siweMessageBytes: Array.from(siweBytes),
        signature: signature,
        signatureBytes: Array.from(signatureBytes),
        chain_id: ledgerInfo.chain_id,
        entryFunction: entryFunction,
        origin: window.location.origin,
        networkName: networkName
    };
    console.log("PrepareTransaction Debug:", JSON.stringify(debugState, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    // DEBUG LOGGING END

    // Build the SIWE abstract signature (scheme, issuedAt, signature)
    const abstractSignature = serializeSIWEAbstractSignature(
        scheme,
        issuedAt,
        signatureBytes,
    );

    // Build the SIWE abstract public key (ethAddress, domain)
    const accountIdentity = serializeSIWEAbstractPublicKey(
        ethAddressBytes,
        domain,
    );

    // Create account authenticator using SDK enums
    const auth = new SIWEAccountAuthenticator(
        digest,
        abstractSignature,
        accountIdentity,
    );

    return {
        transaction,
        auth,
        senderAddress,
        debugState,
        payload
    };
}

export async function simulateNativeTransaction(preparedTx: PreparedTransaction) {
    console.log("\n=== Simulating Transaction ===");
    try {
        const [simulationResult] = await aptos.transaction.simulate.simple({
            transaction: preparedTx.transaction,
            // @ts-ignore
            senderAuthenticator: preparedTx.auth,
        });

        console.log("Simulation Result:");
        console.log("  Success:", simulationResult.success);
        console.log("  VM Status:", simulationResult.vm_status);
        console.log("  Gas used:", simulationResult.gas_used);

        if (!simulationResult.success) {
            console.error("❌ Simulation failed!");
            console.error("Full simulation result:", JSON.stringify(simulationResult, null, 2));
        }
        return simulationResult;
    } catch (simError: any) {
        console.error("❌ Simulation error:", simError.message);
        throw simError;
    }
}

export async function submitPreparedTransaction(preparedTx: PreparedTransaction) {
    const { transaction, auth, senderAddress, debugState, payload } = preparedTx;
    try {
        console.log("\n=== Submitting Transaction ===");
        console.log("Transaction payload:", JSON.stringify(payload, (_key, value) => {
            return typeof value === 'bigint' ? value.toString() : value;
        }, 2));
        console.log("Sender address:", senderAddress.toString());

        const pendingTx = await aptos.transaction.submit.simple({
            transaction,
            senderAuthenticator: auth,
        });

        console.log("\n⏳ Transaction submitted, waiting for execution...");
        console.log("Transaction hash:", pendingTx.hash);

        // Wait for the transaction to be executed and check if it succeeded
        const executedTx = await aptos.waitForTransaction({
            transactionHash: pendingTx.hash,
        });

        if (!executedTx.success) {
            console.error("\n❌ Transaction execution failed!");
            console.error("VM Status:", executedTx.vm_status);
            throw new Error(`Transaction failed: ${executedTx.vm_status}`);
        }

        console.log("\n✅ Transaction executed successfully!");
        console.log("Transaction hash:", pendingTx.hash);

        return pendingTx;
    } catch (e: any) {
        console.error("\n❌ Submission Failed");
        console.error("Error message:", e.message);
        console.error("Error stack:", e.stack);

        // Log the debug state again on failure for visibility
        console.error("\n=== Debug State on Failure ===");
        console.error(JSON.stringify(debugState, null, 2));

        if (e.response) {
            console.error("\n=== Response Details ===");
            console.error("Status:", e.response.status);
            console.error("Status Text:", e.response.statusText);

            try {
                const responseText = await e.response.text();
                console.error("Response Body:", responseText);

                try {
                    const responseJson = JSON.parse(responseText);
                    console.error("Parsed Response:", JSON.stringify(responseJson, null, 2));

                    if (responseJson.vm_error_code !== undefined) {
                        console.error("\n=== VM Error Details ===");
                        console.error("VM Error Code:", responseJson.vm_error_code);
                        console.error("Message:", responseJson.message);

                        // Provide specific guidance based on error code
                        if (responseJson.vm_error_code === 1) {
                            console.error("\n💡 INVALID_SIGNATURE (code 1) detected");
                            console.error("This means the Move contract's signature verification failed");
                            console.error("\nPossible causes:");
                            console.error("1. Entry function name mismatch between SIWE message and transaction");
                            console.error("2. Account address derivation issue");
                            console.error("3. BCS serialization mismatch");
                            console.error("\nDebugging steps:");
                            console.error("- Check that entry function in SIWE matches transaction payload");
                            console.error("- Verify the sender address is correctly derived");
                            console.error("- Check Move contract logs if available");
                        }
                    }
                } catch (jsonError) {
                    // Response wasn't JSON, that's okay
                }
            } catch (textError) {
                console.error("Could not read response text");
            }
        }

        throw new Error(
            `Transaction Submission verification failed: ${e.message || e}\nDebug State: ${JSON.stringify(debugState, null, 2)}`,
        );
    }
}

export async function submitNativeTransaction(
    ethAddress: string,
    payload: InputGenerateTransactionPayloadData | PreparedTransaction,
) {
    // Overload: Check if payload is actually a PreparedTransaction
    if ('auth' in payload && 'transaction' in payload) {
        return submitPreparedTransaction(payload as PreparedTransaction);
    }

    // Default flow: Prepare -> Simulate -> Submit
    const prepared = await prepareNativeTransaction(ethAddress, payload as InputGenerateTransactionPayloadData);

    // Backward compatibility: Simulate and log, but don't block unless error throws
    try {
        await simulateNativeTransaction(prepared);
    } catch (e) {
        console.error("Simulation error caught in wrapper, proceeding to submit...");
    }

    return await submitPreparedTransaction(prepared);
}
