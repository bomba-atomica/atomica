# Chapter 9: Action List

Ordered by what unblocks or protects the most. Each item names the findings it closes. Nothing here was turned into an issue. Issue creation and plan changes belong to the plan owner.

---

## Do before the Aptos unwind (194) merges

These gate outcome emission. After that issue merges, a proven outcome moves real balances on Ethereum.

| # | Action | Where | Closes |
| --- | --- | --- | --- |
| 1 | Abort `create_auction` and `submit_bid` unless the receipt's window and pair match the window | `auction.move`, `lock_receipt.move` | E-1 |
| 2 | Store collateral on the bid. Treat a bid as invalid when price times quantity exceeds it | `auction.move` | A-1 |
| 3 | Reject zero quantity, quantity above supply, and zero price | `auction.move` | A-2, A-5 |
| 4 | Decide and document the price unit. Use one SDK parser and formatter | `auction.move`, SDK, components | C-2 |
| 5 | Cap seller locks per window. Set a minimum lock size for sellers and bidders | `auction.move` | A-6, A-10 |
| 6 | Add one live test: lock, auction, outcome, light client, release, with balance asserts | docker testnet tests | T-1 |

---

## Do as one contract change, before any deployment holds value

LockBox and the light client are immutable. Batch every change that needs a redeploy.

| # | Action | Where | Closes |
| --- | --- | --- | --- |
| 7 | Fix the window id formula to the 07:45 and 16:15 UTC closes, with a pinning test | `auction.move`, `eth_proof.move`, SDK | A-8 |
| 8 | Compute the lock deadline from the window id in `lock`. Drop the argument | `LockBox.sol`, `lock_receipt.move` | E-5 |
| 9 | Pay the leaf remainder to the depositor. Let an unpayable leaf reclaim | `LockBox.sol`, `OutcomeTree.sol`, mirrors | E-2 |
| 10 | Add `maxEpochAge` to the light client | `AptosLightClient.sol` | E-3 |
| 11 | Require an expected genesis waypoint in the deploy script | `DeployAptosLightClient.s.sol` | E-6 |
| 12 | Publish the outcome leaves where a reclaim can read them | `auction.move`, optionally `LockBox.sol` | E-7 |

---

## Do in the fork

| # | Action | Where | Closes |
| --- | --- | --- | --- |
| 13 | Reject a DKG result when no expected parameters hash is set. Set it in genesis | `timelock_dkg.rs`, genesis | F-2 |
| 14 | Let only the auction package register a timelock, one per window, at the window close | `ibe_config.move`, `auction.move` | A-7, F-1, F-7 |
| 15 | Add a decrypt native. Clear the window from the ciphertexts | `aptos-dkg`, `ibe` natives, `auction.move` | A-3, F-6 |
| 16 | Call the share verifier directly instead of through a global | `validator_txns/timelock.rs` | F-3 |
| 17 | Keep and emit the submitter list on expiry | `ibe_config.move` | F-5 |
| 18 | Align chain epochs with the auction closes, and emit an event for an epoch with no key | genesis config, `timelock_dkg.move` | F-4 |

Item 15 is the largest single simplification in this review. It removes about a third of `auction.move`.

---

## Do in the clients

| # | Action | Where | Closes |
| --- | --- | --- | --- |
| 19 | Lowercase inside `getDerivedAddress` | `siwe.ts` | C-4 |
| 20 | Add a FakeUSD register path. Derive the collateral lock id from the lock event | `payloads.ts`, `AuctionBidder.tsx` | C-3 |
| 21 | Check the host and the LockBox address against the chain before any lock | SDK, lock actions | C-5 |
| 22 | Build the bid identity and associated data locally and compare. Keep the salt | `sealed-bid.ts` | C-6 |
| 23 | Replace the faucet "claim" with the outcome carrier and release | components, SDK | C-1 |

---

## Delete

| # | Action | Closes |
| --- | --- | --- |
| 24 | The retired Solidity contracts, `Deploy.s.sol`, the EVM orchestrator and its two required jobs | E-10, T-5 |
| 25 | The relayer bridge and relayer script | C-7 |
| 26 | `state-proofs` beacon light client and its CLI commands | T-2 |
| 27 | `registry.move`, `timelock_config.move`, the rebate scaffolding, `claimed_locks`, unused error codes and arguments | A-11, A-13 |
| 28 | `docker-testnet/typescript-sdk`, `rust-sdk`, stale configs, `test-utils` mocks, placeholder tests, `atomica-zkp` | T-7, T-9 |
| 29 | Fork: the retired prototype, legacy vectors, unused native | Chapter 5 |

---

## Decide (owner)

| # | Decision | Context |
| --- | --- | --- |
| 30 | Does the PRD trust model name the package upgrade key, or does the key get a delay or go away? | E-4 |
| 31 | Does the PRD state the one-half secrecy bound, or do the thresholds change? | Chapter 5 |
| 32 | Is `LockBox.reclaim` enough for axiom 3, so that the Aptos unwind can shrink? | Chapter 2, S-3 |
| 33 | Keep a reserve price and enforce it, or remove the field? | A-4 |
| 34 | What is the rule for an undersubscribed window? | A-5 |
| 35 | What does an unopened bid cost, until the chain can decrypt? | A-3 |

---

## Update the documents

- PRD: status block, last-updated date, the broken plan-evolution link, the trust model sentence, the 67 percent claim, and which layers are later phases.
- Roadmap: the auction, collateral, window and mint rows.
- Architecture §2.5 to §2.8: the reveal as built, and the collateral rule as enforced.
- Auction timing: the window formula after item 7, and the shorter reclaim budget after item 14.
- Decision record: its first sentence against its trust assumptions section.
