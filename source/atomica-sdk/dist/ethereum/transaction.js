/**
 * Transaction helpers for Ethereum testnet
 *
 * Handles minting FakeETH and FakeUSD via MetaMask
 */
import { getFakeETHContractWithSigner, getFakeUSDContractWithSigner, } from "./contracts.js";
import { connectMetaMask, isCorrectNetwork, switchToTestnet, getEthereumProvider, } from "./config.js";
/**
 * Ensure MetaMask is connected and on correct network
 */
async function ensureConnected() {
    // Connect MetaMask
    const address = await connectMetaMask();
    // Check network
    const correctNetwork = await isCorrectNetwork();
    if (!correctNetwork) {
        await switchToTestnet();
    }
    return address;
}
/**
 * Mint FakeETH tokens
 * @param amount Amount to mint in wei (e.g., 10n * 10n**18n for 10 ETH)
 * @returns Transaction result
 */
export async function mintFakeETH(amount) {
    const address = await ensureConnected();
    const contract = await getFakeETHContractWithSigner();
    // Call mint function (mint to the connected address)
    const tx = await contract.mint(address, amount);
    return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        wait: () => tx.wait(),
    };
}
/**
 * Mint FakeUSD tokens
 * @param amount Amount to mint in smallest units (e.g., 10_000n * 10n**6n for 10,000 USD)
 * @returns Transaction result
 */
export async function mintFakeUSD(amount) {
    const address = await ensureConnected();
    const contract = await getFakeUSDContractWithSigner();
    // Call mint function (mint to the connected address)
    const tx = await contract.mint(address, amount);
    return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        wait: () => tx.wait(),
    };
}
/**
 * Mint 10 FakeETH (convenience function)
 */
export async function mint10FakeETH() {
    const amount = 10n * 10n ** 18n; // 10 ETH
    return mintFakeETH(amount);
}
/**
 * Mint 10,000 FakeUSD (convenience function)
 */
export async function mint10kFakeUSD() {
    const amount = 10000n * 10n ** 6n; // 10,000 USD
    return mintFakeUSD(amount);
}
/**
 * Request FakeETH and FakeUSD from the server-side faucet.
 * Uses the deployer account to mint tokens on behalf of the user
 * so the user doesn't need any ETH to pay gas.
 */
export async function requestEthTokens(recipientAddress) {
    const res = await fetch("/api/ethereum/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientAddress }),
    });
    const body = (await res.json().catch(() => ({})));
    if (!res.ok) {
        throw new Error(body.error || `Ethereum faucet failed: ${res.status}`);
    }
    return {
        ethTxHash: body.ethTxHash || "",
        usdTxHash: body.usdTxHash || "",
    };
}
/**
 * Wait for a transaction to be mined
 * @param txHash Transaction hash
 * @param confirmations Number of confirmations to wait for (default: 1)
 * @returns Transaction receipt
 */
export async function waitForTransaction(txHash, confirmations = 1) {
    const provider = getEthereumProvider();
    return provider.waitForTransaction(txHash, confirmations);
}
/**
 * Get transaction status
 * @param txHash Transaction hash
 * @returns Transaction receipt or null if not mined
 */
export async function getTransactionStatus(txHash) {
    const provider = getEthereumProvider();
    return provider.getTransactionReceipt(txHash);
}
/**
 * Estimate gas for minting FakeETH
 */
export async function estimateMintFakeETHGas(amount) {
    const address = await ensureConnected();
    const contract = await getFakeETHContractWithSigner();
    return contract.mint.estimateGas(address, amount);
}
/**
 * Estimate gas for minting FakeUSD
 */
export async function estimateMintFakeUSDGas(amount) {
    const address = await ensureConnected();
    const contract = await getFakeUSDContractWithSigner();
    return contract.mint.estimateGas(address, amount);
}
