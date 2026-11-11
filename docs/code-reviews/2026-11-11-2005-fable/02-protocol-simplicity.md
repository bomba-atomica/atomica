# Chapter 2: Is the Protocol as Simple as It Could Be?

**Short answer: no.** The fund path is close to minimal. The auction path carries a second reveal protocol, caller-chosen parameters, and several exits that do the same job. Six changes would remove whole mechanisms, and each also closes findings.

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

Add one native to the fork: decrypt a V2 bid with the on-chain key and return the plaintext. The fork already parses the ciphertext in a native (`ibe::verify_bid_ct`). Then:

- One permissionless call decrypts every bid and clears the window.
- A bid that fails to decrypt is invalid. The bidder made it invalid at submission, before seeing anything.

**Removed**

`commitment`, the salt, `compute_bid_commitment`, `open_bid`, `submit_cleartext_and_clear`, `finalize_reveal`, `OPENING_WINDOW_US`, `opened`, `revealed_prices`, `BidOpened`, `RevealFinalized`, `BidUnopened`, the client's decrypt-and-open path, and 10 minutes from every auction. About a third of `auction.move`.

**Cost**

One native with gas metering, and a fork change. AES-GCM over 40 bytes for 100 bids is small work.

---

## S-2: derive every time from the window id

**Today**

- The seller registers a timelock with any deadline and passes its id to `create_auction`.
- The depositor passes a deadline to `LockBox.lock`, and Aptos rejects any value but one.
- The reclaim delay is 72 hours, because the reveal may come up to 23 hours 50 minutes after the window closes (`docs/specifications/auction-timing.md`, budget table).

**Simpler**

The window id fixes the close time. So:

- `create_auction` registers the window's timelock itself, at the window's close. No `timelock_id` argument.
- `LockBox.lock` computes the deadline from `windowId`. No `deadline` argument, and no deadline in the auction key.
- `register_timelock` becomes callable only by the auction package.

**Removed**

Two caller arguments, `E_WRONG_DEADLINE`, `assert_timelock_open`'s caller-facing cases, the open timelock registry, and most of the 72 hours. With a fixed close, the budget is 10 minutes of reveal plus a carrier margin. A reclaim delay of a few hours would do, which is what the PRD promises (1 to 3 hours).

**Findings closed**

A-7, A-8 (if the formula is fixed at the same time), E-5, F-1 and F-7.

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

- **`cancel_unauctioned` is not needed.** A receipt that never joined an auction is in no tree. Its lock reclaims at the deadline. Cancelling the receipt changes Aptos bookkeeping and moves no funds.
- **`unwind` on a settled window is not needed** if `settle` gives every claimed lock a complete leaf (fills to counterparties, the rest to the depositor). Then nothing is "still held".
- **`unwind` on an unsettled window** only speeds up the return. With S-2 the reclaim delay is short, so the speed-up is small. One "all refund" outcome from `refund_expired_window` covers the expired case.

That leaves two Aptos exits (`settle`, and a refund that emits an all-refund outcome) and the Ethereum exits as they are.

**Owner decision needed**

Axiom 3 says "any user can send a transaction to a finished or stuck auction to unwind it". `LockBox.reclaim` is such a transaction. If the axiom is read to require an Aptos entry too, keep one `unwind` and still drop the other two. This is a scope cut to the unwind issue (194), so the owner should confirm it.

---

## S-4: one record of the outcome

**Planned (194)**

Each lock gets a stored outcome record, an event with the same fields, and a leaf in the tree. `settle` also still emits `AuctionSettled`, `SellerSupplySettled` and `BidUnopened` for a relayer that no longer exists.

**Simpler**

The tree leaf is the record. Emit the leaves once, in the outcome transaction. Delete the relayer events. A client rebuilds proofs from the leaves. This also gives E-7 its fix (publish the leaves).

---

## S-5: decide the collateral rule once, on chain

Today the rule lives in three places that disagree: the architecture text ("at least quantity times price"), the Move contract (no check), and the TypeScript bridge (throws). The price unit also differs between screens by one million (C-2).

One rule in `auction.move`, stated with its unit, replaces all three: a bid is valid only when `price × quantity ≤ collateral`. The payout math then needs no error path.

---

## S-6: delete what is retired

Each of these is dead, superseded or unused. Each was confirmed by a search for callers.

| Area | Delete | Why |
| --- | --- | --- |
| Move | `registry.move` | No function writes a user. |
| Move | `timelock_config.move` | The stored config is never read. The threshold is not the real one. |
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
| S-2 derived times | Caller deadlines, open registry, most of the reclaim delay | A-7, A-8, E-5, F-1, F-7 |
| S-3 one way home | Two or three planned Aptos entries | Scope of issue 194 |
| S-4 one outcome record | Three event types, per-lock records | E-7 |
| S-5 one collateral rule | Off-chain check, unit mismatch | A-1, C-2 |
| S-6 deletions | Retired stacks in five packages | E-10, C-7, T-2, T-5, T-9 |

The protocol after these changes: **lock for a window, bid sealed, the chain opens and clears at the close, one outcome goes to Ethereum, and anything unnamed goes home at a short deadline.**
