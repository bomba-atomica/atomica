# Chapter 2: Is the Protocol as Simple as It Could Be?

**Short answer: no.** The fund path is close to minimal. The auction path carries a second reveal protocol, caller-chosen parameters, and several exits that do the same job. Six changes would remove whole mechanisms, and four of them also close findings.

---

## The one idea worth protecting

**Funds exist only on Ethereum. Aptos only decides who is paid.**

LockBox moves a token on exactly two events: a proven outcome, or a passed deadline. Aptos holds receipts, which are accounting entries. No token is minted on Aptos (the mint path was retired in the LockBox merge). So the two chains can disagree without creating or destroying value. Every simplification below leans on this.

---

## S-1: let the chain decrypt bids, and delete the second reveal protocol

**Today**

A bid carries an IBE ciphertext and a separate hash commitment. After the validators release the key, somebody decrypts each bid off chain and submits `(price, salt)`. The contract checks it against the commitment. A 10 minute opening window follows. Bids not opened are invalid.

That is two protocols for one job. The timelock gives liveness only, and the commit-and-reveal step decides the price. It also brings back the selective-reveal problem the timelock was meant to remove (Chapter 3, A-3).

**Simpler**

Add one native to the fork: decrypt a V2 bid with the on-chain key and return the plaintext. The pieces exist. The fork already parses the ciphertext in a native (`ibe::verify_bid_ct`). The revealed key is in chain state (`ibe_config::get_decryption_key`). The Rust decrypt function is written (`decrypt_bid` in `crates/aptos-dkg/src/ibe/ciphertext.rs`). Then:

- One permissionless call decrypts every bid and clears the window.
- A bid that fails to decrypt is invalid. The bidder made it invalid at submission, before seeing anything.

**Removed**

`commitment`, the salt, `compute_bid_commitment`, `open_bid`, `submit_cleartext_and_clear`, `finalize_reveal`, `OPENING_WINDOW_US`, `opened`, `revealed_prices`, `BidOpened`, `RevealFinalized`, `BidUnopened`, the client's decrypt-and-open path, and 10 minutes from every auction. That is roughly 200 lines, about a sixth of the non-test code in `auction.move`.

**Cost**

One native with gas metering, and a fork change. Each decrypt is one pairing, one signature check and one small AES-GCM call. The pairing is the cost, not the cipher. Whether 100 pairings fit in one transaction was not measured. If they do not, the call must work in batches, and the window clears on the last batch.

**Limit**

This removes the option to withhold an opening. It does not hide the bid quantity, which `submit_bid` already takes in clear.

---

## S-2: derive every time from the window id

**Today**

- The seller registers a timelock with any deadline and passes its id to `create_auction`.
- The depositor passes a deadline to `LockBox.lock`, and Aptos rejects any value but one.
- The reclaim delay is 72 hours. About a third of it exists because the reveal may come up to 23 hours 50 minutes after the window closes (`docs/specifications/auction-timing.md`, budget table).

**Simpler**

The window id fixes the close time. So:

- `create_auction` registers the window's timelock itself, at the window's close. No `timelock_id` argument.
- `LockBox.lock` computes the deadline from `windowId`. No `deadline` argument, and no deadline in the auction key.
- `register_timelock` becomes callable only by the auction package.

**What this needs to work**

- **The epoch rule.** A timelock must end 15 minutes before its chain epoch ends, and it dies at the epoch change (Chapter 5, F-4). So the contract can register the timelock only inside the chain epoch that holds the window's close. A window created earlier needs a later, permissionless call to register it. Bids can start only after that call, because the bid's associated data names the timelock. Fix the epoch alignment (F-4) with this change.
- **The pair allowlist.** Any caller can open a window for any pair bytes (Chapter 3, A-12). Each such window would get its own timelock. Without the allowlist, the spam in F-1 costs one dust lock per timelock in place of gas alone. It is not closed.
- **A caller allowlist in the framework.** The framework cannot name the auction package. It needs a stored address or a capability that governance sets.
- **A frozen formula.** LockBox is immutable. A deadline computed there freezes the window formula and the reclaim delay for that deployment.

**Removed**

Two caller arguments, `E_WRONG_DEADLINE`, `assert_timelock_open`'s caller-facing cases, and the open timelock registry.

**The reclaim delay can shrink, but only by an owner decision**

The 72 hours hold four budgets (`docs/specifications/auction-timing.md`): up to 23 hours 50 minutes to the reveal, 10 minutes of opening, 24 hours of unwind grace and 24 hours of carrier margin. A fixed close cuts only the first, down to the 10 minute reveal window. The two 24 hour values are choices, and the unwind pull request (213) sets both.

A short delay also has a cost. The first reclaim before an outcome is recorded voids the outcome for the whole auction (`LockBox.sol:283-284`). Anyone holding a dust lock under the same auction key can make that reclaim at the deadline. So the delay must cover the worst case for the carrier: a slow Aptos node, missing epoch advances, and a congested or censored Ethereum. A delay of a few hours would match the PRD (1 to 3 hours). It would also let a short outage cancel a finished auction. This review did not find the safe lower bound.

**Findings closed**

A-7, A-8 (if the formula is fixed at the same time) and E-5. F-1 closes only together with the pair allowlist (A-12). F-7 loses its trigger, and its own one-line fix is still worth doing.

---

## S-3: one way home per chain

**Today and planned**

| Chain | Exit | State |
| --- | --- | --- |
| Aptos | `settle` | Live |
| Aptos | `refund_expired_window` | Live |
| Aptos | `unwind` on an unsettled window | Planned (194) |
| Aptos | `unwind` on a settled window that "still holds coins" | Planned (194) |
| Aptos | `cancel_unauctioned` | Planned (194) |
| Ethereum | `releaseByOutcome` | Live |
| Ethereum | `reclaim` with no outcome | Live |
| Ethereum | `reclaim` with a non-membership proof | Live |

**Simpler**

Because funds exist only on Ethereum, `reclaim` is already the universal unwind. A lock that no outcome names goes home at the deadline, whatever Aptos thinks. So:

- **`cancel_unauctioned` is not needed to move funds.** A receipt that never joined an auction is in no tree. Its lock reclaims at the deadline. Cancelling the receipt changes Aptos bookkeeping and moves no funds. The decision record names this cancel as part of its fourth mechanism (`trustless-v0-1-unwinding.md:27`), and the unwind pull request (213) already builds it. Dropping it is a change to an accepted decision.
- **`unwind` on a settled window is not needed** if `settle` gives every claimed lock a complete leaf (fills to counterparties, the rest to the depositor). Then nothing is "still held".
- **`unwind` on an unsettled window** only speeds up the return. With S-2 the reclaim delay is short, so the speed-up is small. One "all refund" outcome from `refund_expired_window` covers the expired case.

That leaves two Aptos exits (`settle`, and a refund that emits an all-refund outcome) and the Ethereum exits as they are.

**Owner decision needed**

Axiom 3 says "any user can send a transaction to a finished or stuck auction to unwind it". `LockBox.reclaim` is such a transaction, but only after the lock deadline. If the axiom is read to require an Aptos entry too, or an exit before that deadline, keep one `unwind` and still drop the other two. This is a scope cut to the unwind issue (194) and a change to the decision record, so the owner must decide it. The pull request (213) already implements the full scope, so the cut now means deleting written code.

---

## S-4: one record of the outcome

**Planned (194)**

Each lock gets a stored outcome record, an event with the same fields, and a leaf in the tree. `settle` also still emits `AuctionSettled`, `SellerSupplySettled` and `BidUnopened` for a relayer that no longer exists.

**Simpler**

Keep one copy. The stored per-lock record is the one to keep, because chain state is served by every node and old events are pruned. A reclaim with a non-membership proof needs the leaves long after the auction (Chapter 4, E-7). Drop the per-lock event, or keep it only as a convenience. Delete the relayer events. A client rebuilds proofs from the stored records.

An earlier draft of this section said to keep only the events. That would have made E-7 worse.

---

## S-5: decide the collateral rule once, on chain

Today the rule lives in three places that disagree: the architecture text ("at least quantity times price"), the Move contract (no check), and the TypeScript bridge (throws). The price unit also differs between screens by one million (C-2).

One rule in `auction.move`, stated with its unit, replaces all three: a bid is valid only when `price × quantity ≤ collateral`. The payout math then needs no error path.

---

## S-6: delete what is retired

Each of these is dead, superseded or unused. The search for callers covered product code. Three items have callers in setup code or in plans, and the deletion must take those along:

- The testnet setup calls `registry::initialize` (`docker-testnet/aptos-testnet/src/localnet.ts:228`, `dual-chain-testnet.ts:307`).
- The unwind issue (194) puts its grace and margin values in `timelock_config.move`, and its pull request (213) does so. Delete only the unused threshold and duration parts, or move the new values first.
- The `aptos-docker-testnet.yaml` workflow runs the tests of `docker-testnet/typescript-sdk`. Retire that workflow step with the package.

| Area | Delete | Why |
| --- | --- | --- |
| Move | `registry.move` | No function writes a user. |
| Move | `timelock_config.move` (the threshold and duration parts) | The stored config is never read. The threshold is not the real one. |
| Move | Rebate scaffolding, `clear_uniform_price`, `_mpk_bytes`, unused error codes | Returns zeros or does nothing. |
| Move | `claimed_locks` | The receipts table already answers it (A-11). |
| Solidity | `Settlement.sol`, `DepositBox.sol`, `BLSVerifier.sol`, `BLSVerifierTestnet.sol`, `archived/`, `Deploy.s.sol` | Retired by the decision record. |
| SDK | `settlement/bridge.ts` relayer path, `settlement-relayer.ts` | Calls functions LockBox no longer has (C-7). |
| SDK | Pre-V2 identity code, slot 0 and 1 key helpers, `address-converter.ts` | No caller. |
| Proofs | `state-proofs/typescript/src/beacon` | Unsound and replaced by certified headers (T-2). |
| Testnet | `docker-testnet/typescript-sdk`, `rust-sdk`, four stale config files | Duplicates or unused. |
| Tests | `source/test-utils` mocks, the EVM orchestrator, placeholder tests | Test the retired design or assert nothing. |
| ZK | `atomica-zkp` | A toy circuit wired to nothing. |
| Fork | `proto-fptx-timelock`, `legacy-v1` vectors, `reconstruct_ibe_dk` | Retired but still built in CI. |

This is several thousand lines. The benefit is not tidiness. A reviewer or an auditor reads the retired relayer bridge and the `BLSVerifierTestnet` stub as if they were the product.

---

## S-7: keep the PRD's unbuilt layers unbuilt

The PRD describes an N-layer onion with a seller key, a fee rebate curve, multi-pair clearing and ZK double verification. None of it is built. That is correct for now. Each would add a mechanism before the single-layer, single-pair auction is sound. Mark them clearly as later phases in the PRD, so that nobody builds toward them first.

---

## What is already as simple as it should be

- **The light client.** One contract, no owner, one trust root. The Yul SHA3 and the BLS library are the price of verifying Aptos on Ethereum, and no smaller design does it.
- **Lock registration.** The caller names a block and the lock fields. The chain derives the root, the slot and the owner.
- **The outcome tree.** One leaf per lock, sorted, with domain-separated hashes. Mirrored in three languages against shared fixtures.
- **Header attestation.** It reuses the fork's validator transaction path. No new actor.
- **The second DKG session.** Given that the timelock must be in-protocol, a second chunky session per epoch is close to minimal. The avoidable part is the public registry (S-2).

---

## Net effect

| Change | Mechanisms removed | Findings closed |
| --- | --- | --- |
| S-1 on-chain decrypt | Commit-and-reveal, opening window | A-3, F-6 |
| S-2 derived times | Caller deadlines, open registry | A-7, A-8, E-5. F-1 with the pair allowlist (A-12). |
| S-3 one way home | Two or three planned Aptos entries | Scope of issue 194 |
| S-4 one outcome record | Three relayer event types, the duplicate per-lock event | None. It must not remove the stored records E-7 relies on. |
| S-5 one collateral rule | Off-chain check, unit mismatch | A-1, C-2 |
| S-6 deletions | Retired stacks in five packages | E-10, C-7, T-2, T-5, T-9 |

The protocol after these changes: **lock for a window, bid sealed, the chain opens and clears at the close, one outcome goes to Ethereum, and anything unnamed goes home at the deadline.**
