/**
 * Selector Contract Tests
 *
 * For each component listed in the selector contract table, render it in a
 * Vitest browser test and query by data-testid to assert the element is found.
 *
 * These tests do NOT require a live testnet — they only verify that the
 * data-testid attributes are present in the rendered DOM.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  SELECTORS,
} from "./helpers/selectors";
import { Faucet } from "../../src/components/Faucet";
import { Step1Connect } from "../../src/components/SellFlow/steps/Step1Connect";
import { Step2Lock } from "../../src/components/SellFlow/steps/Step2Lock";
import { Step3Confirm } from "../../src/components/SellFlow/steps/Step3Confirm";
import { Step4Proof } from "../../src/components/SellFlow/steps/Step4Proof";
import { Step5Submit } from "../../src/components/SellFlow/steps/Step5Submit";
import { Step7Auction } from "../../src/components/SellFlow/steps/Step7Auction";
import { Step8Monitor } from "../../src/components/SellFlow/steps/Step8Monitor";
import { AuctionBidder } from "../../src/components/AuctionBidder";
import { SettleButton } from "../../src/components/SettleButton";
import { ClaimButton } from "../../src/components/ClaimButton";
import { FeeRebateDisplay } from "../../src/components/FeeRebateDisplay";
import { BidHistory } from "../../src/components/BidHistory";
import type { BidHistoryEntry } from "../../src/components/BidHistory";
import {
  WalletContext,
  NetworkConfigProvider,
  ContractStatusProvider,
  BalancesProvider,
} from "../../src/index";

afterEach(() => {
  cleanup();
});

// Minimal providers for components that need context
function MinimalProviders({ children }: { children: React.ReactNode }) {
  return (
    <NetworkConfigProvider>
      <WalletContext.Provider
        value={{ account: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", connect: async () => {} }}
      >
        <ContractStatusProvider>
          <BalancesProvider>{children}</BalancesProvider>
        </ContractStatusProvider>
      </WalletContext.Provider>
    </NetworkConfigProvider>
  );
}

describe("Selector contract — data-testid attributes", () => {
  it("Faucet: faucet-eth-button is present", () => {
    render(
      <MinimalProviders>
        <Faucet />
      </MinimalProviders>,
    );
    expect(
      screen.getByTestId(SELECTORS.faucet.ethButton),
    ).toBeTruthy();
  });

  it("Step1Connect: connect-metamask-button is present", () => {
    render(<Step1Connect onConnect={async () => {}} />);
    expect(
      screen.getByTestId(SELECTORS.step1Connect.connectMetaMaskButton),
    ).toBeTruthy();
  });

  it("Step1Connect: connected-address is present when account prop is provided", () => {
    render(
      <Step1Connect
        onConnect={async () => {}}
        account="0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
      />,
    );
    expect(
      screen.getByTestId(SELECTORS.step1Connect.connectedAddress),
    ).toBeTruthy();
  });

  it("Step2Lock: lock-amount-input is present", () => {
    render(
      <Step2Lock onLock={async () => {}} loading={false} />,
    );
    expect(
      screen.getByTestId(SELECTORS.step2Lock.lockAmountInput),
    ).toBeTruthy();
  });

  it("Step2Lock: min-price-input is present", () => {
    render(
      <Step2Lock onLock={async () => {}} loading={false} />,
    );
    expect(
      screen.getByTestId(SELECTORS.step2Lock.minPriceInput),
    ).toBeTruthy();
  });

  it("Step2Lock: approve-lock-button is present", () => {
    render(
      <Step2Lock onLock={async () => {}} loading={false} />,
    );
    expect(
      screen.getByTestId(SELECTORS.step2Lock.approveLockButton),
    ).toBeTruthy();
  });

  it("Step2Lock: lock-error is present when error prop is provided", () => {
    render(
      <Step2Lock onLock={async () => {}} loading={false} error="Something went wrong" />,
    );
    expect(
      screen.getByTestId(SELECTORS.step2Lock.lockError),
    ).toBeTruthy();
  });

  it("Step3Confirm: confirm-spinner is present", () => {
    render(<Step3Confirm />);
    expect(
      screen.getByTestId(SELECTORS.step3Confirm.confirmSpinner),
    ).toBeTruthy();
  });

  it("Step3Confirm: confirm-tx-hash is present when txHash prop is provided", () => {
    render(<Step3Confirm txHash="0xabc123" />);
    expect(
      screen.getByTestId(SELECTORS.step3Confirm.confirmTxHash),
    ).toBeTruthy();
  });

  it("Step4Proof: proof-spinner is present when no proof", () => {
    render(
      <Step4Proof loading={true} onGenerate={async () => {}} />,
    );
    expect(
      screen.getByTestId(SELECTORS.step4Proof.proofSpinner),
    ).toBeTruthy();
  });

  it("Step4Proof: proof-ready is present when proof is provided", () => {
    const now = Date.now();
    const mockProof = {
      blockNumber: 100,
      blockHash: "0x" + "a".repeat(64),
      stateRoot: "0x" + "b".repeat(64),
      storageValue: 1000000000000000000n,
      storageKey: "0x" + "c".repeat(64),
      accountProof: ["0xabc"],
      storageProof: ["0xdef"],
      contractAddress: "0x" + "d".repeat(40),
      userAddress: "0x" + "e".repeat(40),
      tokenAddress: "0x" + "f".repeat(40),
      timestamp: Math.floor(now / 1000),
      generatedAt: now,
    };
    render(
      <Step4Proof proof={mockProof} loading={false} onGenerate={async () => {}} />,
    );
    expect(
      screen.getByTestId(SELECTORS.step4Proof.proofReady),
    ).toBeTruthy();
  });

  it("Step5Submit: submit-status is present", () => {
    render(
      <Step5Submit loading={true} onSubmit={async () => {}} />,
    );
    expect(
      screen.getByTestId(SELECTORS.step5Submit.submitStatus),
    ).toBeTruthy();
  });

  it("Step5Submit: submit-proof-button is present when error is shown", () => {
    render(
      <Step5Submit loading={false} error="Submit failed" onSubmit={async () => {}} />,
    );
    expect(
      screen.getByTestId(SELECTORS.step5Submit.submitProofButton),
    ).toBeTruthy();
  });

  it("Step7Auction: auction-spinner is present", () => {
    render(
      <Step7Auction loading={true} onCreateAuction={async () => {}} />,
    );
    expect(
      screen.getByTestId(SELECTORS.step7Auction.auctionSpinner),
    ).toBeTruthy();
  });

  it("Step7Auction: auction-tx-hash is present when txHash prop is provided", () => {
    render(
      <Step7Auction
        loading={false}
        txHash="0xabc123"
        onCreateAuction={async () => {}}
      />,
    );
    expect(
      screen.getByTestId(SELECTORS.step7Auction.auctionTxHash),
    ).toBeTruthy();
  });

  it("Step8Monitor: auction-countdown is present", () => {
    render(
      <Step8Monitor
        auctionEndTime={Math.floor(Date.now() / 1000) + 3600}
        onCancelAndUnlock={async () => {}}
        loading={false}
      />,
    );
    expect(
      screen.getByTestId(SELECTORS.step8Monitor.auctionCountdown),
    ).toBeTruthy();
  });

  it("Step8Monitor: auction-status-badge is present", () => {
    render(
      <Step8Monitor
        onCancelAndUnlock={async () => {}}
        loading={false}
      />,
    );
    expect(
      screen.getByTestId(SELECTORS.step8Monitor.auctionStatusBadge),
    ).toBeTruthy();
  });

  it("Step8Monitor: auction-seller-address is present when sellerAddress prop is provided", () => {
    render(
      <Step8Monitor
        sellerAddress="0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
        onCancelAndUnlock={async () => {}}
        loading={false}
      />,
    );
    expect(
      screen.getByTestId(SELECTORS.step8Monitor.auctionSellerAddress),
    ).toBeTruthy();
  });

  it("AuctionBidder: seller-address-input is present", () => {
    render(
      <MinimalProviders>
        <AuctionBidder />
      </MinimalProviders>,
    );
    expect(
      screen.getByTestId(SELECTORS.auctionBidder.sellerAddressInput),
    ).toBeTruthy();
  });

  it("AuctionBidder: bid-amount-input is present", () => {
    render(
      <MinimalProviders>
        <AuctionBidder />
      </MinimalProviders>,
    );
    expect(
      screen.getByTestId(SELECTORS.auctionBidder.bidAmountInput),
    ).toBeTruthy();
  });

  it("AuctionBidder: submit-bid-button is present", () => {
    render(
      <MinimalProviders>
        <AuctionBidder />
      </MinimalProviders>,
    );
    expect(
      screen.getByTestId(SELECTORS.auctionBidder.submitBidButton),
    ).toBeTruthy();
  });

  it("SettleButton: settle-button is present", () => {
    render(
      <MinimalProviders>
        <SettleButton sellerAddress="0xdeadbeef" />
      </MinimalProviders>,
    );
    expect(
      screen.getByTestId(SELECTORS.settleButton.settleButton),
    ).toBeTruthy();
  });

  it("ClaimButton: claim-button is present", () => {
    render(
      <ClaimButton onClaim={async () => {}} onReclaim={async () => {}} />,
    );
    expect(
      screen.getByTestId(SELECTORS.claimButton.claimButton),
    ).toBeTruthy();
  });

  it("ClaimButton: reclaim-button is present", () => {
    render(
      <ClaimButton onClaim={async () => {}} onReclaim={async () => {}} />,
    );
    expect(
      screen.getByTestId(SELECTORS.claimButton.reclaimButton),
    ).toBeTruthy();
  });

  it("FeeRebateDisplay: rebate-amount is present", () => {
    render(<FeeRebateDisplay rebateAmount={1000000n} feeAmount={500000n} />);
    expect(
      screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount),
    ).toBeTruthy();
  });

  it("FeeRebateDisplay: fee-amount is present", () => {
    render(<FeeRebateDisplay rebateAmount={1000000n} feeAmount={500000n} />);
    expect(
      screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount),
    ).toBeTruthy();
  });

  it("BidHistory: bid-history-table is present", () => {
    render(<BidHistory />);
    expect(
      screen.getByTestId(SELECTORS.bidHistory.bidHistoryTable),
    ).toBeTruthy();
  });

  it("BidHistory: bid-history-row is present when entries are provided", () => {
    const entries: BidHistoryEntry[] = [
      {
        auctionId: "0xabc",
        clearingPrice: 100000000n,
        settledAt: Math.floor(Date.now() / 1000),
      },
    ];
    render(<BidHistory entries={entries} />);
    expect(
      screen.getByTestId(SELECTORS.bidHistory.bidHistoryRow),
    ).toBeTruthy();
  });

  it("selectors.ts compiles and exports SELECTORS with correct TypeScript types", () => {
    // Verify that SELECTORS is typed and all expected keys are present
    const s = SELECTORS;
    expect(s.faucet.ethButton).toBe("faucet-eth-button");
    expect(s.faucet.status).toBe("faucet-status");
    expect(s.step1Connect.connectMetaMaskButton).toBe("connect-metamask-button");
    expect(s.step1Connect.connectedAddress).toBe("connected-address");
    expect(s.step2Lock.lockAmountInput).toBe("lock-amount-input");
    expect(s.step2Lock.minPriceInput).toBe("min-price-input");
    expect(s.step2Lock.approveLockButton).toBe("approve-lock-button");
    expect(s.step2Lock.lockError).toBe("lock-error");
    expect(s.step3Confirm.confirmSpinner).toBe("confirm-spinner");
    expect(s.step3Confirm.confirmTxHash).toBe("confirm-tx-hash");
    expect(s.step4Proof.proofSpinner).toBe("proof-spinner");
    expect(s.step4Proof.proofReady).toBe("proof-ready");
    expect(s.step5Submit.submitProofButton).toBe("submit-proof-button");
    expect(s.step5Submit.submitStatus).toBe("submit-status");
    expect(s.step7Auction.auctionSpinner).toBe("auction-spinner");
    expect(s.step7Auction.auctionTxHash).toBe("auction-tx-hash");
    expect(s.step8Monitor.auctionCountdown).toBe("auction-countdown");
    expect(s.step8Monitor.auctionStatusBadge).toBe("auction-status-badge");
    expect(s.step8Monitor.auctionSellerAddress).toBe("auction-seller-address");
    expect(s.auctionBidder.sellerAddressInput).toBe("seller-address-input");
    expect(s.auctionBidder.bidAmountInput).toBe("bid-amount-input");
    expect(s.auctionBidder.submitBidButton).toBe("submit-bid-button");
    expect(s.auctionBidder.bidStatus).toBe("bid-status");
    expect(s.settleButton.settleButton).toBe("settle-button");
    expect(s.settleButton.settleStatus).toBe("settle-status");
    expect(s.claimButton.claimButton).toBe("claim-button");
    expect(s.claimButton.reclaimButton).toBe("reclaim-button");
    expect(s.feeRebateDisplay.rebateAmount).toBe("rebate-amount");
    expect(s.feeRebateDisplay.feeAmount).toBe("fee-amount");
    expect(s.bidHistory.bidHistoryTable).toBe("bid-history-table");
    expect(s.bidHistory.bidHistoryRow).toBe("bid-history-row");
  });
});
