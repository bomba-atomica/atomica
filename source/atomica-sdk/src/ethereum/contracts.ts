/**
 * Contract instances and helpers for FakeETH, FakeUSD, BLSVerifierTestnet, and Settlement.
 *
 * Provides typed contract instances using ethers.js.
 * Settlement bridge factories are used by bridge.ts (issue #112).
 *
 * @see source/atomica-sdk/src/settlement/bridge.ts
 * @see docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 */

import { ethers, Contract } from "ethers";
import {
  FAKE_ETH_ABI,
  FAKE_USD_ABI,
  BLS_VERIFIER_TESTNET_ABI,
  SETTLEMENT_ABI,
} from "./abis.js";
import {
  FAKE_ETH_ADDRESS,
  FAKE_USD_ADDRESS,
  getEthereumProvider,
  getMetaMaskProvider,
} from "./config.js";

/**
 * Get FakeETH contract instance (read-only)
 */
export function getFakeETHContract(): Contract {
  const provider = getEthereumProvider();
  return new ethers.Contract(FAKE_ETH_ADDRESS, FAKE_ETH_ABI, provider);
}

/**
 * Get FakeUSD contract instance (read-only)
 */
export function getFakeUSDContract(): Contract {
  const provider = getEthereumProvider();
  return new ethers.Contract(FAKE_USD_ADDRESS, FAKE_USD_ABI, provider);
}

/**
 * Get FakeETH contract instance with signer (for transactions)
 */
export async function getFakeETHContractWithSigner(): Promise<Contract> {
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
export async function getFakeUSDContractWithSigner(): Promise<Contract> {
  const provider = getMetaMaskProvider();
  if (!provider) {
    throw new Error("MetaMask provider not available");
  }

  const signer = await provider.getSigner();
  return new ethers.Contract(FAKE_USD_ADDRESS, FAKE_USD_ABI, signer);
}

// ── Settlement bridge contract factories (issue #112) ─────────────────────────

/**
 * Get a BLSVerifierTestnet contract instance with a signer attached.
 *
 * Used by bridge.ts::submitSettlement to call authorizeSettlement.
 * The `blsVerifierAddress` must be the deployed BLSVerifierTestnet address.
 *
 * @param provider  ethers JsonRpcProvider (Node.js / relayer script)
 * @param signer    ethers Wallet or JsonRpcSigner — must be the trustedRelayer EOA
 * @param blsVerifierAddress  Deployed BLSVerifierTestnet contract address
 * @returns Contract instance with signer
 * @see docs/architecture/v0-architecture.md §3.2
 */
export function getBLSVerifierTestnetContract(
  provider: ethers.JsonRpcProvider,
  signer: ethers.Signer,
  blsVerifierAddress: string,
): Contract {
  void provider; // provider may be used for read-only calls; signer provides write access
  return new ethers.Contract(
    blsVerifierAddress,
    BLS_VERIFIER_TESTNET_ABI,
    signer,
  );
}

/**
 * Get a Settlement contract instance (read-only) for querying state.
 *
 * @param provider         ethers JsonRpcProvider
 * @param settlementAddress Deployed Settlement.sol contract address
 * @returns Read-only Contract instance
 * @see docs/architecture/v0-architecture.md §3.2
 */
export function getSettlementContract(
  provider: ethers.JsonRpcProvider,
  settlementAddress: string,
): Contract {
  return new ethers.Contract(settlementAddress, SETTLEMENT_ABI, provider);
}

/**
 * Check if contracts are deployed
 */
export async function areContractsDeployed(): Promise<boolean> {
  try {
    const provider = getEthereumProvider();

    // Check if addresses have code deployed
    const fakeETHCode = await provider.getCode(FAKE_ETH_ADDRESS);
    const fakeUSDCode = await provider.getCode(FAKE_USD_ADDRESS);

    // "0x" means no code deployed
    return fakeETHCode !== "0x" && fakeUSDCode !== "0x";
  } catch (error) {
    console.warn("Failed to check contract deployment:", error);
    return false;
  }
}

/**
 * Get contract metadata for display
 */
export async function getContractMetadata(): Promise<{
  fakeETH: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    maxMint: bigint;
  };
  fakeUSD: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    maxMint: bigint;
  };
}> {
  const fakeETH = getFakeETHContract();
  const fakeUSD = getFakeUSDContract();

  const [
    ethName,
    ethSymbol,
    ethDecimals,
    ethMaxMint,
    usdName,
    usdSymbol,
    usdDecimals,
    usdMaxMint,
  ] = await Promise.all([
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
