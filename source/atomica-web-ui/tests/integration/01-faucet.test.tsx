/**
 * @file 01-faucet.test.tsx
 * @description Browser integration tests for the Faucet component.
 *
 * Scenarios:
 *   1. Happy path — click "Request ETH Tokens"; assert FakeETH balance > 0
 *      on-chain after the transaction is confirmed.
 *   2. Double-click no-op — click twice rapidly; assert only one API call sent.
 *   3. RPC failure error state — API returns an error; assert error message
 *      shown in the UI.
 *
 * Runs in headless Chromium via Vitest browser mode (Playwright).
 * Uses a live Ethereum Docker testnet (started via browser commands) for
 * on-chain balance assertions.
 *
 * The Faucet component calls POST /api/ethereum/fund to delegate minting to a
 * server-side deployer account.  In these tests window.fetch is intercepted so
 * the stub performs real on-chain minting using the deployer key returned by
 * setupEthereumTestnet(), then returns the resulting tx hashes in the same
 * JSON shape the real server returns.
 *
 * useContractStatuses is mocked via vi.mock so the Faucet button is
 * immediately enabled without waiting for the polling loop to report ready.
 */

// ── Module-level mocks (hoisted by Vitest) ────────────────────────────────
// These must appear before any imports that depend on them.

import { vi } from "vitest";

// Mock the contract-status poller so the Faucet EVM button is always enabled.
vi.mock("../../src/hooks/useContractStatuses", () => ({
  useContractStatuses: vi.fn().mockReturnValue({
    evmAlive: true,
    aptosAlive: true,
    evmStatus: "ready",
    aptosStatus: "ready",
  }),
}));

// Mock balance hooks so BalancesProvider never makes real network calls.
vi.mock("../../src/hooks/useEthereumBalances", () => ({
  useEthereumBalances: vi.fn().mockReturnValue({
    ethAccountExists: true,
    ethBalance: 10n ** 18n,
    ethFakeETH: 0n,
    ethFakeUSD: 0n,
    ethContractsDeployed: true,
    loading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../src/hooks/useAptosBalances", () => ({
  useAptosBalances: vi.fn().mockReturnValue({
    apt: 1,
    aptAccountExists: true,
    aptosContractsDeployed: true,
    loading: false,
    refetch: vi.fn(),
  }),
}));

// ── Imports ───────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { commands } from "vitest/browser";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { faucet } from "./helpers/selectors";
import { Faucet } from "../../src/components/Faucet";
import type { EthereumTestnetInfo } from "@atomica/aptos-docker-testnet/browser-commands";
import {
  WalletContext,
  NetworkConfigProvider,
  ContractStatusProvider,
  BalancesProvider,
} from "../../src/index";

// ── Minimal ERC-20 ABI for on-chain balance checks ────────────────────────

const ERC20_BALANCE_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Render Faucet inside all required context providers.
 * WalletContext is injected with the test account so Faucet has a non-null
 * account to pass to requestEthTokens().
 */
function renderFaucet(account: string) {
  return render(
    <NetworkConfigProvider>
      <WalletContext.Provider value={{ account, connect: async () => {} }}>
        <ContractStatusProvider>
          <BalancesProvider>
            <Faucet />
          </BalancesProvider>
        </ContractStatusProvider>
      </WalletContext.Provider>
    </NetworkConfigProvider>,
  );
}

/**
 * Build a fetch interceptor that:
 *   - Intercepts POST /api/ethereum/fund
 *   - Mints real FakeETH + FakeUSD on the live testnet using the deployer key
 *   - Returns { ethTxHash, usdTxHash } in the shape the Faucet expects
 *   - Increments callCount.count for each intercepted call
 *
 * All other requests pass through to the original fetch.
 */
function buildFundStub(
  info: EthereumTestnetInfo,
  recipient: string,
  callCount: { count: number },
  originalFetch: typeof fetch,
): typeof fetch {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    if (!url.includes("/api/ethereum/fund")) {
      return originalFetch(input, init);
    }

    callCount.count += 1;

    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(info.rpcUrl);
    const deployer = new ethers.Wallet(info.signerPrivateKey, provider);
    const mintAbi = ["function mint(address to, uint256 amount)"];

    const fakeETHContract = new ethers.Contract(
      info.fakeETH,
      mintAbi,
      deployer,
    );
    const fakeUSDContract = new ethers.Contract(
      info.fakeUSD,
      mintAbi,
      deployer,
    );

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
 * Build a fetch interceptor that returns an HTTP 500 error for /api/ethereum/fund.
 */
function buildErrorStub(
  callCount: { count: number },
  originalFetch: typeof fetch,
): typeof fetch {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    if (!url.includes("/api/ethereum/fund")) {
      return originalFetch(input, init);
    }

    callCount.count += 1;
    return new Response(JSON.stringify({ error: "testnet unavailable" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };
}

/**
 * Build a slow fetch stub (2-second delay) for testing double-click no-op.
 */
function buildSlowFundStub(
  callCount: { count: number },
  originalFetch: typeof fetch,
): typeof fetch {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    if (!url.includes("/api/ethereum/fund")) {
      return originalFetch(input, init);
    }

    callCount.count += 1;
    await new Promise<void>((r) => setTimeout(r, 2_000));

    return new Response(
      JSON.stringify({
        ethTxHash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        usdTxHash:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

// ── Test suite ────────────────────────────────────────────────────────────

describe.sequential("01-faucet integration", () => {
  let info: EthereumTestnetInfo;
  let signerAddress: string;

  beforeAll(async () => {
    console.log("[01-faucet] Starting Ethereum testnet...");
    info = await commands.setupEthereumTestnet();
    console.log(`[01-faucet] Testnet ready — RPC: ${info.rpcUrl}`);
    console.log(`[01-faucet] FakeETH: ${info.fakeETH}`);

    // Inject wallet mock — provides window.ethereum backed by the test
    // private key so any ethers.BrowserProvider calls resolve the address.
    signerAddress = await setupWalletMock({
      privateKey: info.signerPrivateKey,
      rpcUrl: info.rpcUrl,
      chainId: info.chainId,
    });
    console.log(`[01-faucet] Signer: ${signerAddress}`);
  }, 300_000);

  afterAll(async () => {
    await commands.teardownEthereumTestnet();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── Scenario 1: happy path ────────────────────────────────────────────

  it("should mint FakeETH on-chain and show success status after button click", async () => {
    const callCount = { count: 0 };

    // Read FakeETH balance before minting
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(info.rpcUrl);
    const fakeEthContract = new ethers.Contract(
      info.fakeETH,
      ERC20_BALANCE_ABI,
      provider,
    );
    const balanceBefore: bigint =
      await fakeEthContract.balanceOf(signerAddress);
    console.log(
      `[01-faucet] FakeETH before: ${ethers.formatEther(balanceBefore)}`,
    );

    // Install fetch stub — performs real on-chain minting
    const originalFetch = globalThis.fetch.bind(globalThis);
    vi.spyOn(globalThis, "fetch").mockImplementation(
      buildFundStub(info, signerAddress, callCount, originalFetch),
    );

    renderFaucet(signerAddress);

    // The button is enabled because useContractStatuses is mocked
    const button = await waitFor(() => screen.getByTestId(faucet.ethButton), {
      timeout: 5_000,
    });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    // Button immediately shows "Requesting tokens..."
    await waitFor(
      () => {
        expect(screen.getByTestId(faucet.ethButton)).toHaveTextContent(
          /Requesting tokens/i,
        );
      },
      { timeout: 5_000 },
    );

    // Wait for success — may take up to 2 minutes for block confirmation
    await waitFor(
      () => {
        expect(screen.getByTestId(faucet.ethButton)).toHaveTextContent(
          /Tokens Received/i,
        );
      },
      { timeout: 120_000 },
    );

    // faucet-status element is visible on success
    await waitFor(
      () => {
        expect(screen.getByTestId(faucet.status)).toBeTruthy();
      },
      { timeout: 5_000 },
    );

    // Assert on-chain FakeETH balance increased
    const balanceAfter: bigint = await fakeEthContract.balanceOf(signerAddress);
    console.log(
      `[01-faucet] FakeETH after: ${ethers.formatEther(balanceAfter)}`,
    );
    expect(balanceAfter).toBeGreaterThan(balanceBefore);

    // Exactly one API call was made
    expect(callCount.count).toBe(1);
  }, 180_000);

  // ── Scenario 2: double-click no-op ───────────────────────────────────

  it("should send only one API call when the button is clicked twice rapidly", async () => {
    const callCount = { count: 0 };

    const originalFetch = globalThis.fetch.bind(globalThis);
    vi.spyOn(globalThis, "fetch").mockImplementation(
      buildSlowFundStub(callCount, originalFetch),
    );

    renderFaucet(signerAddress);

    const button = await waitFor(() => screen.getByTestId(faucet.ethButton), {
      timeout: 5_000,
    });

    // Click twice rapidly — second click should be a no-op because the
    // button becomes disabled (loadingEthTokens=true) after the first
    fireEvent.click(button);
    fireEvent.click(button);

    // Wait for success
    await waitFor(
      () => {
        expect(screen.getByTestId(faucet.ethButton)).toHaveTextContent(
          /Tokens Received/i,
        );
      },
      { timeout: 30_000 },
    );

    // Only one API call was sent
    expect(callCount.count).toBe(1);
  }, 60_000);

  // ── Scenario 3: API error shows error message ─────────────────────────

  it("should show an error message when the faucet API returns an error", async () => {
    const callCount = { count: 0 };

    const originalFetch = globalThis.fetch.bind(globalThis);
    vi.spyOn(globalThis, "fetch").mockImplementation(
      buildErrorStub(callCount, originalFetch),
    );

    renderFaucet(signerAddress);

    const button = await waitFor(() => screen.getByTestId(faucet.ethButton), {
      timeout: 5_000,
    });

    fireEvent.click(button);

    // Error text must appear inside faucet-status
    await waitFor(
      () => {
        const statusEl = screen.getByTestId(faucet.status);
        expect(statusEl.textContent).toMatch(/testnet unavailable/i);
      },
      { timeout: 15_000 },
    );

    // Button should no longer show "Requesting tokens..." (not stuck)
    await waitFor(
      () => {
        expect(screen.getByTestId(faucet.ethButton)).not.toHaveTextContent(
          /Requesting tokens/i,
        );
      },
      { timeout: 5_000 },
    );

    // Button should be re-enabled for retry
    expect(screen.getByTestId(faucet.ethButton)).not.toBeDisabled();
  }, 30_000);
});
