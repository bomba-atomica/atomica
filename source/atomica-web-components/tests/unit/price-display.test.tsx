/**
 * Unit tests for every component that shows a price.
 *
 * A price is whole USD per whole base token with no decimal shift, so every
 * display goes through the SDK `formatPrice`: a price of 2000n shows as $2000.
 *
 * Runs in the Unit Tests (atomica-sdk, atomica-web-components) job through
 * vitest.unit.config.ts.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import type { AuctionSettledEvent, Pair } from "@atomica/sdk/settlement/bridge";
import { WalletContext } from "../../src/context/WalletContext";

const { mockQueryAuctionSettledEvents, mockIsRevealed, mockDecryptWindowBids } =
  vi.hoisted(() => ({
    mockQueryAuctionSettledEvents: vi.fn(),
    mockIsRevealed: vi.fn(),
    mockDecryptWindowBids: vi.fn(),
  }));

vi.mock("@atomica/sdk/settlement/bridge", async () => ({
  ...(await vi.importActual<typeof import("@atomica/sdk/settlement/bridge")>(
    "@atomica/sdk/settlement/bridge",
  )),
  queryAuctionSettledEvents: (...args: unknown[]) =>
    mockQueryAuctionSettledEvents(...args),
}));

vi.mock("@atomica/sdk/settlement/window-release", () => ({
  defaultAptosNodes: () => ["http://aptos.test/v1"],
}));

vi.mock("@atomica/sdk/chain-config", () => ({
  getChainConfig: () => ({
    ethereum: {},
    aptos: { contractAddress: "0x" + "ab".repeat(32) },
  }),
}));

vi.mock("@atomica/sdk/aptos", () => ({
  isRevealed: mockIsRevealed,
  MAX_OPEN_BIDS_PER_CALL: 12n,
  openBids: vi.fn(),
  finalizeWindow: vi.fn(),
  getOpenCursor: vi.fn(),
  getWindowTimelockId: vi.fn().mockResolvedValue(42n),
  decryptWindowBids: mockDecryptWindowBids,
}));

import { BidHistory } from "../../src/components/BidHistory";
import { SettlementStatus } from "../../src/components/SettlementStatus";
import { WithdrawWinnings } from "../../src/components/WithdrawWinnings";
import { AuctionRevealer } from "../../src/components/AuctionRevealer";

const PAIR: Pair = {
  baseChain: "ethereum",
  baseToken: "FakeETH",
  quoteChain: "ethereum",
  quoteToken: "FakeUSD",
};

const EVENT: AuctionSettledEvent = {
  windowId: 1n,
  pair: PAIR,
  clearingPrice: 2000n,
  totalFilled: 10n ** 18n,
  winnerCount: 1n,
  lockIds: [],
};

describe("price display", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("BidHistory renders a recorded clearing price of 2000n as $2000", () => {
    render(
      <BidHistory
        entries={[
          { auctionId: "0xseller", clearingPrice: 2000n, settledAt: 1 },
        ]}
      />,
    );
    const row = screen.getByTestId("bid-history-row");
    expect(row.textContent).toContain("$2000");
    expect(row.textContent).not.toContain("$0.00");
  });

  it("SettlementStatus renders a settlement event with clearing price 2000n as $2000", async () => {
    mockQueryAuctionSettledEvents.mockResolvedValue([EVENT]);
    render(<SettlementStatus windowId={1n} pair={PAIR} />);
    await waitFor(() =>
      expect(screen.getByTestId("settlement-status-settled")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("settlement-status-settled").textContent,
    ).toContain("clearing price $2000");
  });

  it("WithdrawWinnings renders a settlement event with clearing price 2000n as $2000", () => {
    render(<WithdrawWinnings events={[EVENT]} />);
    expect(
      screen.getByTestId("withdraw-winnings-events").textContent,
    ).toContain("clearing price $2000");
  });

  it("AuctionRevealer lists a decrypted bid of 2000n as $2000", async () => {
    mockIsRevealed.mockResolvedValue(true);
    mockDecryptWindowBids.mockResolvedValue([
      {
        index: 0,
        bidder: "0x" + "0a".repeat(32),
        alreadyOpened: false,
        valid: true,
        price: 2000n,
      },
    ]);
    render(
      <WalletContext.Provider
        value={{ account: "0x" + "12".repeat(20), connect: vi.fn() }}
      >
        <AuctionRevealer />
      </WalletContext.Provider>,
    );
    fireEvent.click(screen.getByTestId("start-polling-button"));
    await waitFor(() =>
      expect(screen.getByTestId("decrypt-bids-button")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("decrypt-bids-button"));
    await waitFor(() =>
      expect(screen.getByTestId("decrypted-bid").textContent).toContain(
        "price $2000",
      ),
    );
  });

  it("no component divides a price by one million", () => {
    const srcDir = join(__dirname, "../../src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(srcDir);
    expect(files.length).toBeGreaterThan(10);
    // A division by 1e6, 1_000_000, 1000000 or 10 ** 6 (number or bigint) on
    // a line that names a price. Microsecond to second conversions name no
    // price and are allowed.
    const divideByMillion =
      /\/\s*\(?\s*(1e6|1_000_000n?|1000000n?|10n?\s*\*\*\s*6n?)\b/;
    const offenders = files.flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .filter((line) => /price/i.test(line) && divideByMillion.test(line))
        .map((line) => `${f}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
    // The old SettleButton display would be caught.
    expect(
      /price/i.test("(Number(clearingPrice) / 1e6).toFixed(2)") &&
        divideByMillion.test("(Number(clearingPrice) / 1e6).toFixed(2)"),
    ).toBe(true);
    // formatUsd (the old million divider) is gone from BidHistory.
    expect(
      readFileSync(join(srcDir, "components/BidHistory.tsx"), "utf8"),
    ).not.toContain("formatUsd");
  });
});
