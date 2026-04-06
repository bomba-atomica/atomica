export { CONTRACT_ADDR } from "./config.js";
import { CONTRACT_ADDR, aptos } from "./config.js";
import { getDerivedAddress } from "./siwe.js";
import { submitNativeTransaction } from "./transaction.js";
/**
 * Sanity Test: Simple APT transfer using MetaMask signature
 * This tests ONLY the signature verification without any custom contracts
 */
export async function testSimpleAPTTransfer(ethAddress, customRecipient) {
    console.log("\n=== 🧪 Sanity Test: Simple APT Transfer ===");
    console.log("This tests signature verification with the simplest possible transaction");
    console.log("Using: 0x1::aptos_account::transfer (standard Aptos function)\n");
    // Show which addresses we're using
    const derivedAddress = await getDerivedAddress(ethAddress.toLowerCase());
    console.log("ETH Address (identity):", ethAddress);
    console.log("Aptos Derived Address (sender):", derivedAddress.toString());
    console.log("This is the same address the faucet funded ✓\n");
    // Generate a random recipient address (standard Ed25519 Aptos account) if not provided
    const randomRecipient = "0x" +
        Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
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
    }
    catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("\n❌ SANITY TEST FAILED!");
        console.error("Error:", errorMessage);
        console.error("\nConclusion: There's a fundamental issue with signature verification");
        console.error("This needs to be fixed before trying custom contracts\n");
        return { success: false, error: errorMessage };
    }
}
/**
 * Step 1: Request APT tokens from faucet for gas
 */
export async function requestAPT(ethAddress) {
    // Always use lowercase for consistency with submitNativeTransaction
    const derived = await getDerivedAddress(ethAddress.toLowerCase());
    const FAUCET_URL = "http://127.0.0.1:8081";
    console.log("=== Requesting APT from Faucet ===");
    console.log("  Ethereum Address:", ethAddress);
    console.log("  Aptos Derived Address:", derived.toString());
    console.log("  Funding address:", derived.toString());
    const res = await fetch(`${FAUCET_URL}/mint?amount=100000000&address=${derived.toString()}`, {
        method: "POST",
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "No response text");
        console.error(`Faucet API Failed: ${res.status} ${res.statusText} - ${text}`);
        throw new Error(`Faucet API Failed: ${text}`);
    }
    // Wait slightly for balance to reflect (local node is fast but async)
    await new Promise((r) => setTimeout(r, 1000));
    return { hash: "apt-funded" };
}
/**
 * Check if core auction contracts are deployed on Aptos.
 * Fake token minting happens on Ethereum — there are no fake_eth/fake_usd Move modules.
 */
export async function areContractsDeployed() {
    try {
        const modules = await aptos.getAccountModules({
            accountAddress: CONTRACT_ADDR,
        });
        const deployed = new Set(modules
            .map((m) => m.abi?.name)
            .filter(Boolean));
        return deployed.has("auction") && deployed.has("lock_receipt");
    }
    catch (e) {
        console.log("Contracts not yet deployed:", e);
        return false;
    }
}
/**
 * Fund account with APT gas tokens.
 */
export async function submitFaucet(ethAddress) {
    await requestAPT(ethAddress);
    return { hash: "gas-funded" };
}
/**
 * @deprecated Fake tokens mint on Ethereum — this no-op stub remains for
 * backward-compatible callers during the Phase 1→2 transition.
 */
export async function requestTestTokens(_ethAddress) {
    console.warn("requestTestTokens: fake token minting moved to Ethereum side");
    return { hash: "noop" };
}
export function getCreateAuctionPayload(amountEth, minPrice, duration, mpk) {
    return {
        function: `${CONTRACT_ADDR}::auction::create_auction`,
        functionArguments: [amountEth, minPrice, duration, mpk],
    };
}
export async function submitCreateAuction(ethAddress, amountEth, minPrice, duration, mpk) {
    return await submitNativeTransaction(ethAddress, getCreateAuctionPayload(amountEth, minPrice, duration, mpk));
}
export function getBidPayload(sellerAddr, amountUsd, _u, _v) {
    return {
        function: `${CONTRACT_ADDR}::auction::submit_bid`,
        functionArguments: [sellerAddr, amountUsd],
    };
}
export async function submitBid(ethAddress, sellerAddr, amountUsd, u, v) {
    return await submitNativeTransaction(ethAddress, getBidPayload(sellerAddr, amountUsd, u, v));
}
