/**
 * @file FakeEthMint.test.tsx
 * @description UI tests for minting FakeETH and FakeUSD on the Ethereum testnet.
 *
 * Tests that button components can:
 * 1. Submit a mint(address, amount) call to the Ethereum testnet via window.ethereum
 * 2. Reflect the pending / success state in the UI
 * 3. Result in an actual on-chain balance increase
 *
 * Both tests share a single Ethereum testnet + wallet mock setup (one beforeAll).
 *
 * Uses EthereumMintMock (window.ethereum mock) + a live Docker Ethereum testnet
 * spun up via the `commands.setupEthereumTestnet()` browser command.
 *
 * Note: Because FAKE_ETH_ADDRESS / FAKE_USD_ADDRESS are module-level constants
 * baked from chain-config at import time, these tests render inline components
 * that accept the contract address as a prop and use ethers directly — rather
 * than importing Faucet.tsx.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { useState } from "react";
import { commands } from "vitest/browser";
import { setupEthereumMintMock } from "../../test-utils/browser-utils/EthereumMintMock";
import type { EthereumTestnetInfo } from "../../test-utils/browser-commands";
import { FAKE_ETH_ABI, FAKE_USD_ABI } from "../../src/lib/ethereum/abis";

// ---------------------------------------------------------------------------
// Minimal test component: a "Mint 10 ETH" button with pending / success state.
// Takes the contract address as a prop to avoid module-level constant caching.
// ---------------------------------------------------------------------------

interface MintButtonProps {
  contractAddress: string;
  rpcUrl: string;
}

function MintFakeEthButton({ contractAddress, rpcUrl }: MintButtonProps) {
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMint = async () => {
    setStatus("pending");
    setTxHash(null);
    setError(null);
    try {
      const { ethers } = await import("ethers");
      // Use window.ethereum (the mock) so this exercises the same code path as
      // the production Faucet component (MetaMask → eth_sendTransaction).
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const contract = new ethers.Contract(
        contractAddress,
        FAKE_ETH_ABI,
        signer,
      );
      const address = await signer.getAddress();
      const amount = 10n * 10n ** 18n; // 10 ETH
      const tx = await contract.mint(address, amount);
      setTxHash(tx.hash);

      // Wait for confirmation using the backing provider (faster than BrowserProvider.waitForTransaction)
      const backingProvider = new ethers.JsonRpcProvider(rpcUrl);
      await backingProvider.waitForTransaction(tx.hash, 1);

      setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  return (
    <div>
      <button
        data-testid="mint-eth-button"
        onClick={handleMint}
        disabled={status === "pending"}
      >
        {status === "pending"
          ? "Minting..."
          : status === "success"
            ? "Minted!"
            : "Mint 10 ETH"}
      </button>
      {txHash && <div data-testid="tx-hash">{txHash}</div>}
      {error && <div data-testid="error">{error}</div>}
    </div>
  );
}

function MintFakeUsdButton({ contractAddress, rpcUrl }: MintButtonProps) {
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMint = async () => {
    setStatus("pending");
    setTxHash(null);
    setError(null);
    try {
      const { ethers } = await import("ethers");
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const contract = new ethers.Contract(
        contractAddress,
        FAKE_USD_ABI,
        signer,
      );
      const address = await signer.getAddress();
      const amount = 10_000n * 10n ** 6n; // 10,000 USD (6 decimals)
      const tx = await contract.mint(address, amount);
      setTxHash(tx.hash);

      const backingProvider = new ethers.JsonRpcProvider(rpcUrl);
      await backingProvider.waitForTransaction(tx.hash, 1);

      setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  return (
    <div>
      <button
        data-testid="mint-usd-button"
        onClick={handleMint}
        disabled={status === "pending"}
      >
        {status === "pending"
          ? "Minting..."
          : status === "success"
            ? "Minted!"
            : "Mint 10k USD"}
      </button>
      {txHash && <div data-testid="tx-hash">{txHash}</div>}
      {error && <div data-testid="error">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.sequential("FakeEthMint UI", () => {
  let info: EthereumTestnetInfo;
  let signerAddress: string;

  beforeAll(async () => {
    console.log("[FakeEthMint] Starting Ethereum testnet...");
    info = await commands.setupEthereumTestnet();
    console.log(`[FakeEthMint] Testnet ready — RPC: ${info.rpcUrl}`);
    console.log(`[FakeEthMint] FakeETH: ${info.fakeETH}`);

    // Inject wallet mock — auto-signs eth_sendTransaction with the test account
    signerAddress = await setupEthereumMintMock({
      privateKey: info.signerPrivateKey,
      rpcUrl: info.rpcUrl,
      chainId: info.chainId,
    });
    console.log(`[FakeEthMint] Signer: ${signerAddress}`);
  }, 300000);

  afterAll(async () => {
    await commands.teardownEthereumTestnet();
  });

  afterEach(() => {
    cleanup();
  });

  it("should mint 10 FakeETH and reflect success in the UI", async () => {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(info.rpcUrl);

    // Read balance before mint
    const contract = new ethers.Contract(info.fakeETH, FAKE_ETH_ABI, provider);
    const balanceBefore: bigint = await contract.balanceOf(signerAddress);
    console.log(
      `[FakeEthMint] Balance before: ${ethers.formatEther(balanceBefore)} ETH`,
    );

    render(
      <MintFakeEthButton contractAddress={info.fakeETH} rpcUrl={info.rpcUrl} />,
    );

    // Click the mint button
    const button = screen.getByTestId("mint-eth-button");
    fireEvent.click(button);

    // Button should show "Minting..." immediately
    await waitFor(() => {
      expect(screen.getByTestId("mint-eth-button")).toHaveTextContent(
        "Minting...",
      );
    });

    // Wait for success state
    await waitFor(
      () => {
        expect(screen.getByTestId("mint-eth-button")).toHaveTextContent(
          "Minted!",
        );
      },
      { timeout: 60000 },
    );

    // tx hash should be displayed
    const txHashEl = screen.getByTestId("tx-hash");
    expect(txHashEl.textContent).toMatch(/^0x[0-9a-f]{64}$/i);
    console.log(`[FakeEthMint] Tx hash: ${txHashEl.textContent}`);

    // Verify on-chain balance increased by 10 ETH
    const balanceAfter: bigint = await contract.balanceOf(signerAddress);
    console.log(
      `[FakeEthMint] Balance after: ${ethers.formatEther(balanceAfter)} ETH`,
    );

    const minted = balanceAfter - balanceBefore;
    expect(minted).toBe(10n * 10n ** 18n);
  }, 120000);

  it("should mint 10k FakeUSD and reflect success in the UI", async () => {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(info.rpcUrl);

    const contract = new ethers.Contract(info.fakeUSD, FAKE_USD_ABI, provider);
    const balanceBefore: bigint = await contract.balanceOf(signerAddress);
    console.log(
      `[FakeUsdMint] Balance before: ${ethers.formatUnits(balanceBefore, 6)} USD`,
    );

    render(
      <MintFakeUsdButton contractAddress={info.fakeUSD} rpcUrl={info.rpcUrl} />,
    );

    const button = screen.getByTestId("mint-usd-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("mint-usd-button")).toHaveTextContent(
        "Minting...",
      );
    });

    await waitFor(
      () => {
        expect(screen.getByTestId("mint-usd-button")).toHaveTextContent(
          "Minted!",
        );
      },
      { timeout: 60000 },
    );

    const txHashEl = screen.getByTestId("tx-hash");
    expect(txHashEl.textContent).toMatch(/^0x[0-9a-f]{64}$/i);
    console.log(`[FakeUsdMint] Tx hash: ${txHashEl.textContent}`);

    const balanceAfter: bigint = await contract.balanceOf(signerAddress);
    console.log(
      `[FakeUsdMint] Balance after: ${ethers.formatUnits(balanceAfter, 6)} USD`,
    );

    const minted = balanceAfter - balanceBefore;
    expect(minted).toBe(10_000n * 10n ** 6n);
  }, 120000);
});
