/**
 * Transaction helpers for Ethereum testnet
 *
 * Handles minting FakeETH and FakeUSD via MetaMask
 */

import { ethers } from "ethers";
import {
  getFakeETHContractWithSigner,
  getFakeUSDContractWithSigner,
} from "./contracts";
import { connectMetaMask, isCorrectNetwork, switchToTestnet } from "./config";

export interface TransactionResult {
  hash: string;
  from: string;
  to: string;
  wait: () => Promise<ethers.TransactionReceipt | null>;
}

/**
 * Ensure MetaMask is connected and on correct network
 */
async function ensureConnected(): Promise<string> {
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
export async function mintFakeETH(
  amount: bigint
): Promise<TransactionResult> {
  await ensureConnected();

  const contract = await getFakeETHContractWithSigner();
  const signer = await contract.runner?.getAddress();

  if (!signer) {
    throw new Error("No signer available");
  }

  // Call mint function
  const tx = await contract.mint(signer, amount);

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
export async function mintFakeUSD(
  amount: bigint
): Promise<TransactionResult> {
  await ensureConnected();

  const contract = await getFakeUSDContractWithSigner();
  const signer = await contract.runner?.getAddress();

  if (!signer) {
    throw new Error("No signer available");
  }

  // Call mint function
  const tx = await contract.mint(signer, amount);

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
export async function mint10FakeETH(): Promise<TransactionResult> {
  const amount = 10n * 10n ** 18n; // 10 ETH
  return mintFakeETH(amount);
}

/**
 * Mint 10,000 FakeUSD (convenience function)
 */
export async function mint10kFakeUSD(): Promise<TransactionResult> {
  const amount = 10_000n * 10n ** 6n; // 10,000 USD
  return mintFakeUSD(amount);
}

/**
 * Wait for a transaction to be mined
 * @param txHash Transaction hash
 * @param confirmations Number of confirmations to wait for (default: 1)
 * @returns Transaction receipt
 */
export async function waitForTransaction(
  txHash: string,
  confirmations: number = 1
): Promise<ethers.TransactionReceipt | null> {
  const provider = (await getFakeETHContractWithSigner()).runner?.provider;

  if (!provider) {
    throw new Error("No provider available");
  }

  return provider.waitForTransaction(txHash, confirmations);
}

/**
 * Get transaction status
 * @param txHash Transaction hash
 * @returns Transaction receipt or null if not mined
 */
export async function getTransactionStatus(
  txHash: string
): Promise<ethers.TransactionReceipt | null> {
  const provider = (await getFakeETHContractWithSigner()).runner?.provider;

  if (!provider) {
    throw new Error("No provider available");
  }

  return provider.getTransactionReceipt(txHash);
}

/**
 * Estimate gas for minting FakeETH
 */
export async function estimateMintFakeETHGas(amount: bigint): Promise<bigint> {
  await ensureConnected();

  const contract = await getFakeETHContractWithSigner();
  const signer = await contract.runner?.getAddress();

  if (!signer) {
    throw new Error("No signer available");
  }

  return contract.mint.estimateGas(signer, amount);
}

/**
 * Estimate gas for minting FakeUSD
 */
export async function estimateMintFakeUSDGas(amount: bigint): Promise<bigint> {
  await ensureConnected();

  const contract = await getFakeUSDContractWithSigner();
  const signer = await contract.runner?.getAddress();

  if (!signer) {
    throw new Error("No signer available");
  }

  return contract.mint.estimateGas(signer, amount);
}
