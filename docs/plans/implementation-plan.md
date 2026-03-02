# Atomica v0 Testnet — Implementation Plan

**Started:** 2026-02-02
**Last Updated:** 2026-03-02

Atomica is a sealed-bid auction protocol with IBE-based bid encryption, cross-chain deposits (Ethereum → Aptos), and on-chain settlement. This plan covers all v0 testnet deliverables.

---

## Completed Infrastructure

The dual testnet integration (Ethereum + Aptos) is largely complete. Summary of what's working:

- **EVM contracts** — FakeETH, FakeUSD, LockBox (36 Solidity unit tests passing). Deployment script (`DeployLockBox.s.sol`) deploys all three.
- **Ethereum integration layer** — `config.ts`, `transaction.ts`, `balances.ts`, `contracts.ts`, `abis.ts`. MetaMask connection, network switching, minting, balance queries all working.
- **Dual testnet orchestrator** — 331 lines (`scripts/dual-testnet-orchestrator.ts`). Parallel startup, health checks, Aptos contract deployment, webapp launcher, cleanup handlers. Ethereum contract deployment is proven in test fixtures (`dual-chain-fixture.ts`) but not yet wired into the orchestrator (still a TODO placeholder).
- **Cross-chain proof pipeline** — 6 E2E tests passing: mint → lock → proof generation → proof submission → replay protection → type isolation (`tests/meta/cross-chain/`). Storage key calculation for `eth_getProof` with single-level mappings.
- **SIWE auth + MetaMask** — secp256k1 → Aptos derived accounts, `ethers.BrowserProvider`.
- **Aptos payloads** — faucet (APT gas), auction create/bid. Note: `getMintFakeEthPayload()` and `getMintFakeUsdPayload()` exist but are vestigial — fake tokens should be minted on Ethereum and bridged, not minted directly on Aptos.
- **Validator node** — DKG on epoch transitions, IBE native (`reconstruct_ibe_dk_internal<G1>`), auto-subscribe to `TimelockExpiredEvent`, `finalize_timelock_reveal()`. Docker testnet runs 4 validators.
- **Framework modules** — `ibe_config.move`, `ibe.move`, `dkg.move`, `reconfiguration_with_dkg.move`.
- **Cross-chain verification modules** — `eth_proof.move`, `lock_receipt.move`, `mpt.move`, `rlp.move`, `fake_eth.move` (includes `mint_from_lock()`).

**Known gaps carried forward:**
- Orchestrator `deployEthereumContracts()` is a TODO placeholder (deployment logic exists in test fixtures, just needs wiring)
- Component tests not yet created
- `useDualChainBalances` hook not created (existing `useTokenBalances` is Aptos-only)
- NetworkStatus only shows Aptos chain
- Faucet uses Aptos-based minting for fake tokens instead of Ethereum minting
- Some integration tests have `it.todo()` blocks

---

## Phase 1: Finish Dual Testnet Polish (2-3 days)

Addresses leftover gaps from the completed infrastructure work.

- [ ] Wire `deployEthereumContracts()` in orchestrator — port the proven deployment logic from `tests/meta/cross-chain/helpers/dual-chain-fixture.ts` (compile via Foundry, deploy FakeETH + FakeUSD + LockBox via ethers `ContractFactory`)
- [ ] Create `useDualChainBalances` hook — query Ethereum balances (ETH, FakeETH, FakeUSD) alongside Aptos balances (APT)
- [ ] Update NetworkStatus to show both chains side-by-side (block heights, health indicators)
- [ ] Update Faucet to mint FakeETH/FakeUSD directly on Ethereum via MetaMask (replace Aptos-based `getMintFakeEthPayload()` / `getMintFakeUsdPayload()` calls with `mintFakeETH()` / `mintFakeUSD()` from `lib/ethereum/transaction.ts`). Keep the APT gas faucet button (that still goes through Aptos).
- [ ] Remove or deprecate vestigial Aptos-side fake token minting payloads

**Files:**
- `scripts/dual-testnet-orchestrator.ts` — wire `deployEthereumContracts()`
- `src/hooks/useDualChainBalances.ts` — new
- `src/components/NetworkStatus.tsx` — update
- `src/components/Faucet.tsx` — update to use Ethereum minting
- `src/lib/aptos/payloads.ts` — deprecate/remove `getMintFakeEthPayload`, `getMintFakeUsdPayload`

---

## Phase 1.5: Frontend State + Config Foundation (2-3 days)

Establish a proper React state model for shared app/runtime state instead of ad-hoc module globals.

- [ ] Add a centralized app state layer (React context + reducer/store) for wallet state, network config, chain health, polling status, and transaction status
- [ ] Define a typed app configuration model with persistence (localStorage/session storage) and hydration/versioning safeguards
- [ ] Migrate network endpoint resolution to read from shared runtime state first, with persistence as fallback
- [ ] Add a Settings/Configuration UI surface in the app header where persistent app config can be edited (network selector will live here)
- [ ] Refactor components/hooks to consume shared state selectors/actions instead of scattered local component state for cross-cutting concerns

**Files (planned):**
- `src/state/app-state.tsx` (or equivalent) — global state provider
- `src/state/app-config.ts` — config schema + persistence/hydration
- `src/components/AppSettings.tsx` — settings UI entry point
- `src/components/TestnetSelector.tsx` — move/integrate into settings UI
- `src/App.tsx` + affected hooks/components — wire provider + shared selectors

---

## Phase 2: Auction Move Contract (5-7 days)

Replace `auction.move.broken` with a working sealed-bid auction using Fungible Asset API and `ibe_config` integration.

- [ ] `auction.move` — sealed-bid auction with IBE timelock encryption
- [ ] Unit tests using `ibe_config::*_for_testing()` helpers

**Design:**

```
AuctionConfig (key, at @atomica):
  auctions: Table<u64, Auction>
  next_auction_id: u64

Auction (store):
  seller, asset_metadata (Object<Metadata>), asset_amount
  min_price, timelock_id (links to ibe_config), deadline_us
  bids: vector<EncryptedBid>
  state: OPEN(0) → REVEALED(1) → CLEARED(2) → SETTLED(3)
  clearing_price, merkle_root
```

**Core functions:**
- `create_auction(seller, asset_amount, min_price, duration_us)` — withdraw FakeETH via `primary_fungible_store`, call `ibe_config::register_timelock(deadline_us)`, store timelock_id
- `submit_bid(bidder, auction_id, u_bytes, ciphertext, collateral_amount)` — validate OPEN + before deadline, withdraw FakeUSD collateral, store encrypted bid
- `submit_cleartext_and_clear(caller, auction_id, bid_prices: vector<u64>)` — verify DK is revealed via `ibe_config::get_decryption_key(timelock_id)`, accept decrypted prices (off-chain decryption for v0), run uniform price clearing, compute merkle root
- `settle(caller, auction_id)` — transfer FakeUSD to seller at clearing price, transfer FakeETH to winners, refund losers
- View functions: `get_auction()`, `get_bids()`, `get_clearing_result()`

**Uniform price clearing:**
1. Sort bids by price descending
2. Accumulate quantity until supply exhausted
3. Clearing price = price of last accepted bid (lowest qualifying)
4. All winners pay clearing price
5. Partial fill for marginal bidder if needed

**IBE note:** `ibe::reconstruct_ibe_dk<G1>` returns a G1 point. For v0, decryption happens off-chain (client fetches DK, decrypts bids, submits cleartext). On-chain IBE decryption is a v1 enhancement.

**Files:**
- `source/atomica-move-contracts/sources/auction.move`
- `source/atomica-move-contracts/sources/auction_tests.move`

---

## Phase 3: Frontend IBE + Auction UI (4-5 days)

Fix encryption, build complete auction UI flow.

- [ ] Fix `lib/ibe.ts` XOR placeholder → real pairing-based encryption (compute `gid = e(r*MPK, H(identity))`, derive mask, XOR message)
- [ ] Create `lib/ibe-identity.ts` — compute identity matching `ibe_config::compute_identity` (SHA3-256 of BCS(timelock_id) || BCS(deadline_us))
- [ ] Update AuctionCreator to query validator MPK from `ibe_config::get_mpk()` (remove local `generateSystemParameters()`)
- [ ] Update AuctionBidder to encrypt with correct IBE identity
- [ ] New: AuctionRevealer component — monitor `is_revealed()`, fetch DK, decrypt bids off-chain, submit cleartext via `submit_cleartext_and_clear()`
- [ ] New: AuctionList component — display active/completed auctions
- [ ] Add auction payloads + view functions to `lib/aptos/payloads.ts`

**Files:**
- `src/lib/ibe.ts` — fix encryption
- `src/lib/ibe-identity.ts` — new
- `src/lib/aptos/payloads.ts` — add auction payloads
- `src/components/AuctionCreator.tsx` — update
- `src/components/AuctionBidder.tsx` — update
- `src/components/AuctionRevealer.tsx` — new
- `src/components/AuctionList.tsx` — new

---

## Phase 4: Cross-Chain Flows (5-7 days)

Wire up ETH deposits → Atomica minting → auction → settlement back to ETH.

**4a. Cross-Chain Deposit (3-4 days):**

- [ ] CrossChainDeposit component — full flow: mint FakeETH on Ethereum → approve + lock in LockBox → generate state proof → call `lock_receipt::register_ethereum_lock<FakeETH>()` on Aptos → call `fake_eth::mint_from_lock(lock_id)` on Aptos
- [ ] `fake_usd.move` — add `mint_from_lock()` matching `fake_eth.move` pattern
- [ ] Add `lock_receipt` + `mint_from_lock` payloads to `lib/aptos/payloads.ts`

**4b. Cross-Chain Settlement (3-4 days):**

- [ ] `BLSVerifierTestnet.sol` — trusted relayer for v0 (accepts results from configured relayer address; real BLS verification in v1 when Pectra/EIP-2537 available)
- [ ] Settlement bridge (`lib/settlement/bridge.ts`) — query Atomica clearing results, submit to Ethereum Settlement.sol
- [ ] SettlementStatus component — show clearing results + settlement progress
- [ ] WithdrawWinnings component — claim allocations on Ethereum

**Files:**
- `src/components/CrossChainDeposit.tsx` — new
- `source/atomica-move-contracts/sources/fake_usd.move` — add `mint_from_lock()`
- `source/evm-contracts/src/settlement/BLSVerifierTestnet.sol` — new
- `src/lib/settlement/bridge.ts` — new
- `src/components/SettlementStatus.tsx` — new
- `src/components/WithdrawWinnings.tsx` — new

---

## Phase 5: E2E Integration + Testing (3-5 days)

Wire everything together and run the complete demo.

- [ ] Update orchestrator to deploy auction module, configure settlement contracts, wait for DKG completion
- [ ] Wire all components into App.tsx: CrossChainDeposit → AuctionCreator → AuctionBidder → AuctionRevealer → SettlementStatus → WithdrawWinnings
- [ ] E2E test: deposit → bid → decrypt → clear → settle → withdraw
- [ ] Component tests for key components (deferred from earlier work)
- [ ] Manual smoke test of `bun run demo`

**Files:**
- `scripts/dual-testnet-orchestrator.ts` — update
- `src/App.tsx` — wire components
- `tests/meta/e2e-full-auction.test.ts` — new

---

## Technical Risks

1. **IBE scheme alignment** — `reconstruct_ibe_dk<G1>` returns G1. Standard Boneh-Franklin has DK in G2. v0 mitigates via off-chain decryption. The client-side `ibe.ts` must match the scheme the validators use.
2. **BLS precompiles** — EIP-2537 may not be available on local Geth. Testnet `BLSVerifierTestnet.sol` (trusted relayer) mitigates this.
3. **Fungible Asset API** — `auction.move.broken` uses old `Coin<T>`. Rewrite must use `primary_fungible_store::withdraw/deposit` pattern from `fake_eth.move`.

---

## Known Issues & Decisions

**Decisions made:**
- **ethers.js over viem** — selected ethers v6.16.0 for Ethereum interactions
- **Single-level mappings in LockBox** — `eth_getProof` doesn't work reliably with nested mappings (see `docs/development/ethereum-storage-proof-quirks.md`)
- **Test directory structure** — tests under `tests/meta/` to match project conventions
- **Fake tokens issued on Ethereum** — FakeETH/FakeUSD are ERC20s on Ethereum, bridged to Aptos via LockBox + state proofs. Not minted directly on Aptos.
- **Off-chain decryption for v0** — client fetches DK from validators, decrypts bids locally, submits cleartext. On-chain decryption is v1.

**Known issues:**
- Some TypeScript integration tests have `it.todo()` blocks
- `auction.move.broken` uses deprecated `Coin<T>` API — needs full rewrite

---

## Verification

End-to-end demo flow (the goal):

1. `bun run demo` starts dual testnet with DKG completed
2. User mints FakeETH on Ethereum via MetaMask
3. User locks FakeETH in LockBox → generates state proof → mints on Aptos
4. User creates sealed-bid auction on Aptos (with IBE timelock)
5. Bidders encrypt bids with MPK + identity, submit to auction
6. After deadline, validators auto-reveal DK shares
7. Any user decrypts bids off-chain, triggers clearing
8. Settlement submitted to Ethereum
9. Winners withdraw on Ethereum
