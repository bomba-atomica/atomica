# Plan: Sell Flow Implementation

**Status:** Planning
**Last updated:** 2026-03-05

---

## Overview

Implement the seller flow end-to-end: lock assets on Ethereum, prove the lock to Atomica, join an auction. The work is split into three **phases** (Demo → MVP → Production) and two **domains** (Infrastructure and UX) developed by separate agents in separate worktrees.

### Phases

| Phase | Goal | State root trust | Auction model | Reserve price | Confirmation |
|-------|------|-----------------|---------------|---------------|--------------|
| **Demo** | Full UX flow clickable end-to-end; all Aptos contracts compile and deploy | User-submitted (no validation) | Rewritten `auction.move` using Fungible Assets; single-seller-per-auction OK | Plain `min_price` only | 1 block (testnet) |
| **MVP** | Real cross-chain sell works on testnet; adversarial state roots blocked | User-submitted proof, validated against validator-signed state root on Aptos | Batch auction supporting multiple sellers per window | Plain `min_price` only | 64 blocks (finality) |
| **Production** | Mainnet-ready | State proof oracle/service submits proofs; users do not generate proofs | Batch auction with timelock encryption | IBE-encrypted reserve price | Finalized (beacon chain) |

### Domains

| Domain | Owner | Worktree | Scope |
|--------|-------|----------|-------|
| **Infrastructure** | Infra agent | `worktree/infra-sell` | Move contracts, state root oracle, proof service, cross-chain verification |
| **UX** | UX agent | `worktree/ux-sell` | Webapp components, hooks, payloads, UI tests |

The two agents work in parallel. Infrastructure delivers contracts and APIs; UX consumes them. Integration points are defined below per phase.

---

## Security Assumptions

The sell flow's security depends on **who supplies the Ethereum state root** and **how it is validated on Atomica**:

| Phase | State root source | Trust model |
|-------|-------------------|-------------|
| Demo | User submits arbitrary state root | **Trust-everyone.** `eth_proof.move` verifies MPT proof against the supplied root but does not verify the root itself. A malicious user can fabricate a root and prove any balance. Acceptable for demo. |
| MVP | User submits state root + proof; Atomica validates root against a validator-signed Ethereum state root stored on-chain | **Trust-validators (2/3+ BLS threshold).** Same trust model as auction execution. |
| Production | State proof oracle observes Ethereum, generates proofs, submits them to Atomica on behalf of users | **Trust-validators + future ZK light client.** Users never touch raw proofs. |

This maps to `technical-risks.md` Risk #3 ("Confirm Ethereum Transaction Inclusion Cross-Chain").

---

## Phase 1: Demo

**Goal:** A user can click through the entire sell flow on a local Docker testnet. All contracts compile and deploy. The flow is not secure against adversarial input.

### Infrastructure — Demo

Develops in `atomica-move-contracts/` and `evm-contracts/`.

#### I-D1: Fix auction.move token standard

The broken `auction.move` uses legacy `aptos_framework::coin` (`Coin<FAKEETH>`) but `fake_eth.move` mints Fungible Assets via `aptos_framework::fungible_asset`. These are incompatible. Rewrite `auction.move` to use the FA standard.

**What to do:**
- Replace `coin::withdraw<FAKEETH>` / `Coin<FAKEETH>` with `primary_fungible_store::withdraw` / `FungibleAsset`
- Replace `coin::withdraw<FAKEUSD>` / `Coin<FAKEUSD>` similarly
- Remove the `use atomica::FAKEETH::FAKEETH` / `FAKEUSD::FAKEUSD` imports (these modules don't exist)
- Use `fake_eth::get_metadata()` / `fake_usd::get_metadata()` to identify the FA
- Settlement: `primary_fungible_store::deposit` instead of `coin::deposit`

**Keep for Demo (defer to later phases):**
- Single-seller resource model (`move_to(seller, Auction{...})`) — acceptable for demo
- `timelock_encryption` dependency — stub or remove `reveal_bids` for demo; use plaintext bids

#### I-D2: Remove timelock dependency for demo

`reveal_bids` calls `aptos_framework::timelock::get_secret(interval)` which doesn't exist on stock Aptos. For demo:
- Remove `reveal_bids` entirely, or replace with a simple plaintext reveal mechanism
- Remove `use atomica::timelock_encryption` dependency
- Store bid amounts in plaintext (sealed bid encryption deferred to Production)
- Keep the `mpk` field in `Auction` struct for forward compatibility but don't validate it

#### I-D3: Fix signer authorization in lock_receipt

**Blocking issue:** `register_ethereum_lock` checks `signer_addr == user || signer_addr == @atomica`, where `user` is the Ethereum address zero-padded to 32 bytes. But the SIWE-derived Aptos address is `SHA3-256(pubkey || auth_fn_id || domain)` — these never match. The existing e2e tests pass because they use the `@atomica` admin signer.

**Options (pick one):**
1. Change `address_from_bytes` to use the same SIWE derivation (requires passing the Ethereum public key, not just address)
2. Accept that registration always goes through the `@atomica` admin (fee payer submits on behalf of user)
3. Remove the authorization check entirely for demo (add back in MVP with correct derivation)

**Recommendation:** Option 2 for demo. The fee payer already sponsors gas; having it also be the signer for `register_ethereum_lock` is architecturally consistent. Document that MVP must implement proper user-signer authorization.

#### I-D4: Deploy and verify all contracts

- Deploy `LockBox.sol` + `FakeETH.sol` + `FakeUSD.sol` to local Geth
- Deploy `eth_proof.move` + `mpt.move` + `rlp.move` + `lock_receipt.move` + `fake_eth.move` + `fake_usd.move` + rewritten `auction.move` to local Aptos
- Extend e2e tests:
  - `e2e-07-mint-on-atomica.test.ts` — claim receipt → mint FakeETH on Atomica → verify balance
  - `e2e-08-create-auction.test.ts` — create auction with minted FakeETH → verify on-chain state
  - `e2e-09-bid-and-settle.test.ts` — submit plaintext bid → settle → verify transfers

#### I-D5: auction.move must consume LockReceipts, not FA

**Correction (original plan was wrong):** FakeETH and FakeUSD exist only as ERC20 tokens on Ethereum. There are no FakeETH/FakeUSD Fungible Assets on Aptos. The Aptos-side representation of a lock is a `LockReceipt<Ethereum, FakeETH>` stored in the `ReceiptRegistry`. The `fake_eth::mint` and `fake_eth::mint_from_lock` functions are explicitly deprecated (canonical token issuance is EVM-only).

**Correct Demo flow:**
1. Seller locks FakeETH on Ethereum → `register_ethereum_lock<FakeETH>()` → `LockReceipt<Ethereum, FakeETH>` in registry
2. `auction::create_auction(seller, lock_id, min_price, duration, mpk)` → calls `lock_receipt::claim<Ethereum, FakeETH>(seller, lock_id)` to consume the receipt and record the auctioned amount
3. Bidders submit bids with a price (Demo: no Aptos-side collateral; bidder collateral is enforced at Ethereum settlement)
4. `auction::settle(seller_addr)` → records winner + clearing price on-chain; emits `SettlementResult` event
5. Ethereum settlement contract reads the clearing result and transfers FakeETH to winner, FakeUSD to seller

**What NOT to do:**
- Do NOT call `fake_eth::mint_from_lock` in the auction flow (deprecated)
- Do NOT call `primary_fungible_store::withdraw` for FakeETH or FakeUSD in auction.move
- Do NOT try to hold FakeETH FA in escrow on Aptos (it doesn't exist there)

**Auction.move is a receipt-based module**: seller proves their Ethereum lock via `lock_receipt::claim`, auction records the clearing result, Ethereum side handles actual asset delivery.

### UX — Demo

Develops in `atomica-web/`.

#### U-D1: lockbox.ts — Ethereum lock helpers

**New file:** `src/lib/ethereum/lockbox.ts`

```typescript
approveFakeEth(provider, lockboxAddress, amount): Promise<TransactionReceipt>
lockFakeEth(provider, lockboxAddress, tokenAddress, amount): Promise<TransactionReceipt>
getLockedBalance(provider, lockboxAddress, userAddress, tokenAddress): Promise<bigint>
getUnlockTime(provider, lockboxAddress, userAddress, tokenAddress): Promise<number>
```

No tests needed — covered by existing `e2e-02-lock-fake-eth.test.ts`.

#### U-D2: payloads.ts — New payload functions

Add to `src/lib/aptos/payloads.ts`:

```typescript
// Serialize directly from LockedBalanceProof — do NOT use serializeProofForAptos
// (it is missing block_number, user_address, token_address, and returns wrong types)
getRegisterLockPayload(proof: LockedBalanceProof): InputGenerateTransactionPayloadData

getMintFakeEthPayload(lockId: Uint8Array): InputGenerateTransactionPayloadData
// Entry function: fake_eth::mint_from_lock(account, lock_id: vector<u8>)
```

**Unit test:** `tests/unit/register-lock-payload.test.ts` — verify parameter order and types match `register_ethereum_lock` signature.

#### U-D3: useSellFlow hook — State machine

**New file:** `src/hooks/useSellFlow.ts`

```typescript
type SellFlowStep =
  | 'connect'           // Step 1
  | 'lock'              // Step 2
  | 'confirming'        // Step 3
  | 'generating-proof'  // Step 4
  | 'submitting-proof'  // Step 5
  | 'minting'           // Step 6
  | 'creating-auction'  // Step 7
  | 'monitoring'        // Step 8

interface SellFlowState {
  step: SellFlowStep
  txHash?: string
  lockBlock?: number
  blockConfirmed: boolean
  proof?: LockedBalanceProof  // not persisted (large)
  lockId?: string
  auctionEndTime?: number
  minPrice?: bigint
  error?: string              // not persisted (transient)
}
```

**Persistence:** `localStorage` keyed by `sell-flow-${walletAddress}`. Persist: step, txHash, lockBlock, lockId, auctionEndTime, minPrice. On mount, resume from correct step.

**Actions:** `lockEth()`, `generateProof()`, `submitProof()`, `mintFakeEth()`, `createAuction()`, `reset()`

**Auto-progression:** Steps 5→6→7 chain automatically but each transition is a separate state. On partial failure, UI shows which sub-step failed with retry.

**Unit test:** `tests/unit/sell-flow-state.test.ts` — transitions, persistence, resume, error recovery.

#### U-D4: SellFlow components

**New files:**
- `src/components/SellFlow/SellFlow.tsx` — Root: step indicator + active step panel
- `src/components/SellFlow/StepIndicator.tsx` — Progress bar (8 steps, pending/active/done)
- `src/components/SellFlow/steps/Step1Connect.tsx` through `Step8Monitor.tsx`

**Step details:**

| Step | What it shows | User action |
|------|---------------|-------------|
| 1. Connect | Wallet status, FakeETH balance, faucet link | Connect MetaMask |
| 2. Lock | Amount input, min price input, duration selector | Approve + Lock (2 MetaMask prompts) |
| 3. Confirm | Spinner, block count | Wait (automatic) |
| 4. Proof | Spinner → proof summary (block, amount, depth) | Wait (automatic) |
| 5. Submit | Transaction status | Wait (automatic, SIWE-signed) |
| 6. Mint | Transaction status, minted amount | Wait (automatic) |
| 7. Auction | Auction window selector, summary | Wait (automatic) |
| 8. Monitor | Countdown, locked amount, min price, settled state | Read-only |

**Unlock/cancel:** Show "Cancel & Unlock" button at Steps 2-6 if `unlockTime` has passed. Calls `LockBox.withdraw()`. Resets flow.

#### U-D5: Wire into MainView

- Replace `<AuctionCreator />` with `<SellFlow />` in `src/views/MainView.tsx`
- Delete `AuctionCreator.tsx` after SellFlow is working

#### U-D6: UI component tests

- `tests/ui-component/SellFlow.test.tsx` — correct step at each state, indicator reflects progress
- `tests/ui-component/SellFlow.error.test.tsx` — insufficient balance, proof failure, tx rejection
- `tests/ui-component/SellFlow.resume.test.tsx` — reload mid-flow resumes from correct step

Mock `window.ethereum` and Ethereum RPC. Mock Aptos payloads.

### Demo Integration Contract

The UX agent consumes these from the Infra agent:

| What UX needs | What Infra delivers | Interface |
|---------------|---------------------|-----------|
| Working `register_ethereum_lock<FakeETH>` callable by fee payer | I-D3: signer auth fix | `@atomica` admin signs on behalf of user |
| Working `auction::create_auction` consuming a LockReceipt | I-D1/I-D5: rewritten auction.move | `create_auction(seller, lock_id, min_price, duration, mpk_bytes)` |
| Working `auction::submit_bid` | I-D1: auction.move | `submit_bid(bidder, seller_addr, bid_price)` |
| Working `auction::settle` emitting clearing result | I-D1: auction.move | `settle(caller, seller_addr)` |
| Deployed contracts on local testnet | I-D4 | Docker compose up → all contracts deployed |

**Note:** There is NO `mint_from_lock` step in the correct flow. FakeETH/FakeUSD do not exist as Fungible Assets on Aptos. The UX step 6 ("Mint") in U-D3 should be removed or replaced with "Claim Receipt" which is implicit in `create_auction`.

### Demo Definition of Done

- [ ] All Move contracts compile and deploy to local Aptos testnet
- [ ] `auction.move` uses Fungible Assets (not legacy Coin)
- [ ] e2e-07, e2e-08, e2e-09 tests pass
- [ ] Full UI flow clickable: connect → lock → confirm → prove → submit → mint → auction → monitor
- [ ] State persists across page reload
- [ ] Cancel/unlock path works when unlock time has passed
- [ ] `bun run test:unit`, `bun run test:ui`, `bun run test:meta` all pass
- [ ] `bun run build` — no TypeScript errors

---

## Phase 2: MVP

**Goal:** Sell flow works securely on testnet. User-submitted state roots are validated against a validator-signed Ethereum state root. 64-block finality. Batch auctions.

### Infrastructure — MVP

#### I-M1: Validator-signed Ethereum state roots

Implement the v0.1 beta approach from `technical-risks.md` Risk #3:

- Atomica validators observe Ethereum state via RPC
- Validators BLS-sign Ethereum block headers (state roots)
- 2/3+ threshold aggregated signature stored on-chain in a new `ethereum_state.move` module
- `eth_proof.move` updated: `verify_and_extract` additionally checks that `proof.state_root` matches the latest validator-signed root (or a root within acceptable block range)

**This is the critical security upgrade.** Without it, any user can fabricate proofs.

#### I-M2: State root validation in eth_proof.move

Update `verify_and_extract`:
```
1. Verify state_root exists in on-chain validator-signed roots (new)
2. Verify account proof against state_root (existing)
3. Verify storage proof against storage root (existing)
4. Return locked amount (existing)
```

Reject proofs whose state root is not validator-attested.

#### I-M3: Batch auction redesign

Replace single-seller `move_to(seller, Auction{...})` with a shared auction pool:

- `AuctionPool` resource at `@atomica` (not per-seller)
- Multiple sellers deposit into the same auction window
- Auction windows aligned to the two daily UTC times (07:45, 16:15)
- Seller can join the next available window
- Still plaintext bids (no timelock encryption yet)

#### I-M4: Proper signer authorization

Replace the Demo workaround (admin-only registration) with user-signer-compatible auth:
- Either derive the receipt `user` address using the same SIWE derivation
- Or use a signed attestation from the Ethereum key proving ownership

#### I-M5: 64-block confirmation requirement

Add a check to `register_ethereum_lock` that rejects proofs from blocks with fewer than 64 confirmations. This requires the validator-signed state root to include the latest finalized block number.

### UX — MVP

#### U-M1: Finality-aware confirmation (Step 3)

- Change confirmation target from 1 block to 64 blocks
- Show progress: "Waiting for finality… 12 of 64 confirmations"
- Estimated time display (~13 minutes on mainnet)
- Keep `ATOMICA_SKIP_PROOF_FINALITY=true` env flag for local dev

#### U-M2: Batch auction UX (Steps 7-8)

- Step 7: Show next auction window, other sellers in pool, user's share
- Step 8: Monitor pool status, countdown to settlement, show all participants
- Remove single-seller assumptions from state machine

#### U-M3: Error handling for state root rejection

If the validator-signed root check fails (e.g., proof too old, root not yet attested):
- Show "Waiting for Atomica to confirm Ethereum state… This may take a few minutes"
- Auto-retry with backoff
- Don't surface raw error codes

### MVP Definition of Done

- [ ] User-submitted proofs validated against validator-signed Ethereum state roots
- [ ] Fabricated state roots rejected on-chain
- [ ] 64-block finality enforced
- [ ] Batch auction with multiple sellers per window
- [ ] User can self-sign `register_ethereum_lock` (no admin workaround)
- [ ] All tests pass including new state-root-validation tests
- [ ] Works end-to-end on remote testnet (not just local Docker)

---

## Phase 3: Production

**Goal:** Mainnet-ready. Users never see raw proofs. Timelock encryption for sealed bids and encrypted reserve prices.

### Infrastructure — Production

#### I-P1: State proof oracle service

Background service that:
- Watches LockBox `TokensLocked` events on Ethereum
- Waits for finality (beacon chain finalized checkpoint)
- Generates storage proofs automatically
- Submits `register_ethereum_lock` to Atomica on behalf of users
- Users only need to lock on Ethereum; the rest happens automatically

#### I-P2: N-layer onion timelock encryption

From `technical-risks.md` Risk #2 (timelock implementation plan):
- Integrate zapatos BLS DKG for validator timelock keys
- Implement onion encryption in `auction.move` (replace plaintext bids)
- `EncryptedBid` stores IBE ciphertext; `reveal_bids` uses time-released secret
- Configurable layers: validators, drand, sellers

#### I-P3: Encrypted reserve price

- Add `encrypted_reserve: vector<u8>` field to `Auction` struct
- Seller encrypts reserve with same timelock mechanism as bids
- Decrypted at reveal time; bids below reserve are rejected
- `update_reserve_price` entry function (before `end_time` only)

#### I-P4: Receipt-direct-escrow (optional)

Evaluate replacing the mint-FA path with direct receipt escrow:
- `auction.move` accepts `LockReceipt` instead of minted FakeETH
- Eliminates `mint_from_lock` entirely
- Settlement transfers receipt ownership (or releases lock on Ethereum)
- This is the "canonical flow" described in the deprecated docstring

#### I-P5: ZK light client (future)

From `technical-risks.md`:
- Succinct SP1 ZK proofs of Ethereum block headers
- Dual-layer verification: BLS consensus AND ZK computation must agree
- Removes validator trust for cross-chain state observation

### UX — Production

#### U-P1: Simplified UX (no proof generation)

- Remove Steps 3-5 from user-facing flow (oracle handles them)
- New flow: Connect → Lock on Ethereum → Wait for Oracle Confirmation → Auction Created
- Show "Atomica is verifying your deposit…" while oracle processes

#### U-P2: Encrypted reserve price UI

- Step 7: "Set Reserve Price" input, encrypted client-side with IBE
- Step 8: "Update Reserve Price" (re-encrypt and submit before deadline)
- Show "Reserve price is sealed — revealed at auction end"

#### U-P3: Encrypted bid UI (buyer side, out of scope for this plan)

Noted for completeness. The buyer flow needs its own plan.

### Production Definition of Done

- [ ] Users lock on Ethereum and oracle handles proof submission automatically
- [ ] Timelock encryption working end-to-end (encrypted bids, encrypted reserve)
- [ ] ZK light client deployed or validator-BLS is production-hardened
- [ ] Security audit completed for all cross-chain verification paths
- [ ] Mainnet deployment checklist signed off

---

## Existing Code Reference

### Contracts (current state)

| File | Status | Notes |
|------|--------|-------|
| `evm-contracts/src/escrow/LockBox.sol` | Working | Single-level mappings, `eth_getProof` compatible |
| `atomica-move-contracts/sources/eth_proof.move` | Working | MPT verification correct but trusts user-supplied state root |
| `atomica-move-contracts/sources/lock_receipt.move` | Working | Phantom types, replay protection; signer auth issue (I-D3) |
| `atomica-move-contracts/sources/fake_eth.move` | Working | `mint_from_lock` marked deprecated but functional |
| `atomica-move-contracts/sources/fake_usd.move` | Working | Same pattern as fake_eth |
| `atomica-move-contracts/sources/auction.move.broken` | Broken | Wrong token standard, phantom deps, single-seller model |

### Webapp (current state)

| File | Status | Notes |
|------|--------|-------|
| `src/lib/ethereum/proofs/storage-key.ts` | Working | Matches LockBox storage layout |
| `src/lib/ethereum/proofs/generator.ts` | Working | `serializeProofForAptos` incomplete — missing fields |
| `src/lib/aptos/payloads.ts` | Partial | Has `getCreateAuctionPayload`, `getBidPayload`; needs `getRegisterLockPayload`, `getMintFakeEthPayload` |
| `src/components/AuctionCreator.tsx` | Placeholder | To be replaced by SellFlow |

### Existing Tests (do not duplicate)

| File | Covers |
|------|--------|
| `tests/meta/cross-chain/e2e-01-mint-tokens.test.ts` | Mint FakeETH/FakeUSD on Ethereum |
| `tests/meta/cross-chain/e2e-02-lock-fake-eth.test.ts` | Lock FakeETH in LockBox |
| `tests/meta/cross-chain/e2e-03-generate-proof.test.ts` | Generate storage proof |
| `tests/meta/cross-chain/e2e-04-submit-proof.test.ts` | Submit proof, verify LockReceipt |
| `tests/meta/cross-chain/e2e-05-replay-protection.test.ts` | Replay attack prevention |
| `tests/meta/cross-chain/e2e-06-type-isolation.test.ts` | Phantom type safety |

New tests extend this numbered series using `DualChainFixture` + `setupDualChainFixture()`.

---

## Testing Strategy

**Runtime:** `bun` (not npm). Vitest + Playwright.

| Category | Command | Environment |
|----------|---------|-------------|
| Unit tests | `bun run test:unit` | happy-dom |
| UI component tests | `bun run test:ui` | happy-dom |
| Meta/integration tests | `bun run test:meta` | `@vitest-environment node` |

**Rules:**
- All localnet tests: `describe.sequential()`
- After funding accounts: 1s indexing delay
- Always `aptos.waitForTransaction()` before assertions
- Env vars prefixed `ATOMICA_*`

### Tests by Phase and Domain

**Demo — Infrastructure:**
- `e2e-07-mint-on-atomica.test.ts` — claim receipt → mint FakeETH → verify balance
- `e2e-08-create-auction.test.ts` — create auction with FA → verify on-chain state
- `e2e-09-bid-and-settle.test.ts` — plaintext bid → settle → verify transfers

**Demo — UX:**
- `tests/unit/sell-flow-state.test.ts` — state machine transitions, persistence, resume
- `tests/unit/register-lock-payload.test.ts` — payload serialization
- `tests/ui-component/SellFlow.test.tsx` — step rendering
- `tests/ui-component/SellFlow.error.test.tsx` — error states
- `tests/ui-component/SellFlow.resume.test.tsx` — reload resume

**MVP — Infrastructure:**
- State root validation tests — reject fabricated roots, accept valid ones
- Batch auction tests — multiple sellers, settlement with multiple participants
- Finality tests — reject proofs with < 64 confirmations

**MVP — UX:**
- Finality progress UI tests
- Batch auction pool display tests
- State root rejection retry behavior tests

---

## Open Questions (Resolved)

| # | Question | Resolution |
|---|----------|------------|
| 1 | What is the exact entry function signature in `fake_eth.move` for minting from a receipt? | `mint_from_lock(account: &signer, lock_id: vector<u8>)` |
| 2 | Will auction.move be fixed before or after UI work? | Parallel: Infra agent fixes contracts in Demo phase while UX agent builds UI |
| 3 | Is auto-progression one button or three? | One visible flow, three transactions under the hood. Each sub-step shown on failure. |
| 4 | Reserve price: encrypted or plain? | Plain `min_price` for Demo/MVP. Encrypted reserve in Production phase. |

---

## Implementation Order

### Demo Phase (parallel agents)

**Infrastructure agent:**
1. I-D1: Rewrite `auction.move` to use Fungible Assets
2. I-D2: Remove timelock dependency (plaintext bids for demo)
3. I-D3: Fix signer authorization (admin-signs workaround)
4. I-D5: Update `mint_from_lock` docstring
5. I-D4: Deploy all contracts + e2e-07/08/09 tests

**UX agent:**
1. U-D1: `lockbox.ts`
2. U-D2: `payloads.ts` updates + unit test
3. U-D3: `useSellFlow` hook + unit test
4. U-D4: SellFlow components (Steps 1-8)
5. U-D5: Wire into MainView
6. U-D6: UI component tests

**Integration:** After both agents complete, run full e2e on local Docker testnet.

### MVP Phase (parallel agents)

**Infrastructure agent:** I-M1 → I-M2 → I-M3 → I-M4 → I-M5

**UX agent:** U-M1 → U-M2 → U-M3

### Production Phase (parallel agents)

**Infrastructure agent:** I-P1 → I-P2 → I-P3 → I-P4

**UX agent:** U-P1 → U-P2
