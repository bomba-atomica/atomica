/**
 * @file 14-happy-path.test.tsx
 * @description Full demo happy-path end-to-end browser smoke test.
 *
 * Runs the complete seller -> bidder -> settle -> claim chain in a single
 * sequential test suite against live Aptos and Ethereum local testnets.
 *
 * NO vi.mock() calls for useContractStatuses, useEthereumBalances, or
 * useAptosBalances — all balance and status hooks run against live testnet
 * nodes. Only the wallet mock (MetaMask) and faucet fetch stub are used.
 *
 * Scenario sequence:
 *   Seller context:
 *     1. Faucet — mint FakeETH + FakeUSD to seller wallet (real balance hooks)
 *     2. SellFlow step 2 — Approve & Lock FakeETH (UI-driven)
 *     3-5. SellFlow steps 3-5 — auto-confirmation, proof generation, proof submission
 *     6. Auction creation — via direct helper (duration hardcoded to 1h in
 *        useSellFlow makes UI-driven auction creation impractical for CI)
 *     7. Step8Monitor — verifies seller address, countdown, auction details
 *   Bidder context:
 *     8. AuctionBidder — fill seller address + bid amount, submit bid
 *   Settlement:
 *     9. Wait for auction expiry
 *    10. SettleButton — click real component (no injected callback)
 *    11. ClaimButton — click real component, verify balance change
 *    12. BidHistory — verify row populated from real useBidHistory data
 *
 * Two wallet mocks are used (seller and bidder) — swapped between phases.
 * All on-chain ops use the dual-chain Docker testnet via setupIntegrationFixture().
 *
 * Expected test duration: 3-5 minutes with live chains.
 *
 * @see issue #66
 */

// ── Imports ───────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { commands } from "vitest/browser";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  AUCTION_DURATION_BID,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import {
  faucet,
  step2Lock,
  step3Confirm,
  step8Monitor,
  auctionBidder,
  settleButton,
  claimButton,
  bidHistory,
} from "./helpers/selectors";
import {
  generateEthLockProof,
  registerLockOnAptos,
  createAuctionDirect,
  viewFunction,
} from "./helpers/auction-setup";
import { Faucet } from "../../src/components/Faucet";
import { SellFlow } from "../../src/components/SellFlow/SellFlow";
import { AuctionBidder } from "../../src/components/AuctionBidder";
import { SettleButton } from "../../src/components/SettleButton";
import { ClaimButton } from "../../src/components/ClaimButton";
import { Step8Monitor } from "../../src/components/SellFlow/steps/Step8Monitor";
import {
  WalletContext,
  WalletProvider,
  NetworkConfigProvider,
  ContractStatusProvider,
  BalancesProvider,
} from "../../src/index";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "../../src/lib/aptos/config";
import {
  setAptosInstance as setDockerAptosInstance,
  getDerivedAddress,
} from "@atomica/aptos-docker-testnet/browser";
import type { EthereumTestnetInfo } from "@atomica/aptos-docker-testnet/browser-commands";
import { ethers } from "ethers";

// ── Constants ─────────────────────────────────────────────────────────────

const MIN_PRICE = 100n;
const LOCK_AMOUNT = ethers.parseEther("10");
const MINT_AMOUNT = ethers.parseEther("1000");
const BID_PRICE = 200n;

const ERC20_BALANCE_ABI = ["function balanceOf(address) view returns (uint256)"];

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Build a fetch interceptor that performs real on-chain FakeETH + FakeUSD
 * minting via the deployer key and returns { ethTxHash, usdTxHash }.
 */
function buildFundStub(
  ethInfo: EthereumTestnetInfo,
  recipient: string,
  originalFetch: typeof fetch,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    if (!url.includes("/api/ethereum/fund")) {
      return originalFetch(input, init);
    }

    const provider = new ethers.JsonRpcProvider(ethInfo.rpcUrl);
    const deployer = new ethers.Wallet(ethInfo.signerPrivateKey, provider);
    const mintAbi = ["function mint(address to, uint256 amount)"];

    const fakeETHContract = new ethers.Contract(ethInfo.fakeETH, mintAbi, deployer);
    const fakeUSDContract = new ethers.Contract(ethInfo.fakeUSD, mintAbi, deployer);

    const ethTx = await fakeETHContract.mint(recipient, 10n * 10n ** 18n);
    await provider.waitForTransaction(ethTx.hash, 1);

    const usdTx = await fakeUSDContract.mint(recipient, 10_000n * 10n ** 6n);
    await provider.waitForTransaction(usdTx.hash, 1);

    return new Response(
      JSON.stringify({ ethTxHash: ethTx.hash, usdTxHash: usdTx.hash }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

/**
 * Render a component inside all required context providers with real hooks.
 * Uses WalletContext.Provider with a direct account value to avoid race
 * conditions with WalletProvider auto-detection.
 */
function withProviders(account: string, children: React.ReactNode) {
  return render(
    <NetworkConfigProvider>
      <WalletContext.Provider value={{ account, connect: async () => {} }}>
        <ContractStatusProvider>
          <BalancesProvider>{children}</BalancesProvider>
        </ContractStatusProvider>
      </WalletContext.Provider>
    </NetworkConfigProvider>,
  );
}

/**
 * Render SellFlow with real WalletProvider (auto-detects from window.ethereum)
 * and real BalancesProvider (fetches from live testnets).
 */
function renderSellFlow() {
  return render(
    <NetworkConfigProvider>
      <WalletProvider>
        <ContractStatusProvider>
          <BalancesProvider>
            <SellFlow />
          </BalancesProvider>
        </ContractStatusProvider>
      </WalletProvider>
    </NetworkConfigProvider>,
  );
}

// ── Test suite ────────────────────────────────────────────────────────────

describe.sequential("14: Full demo happy-path e2e — no mocked hooks", () => {
  let fixture: IntegrationFixture;
  let aptosClient: Aptos;
  let moduleAddr: string;
  let deployerAccount: Account;

  // Seller state
  let sellerEthAddress: string;
  let sellerAptosAddress: string;
  let lockId: string;
  let auctionEndTime: number;

  // Bidder state
  let bidderEthAddress: string;

  // Settlement state
  let clearingPrice: bigint;

  // ── Setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    console.log("[14-happy-path] Starting dual-chain testnet...");
    fixture = await setupIntegrationFixture();

    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: fixture.aptos.nodeUrl,
    });
    aptosClient = new Aptos(aptosConfig);
    setAptosInstance(aptosClient);
    setDockerAptosInstance(aptosClient);

    moduleAddr = fixture.aptos.moduleAddress;

    deployerAccount = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(fixture.aptos.deployerPrivateKey),
    });

    // Fund bidder's Aptos account so bidder can submit transactions later
    bidderEthAddress = await setupWalletMock({
      privateKey: fixture.eth.bidder.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });
    const bidderAptosAddress = await getDerivedAddress(bidderEthAddress.toLowerCase());
    await commands.fundAccount(bidderAptosAddress.toString(), 500_000_000);

    // Fund seller's Aptos account for SIWE-based transactions
    sellerEthAddress = fixture.eth.seller.address;
    const sellerDerivedAddr = await getDerivedAddress(sellerEthAddress.toLowerCase());
    await commands.fundAccount(sellerDerivedAddr.toString(), 500_000_000);

    console.log("[14-happy-path] Testnet ready");
    console.log(`[14-happy-path] Seller ETH: ${fixture.eth.seller.address}`);
    console.log(`[14-happy-path] Bidder ETH: ${fixture.eth.bidder.address}`);
  }, 600_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── Step 1: Seller — faucet mints FakeETH (real balance hooks) ──────────

  it(
    "step 1 — faucet: seller FakeETH balance increases after clicking Request ETH Tokens",
    async () => {
      console.log("[14-happy-path] Step 1: Faucet (real useEthereumBalances hook)");

      sellerEthAddress = await setupWalletMock({
        privateKey: fixture.eth.seller.privateKey,
        rpcUrl: fixture.eth.rpcUrl,
        chainId: fixture.eth.chainId,
      });

      const provider = new ethers.JsonRpcProvider(fixture.eth.rpcUrl);
      const fakeEthContract = new ethers.Contract(
        fixture.eth.contracts.fakeETH,
        ERC20_BALANCE_ABI,
        provider,
      );

      const balanceBefore: bigint = await fakeEthContract.balanceOf(sellerEthAddress);

      // Build a fetch stub that mints real on-chain tokens
      const ethInfo: EthereumTestnetInfo = {
        rpcUrl: fixture.eth.rpcUrl,
        chainId: fixture.eth.chainId,
        fakeETH: fixture.eth.contracts.fakeETH,
        fakeUSD: fixture.eth.contracts.fakeUSD,
        signerPrivateKey: fixture.eth.seller.privateKey,
      };

      const originalFetch = globalThis.fetch.bind(globalThis);
      vi.spyOn(globalThis, "fetch").mockImplementation(
        buildFundStub(ethInfo, sellerEthAddress, originalFetch),
      );

      // Render Faucet with real providers (no mocked hooks)
      withProviders(sellerEthAddress, <Faucet />);

      const button = await waitFor(
        () => screen.getByTestId(faucet.ethButton),
        { timeout: 10_000 },
      );
      expect(button).not.toBeDisabled();

      fireEvent.click(button);

      // Wait for "Tokens Received" to appear — driven by real component state
      await waitFor(
        () => {
          expect(screen.getByTestId(faucet.ethButton)).toHaveTextContent(/Tokens Received/i);
        },
        { timeout: 120_000 },
      );

      const balanceAfter: bigint = await fakeEthContract.balanceOf(sellerEthAddress);
      console.log(
        `[14-happy-path] Seller FakeETH: ${ethers.formatEther(balanceBefore)} -> ${ethers.formatEther(balanceAfter)}`,
      );
      expect(balanceAfter).toBeGreaterThan(balanceBefore);
    },
    180_000,
  );

  // ── Step 2: Seller — SellFlow lock via UI clicks ────────────────────────
  //
  // Renders the full SellFlow component with real WalletProvider and
  // BalancesProvider. The wallet mock auto-connects, SellFlow detects the
  // connected account and shows Step2Lock. We fill the amount and min price
  // inputs and click "Approve & Lock" to drive a real EVM transaction.

  it(
    "step 2 — lock: Approve & Lock transitions to Step3 (confirm spinner shown)",
    async () => {
      console.log("[14-happy-path] Step 2: SellFlow lock (real UI + real hooks)");

      // Ensure seller wallet mock is active
      sellerEthAddress = await setupWalletMock({
        privateKey: fixture.eth.seller.privateKey,
        rpcUrl: fixture.eth.rpcUrl,
        chainId: fixture.eth.chainId,
      });

      // Clear any persisted SellFlow state so we start fresh at Step2Lock
      localStorage.clear();

      renderSellFlow();

      // Wait for wallet auto-connect -> Step2Lock appears
      await waitFor(
        () => {
          expect(screen.queryByTestId(step2Lock.approveLockButton)).not.toBeNull();
        },
        { timeout: 15_000 },
      );

      // Set lock amount (small to avoid balance issues)
      const amountInput = screen.getByTestId(step2Lock.lockAmountInput) as HTMLInputElement;
      fireEvent.change(amountInput, { target: { value: "1.0" } });

      // Set min price
      const minPriceInput = screen.getByTestId(step2Lock.minPriceInput) as HTMLInputElement;
      fireEvent.change(minPriceInput, { target: { value: "100" } });

      // Click Approve & Lock — real EVM transactions via wallet mock
      fireEvent.click(screen.getByTestId(step2Lock.approveLockButton));

      // Step3Confirm should appear after the real tx completes
      await waitFor(
        () => {
          expect(screen.queryByTestId(step3Confirm.confirmSpinner)).not.toBeNull();
        },
        { timeout: 60_000 },
      );

      console.log("[14-happy-path] Step 2 complete: lock tx confirmed, Step3 visible");
    },
    90_000,
  );

  // ── Steps 3-7: Seller — lock proof + auction via helpers ────────────────
  //
  // Steps 3-5 (confirm, proof, submit) auto-progress in useSellFlow via
  // useEffect hooks. Step 7 (auction creation) has a 1-hour hardcoded
  // duration in useSellFlow making full UI-driven auction creation impractical
  // for CI tests. We use direct helpers for ETH lock proof + Aptos registration
  // + auction creation with AUCTION_DURATION_BID (30s) to keep the test fast.
  //
  // The individual component-level tests (03-07) already cover each UI step.
  // Here we verify the auction is created and Step8Monitor renders correctly.

  it(
    "steps 3-7 — proof + auction: auction created with short duration, seller address readable",
    async () => {
      console.log("[14-happy-path] Steps 3-7: Lock proof + auction creation (direct helpers)");

      // Generate ETH lock proof via Node.js-side helper
      const proofResult = await generateEthLockProof(fixture, LOCK_AMOUNT, MINT_AMOUNT);
      lockId = proofResult.lockId;

      // Register lock on Aptos (deployer is authorized in Demo phase)
      await registerLockOnAptos(aptosClient, deployerAccount, moduleAddr, proofResult.proof);

      // Create auction with short duration for fast settlement
      const auctionCreatedAt = Math.floor(Date.now() / 1000);
      await createAuctionDirect(
        aptosClient,
        deployerAccount,
        moduleAddr,
        lockId,
        MIN_PRICE,
        BigInt(AUCTION_DURATION_BID),
      );

      auctionEndTime = auctionCreatedAt + AUCTION_DURATION_BID;
      sellerAptosAddress = deployerAccount.accountAddress.toString();

      console.log(`[14-happy-path] Auction created. Seller: ${sellerAptosAddress}`);
      console.log(`[14-happy-path] Auction closes at: ${auctionEndTime}`);

      // Verify Step8Monitor renders seller address, countdown, and auction details
      // using real hooks (no mocked useContractStatuses/useBalances)
      withProviders(
        sellerEthAddress,
        <Step8Monitor
          auctionEndTime={auctionEndTime}
          sellerAddress={sellerAptosAddress}
          onCancelAndUnlock={async () => {}}
          loading={false}
        />,
      );

      // Seller address should be displayed
      const addrEl = await waitFor(
        () => screen.getByTestId(step8Monitor.auctionSellerAddress),
        { timeout: 5_000 },
      );
      expect(addrEl.textContent?.toLowerCase()).toContain(
        sellerAptosAddress.toLowerCase(),
      );

      // Countdown should be visible
      const countdownEl = screen.getByTestId(step8Monitor.auctionCountdown);
      expect(countdownEl).toBeTruthy();

      // Status badge should show "Active" while auction is running
      const badgeEl = screen.getByTestId(step8Monitor.auctionStatusBadge);
      expect(badgeEl.textContent).toBe("Active");

      console.log("[14-happy-path] Step8Monitor renders correctly with live data");
    },
    600_000,
  );

  // ── Step 8: Bidder — connect wallet and submit bid ────────────────────────

  it(
    "step 8 — bidder connect + bid: bid submitted above min_price",
    async () => {
      console.log("[14-happy-path] Step 8: Bidder connect + bid (real hooks)");

      // Switch wallet mock to bidder
      bidderEthAddress = await setupWalletMock({
        privateKey: fixture.eth.bidder.privateKey,
        rpcUrl: fixture.eth.rpcUrl,
        chainId: fixture.eth.chainId,
      });

      // Render AuctionBidder with real providers
      withProviders(
        bidderEthAddress,
        <AuctionBidder />,
      );

      // Fill in seller address
      const sellerInput = screen.getByTestId(auctionBidder.sellerAddressInput);
      fireEvent.change(sellerInput, { target: { value: sellerAptosAddress } });

      // Set bid amount above min_price
      const bidInput = screen.getByTestId(auctionBidder.bidAmountInput);
      fireEvent.change(bidInput, { target: { value: BID_PRICE.toString() } });

      // Submit bid — real SIWE transaction
      fireEvent.click(screen.getByTestId(auctionBidder.submitBidButton));

      await waitFor(
        () => {
          const statusEl = screen.getByTestId(auctionBidder.bidStatus);
          expect(statusEl.textContent).toMatch(/Bid Submitted!/);
        },
        { timeout: 60_000 },
      );

      console.log("[14-happy-path] Bid submitted successfully");
    },
    90_000,
  );

  // ── Step 9-10: Wait for expiry -> settle via real SettleButton ──────────
  //
  // Instead of using settleAuctionDirect, we render the real SettleButton
  // component and click it. The component calls submitSettle (SIWE-based)
  // and queries on-chain state for the settlement result.

  it(
    "step 9-10 — wait for expiry + settle: SettleButton shows 'Settled', winner is bidder",
    async () => {
      console.log("[14-happy-path] Steps 9-10: Wait for expiry + settle via real SettleButton");

      // Wait for the remaining auction window to expire (+ 3 s buffer)
      const remainingMs = (auctionEndTime + 3) * 1000 - Date.now();
      if (remainingMs > 0) {
        console.log(`[14-happy-path] Waiting ${remainingMs} ms for auction to close...`);
        await new Promise((r) => setTimeout(r, remainingMs));
      }

      // Switch to seller wallet for settlement (or any funded account)
      sellerEthAddress = await setupWalletMock({
        privateKey: fixture.eth.seller.privateKey,
        rpcUrl: fixture.eth.rpcUrl,
        chainId: fixture.eth.chainId,
      });

      // Render real SettleButton with WalletContext providing seller account
      render(
        <WalletContext.Provider value={{ account: sellerEthAddress, connect: async () => {} }}>
          <SettleButton
            sellerAddress={sellerAptosAddress}
            auctionEndTime={auctionEndTime}
          />
        </WalletContext.Provider>,
      );

      // Button should be enabled (auction ended, not yet settled)
      const btn = await waitFor(
        () => {
          const b = screen.getByTestId(settleButton.settleButton);
          expect((b as HTMLButtonElement).disabled).toBe(false);
          return b;
        },
        { timeout: 10_000 },
      );

      // Click the real SettleButton — triggers submitSettle via SIWE
      fireEvent.click(btn);

      // Wait for "Settled" status (real on-chain settlement)
      await waitFor(
        () => {
          const statusEl = screen.getByTestId(settleButton.settleStatus);
          expect(statusEl.textContent).toBe("Settled");
        },
        { timeout: 60_000 },
      );

      console.log("[14-happy-path] Auction settled via real SettleButton");

      // Verify on-chain settlement state
      const [isSettledResult] = await viewFunction(
        aptosClient,
        `${moduleAddr}::auction::is_settled`,
        [],
        [sellerAptosAddress],
      );
      expect(isSettledResult).toBe(true);

      // Verify winner is the bidder's derived Aptos address
      const settlementResult = await viewFunction(
        aptosClient,
        `${moduleAddr}::auction::get_settlement`,
        [],
        [sellerAptosAddress],
      );
      const [winnerAddr, priceRaw] = settlementResult;
      clearingPrice = BigInt(priceRaw);

      const bidderAptosAddress = await getDerivedAddress(bidderEthAddress.toLowerCase());
      expect(winnerAddr.toString().toLowerCase()).toBe(
        bidderAptosAddress.toString().toLowerCase(),
      );

      // Assert clearing price > 0
      expect(clearingPrice).toBeGreaterThan(0n);

      console.log(`[14-happy-path] Winner: ${winnerAddr}`);
      console.log(`[14-happy-path] Clearing price: ${clearingPrice}`);
    },
    120_000,
  );

  // ── Step 11: Bidder claims via real ClaimButton ───────────────────────────
  //
  // Renders the real ClaimButton component. It queries get_settlement,
  // compares the winner to the current user's derived Aptos address, and
  // calls submitClaim (which invokes fake_eth::mint via SIWE).

  it(
    "step 11 — bidder claim: ClaimButton detects winner and mints FakeETH via SIWE",
    async () => {
      console.log("[14-happy-path] Step 11: Bidder claim via real ClaimButton");

      // Restore bidder wallet mock
      bidderEthAddress = await setupWalletMock({
        privateKey: fixture.eth.bidder.privateKey,
        rpcUrl: fixture.eth.rpcUrl,
        chainId: fixture.eth.chainId,
      });

      // Read bidder's Aptos FakeETH FA balance before claim
      const bidderAptosAddress = (
        await getDerivedAddress(bidderEthAddress.toLowerCase())
      ).toString();

      let balanceBefore = 0n;
      try {
        const [raw] = await viewFunction(
          aptosClient,
          `${moduleAddr}::fake_eth::balance`,
          [],
          [bidderAptosAddress],
        );
        balanceBefore = BigInt(raw);
      } catch {
        // Account may not have a FakeETH store yet
      }
      console.log(`[14-happy-path] Bidder FakeETH before claim: ${balanceBefore}`);

      // Render real ClaimButton with bidder's wallet context (real hooks)
      withProviders(
        bidderEthAddress,
        <ClaimButton sellerAddress={sellerAptosAddress} />,
      );

      // Wait for settlement check to complete — Claim button should be enabled
      await waitFor(
        () => {
          const claimBtn = screen.getByTestId(claimButton.claimButton);
          expect((claimBtn as HTMLButtonElement).disabled).toBe(false);
        },
        { timeout: 30_000 },
      );

      // Click the real ClaimButton — triggers submitClaim via SIWE
      fireEvent.click(screen.getByTestId(claimButton.claimButton));

      // Wait for "Claimed" status
      await waitFor(
        () => {
          const statusEl = screen.getByTestId(claimButton.claimStatus);
          expect(statusEl.textContent).toBe("Claimed");
        },
        { timeout: 60_000 },
      );

      // Bidder's Aptos FakeETH FA balance should have increased
      const [balanceAfterRaw] = await viewFunction(
        aptosClient,
        `${moduleAddr}::fake_eth::balance`,
        [],
        [bidderAptosAddress],
      );
      const balanceAfter = BigInt(balanceAfterRaw);
      console.log(`[14-happy-path] Bidder FakeETH after claim: ${balanceAfter}`);
      expect(balanceAfter).toBeGreaterThan(balanceBefore);
    },
    120_000,
  );

  // ── Step 12: Bid history from real useBidHistory data ───────────────────
  //
  // Renders Step8Monitor which embeds BidHistory, SettleButton, and ClaimButton.
  // The SettleButton's onSettled callback feeds useBidHistory.recordSettlement,
  // which persists to localStorage. Since the auction was settled in step 10,
  // SettleButton detects "Already Settled" and fires onSettled, populating
  // BidHistory with real data (not hand-constructed entries).

  it(
    "step 12 — bid history: Step8Monitor BidHistory shows one row with correct clearing price from real data",
    async () => {
      console.log("[14-happy-path] Step 12: Bid history via real useBidHistory in Step8Monitor");

      // Clear any stale localStorage bid history so we test fresh recording
      localStorage.clear();

      // Render Step8Monitor with a past auctionEndTime so it shows as "Settled"
      // The SettleButton embedded in Step8Monitor will detect the already-settled
      // auction and fire onSettled -> recordSettlement -> BidHistory updates
      withProviders(
        sellerEthAddress,
        <Step8Monitor
          auctionEndTime={auctionEndTime}
          sellerAddress={sellerAptosAddress}
          onCancelAndUnlock={async () => {}}
          loading={false}
        />,
      );

      // Wait for SettleButton to detect "Already Settled" and fire onSettled
      // which records the settlement into useBidHistory -> BidHistory renders a row
      await waitFor(
        () => {
          const statusEl = screen.getByTestId(settleButton.settleStatus);
          expect(statusEl.textContent).toBe("Already Settled");
        },
        { timeout: 30_000 },
      );

      // BidHistory should now have one row populated from real on-chain data
      await waitFor(
        () => {
          const rows = screen.getAllByTestId(bidHistory.bidHistoryRow);
          expect(rows).toHaveLength(1);
        },
        { timeout: 10_000 },
      );

      const rows = screen.getAllByTestId(bidHistory.bidHistoryRow);

      // Row should contain the seller address as auction ID
      expect(rows[0].textContent).toContain(sellerAptosAddress);

      // Row should display the clearing price in USD format
      const expectedUsd = (Number(clearingPrice) / 1e6).toFixed(2);
      expect(rows[0].textContent).toContain(`$${expectedUsd}`);

      console.log(
        `[14-happy-path] Bid history row verified from real data. Clearing price: $${expectedUsd}`,
      );
    },
    60_000,
  );
});
