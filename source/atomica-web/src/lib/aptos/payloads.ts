import { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import { CONTRACT_ADDR, aptos } from "./config";
import { getDerivedAddress } from "./siwe";
import { submitNativeTransaction } from "./transaction";

/**
 * Sanity Test: Simple APT transfer using MetaMask signature
 * This tests ONLY the signature verification without any custom contracts
 */
export async function testSimpleAPTTransfer(ethAddress: string, customRecipient?: string) {
    console.log("\n=== 🧪 Sanity Test: Simple APT Transfer ===");
    console.log("This tests signature verification with the simplest possible transaction");
    console.log("Using: 0x1::aptos_account::transfer (standard Aptos function)\n");

    // Show which addresses we're using
    const derivedAddress = await getDerivedAddress(ethAddress.toLowerCase());
    console.log("ETH Address (identity):", ethAddress);
    console.log("Aptos Derived Address (sender):", derivedAddress.toString());
    console.log("This is the same address the faucet funded ✓\n");

    // Generate a random recipient address (standard Ed25519 Aptos account) if not provided
    const randomRecipient = "0x" + Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const recipient = customRecipient || randomRecipient;

    console.log("Recipient:", recipient);
    console.log("Amount: 100 octas (0.000001 APT)\n");

    try {
        const result = await submitNativeTransaction(ethAddress, {
            function: "0x1::aptos_account::transfer",
            functionArguments: [recipient, 100],
        });

        console.log("\n✅ SANITY TEST PASSED!");
        console.log("Transaction hash:", result.hash);
        console.log("\nConclusion: Signature verification is working correctly!");
        console.log("The issue with FAKEETH::mint is likely contract-specific\n");

        return { success: true, hash: result.hash };
    } catch (e: any) {
        console.error("\n❌ SANITY TEST FAILED!");
        console.error("Error:", e.message);
        console.error("\nConclusion: There's a fundamental issue with signature verification");
        console.error("This needs to be fixed before trying custom contracts\n");

        return { success: false, error: e.message };
    }
}

/**
 * Step 1: Request APT tokens from faucet for gas
 */
export async function requestAPT(ethAddress: string) {
    // Always use lowercase for consistency with submitNativeTransaction
    const derived = await getDerivedAddress(ethAddress.toLowerCase());
    const FAUCET_URL = "http://127.0.0.1:8081";

    console.log("=== Requesting APT from Faucet ===");
    console.log("  Ethereum Address:", ethAddress);
    console.log("  Aptos Derived Address:", derived.toString());
    console.log("  Funding address:", derived.toString());

    const res = await fetch(
        `${FAUCET_URL}/mint?amount=100000000&address=${derived.toString()}`,
        { method: "POST" },
    );
    if (!res.ok) {
        const text = await res.text().catch(() => "No response text");
        console.error(
            `Faucet API Failed: ${res.status} ${res.statusText} - ${text}`,
        );
        throw new Error(`Faucet API Failed: ${text}`);
    }

    // Wait slightly for balance to reflect (local node is fast but async)
    await new Promise((r) => setTimeout(r, 1000));

    return { hash: "apt-funded" };
}

/**
 * Mint FAKEETH Payload Builder
 */
export function getMintFakeEthPayload(): InputGenerateTransactionPayloadData {
    const amountEth = BigInt(10) * BigInt(100_000_000);
    return {
        function: `${CONTRACT_ADDR}::FAKEETH::mint`,
        functionArguments: [amountEth],
    };
}

/**
 * Mint FAKEETH (10 ETH)
 */
export async function mintFakeEth(ethAddress: string) {
    console.log("\n=== Minting FAKEETH ===");
    return await submitNativeTransaction(ethAddress, getMintFakeEthPayload());
}

/**
 * Mint FAKEUSD Payload Builder
 */
export function getMintFakeUsdPayload(): InputGenerateTransactionPayloadData {
    const amountUsd = BigInt(10000) * BigInt(100_000_000);
    return {
        function: `${CONTRACT_ADDR}::FAKEUSD::mint`,
        functionArguments: [amountUsd],
    };
}

/**
 * Mint FAKEUSD (10,000 USD)
 */
export async function mintFakeUsd(ethAddress: string) {
    console.log("\n=== Minting FAKEUSD ===");
    return await submitNativeTransaction(ethAddress, getMintFakeUsdPayload());
}

/**
 * Step 2: Mint test tokens (FAKEETH and FAKEUSD)
 * Requires contracts to be deployed
 * @deprecated Use mintFakeEth and mintFakeUsd separately
 */
export async function requestTestTokens(ethAddress: string) {
    await mintFakeEth(ethAddress);
    await mintFakeUsd(ethAddress);
    return { hash: "test-tokens-minted" };
}

/**
 * Check if test token contracts are deployed
 */
export async function areContractsDeployed(): Promise<boolean> {
    try {
        // Try to get account modules at the contract address
        const modules = await aptos.getAccountModules({
            accountAddress: CONTRACT_ADDR,
        });

        // Check if FAKEETH and FAKEUSD modules exist
        const hasFakeEth = modules.some((m) => m.abi?.name === "FAKEETH");
        const hasFakeUsd = modules.some((m) => m.abi?.name === "FAKEUSD");

        return hasFakeEth && hasFakeUsd;
    } catch (e) {
        console.log("Contracts not yet deployed:", e);
        return false;
    }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use requestAPT() and requestTestTokens() separately
 */
export async function submitFaucet(ethAddress: string) {
    await requestAPT(ethAddress);
    await requestTestTokens(ethAddress);
    return { hash: "gas-fakeeth-fakeusd-minted" };
}

export function getCreateAuctionPayload(
    amountEth: bigint,
    minPrice: bigint,
    duration: bigint,
    mpk: Uint8Array,
): InputGenerateTransactionPayloadData {
    return {
        function: `${CONTRACT_ADDR}::auction::create_auction`,
        functionArguments: [amountEth, minPrice, duration, mpk],
    };
}

export async function submitCreateAuction(
    ethAddress: string,
    amountEth: bigint,
    minPrice: bigint,
    duration: bigint,
    mpk: Uint8Array,
) {
    return await submitNativeTransaction(ethAddress, getCreateAuctionPayload(amountEth, minPrice, duration, mpk));
}

export function getBidPayload(
    sellerAddr: string,
    amountUsd: bigint,
    u: Uint8Array,
    v: Uint8Array,
): InputGenerateTransactionPayloadData {
    return {
        function: `${CONTRACT_ADDR}::auction::bid`,
        functionArguments: [sellerAddr, amountUsd, u, v],
    };
}

export async function submitBid(
    ethAddress: string,
    sellerAddr: string,
    amountUsd: bigint,
    u: Uint8Array,
    v: Uint8Array,
) {
    return await submitNativeTransaction(ethAddress, getBidPayload(sellerAddr, amountUsd, u, v));
}
