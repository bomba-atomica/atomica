/**
 * UI component tests for AuctionBidder (Phase 3e IBE wiring closure).
 *
 * Verifies that:
 *   1. The component renders the FakeUSD lock step (Step 1) by default.
 *   2. The step indicator shows the active step correctly.
 *   3. Navigating to Step 2 via "Skip" renders the bid submission form.
 *   4. The collateral_lock_id, price and quantity fields are present in Step 2.
 *   5. Submitting seals the bid in the client (`sealBid` reads the timelock key,
 *      identity and associated data from chain) for the wallet's derived Aptos
 *      address, then sends the sealed ciphertext and commitment to `submitBid`.
 *
 * Uses vi.mock to stub `@atomica/sdk/*` so tests run without a blockchain.
 *
 * @see docs/architecture/v0-architecture.md §2.5 — Bidder Collateral
 * @see #90 — Phase 3e IBE wiring closure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

// Stub SDK modules so no blockchain calls are made.
// SCOUT(#228) EDIT: the sealBid mock returns no commitment and no salt.
vi.mock("@atomica/sdk/aptos", () => ({
  assertSiweDomain: vi.fn().mockResolvedValue(undefined),
  submitBid: vi.fn().mockResolvedValue({ hash: "0xabc123" }),
  sealBid: vi.fn().mockResolvedValue({
    timelockId: 11n,
    ciphertext: new Uint8Array([0x20, 0x13, 0xab]),
    commitment: new Uint8Array(32).fill(0xab),
    salt: new Uint8Array(32).fill(1),
  }),
  getRegisterLockPayload: vi.fn((_proof: unknown, asset: string) => ({
    function: "0xa::lock_receipt::register_ethereum_lock",
    typeArguments: [`0xa::lock_receipt::${asset}`],
  })),
  waitForCertifiedBlock: vi.fn(async (minBlock: number) => minBlock + 2),
  getWindowSchedule: vi.fn(async () => ({
    daySecs: 86_400n,
    closeOffsetsSecs: [27_900n, 58_500n],
  })),
  aptos: { mock: "aptos-client" },
}));

// getDerivedAddress is stubbed by default. The checksummed account case swaps
// in the real implementation (vi.importActual) for one call.
vi.mock("@atomica/sdk", () => ({
  getDerivedAddress: vi
    .fn()
    .mockResolvedValue({ toString: () => "0x" + "0d".repeat(32) }),
  submitNativeTransaction: vi.fn().mockResolvedValue({ hash: "0xregister" }),
}));

// lockBinding returns the computed deadline, ethLockDeadline(windowId); LockBox.lock takes none.
vi.mock("@atomica/sdk/ethereum", () => ({
  approveFakeUsd: vi.fn().mockResolvedValue({ hash: "0xapprove" }),
  lockFakeUsd: vi
    .fn()
    .mockResolvedValue({ hash: "0xlock123", blockNumber: 40 }),
  lockFromReceipt: vi.fn(() => ({
    lockId: "0x" + "1d".repeat(32),
    depositor: "0x1234567890123456789012345678901234567890",
    token: "0x" + "55".repeat(20),
    nonce: 3n,
    amount: 10_000_000n,
    windowId: 7n,
    pairHash: "0x" + "00".repeat(32),
    deadline: 1_800_000_000n,
  })),
  currentWindowId: vi.fn(() => 7n),
  lockBinding: vi.fn((windowId: bigint) => ({
    windowId,
    pairHash: "0x" + "00".repeat(32),
    deadline: 1_800_000_000n,
  })),
}));

vi.mock("@atomica/sdk/ethereum/proofs", () => ({
  generateLockedBalanceProof: vi.fn().mockResolvedValue({ lockId: "proof" }),
}));

vi.mock("@atomica/sdk/chain-config", () => ({
  getChainConfig: vi.fn(() => ({
    ethereum: {
      rpcUrl: "http://localhost:9999",
      lockBox: "0x" + "11".repeat(20),
      fakeUSD: "0x" + "55".repeat(20),
    },
  })),
}));

vi.mock("../../src/storage/bidStorage", () => ({
  saveBidPrice: vi.fn(),
}));

import { AuctionBidder } from "../../src/components/AuctionBidder";
import { assertSiweDomain } from "@atomica/sdk/aptos";
import { approveFakeUsd, lockFakeUsd } from "@atomica/sdk/ethereum";

const ACCOUNT = "0x1234567890123456789012345678901234567890";

function renderBidder(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <AuctionBidder />
    </WalletContext.Provider>,
  );
}

describe("AuctionBidder — Phase 3e IBE wiring", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the FakeUSD lock step (Step 1) by default", () => {
    renderBidder();
    expect(screen.getByTestId("lock-collateral-step")).toBeTruthy();
    expect(screen.getByTestId("approve-lock-usd-button")).toBeTruthy();
    expect(screen.getByTestId("collateral-amount-input")).toBeTruthy();
  });

  it("shows Step 1 as active in the step indicator", () => {
    renderBidder();
    const lockIndicator = screen.getByTestId("step-indicator-lock");
    const bidIndicator = screen.getByTestId("step-indicator-bid");
    // Step 1 should have active (bold) styling class
    expect(lockIndicator.className).toContain("bg-zinc-100");
    expect(bidIndicator.className).not.toContain("bg-zinc-100");
  });

  it("navigates to Step 2 when Skip button is clicked", () => {
    renderBidder();
    const skipButton = screen.getByTestId("skip-to-bid-button");
    fireEvent.click(skipButton);

    expect(screen.getByTestId("submit-bid-step")).toBeTruthy();
    expect(screen.getByTestId("submit-bid-button")).toBeTruthy();
    expect(screen.getByTestId("collateral-lock-id-input")).toBeTruthy();
    expect(screen.getByTestId("bid-amount-input")).toBeTruthy();
    expect(screen.getByTestId("window-id-input")).toBeTruthy();
  });

  it("asks for a price and quantity, not for ciphertext or commitment", () => {
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    expect(screen.queryByTestId("bid-ciphertext-input")).toBeNull();
    expect(screen.queryByTestId("bid-commitment-input")).toBeNull();
    expect(screen.getByTestId("bid-amount-input")).toBeTruthy();
    expect(screen.getByTestId("bid-quantity-input")).toBeTruthy();
  });

  // SCOUT(#217) EDIT: parsePrice rejects 0; the assert on the word positive depends on its message.
  it("rejects a price that is not positive without sealing or submitting", async () => {
    const { submitBid, sealBid } = await import("@atomica/sdk/aptos");
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    fireEvent.change(screen.getByTestId("bid-amount-input"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByTestId("submit-bid-button"));
    const status = await screen.findByTestId("bid-status");
    expect(status.textContent).toContain("positive");
    expect(sealBid).not.toHaveBeenCalled();
    expect(submitBid).not.toHaveBeenCalled();
  });

  it("rejects a zero quantity without sealing or submitting", async () => {
    const { submitBid, sealBid } = await import("@atomica/sdk/aptos");
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    fireEvent.change(screen.getByTestId("bid-quantity-input"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByTestId("submit-bid-button"));
    const status = await screen.findByTestId("bid-status");
    expect(status.textContent).toContain("quantity must be above zero");
    expect(sealBid).not.toHaveBeenCalled();
    expect(submitBid).not.toHaveBeenCalled();
  });

  it("explains the over-supply abort (38) of submit_bid", async () => {
    const { submitBid } = await import("@atomica/sdk/aptos");
    vi.mocked(submitBid).mockRejectedValueOnce(
      new Error("Move abort in 0xa7::auction: E_QUANTITY_ABOVE_SUPPLY(0x26)"),
    );
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    fireEvent.change(screen.getByTestId("collateral-lock-id-input"), {
      target: { value: "0x" + "cd".repeat(32) },
    });
    fireEvent.click(screen.getByTestId("submit-bid-button"));
    await screen.findByText(/above the window supply/);
  });

  // SCOUT(#228) EDIT: the submitBid arguments shift (no commitment at index 4).
  // SCOUT(#217) EDIT: this types 200 and expects 200n; add the 2000 case.
  it("seals the bid for the derived address and submits ciphertext, commitment, lock id and quantity", async () => {
    const { submitBid, sealBid } = await import("@atomica/sdk/aptos");
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    fireEvent.change(screen.getByTestId("window-id-input"), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByTestId("bid-amount-input"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByTestId("collateral-lock-id-input"), {
      target: { value: "0x" + "cd".repeat(32) },
    });
    fireEvent.change(screen.getByTestId("bid-quantity-input"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByTestId("submit-bid-button"));
    await screen.findByText(/Bid Submitted/);

    expect(sealBid).toHaveBeenCalledTimes(1);
    const sealArgs = vi.mocked(sealBid).mock.calls[0];
    expect(sealArgs[0]).toBe(9n);
    expect(sealArgs[2]).toBe("0x" + "0d".repeat(32));
    expect(sealArgs[3]).toBe(200n);

    expect(submitBid).toHaveBeenCalledTimes(1);
    const args = vi.mocked(submitBid).mock.calls[0];
    expect(args[0]).toBe(ACCOUNT);
    expect(args[1]).toBe(9n);
    expect(Array.from(args[3])).toEqual([0x20, 0x13, 0xab]);
    expect(args[4]).toEqual(new Uint8Array(32).fill(0xab));
    expect(args[5]).toHaveLength(32);
    expect(args[6]).toBe(7n);
  });

  it("with a checksummed account and the real getDerivedAddress, sealBid receives the address derived from the lowercase account", async () => {
    const { sealBid } = await import("@atomica/sdk/aptos");
    const sdk = await import("@atomica/sdk");
    const actual =
      await vi.importActual<typeof import("@atomica/sdk")>("@atomica/sdk");
    vi.mocked(sdk.getDerivedAddress).mockImplementationOnce(
      actual.getDerivedAddress,
    );
    const checksummed = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const expected = (
      await actual.getDerivedAddress(checksummed.toLowerCase())
    ).toString();

    renderBidder(checksummed);
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    fireEvent.change(screen.getByTestId("bid-amount-input"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByTestId("collateral-lock-id-input"), {
      target: { value: "0x" + "cd".repeat(32) },
    });
    fireEvent.click(screen.getByTestId("submit-bid-button"));
    await screen.findByText(/Bid Submitted/);

    expect(sealBid).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sealBid).mock.calls[0][2]).toBe(expected);
  });

  it("when sealBid throws, AuctionBidder shows the error and never calls submitBid", async () => {
    const { submitBid, sealBid } = await import("@atomica/sdk/aptos");
    const { saveBidPrice } = await import("../../src/storage/bidStorage");
    vi.mocked(sealBid).mockRejectedValueOnce(
      new Error(
        "The Aptos node returned a timelock identity for timelock 11 that differs from the one built from its chain id, epoch and deadline. Refusing to seal the bid.",
      ),
    );
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    fireEvent.change(screen.getByTestId("bid-amount-input"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByTestId("collateral-lock-id-input"), {
      target: { value: "0x" + "cd".repeat(32) },
    });
    fireEvent.click(screen.getByTestId("submit-bid-button"));

    await waitFor(() =>
      expect(screen.getByTestId("bid-status").textContent).toContain(
        "Refusing to seal the bid",
      ),
    );
    expect(sealBid).toHaveBeenCalledTimes(1);
    expect(submitBid).not.toHaveBeenCalled();
    expect(saveBidPrice).not.toHaveBeenCalled();
    expect(screen.queryByText(/Bid Submitted/)).toBeNull();
  });

  it("shows Step 2 as active in step indicator after skipping to bid", () => {
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));

    const lockIndicator = screen.getByTestId("step-indicator-lock");
    const bidIndicator = screen.getByTestId("step-indicator-bid");
    expect(bidIndicator.className).toContain("bg-zinc-100");
    expect(lockIndicator.className).not.toContain("bg-zinc-100");
  });

  it("navigates back to Step 1 when Back button is clicked", () => {
    renderBidder();
    // Go to Step 2
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    expect(screen.getByTestId("submit-bid-step")).toBeTruthy();

    // Go back to Step 1
    fireEvent.click(screen.getByTestId("back-to-lock-button"));
    expect(screen.getByTestId("lock-collateral-step")).toBeTruthy();
  });

  it("renders the Approve & Lock FakeUSD button on Step 1", () => {
    renderBidder();
    const lockButton = screen.getByTestId("approve-lock-usd-button");
    expect(lockButton.textContent).toContain("Approve & Lock FakeUSD");
  });

  it("renders the Submit Encrypted Bid button on Step 2", () => {
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    const bidButton = screen.getByTestId("submit-bid-button");
    expect(bidButton.textContent).toContain("Submit Encrypted Bid");
  });

  it.todo(
    "SCOUT(#217) typing 2000 in the price field makes sealBid receive 2000n",
  );
  it.todo(
    "SCOUT(#217) a price of 2000.5, -1 or an empty field shows an error and neither seals nor submits",
  );
  it.todo("SCOUT(#228) submitBid is called with no commitment");
  it("refuses the FakeUSD lock on another host and shows the expected SIWE domain", async () => {
    (window as unknown as { ethereum: object }).ethereum = {};
    vi.mocked(assertSiweDomain).mockRejectedValueOnce(
      new Error(
        "This page runs on evil.example, but lock receipts belong to accounts of localhost:3000. Open the app on localhost:3000 before you lock tokens.",
      ),
    );
    renderBidder();
    fireEvent.change(screen.getByTestId("collateral-amount-input"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByTestId("approve-lock-usd-button"));

    await waitFor(() =>
      expect(screen.getByTestId("lock-status").textContent).toContain(
        "localhost:3000",
      ),
    );
    expect(assertSiweDomain).toHaveBeenCalledWith(window.location.host);
    expect(approveFakeUsd).not.toHaveBeenCalled();
    expect(lockFakeUsd).not.toHaveBeenCalled();
    expect(screen.getByTestId("lock-collateral-step")).toBeTruthy();
    delete (window as unknown as { ethereum?: object }).ethereum;
  });
});

describe("AuctionBidder — FakeUSD lock registration", () => {
  const LOCK_ID = "0x" + "1d".repeat(32);

  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { ethereum: object }).ethereum = { request: vi.fn() };
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { ethereum?: object }).ethereum;
  });

  async function lockAndRegister() {
    fireEvent.click(screen.getByTestId("approve-lock-usd-button"));
    await screen.findByTestId("submit-bid-step");
  }

  it("after the lock, the collateral lock id field equals the lockId of the Locked event and never the transaction hash", async () => {
    renderBidder();
    await lockAndRegister();
    const field = screen.getByTestId(
      "collateral-lock-id-input",
    ) as HTMLInputElement;
    expect(field.value).toBe(LOCK_ID);
    expect(field.value).not.toBe("0xlock123");
  });

  it("the lock step calls approve, lock, the certified block wait, the proof generator with the FakeUSD token and the register transaction with asset FakeUSD, in that order", async () => {
    const { waitForCertifiedBlock, getRegisterLockPayload } =
      await import("@atomica/sdk/aptos");
    const { generateLockedBalanceProof } =
      await import("@atomica/sdk/ethereum/proofs");
    const { submitNativeTransaction } = await import("@atomica/sdk");
    renderBidder();
    await lockAndRegister();

    const order = [
      approveFakeUsd,
      lockFakeUsd,
      waitForCertifiedBlock,
      generateLockedBalanceProof,
      getRegisterLockPayload,
      submitNativeTransaction,
    ].map((fn) => {
      expect(fn).toHaveBeenCalledTimes(1);
      return vi.mocked(fn).mock.invocationCallOrder[0];
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));

    // Proven at a certified block that covers the lock block.
    expect(waitForCertifiedBlock).toHaveBeenCalledWith(40);
    const proofArgs = vi.mocked(generateLockedBalanceProof).mock.calls[0];
    expect(proofArgs[1]).toBe("0x" + "11".repeat(20)); // LockBox
    expect(proofArgs[2]).toBe(ACCOUNT);
    expect(proofArgs[3]).toBe("0x" + "55".repeat(20)); // FakeUSD
    expect(proofArgs[4]).toBe(3n); // nonce of the Locked event
    expect(proofArgs[5]).toEqual({
      amount: 10_000_000n,
      windowId: 7n,
      pairHash: "0x" + "00".repeat(32),
      deadline: 1_800_000_000n,
    });
    expect(proofArgs[6]).toBe(42);

    expect(getRegisterLockPayload).toHaveBeenCalledWith(
      { lockId: "proof" },
      "FakeUSD",
    );
    const sent = vi.mocked(submitNativeTransaction).mock.calls[0];
    expect(sent[1]).toBe(ACCOUNT);
    expect(sent[2]).toEqual(
      vi.mocked(getRegisterLockPayload).mock.results[0].value,
    );
  });

  it("the pair bytes passed to lockBinding equal the pair bytes passed to sealBid and submitBid", async () => {
    const { sealBid, submitBid } = await import("@atomica/sdk/aptos");
    const { lockBinding } = await import("@atomica/sdk/ethereum");
    renderBidder();
    fireEvent.change(screen.getByTestId("pair-bcs-input"), {
      target: { value: "0x0a0b0c" },
    });
    await lockAndRegister();
    fireEvent.click(screen.getByTestId("submit-bid-button"));
    await screen.findByText(/Bid Submitted/);

    const locked = vi.mocked(lockBinding).mock.calls[0][1];
    expect(Array.from(locked)).toEqual([0x0a, 0x0b, 0x0c]);
    expect(vi.mocked(sealBid).mock.calls[0][1]).toEqual(locked);
    expect(vi.mocked(submitBid).mock.calls[0][2]).toEqual(locked);
    // The bid consumes the registered lock.
    expect(
      Array.from(vi.mocked(submitBid).mock.calls[0][5] as Uint8Array),
    ).toEqual(Array(32).fill(0x1d));
  });

  it("when the SDK lock rejects with the pin mismatch error, the lock step shows the expected address and does not advance", async () => {
    const pinned = "0x" + "77".repeat(20);
    vi.mocked(approveFakeUsd).mockRejectedValueOnce(
      new Error(
        `LockBox address mismatch: Aptos pins ${pinned}, but this client is configured with ${"0x" + "11".repeat(20)}. Aptos accepts locks only in ${pinned}. Refusing to approve or lock.`,
      ),
    );
    renderBidder();
    fireEvent.click(screen.getByTestId("approve-lock-usd-button"));

    await waitFor(() =>
      expect(screen.getByTestId("lock-status").textContent).toContain(pinned),
    );
    expect(lockFakeUsd).not.toHaveBeenCalled();
    expect(screen.getByTestId("lock-collateral-step")).toBeTruthy();
    expect(screen.queryByTestId("submit-bid-step")).toBeNull();
  });

  it("when the register transaction rejects, the error shows, the step stays on the lock step, and a retry sends no second approve or lock", async () => {
    const { submitNativeTransaction } = await import("@atomica/sdk");
    const { generateLockedBalanceProof } =
      await import("@atomica/sdk/ethereum/proofs");
    vi.mocked(submitNativeTransaction).mockRejectedValueOnce(
      new Error("register_ethereum_lock aborted"),
    );
    renderBidder();
    fireEvent.click(screen.getByTestId("approve-lock-usd-button"));

    await waitFor(() =>
      expect(screen.getByTestId("lock-status").textContent).toContain(
        "register_ethereum_lock aborted",
      ),
    );
    expect(screen.getByTestId("lock-collateral-step")).toBeTruthy();
    expect(screen.queryByTestId("submit-bid-step")).toBeNull();
    const retry = screen.getByTestId("approve-lock-usd-button");
    expect(retry.textContent).toContain("Retry");

    fireEvent.click(retry);
    await screen.findByTestId("submit-bid-step");
    expect(approveFakeUsd).toHaveBeenCalledTimes(1);
    expect(lockFakeUsd).toHaveBeenCalledTimes(1);
    expect(generateLockedBalanceProof).toHaveBeenCalledTimes(2);
    expect(submitNativeTransaction).toHaveBeenCalledTimes(2);
    expect(
      (screen.getByTestId("collateral-lock-id-input") as HTMLInputElement)
        .value,
    ).toBe(LOCK_ID);
  });
});
