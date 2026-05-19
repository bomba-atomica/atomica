/**
 * bridge.ts — v0 Beta Settlement Bridge scaffold
 *
 * Cross-chain settlement bridge between Aptos and Ethereum.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 *
 * ============================================================
 * INTEGRATION RISK REGISTRY (scouts #96 and #111)
 * ============================================================
 *
 * This file is a compile-clean stub.  None of the exported functions contain
 * real logic; all bodies throw NOT_IMPLEMENTED.  Scout #111 adds deep
 * annotations for all integration points the #112 implementation must wire.
 *
 * --- RISK 1: AuctionSettled winners/fills join gap ---
 *
 * `AuctionSettled` (auction.move §2.9) emits:
 *   window_id, pair, clearing_price, total_filled, winner_count, lock_ids
 *
 * It does NOT include per-winner Ethereum addresses or per-winner fill
 * amounts.  To construct `authorizeSettlement(winners[], fills[])` the
 * relayer (issue #112) must make a second Aptos view call to fetch
 * `bid_results` for the window and:
 *   1. Filter bid_results where `is_winner == true`.
 *   2. Convert each winner's Aptos address (32-byte Aptos addr with the
 *      leading bytes zero-padded) to Ethereum via the address-converter in
 *      `atomica-sdk/src/ethereum/address-converter.ts`.
 *   3. Use `fill_amount` from each winning BidResult as the corresponding
 *      `fills` entry.
 *
 * There is currently no public view function `get_bid_results` exposed in
 * auction.move.  Issue #112 must either add it or use `get_auction` and
 * query the event stream for complete bid data.
 *
 * --- RISK 2: Settlement.sol / BLSVerifierTestnet call-signature mismatch ---
 *
 * Settlement.sol (line ~172) calls:
 *   blsVerifier.verifyBlockHash(blockHash, blsSignature, validatorIndices)
 *
 * BLSVerifierTestnet.sol only exposes:
 *   verifyBlockHash(bytes32 blockHash, bytes calldata sig) returns (bool)
 *
 * The `validatorIndices` array is NOT in BLSVerifierTestnet's ABI.  At
 * runtime this call will revert with a function-not-found error unless
 * Settlement.sol is updated for v0.1 Beta.  Recommended fix in #112: update
 * Settlement.sol to call the two-argument form OR pass a dummy empty array
 * for validatorIndices if the old Settlement ABI is retained.
 *
 * --- RISK 3: No withdrawWinnings pull-pattern in Settlement.sol ---
 *
 * The WithdrawWinnings UI component calls `submitSettlement` expecting a
 * winner-initiated pull flow.  Settlement.sol only implements a push path
 * via `settle()` (called by the relayer, not the winner).  Issue #113 must
 * decide: (a) add a `withdrawWinnings` function to Settlement.sol, or (b)
 * change the UI to reflect that the relayer pushes and the UI only monitors.
 *
 * --- RISK 4: No BLSVerifierTestnet or Settlement.sol ABI in the SDK ---
 *
 * As of scout #111, only `FakeETH` and `FakeUSD` ABIs exist in
 * `atomica-sdk/src/ethereum/abis.ts`.  Scout #111 adds stub ABI constants
 * `BLS_VERIFIER_TESTNET_ABI` and `SETTLEMENT_ABI` to that file.  Issue #112
 * must import and use those ABIs when constructing ethers Contract instances.
 *
 * --- RECOMMENDED SEQUENCING (scout #111) ---
 *
 *   Step 1 (#112, first):
 *     Implement `queryAuctionSettledEvents` — Aptos node event query and
 *     parse into `AuctionSettledEvent[]`.  Add `get_bid_results` view to
 *     auction.move or equivalent.
 *
 *   Step 2 (#112, second):
 *     Resolve Settlement.sol / BLSVerifierTestnet signature mismatch.
 *     Implement `submitSettlement` mapping AuctionSettled fields to
 *     `authorizeSettlement` inputs using the join logic from RISK 1.
 *
 *   Step 3 (#112, third):
 *     Implement `releaseBidderCollateral` using LockBox.sol.
 *
 *   Step 4 (#112, fourth):
 *     Add relayer script in `atomica-demo/scripts/settlement-relayer.ts`
 *     that polls `queryAuctionSettledEvents` and calls `submitSettlement`
 *     in a loop.  The relayer entry point must be runnable via
 *     `bun run atomica-demo/scripts/settlement-relayer.ts`.
 *
 *   Step 5 (#113, after #112 merges):
 *     Wire SettlementStatus, WithdrawWinnings, and useFeeRebate to real
 *     on-chain data.  Decide pull vs. push for WithdrawWinnings (RISK 3).
 *
 * --- FILES THE RELAYER AND BRIDGE.TS MUST TOUCH ---
 *
 *   source/atomica-sdk/src/settlement/bridge.ts          — this file
 *   source/atomica-sdk/src/ethereum/abis.ts              — add ABIs (#111 done)
 *   source/atomica-sdk/src/ethereum/contracts.ts         — add contract factories
 *   source/atomica-sdk/src/aptos/payloads.ts             — add get_bid_results view
 *   source/evm-contracts/src/Settlement.sol              — fix verifyBlockHash arity
 *   source/evm-contracts/src/settlement/BLSVerifierTestnet.sol — no change needed
 *   source/atomica-demo/scripts/settlement-relayer.ts    — new file (#112)
 *   source/atomica-web-components/src/components/SettlementStatus.tsx — (#113)
 *   source/atomica-web-components/src/components/WithdrawWinnings.tsx — (#113)
 *   source/atomica-web-components/src/hooks/useFeeRebate.ts           — (#113)
 *
 * @see docs/architecture/v0-architecture.md §3.1 — Relayer Entry Point Design
 * @see docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 * @see docs/architecture/v0-architecture.md §3.4 — v1 ZK-Proof Upgrade Seam
 */

// Scaffold stubs created by dev-scout issue #96.
// Annotated with full integration seam documentation by dev-scout issue #111.
// Implement in issue #112 (bridge.ts functions + relayer script).

// ============================================================
// Types
// ============================================================

/**
 * Mirrors the on-chain `auction::Pair` struct.
 * @see docs/architecture/v0-architecture.md §2.4
 */
export interface Pair {
  baseChain: string; // e.g. "ethereum"
  baseToken: string; // e.g. "FakeETH"
  quoteChain: string; // e.g. "aptos"
  quoteToken: string; // e.g. "FakeUSD"
}

/**
 * Mirrors the on-chain `auction::AuctionSettled` event.
 * @see docs/architecture/v0-architecture.md §2.9
 * Implemented in auction.move as `AuctionSettled` (Phase 3a #86).
 */
export interface AuctionSettledEvent {
  windowId: bigint;
  pair: Pair;
  clearingPrice: bigint;
  totalFilled: bigint; // wei of base token transferred to winners
  winnerCount: bigint;
  lockIds: Uint8Array[]; // seller receipt IDs consumed
}

/**
 * Transaction hash returned by Ethereum settlement calls.
 */
export type TxHash = string;

// ============================================================
// Functions — scaffold stubs (all throw NOT_IMPLEMENTED)
// ============================================================

/**
 * Query Aptos node for `auction::AuctionSettled` events for a given window/pair.
 *
 * Implementation target: issue #112.
 *
 * AuctionSettled event schema (auction.move §2.9):
 *   window_id:      u64             → AuctionSettledEvent.windowId       (bigint)
 *   pair:           Pair            → AuctionSettledEvent.pair            (Pair)
 *   clearing_price: u64             → AuctionSettledEvent.clearingPrice   (bigint)
 *   total_filled:   u256            → AuctionSettledEvent.totalFilled     (bigint)
 *   winner_count:   u64             → AuctionSettledEvent.winnerCount     (bigint)
 *   lock_ids:       vector<vector<u8>> → AuctionSettledEvent.lockIds      (Uint8Array[])
 *
 * Aptos query endpoint (v0.1 Beta):
 *   GET /v1/accounts/{contractAddress}/events/{eventType}
 *   where eventType = "{CONTRACT_ADDR}::auction::AuctionSettled"
 *   Filter by window_id and pair fields after fetching.
 *
 * OPEN QUESTION (#112): The Aptos SDK event API returns events in
 * reverse-creation order.  The relayer must page through results to find
 * the event matching (windowId, pair).  Consider using the Aptos SDK
 * `getEventsByCreationNumber` or `getModuleEventsByEventType` approach.
 *
 * @param windowId  auction_window_id from docs/architecture §2.2
 * @param pair      trading pair descriptor
 * @see docs/architecture/v0-architecture.md §2.9 — AuctionSettled event
 * @see docs/architecture/v0-architecture.md §3.1 — Relayer polling loop
 */
export async function queryAuctionSettledEvents(
  _windowId: bigint,
  _pair: Pair,
): Promise<AuctionSettledEvent[]> {
  throw new Error(
    "NOT_IMPLEMENTED: queryAuctionSettledEvents — implement in #89",
  );
}

/**
 * Submit settlement to `BLSVerifierTestnet.sol::authorizeSettlement`.
 *
 * Implementation target: issue #112.
 *
 * Full data-flow (AuctionSettled → authorizeSettlement → Settlement.sol):
 *
 *   1. APTOS SIDE — read from `queryAuctionSettledEvents`:
 *      AuctionSettledEvent.windowId      → authorizeSettlement windowId
 *      keccak256(BCS(AuctionSettledEvent.pair)) → authorizeSettlement pairHash
 *      AuctionSettledEvent.clearingPrice → authorizeSettlement clearingPrice
 *
 *   2. JOIN STEP — must fetch bid_results from Aptos view:
 *      auction::get_bid_results(windowId, pairBcs) → BidResult[]
 *      Filter BidResult where is_winner == true.
 *      Convert winner Aptos address → Ethereum address (zero-pad to 20 bytes).
 *      Use BidResult.fill_amount as fills entry.
 *      → authorizeSettlement winners[], fills[]
 *
 *   3. ETHEREUM SIDE — call on BLSVerifierTestnet.sol:
 *      BLS_VERIFIER_TESTNET_ABI.authorizeSettlement(
 *        windowId, pairHash, clearingPrice, winners, fills
 *      )
 *      See `BLS_VERIFIER_TESTNET_ABI` in atomica-sdk/src/ethereum/abis.ts
 *
 *   4. SETTLEMENT.SOL — the trusted relayer then calls:
 *      Settlement.sol::settle(...) with blockHash, stateRoot, tradeResult,
 *      blsSignature, validatorIndices, ...
 *      See RISK 2 in the file header for the signature-mismatch issue.
 *
 * @param events  AuctionSettled events fetched from Aptos
 * @see docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 * @see source/atomica-sdk/src/ethereum/abis.ts — BLS_VERIFIER_TESTNET_ABI
 */
export async function submitSettlement(
  _events: AuctionSettledEvent[],
): Promise<TxHash> {
  throw new Error("NOT_IMPLEMENTED: submitSettlement — implement in #89");
}

/**
 * Typed descriptor for a losing bidder's collateral refund request.
 *
 * Created when settlement determines a bid did not win.  The
 * `collateral_lock_id` is the FakeUSD LockReceipt ID that was consumed by
 * `auction::submit_bid`.  The off-chain relayer or user calls
 * `releaseBidderCollateral` with this descriptor to trigger the Ethereum-side
 * unlock of the frozen FakeUSD.
 *
 * @see docs/architecture/v0-architecture.md §2.8 — Collateral Refund Path
 * @see #87 (Phase 3b — bidder collateral scaffold)
 * @see #89 (Phase 3d — cross-chain settlement) where full release logic lands
 */
export interface BidderCollateralRefund {
  /** FakeUSD LockReceipt ID consumed by auction::submit_bid */
  collateralLockId: Uint8Array;
  /** Bidder Aptos address (zero-padded Ethereum address) */
  bidderAddress: string;
  /** auction_window_id for which this bid was submitted */
  windowId: bigint;
  /** BCS-encoded trading pair that identifies the auction window */
  pairBcs: Uint8Array;
}

/**
 * Release bidder collateral for a losing bid.
 *
 * Called after settlement when a bid did not win the uniform-price clearing.
 * In the production flow this calls the Ethereum LockBox to unfreeze the
 * FakeUSD that was locked as margin.
 *
 * Scaffold body — implemented in issue #87 (this issue) as a typed stub.
 * Full cross-chain release logic (including BLS proof generation and
 * `BLSVerifierTestnet.sol` call) lands in #89.
 *
 * @param refund  Collateral refund descriptor from the losing bid
 * @see docs/architecture/v0-architecture.md §2.8
 */
export async function releaseBidderCollateral(
  _refund: BidderCollateralRefund,
): Promise<TxHash> {
  throw new Error(
    "NOT_IMPLEMENTED: releaseBidderCollateral — full cross-chain release implements in #89",
  );
}
