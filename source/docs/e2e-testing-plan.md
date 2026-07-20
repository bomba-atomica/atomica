# Atomica Demo — Browser Integration Test Plan

Full browser integration tests for the demo. Tests run in headless Chromium via
Vitest + Playwright against a live dual-chain Docker testnet. Engineers run
`bun test:integration` and get a full automated pass with no manual steps.

---

## Setup and Teardown

Every test suite starts the **Aptos local testnet** (Docker, 4-validator, port
8080/8081) and the **Ethereum local testnet** (Geth archive node, port 8545) in
`beforeAll` via `setupIntegrationFixture()`, deploys all contracts, and tears
both down in `afterAll`. No external network is required — everything runs
locally.

The user only connects an Ethereum wallet (MetaMask); the Aptos address is
derived from it programmatically and all Aptos transactions are signed
server-side by the app. `window.ethereum` is replaced with a deterministic mock
signer derived from `.env.test` credentials — no MetaMask extension required.

```
tests/integration/
  fixtures/
    wallet-mock.ts         ← injects window.ethereum backed by .env.test key
    dual-chain.ts          ← starts Aptos + Ethereum testnets, deploys contracts, tears down
  helpers/
    selectors.ts           ← all data-testid constants in one place
    wait.ts                ← poll helpers (waitForBalance, waitForStep, etc.)
```

**Testnet startup sequence inside `setupIntegrationFixture()`:**
1. Start Aptos Docker testnet (reuses `setupLocalnet()` from `aptos-testnet` package)
2. Deploy Atomica Move modules via `deployContracts()`
3. Start Ethereum Geth testnet (reuses `setupEthereumTestnet()`)
4. Deploy `FakeETH`, `FakeUSD`, and `LockBox` contracts
5. Fund seller and bidder addresses with FakeETH from `.env.test`
6. Return typed fixture handles to the test

All components under test must have `data-testid` attributes. If a component
is missing one, add it — do not use text or CSS selectors in tests.

---

## Test Files

### `01-faucet.test.tsx`

Tests the `<Faucet>` component against a live testnet.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Request test tokens | Render `<Faucet>`, click "Request ETH Tokens" | Button cycles to "Tokens Received"; FakeETH + FakeUSD balances > 0 on Ethereum |
| Double request | Click button twice rapidly | Second click is a no-op while first is pending |
| RPC failure | Kill Ethereum testnet; click "Request ETH Tokens" | Error message displayed; button returns to default state |

---

### `02-wallet-connect.test.tsx`

Tests wallet connection via `<Step1Connect>` and `WalletContext`.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Connect Ethereum wallet | Render app, click "Connect MetaMask" | `window.ethereum.request` called with `eth_requestAccounts`; truncated address shown in header |
| Auto-reconnect on reload | Connect, remount component | `listAccounts` checked on mount; address restored without click |
| User rejects prompt | Mock `eth_requestAccounts` to reject | Error toast shown; button returns to "Connect MetaMask" |
| Aptos address derived silently | Connect Ethereum wallet | Derived Aptos address computed and used internally; no second wallet prompt shown to user |

---

### `03-approve-and-lock.test.tsx`

Tests `<Step2Lock>` — the two-transaction approve + lock sequence.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Happy path | Enter amount "10", min price "100", click "Approve & Lock" | First MetaMask call is `eth_sendRawTransaction` for `approve()`; second is `lock()`; advances to Step3 |
| Amount exceeds balance | Enter amount greater than FakeETH balance | "Approve & Lock" disabled or inline error before sending any tx |
| Zero amount | Enter "0" | Button disabled |
| Approval rejected | Mock first tx to reject | Error shown; neither `lock()` tx is sent |
| Lock rejected | Mock approve to succeed, lock to reject | Error shown; user stays on Step2 |

---

### `04-lock-confirmation.test.tsx`

Tests `<Step3Confirm>` — waiting for block finality.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Waiting state | Mount after lock tx sent, before confirmation | Spinner shown with "Waiting for block inclusion…"; tx hash displayed |
| Confirmed | Lock tx mines; testnet produces 12 blocks | Spinner replaced with checkmark; app advances to Step4 |
| Slow block time | Block time artificially slow | Component stays in waiting state; no timeout error shown |

---

### `05-proof-generation.test.tsx`

Tests `<Step4Proof>` — `eth_getProof` call and storage proof generation.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Happy path | App reaches Step4 after lock confirmed | "Generating proof…" spinner shown; storage proof computed; app advances to Step5 |
| Proof computed values | Observe generated proof | `storageValue` matches `lockedBalances` mapping for test address + token |
| Block not finalized yet | Request proof at block N, testnet at N-1 | Component waits/retries; does not advance until block available |

---

### `06-proof-submission.test.tsx`

Tests `<Step5Submit>` — `register_ethereum_lock` call on Aptos.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Happy path | App reaches Step5 with valid proof | Aptos tx submitted; `LockReceipt` created; app advances to Step7 |
| Duplicate proof | Submit same proof twice | Second submission shows error "already registered"; receipt count unchanged |
| Wrong token type | Mutate token address in proof before submit | Aptos Move abort shown in error; app stays on Step5 |

---

### `07-create-auction.test.tsx`

Tests `<Step7Auction>` — `create_auction` Move call.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Happy path | App reaches Step7 | "Creating auction…" spinner; tx confirmed; auction card shown with amount and min price |
| Receipt already claimed | Call create_auction twice for same receipt | Second attempt shows Move abort error |
| SIWE signature rejected | Mock signature prompt to reject | Error shown; no auction tx sent |

---

### `08-auction-monitor.test.tsx`

Tests `<Step8Monitor>` — the live auction countdown and status.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Active auction | Auction created with 5-min duration | Countdown displays HH:MM:SS; status badge shows "Active" |
| Timer decrements | Wait 3 seconds | Displayed time is 3s less |
| Auction expires | Create auction with 2s duration; wait | Countdown reaches 00:00:00; status badge switches to "Closed" |
| Settled state | Settle auction on-chain; refresh | Status badge shows "Settled"; clearing price displayed |

---

### `09-submit-bid.test.tsx`

Tests `<AuctionBidder>` — bidder submitting to an open auction.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Happy path | Enter seller address + bid amount above min_price; click "Submit Encrypted Bid" | "Encrypting Bid…" then "Please sign the transaction…" shown; tx hash displayed after confirm |
| Bid below min_price | Enter bid amount below min_price | Aptos Move abort returned; error message shown |
| Bid on closed auction | Wait for auction to expire; submit bid | Move abort for expired auction; error shown |
| Bid on nonexistent auction | Enter random seller address | Move abort shown; no tx sent to chain |
| IBE encryption failure | Mock IBE to throw | Error shown before tx is constructed |

---

### `10-settle.test.tsx`

Tests the settle action — anyone can trigger it after the auction closes.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Settle after close | Wait for 2s auction to expire; any user clicks settle | Tx confirmed; `is_settled` returns true; result page shown with winner + clearing price |
| Settle before close | Click settle while countdown > 0 | Move abort; error shown; auction state unchanged |
| Double settle | Call settle twice | Second call shows "already settled" error |
| No bids — settle | Create auction, place no bids, wait, settle | Tx succeeds; no winner; seller's lock receipt returned to available state |

---

### `11-claim-and-reclaim.test.tsx`

Tests post-settlement token flows.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Winner claims | Winning bidder address clicks "Claim" | Ethereum FakeETH balance increases by auctioned amount |
| Loser reclaims | Losing bidder clicks "Reclaim" | LockBox locked balance restored; available to withdraw |
| Non-winner tries to claim | Losing bidder clicks "Claim" | Move abort; no balance change |
| Winner tries to reclaim | Winning bidder clicks "Reclaim" | Move abort; no balance change |
| Double claim | Winner claims twice | Second claim shows "already claimed" error |

---

### `12-fee-rebate.test.tsx`

Tests fee and rebate calculation display.

| Scenario | Steps | Assert |
|----------|-------|--------|
| Accurate bidder rebate | Bidder whose price == clearing price | Rebate shown as positive amount in result card |
| Noisy bidder fee | Bidder whose price >> clearing price | Fee shown as negative amount; larger spread = larger fee |
| Uniform clearing price | Three bidders at 300, 200, 100; clearing at 100 | All three result cards show clearing price of 100 |

---

### `13-bid-history.test.tsx`

Tests the `<BidHistory>` component after auctions complete.

| Scenario | Steps | Assert |
|----------|-------|--------|
| History row added | Complete a full auction cycle | New row appears with auction ID, clearing price, settled timestamp |
| Expandable bids | Click row to expand | Individual bids listed with address, price, win/loss status |
| Multiple auctions | Run two auctions back-to-back | Both rows visible in history, newest first |

---

### `14-happy-path.test.tsx`

Full end-to-end walk of every demo step in sequence, two browser contexts
(seller and bidder). This is the smoke test engineers run before a live demo.

```
Seller context
  1. Navigate to app
  2. Click "Request ETH Tokens" → wait for FakeETH > 0
  3. Click "Connect MetaMask" → address shown
  4. Enter lock amount "10", min price "100"
  5. Click "Approve & Lock" → approve tx → lock tx → Step3
  6. Wait for 12-block finality → Step4
  7. Wait for proof generation → Step5
  8. Wait for proof submission to Aptos → Step7
  9. Wait for auction creation → Step8
  10. Read seller address from Step8 display

Bidder context (separate browser instance, funded via faucet in beforeAll)
  11. Navigate to app, connect wallet
  12. Paste seller address into AuctionBidder; enter bid "150"
  13. Click "Submit Encrypted Bid" → tx confirmed

Shared
  14. Wait for 2s auction duration to expire (use short AUCTION_DURATION in fixture)
  15. Any context: trigger settle
  16. Assert result page shows winner == bidder address, clearing price == 150
  17. Bidder clicks "Claim" → FakeETH balance increases
  18. Assert bid history row visible in both contexts
```

---

## Selector Contract

All tests target `data-testid` attributes. Component owners are responsible for
adding these. Core set required before tests can be written:

| Component | Required data-testid |
|-----------|----------------------|
| `Faucet` | `faucet-eth-button`, `faucet-status` |
| `Step1Connect` | `connect-metamask-button`, `connected-address` |
| `Step2Lock` | `lock-amount-input`, `min-price-input`, `approve-lock-button`, `lock-error` |
| `Step3Confirm` | `confirm-spinner`, `confirm-tx-hash` |
| `Step4Proof` | `proof-spinner`, `proof-ready` |
| `Step5Submit` | `submit-proof-button`, `submit-status` |
| `Step7Auction` | `auction-spinner`, `auction-tx-hash` |
| `Step8Monitor` | `auction-countdown`, `auction-status-badge`, `auction-seller-address` |
| `AuctionBidder` | `seller-address-input`, `bid-amount-input`, `submit-bid-button`, `bid-status` |
| `SettleButton` | `settle-button`, `settle-status` |
| `ClaimButton` | `claim-button`, `reclaim-button` |
| `FeeRebateDisplay` | `rebate-amount`, `fee-amount` |
| `BidHistory` | `bid-history-table`, `bid-history-row` |

---

## Running

```bash
# Start Docker (required)
docker compose -f source/docker-testnet/config/docker-compose.yaml up -d

# Run all browser integration tests
bun test:integration

# Run one file
bun vitest run tests/integration/14-happy-path.test.tsx
```

Tests are sequential. Expect ~8 minutes for the full suite.

---

## What Is Not Automated

- Real MetaMask extension UX (these tests use a programmatic window.ethereum mock)
- Public testnet faucet rate limits
- Timelock encryption with live beacon chain key material
