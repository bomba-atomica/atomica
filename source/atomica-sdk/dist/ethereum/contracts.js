/**
 * Contract instances and helpers for FakeETH and FakeUSD
 *
 * Provides typed contract instances using ethers.js
 */
import { ethers } from "ethers";
import { FAKE_ETH_ABI, FAKE_USD_ABI } from "./abis.js";
import { FAKE_ETH_ADDRESS, FAKE_USD_ADDRESS, getEthereumProvider, getMetaMaskProvider, } from "./config.js";
/**
 * Get FakeETH contract instance (read-only)
 */
export function getFakeETHContract() {
    const provider = getEthereumProvider();
    return new ethers.Contract(FAKE_ETH_ADDRESS, FAKE_ETH_ABI, provider);
}
/**
 * Get FakeUSD contract instance (read-only)
 */
export function getFakeUSDContract() {
    const provider = getEthereumProvider();
    return new ethers.Contract(FAKE_USD_ADDRESS, FAKE_USD_ABI, provider);
}
/**
 * Get FakeETH contract instance with signer (for transactions)
 */
export async function getFakeETHContractWithSigner() {
    const provider = getMetaMaskProvider();
    if (!provider) {
        throw new Error("MetaMask provider not available");
    }
    const signer = await provider.getSigner();
    return new ethers.Contract(FAKE_ETH_ADDRESS, FAKE_ETH_ABI, signer);
}
/**
 * Get FakeUSD contract instance with signer (for transactions)
 */
export async function getFakeUSDContractWithSigner() {
    const provider = getMetaMaskProvider();
    if (!provider) {
        throw new Error("MetaMask provider not available");
    }
    const signer = await provider.getSigner();
    return new ethers.Contract(FAKE_USD_ADDRESS, FAKE_USD_ABI, signer);
}
/**
 * Check if contracts are deployed
 */
export async function areContractsDeployed() {
    try {
        const provider = getEthereumProvider();
        // Check if addresses have code deployed
        const fakeETHCode = await provider.getCode(FAKE_ETH_ADDRESS);
        const fakeUSDCode = await provider.getCode(FAKE_USD_ADDRESS);
        // "0x" means no code deployed
        return fakeETHCode !== "0x" && fakeUSDCode !== "0x";
    }
    catch (error) {
        console.warn("Failed to check contract deployment:", error);
        return false;
    }
}
/**
 * Get contract metadata for display
 */
export async function getContractMetadata() {
    const fakeETH = getFakeETHContract();
    const fakeUSD = getFakeUSDContract();
    const [ethName, ethSymbol, ethDecimals, ethMaxMint, usdName, usdSymbol, usdDecimals, usdMaxMint,] = await Promise.all([
        fakeETH.name(),
        fakeETH.symbol(),
        fakeETH.decimals(),
        fakeETH.MAX_MINT_AMOUNT(),
        fakeUSD.name(),
        fakeUSD.symbol(),
        fakeUSD.decimals(),
        fakeUSD.MAX_MINT_AMOUNT(),
    ]);
    return {
        fakeETH: {
            address: FAKE_ETH_ADDRESS,
            name: ethName,
            symbol: ethSymbol,
            decimals: Number(ethDecimals),
            maxMint: ethMaxMint,
        },
        fakeUSD: {
            address: FAKE_USD_ADDRESS,
            name: usdName,
            symbol: usdSymbol,
            decimals: Number(usdDecimals),
            maxMint: usdMaxMint,
        },
    };
}
