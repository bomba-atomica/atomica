/**
 * Selector constants for all demo UI components.
 *
 * Every `data-testid` value used in browser integration tests must be defined
 * here. Test files import from this module — never hard-code selector strings
 * directly in tests.
 *
 * Source of truth: source/docs/e2e-testing-plan.md — "Selector Contract" table.
 */

export const SELECTORS = {
  // Faucet
  faucet: {
    ethButton: "faucet-eth-button",
    status: "faucet-status",
  },

  // Step1Connect
  step1Connect: {
    connectMetaMaskButton: "connect-metamask-button",
    connectedAddress: "connected-address",
  },

  // Step2Lock
  step2Lock: {
    lockAmountInput: "lock-amount-input",
    approveLockButton: "approve-lock-button",
    lockError: "lock-error",
  },

  // Step3Confirm
  step3Confirm: {
    confirmSpinner: "confirm-spinner",
    confirmTxHash: "confirm-tx-hash",
  },

  // Step4Proof
  step4Proof: {
    proofSpinner: "proof-spinner",
    proofReady: "proof-ready",
  },

  // Step5Submit
  step5Submit: {
    submitProofButton: "submit-proof-button",
    submitStatus: "submit-status",
  },

  // Step7Auction
  step7Auction: {
    auctionSpinner: "auction-spinner",
    auctionTxHash: "auction-tx-hash",
  },

  // Step8Monitor
  step8Monitor: {
    auctionCountdown: "auction-countdown",
    auctionStatusBadge: "auction-status-badge",
    auctionSellerAddress: "auction-seller-address",
  },

  // AuctionBidder — v0 Beta (Phase 3b)
  // Phase 3b: two-step flow — lock FakeUSD collateral then submit sealed bid.
  // skipToBidButton advances from Step 1 (lock) to Step 2 (bid) without
  // performing a real on-chain lock (for integration test use).
  auctionBidder: {
    /** @deprecated v0 Beta: use windowIdInput instead */
    sellerAddressInput: "seller-address-input",
    /** Step 1 — skip the FakeUSD lock and go straight to the bid form. */
    skipToBidButton: "skip-to-bid-button",
    /** Step 1 — pair BCS the lock is bound to (the bid names the same pair). */
    pairBcsInput: "pair-bcs-input",
    /** Step 1 — approve, lock, prove and register FakeUSD. */
    approveLockUsdButton: "approve-lock-usd-button",
    lockStatus: "lock-status",
    submitBidStep: "submit-bid-step",
    windowIdInput: "window-id-input",
    collateralLockIdInput: "collateral-lock-id-input",
    bidAmountInput: "bid-amount-input",
    bidQuantityInput: "bid-quantity-input",
    submitBidButton: "submit-bid-button",
    bidStatus: "bid-status",
  },

  // AuctionRevealer
  auctionRevealer: {
    revealerWindow: "revealer-window",
    startPollingButton: "start-polling-button",
    revealStatus: "reveal-status",
    openBidsButton: "open-bids-button",
    openedCount: "opened-count",
    openStatus: "open-status",
    timelockExpired: "timelock-expired",
  },

  // SettleButton
  settleButton: {
    settleButton: "settle-button",
    settleStatus: "settle-status",
    settleResult: "settle-result",
    settleWinner: "settle-winner",
    settleClearingPrice: "settle-clearing-price",
    settleTotalFilled: "settle-total-filled",
  },

  // ReleaseButton
  releaseButton: {
    releaseButton: "release-button",
    releaseNote: "release-note",
    releaseLock: "release-lock",
    releaseLockStatus: "release-lock-status",
    releaseStatus: "release-status",
    releaseError: "release-error",
  },

  // BidHistory
  bidHistory: {
    bidHistoryTable: "bid-history-table",
    bidHistoryRow: "bid-history-row",
  },
} as const;

// Flat exports for direct destructuring in tests.
export const {
  faucet,
  step1Connect,
  step2Lock,
  step3Confirm,
  step4Proof,
  step5Submit,
  step7Auction,
  step8Monitor,
  auctionBidder,
  auctionRevealer,
  settleButton,
  releaseButton,
  bidHistory,
} = SELECTORS;
