/**
 * 07-create-auction.test.tsx
 *
 * Browser integration tests for Step7Auction — the UI component that
 * auto-creates an auction from a LockReceipt on mount.
 *
 * Scenarios:
 *   1. Happy path: spinner shown; no error after successful create
 *   2. Amount and min price displayed in description text
 *   3. Receipt already claimed: Move abort error shown via error prop
 *   4. SIWE signature rejected: error shown via error prop
 *
 * Setup:
 *   - Dual-chain testnet started in beforeAll
 *   - Ethereum lock → Aptos proof registration via deployer account (no SIWE)
 *   - Seller wallet mock injected for SIWE signing in UI callbacks
 */

import React, { useState } from "react";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { step7Auction } from "./helpers/selectors";
import {
  generateEthLockProof,
  type EthLockProofResult,
} from "./helpers/auction-setup";
import { getRegisterLockPayload } from "../../src/lib/aptos/payloads";
import { Step7Auction } from "../../src/components/SellFlow/steps/Step7Auction";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setAptosInstance, aptos as aptosGlobal } from "../../src/lib/aptos/config";
import { ethers } from "ethers";
import { getCreateAuctionPayload } from "../../src/lib/aptos/payloads";
import { submitNativeTransaction } from "../../src/lib/aptos/transaction";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";
import { commands } from "vitest/browser";

const MIN_PRICE = 100n;
const AUCTION_DURATION = 3600n;

// ---------------------------------------------------------------------------
// Stateful wrapper so we can observe the result of onCreateAuction
// ---------------------------------------------------------------------------

interface WrapperState {
  loading: boolean;
  error?: string;
  txHash?: string;
}

function AuctionWrapper({
  amount,
  minPrice,
  onCreateAuction,
}: {
  amount: bigint;
  minPrice: bigint;
  onCreateAuction: () => Promise<{ txHash?: string }>;
}) {
  const [state, setState] = useState<WrapperState>({ loading: false });

  const handleCreate = async () => {
    setState({ loading: true });
    try {
      const result = await onCreateAuction();
      setState({ loading: false, txHash: result.txHash });
    } catch (e: unknown) {
      setState({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <Step7Auction
      loading={state.loading}
      error={state.error}
      txHash={state.txHash}
      amount={amount}
      minPrice={minPrice}
      onCreateAuction={handleCreate}
    />
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.sequential("07: Create Auction from LockReceipt", () => {
  let fixture: IntegrationFixture;
  let ethProof: EthLockProofResult;
  let sellerAddress: string;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();

    // Point the global Aptos singleton at the testnet node
    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: fixture.aptos.nodeUrl,
    });
    setAptosInstance(new Aptos(aptosConfig));

    // Inject seller wallet mock so SIWE signing works without MetaMask
    sellerAddress = await setupWalletMock({
      privateKey: fixture.eth.seller.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });

    // Fund the seller's SIWE-derived Aptos address so transactions have gas
    const sellerAptosAddress = await getDerivedAddress(
      sellerAddress.toLowerCase(),
    );
    await commands.fundAccount(sellerAptosAddress.toString(), 500_000_000);

    // Lock ETH on Ethereum and generate storage proof (no Aptos registration)
    ethProof = await generateEthLockProof(fixture);

    // Register the lock on Aptos via SIWE (same path as the real app flow):
    // The LockReceipt is stored at the seller's SIWE-derived Aptos address so
    // create_auction (also SIWE-signed) can consume it.
    const registerPayload = getRegisterLockPayload(ethProof.proof);
    await submitNativeTransaction(aptosGlobal, sellerAddress, registerPayload);
  }, 600_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
    // Restore wallet mock after each test (some tests swap it out)
    setupWalletMock({
      privateKey: fixture?.eth.seller.privateKey ?? "0x" + "0".repeat(64),
      rpcUrl: fixture?.eth.rpcUrl,
      chainId: fixture?.eth.chainId,
    });
  });

  // ── Test 1: happy path ─────────────────────────────────────────────────────

  it("shows auction-spinner on mount and auction-tx-hash after successful create", async () => {
    const lockIdBytes = ethers.getBytes(ethProof.lockId);
    const mpk = new Uint8Array(0);

    const onCreateAuction = async () => {
      const payload = getCreateAuctionPayload(lockIdBytes, MIN_PRICE, AUCTION_DURATION, mpk);
      const result = await submitNativeTransaction(aptosGlobal, sellerAddress, payload);
      return { txHash: (result as { hash?: string }).hash };
    };

    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        minPrice={MIN_PRICE}
        onCreateAuction={onCreateAuction}
      />,
    );

    // spinner shown on mount while auto-creating
    expect(screen.getByTestId(step7Auction.auctionSpinner)).toBeTruthy();

    // After create succeeds, tx hash element should appear
    await waitFor(
      () => {
        expect(screen.getByTestId(step7Auction.auctionTxHash)).toBeTruthy();
      },
      { timeout: 60_000 },
    );

    const txHashEl = screen.getByTestId(step7Auction.auctionTxHash);
    expect(txHashEl.textContent).toMatch(/Tx:/);
  }, 90_000);

  // ── Test 2: amount and min price displayed ─────────────────────────────────

  it("shows formatted amount and min price in description text", () => {
    render(
      <Step7Auction
        loading={true}
        amount={ethers.parseEther("10")}
        minPrice={MIN_PRICE}
        onCreateAuction={async () => {}}
      />,
    );

    const text = document.body.textContent ?? "";
    expect(text).toContain("10.0000 FETH");
    // MIN_PRICE = 100n (raw FUSD units, 6 decimals) → $0.00
    expect(text).toContain("$0.00");
  });

  // ── Test 3: receipt already claimed ───────────────────────────────────────

  it("shows Move abort error when receipt is already claimed (second call)", async () => {
    // The auction was already created in Test 1.
    // Attempting create_auction again on the same lockId should fail.
    const lockIdBytes = ethers.getBytes(ethProof.lockId);
    const mpk = new Uint8Array(0);

    const onCreateAuction = async () => {
      const payload = getCreateAuctionPayload(lockIdBytes, MIN_PRICE, AUCTION_DURATION, mpk);
      const result = await submitNativeTransaction(aptosGlobal, sellerAddress, payload);
      return { txHash: (result as { hash?: string }).hash };
    };

    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        minPrice={MIN_PRICE}
        onCreateAuction={onCreateAuction}
      />,
    );

    // Wait for the create attempt to finish and surface an error
    await waitFor(
      () => {
        const errorEl = document.querySelector(".text-red-400");
        expect(errorEl).toBeTruthy();
      },
      { timeout: 60_000 },
    );
  }, 90_000);

  // ── Test 4: SIWE signature rejected ───────────────────────────────────────

  it("shows error when SIWE personal_sign is rejected by the wallet", async () => {
    // Swap in a wallet mock that rejects personal_sign
    const rejectedMock = {
      isMetaMask: true,
      selectedAddress: sellerAddress,
      chainId: `0x${fixture.eth.chainId.toString(16)}`,
      on: () => {},
      removeListener: () => {},
      async request({ method }: { method: string; params?: unknown[] }) {
        if (method === "eth_accounts" || method === "eth_requestAccounts") {
          return [sellerAddress];
        }
        if (method === "eth_chainId") {
          return `0x${fixture.eth.chainId.toString(16)}`;
        }
        if (method === "personal_sign") {
          throw Object.assign(new Error("MetaMask: User denied message signature."), {
            code: 4001,
          });
        }
        const provider = new ethers.JsonRpcProvider(fixture.eth.rpcUrl);
        return provider.send(method, []);
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ethereum = rejectedMock;

    const lockIdBytes = ethers.getBytes(ethProof.lockId);
    const mpk = new Uint8Array(0);

    const onCreateAuction = async () => {
      const payload = getCreateAuctionPayload(lockIdBytes, MIN_PRICE, AUCTION_DURATION, mpk);
      const result = await submitNativeTransaction(aptosGlobal, sellerAddress, payload);
      return { txHash: (result as { hash?: string }).hash };
    };

    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        minPrice={MIN_PRICE}
        onCreateAuction={onCreateAuction}
      />,
    );

    // An error should be surfaced via the red error element
    await waitFor(
      () => {
        const errorEl = document.querySelector(".text-red-400");
        expect(errorEl).toBeTruthy();
      },
      { timeout: 30_000 },
    );
  }, 60_000);
});
