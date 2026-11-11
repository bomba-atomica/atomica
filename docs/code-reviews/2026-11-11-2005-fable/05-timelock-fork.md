# Chapter 5: Timelock in the Aptos Fork

**Scope:** `bomba-atomica/atomica-aptos`, branch `dev-atomica` at commit `52beee31a6`. Only the Atomica delta against `aptos-node-v1.49.6` was reviewed: about 120 files and 18 700 added lines outside docs, CI and generated files.
**Method:** A delegated reviewer read the code. I then re-read the lines behind F-1, F-2 and the threshold claim myself. Nothing was built or run. All paths in this chapter are relative to the fork repo unless they start with `source/`.

**Premise correction.** The project instructions describe a "dual-output DKG". That design was retired (fork commit `3fc4f34a07`). The shipped design is a second upstream chunky DKG session per epoch, plus Boneh-Franklin identity-based encryption on BLS12-381.

---

## The trust assumption, as coded

- **Secrecy needs more than one half of stake to stay honest.** `DEFAULT_SECRECY_THRESHOLD` is 1/2 (`types/src/dkg/real_dkg/rounding/mod.rs:360-361`).
- **A reveal needs more than two thirds of stake.** `DEFAULT_RECONSTRUCT_THRESHOLD` is 2/3 (`rounding/mod.rs:363-364`), used at `types/src/dkg/chunky_dkg.rs:352-364`.
- **The PRD says something stronger.** "Decryption requires cooperation from ... the Validator Set (>67%)" (`docs/specifications/prd.md:122`). A coalition above one half of stake can read every bid early. Nobody can detect it, and nothing punishes it.
- **The thresholds are shared with another feature.** The timelock session reads the mempool session's on-chain config (`aptos-move/framework/aptos-framework/sources/reconfiguration_with_dkg.move:96-101`). A governance change to the mempool thresholds silently changes the timelock's.
- **The product contract advertises a number nothing reads.** `source/atomica-move-contracts/sources/timelock_config.move:43-46` says 67 of 100.

The PRD and the decision record state the trust model as "the 2/3 validator threshold". For bid secrecy the real number is one half. One of the two should change.

---

## Summary

| ID | Severity | Finding |
| --- | --- | --- |
| F-1 | High | Cheap timelock registrations can starve an auction's reveal |
| F-2 | High | One validator can disable reveals for a whole epoch |
| F-3 | Medium | Share verification depends on a process-global hook |
| F-4 | Medium | A timelock cannot outlive an epoch, and an epoch can start with no key |
| F-5 | Medium | Withholding reveal shares has no consequence, and the evidence is erased |
| F-6 | Medium | The chain never decrypts a bid |
| F-7 | Medium | Status can read `Pending` after the reveal window closed |
| F-8 | Low | Validator work and state grow without bound |
| F-9 | Low | The range-proof key comes from a single-party setup |
| F-10 | Low | A proposer can frame a validator with rejection events |

---

## F-1 High: cheap timelock registrations can starve an auction's reveal

**Evidence**

- `register_timelock` is a public entry with no fee, cap or permission (`aptos-move/framework/aptos-framework/sources/ibe_config.move:445`). I confirmed this.
- The per-block validator transaction limit is 2 (`types/src/on_chain_config/consensus_config.rs:124`). I confirmed this.
- The validator transaction pool pulls in first-in order (`crates/validator-transaction-pool/src/lib.rs:152-199`).
- Each validator queues one share transaction per due timelock, in id order (`dkg/src/timelock_share_service.rs:173-237`).
- The reveal window is 10 minutes (`ibe_config.move:101`).

**Failure scenario**

Mallory registers a few thousand timelocks with deadlines just before the victim auction's. Every validator queues the spam shares first. Two land per block. The victim's shares miss the 10 minute window. The timelock becomes `Expired`, and the auction unwinds. The cost is registration gas. The exact count depends on block time, which was not measured.

**Smallest fix**

Stop serving arbitrary registrations. Make `register_timelock` callable only by the auction package, one per window (this also fixes A-7 in Chapter 3). Order pooled shares by `reveal_expiry_us`.

---

## F-2 High: one validator can disable reveals for a whole epoch

**Evidence**

- The parameters hash check runs only when an expected hash is set: `if let Some(expected) = expected_params_hash && expected != ...` (`types/src/dkg/timelock_dkg.rs:768-772`). I confirmed this.
- `set_expected_public_parameters_hash` has no caller outside tests (`aptos-move/framework/aptos-framework/sources/timelock_dkg.move:94`). I confirmed this with a repo-wide search.
- The hash is supplied by the proposer and is not in the signed message (`dkg/src/chunky/dkg_manager/mod.rs:695`, `timelock_dkg.rs:77-84`).
- Honest nodes refuse to serve shares on a mismatch (`timelock_dkg.rs:872-876`).

**Failure scenario**

A malicious validator lands its own DKG result first, with a valid certificate and a garbage parameters hash. The key reads as ready, so auctions open. Every honest node refuses to serve. No share is ever submitted. Every auction in that epoch expires. The attacker can repeat it each epoch it wins the race.

**Smallest fix**

Reject a result when no expected hash is set, except on the test chain. Set the hash in genesis next to `timelock_dkg_enabled`.

---

## F-3 Medium: share verification depends on a process-global hook

`aptos-move/aptos-vm/src/validator_txns/timelock.rs:141` holds the verifier in a static. Only `aptos-node/src/lib.rs:701` installs it. With none installed the transaction is discarded (`timelock.rs:368-370`). Any other executor of the same blocks (a debugger, a replay-verify job, a restore with replay) discards every share the chain kept. Its state root then diverges from the first reveal onward.

**Smallest fix:** call `ibe::verify_player_shares` directly. The verifier holds no state.

---

## F-4 Medium: a timelock cannot outlive an epoch, and an epoch can start with no key

- A deadline must be 15 minutes before the epoch end (`ibe_config.move:99`, `:456`).
- A pending timelock from an earlier epoch reads as expired (`ibe_config.move:728-734`).
- The timelock DKG starts only from `try_start_with_chunky_dkg`, not from `try_start` (`reconfiguration_with_dkg.move:43-101`).
- The DKG grace period is 120 seconds (`timelock_dkg.move:42`).

**Consequences**

- An auction close that falls in the last 15 minutes of a chain epoch is impossible. Chain epochs are not aligned to 07:45 or 16:15 UTC.
- A reconfiguration through the other path, a forced epoch end, or a slow DKG gives the next epoch no key. No auction can run in that epoch.
- More than one third of stake can cause the same by withholding DKG messages.
- An early governance reconfiguration expires every open timelock.

**Smallest fix:** align chain epochs so that neither daily close falls inside the guard. Emit an event when an epoch starts without a key, and show it in the UI.

---

## F-5 Medium: withholding reveal shares has no consequence

`expire()` clears the list of validators that did submit (`ibe_config.move:674-681`). No stake or performance hook exists. Validators above one third of stake can skip shares for one chosen auction. It expires and unwinds. Nothing on chain records who abstained. With the one-half secrecy bound, a coalition can look first and then abort.

**Smallest fix:** keep the submitter list on expiry and emit it in the expiry event.

---

## F-6 Medium: the chain never decrypts a bid

`ibe::verify_bid_ct` checks the ephemeral point and a one-time signature only (`crates/aptos-dkg/src/ibe/ciphertext.rs:144-150`). The auction checks openings against a separate commitment. A bidder can therefore encrypt junk and decide after the reveal whether to open. This is the same defect as A-3 in Chapter 3, seen from the fork. The fix is a decrypt native.

---

## F-7 Medium: status can read `Pending` after the reveal window closed

Expiry is written by a queue that handles 50 entries per block (`ibe_config.move:103`). `effective_status` overrides the stored status only for an epoch change (`:728-734`). Spam registrations (F-1) sit ahead in the queue. During the backlog the auction's `refund_expired_window` aborts with `E_TIMELOCK_NOT_EXPIRED`.

**Smallest fix:** have `effective_status` return expired when the status is pending and the reveal expiry has passed.

---

## F-8 to F-10 Low

- **F-8.** The share service starts its scan at timelock 0 each epoch and re-reads every open timelock every 500 ms (`dkg/src/timelock_share_service.rs:107`, `:169-177`). The revealed branch never clears stored shares (`ibe_config.move:657-662`). Cost grows with every timelock ever registered.
- **F-9.** The range-proof parameters came from one party (`atomica/timelock-params/README.md`). A holder of the trapdoor with one validator key can deal undecryptable chunks. That stops reveals for an epoch. It does not leak bids.
- **F-10.** A share transaction carries no signature, and a failed check emits an event naming the author (`aptos-move/aptos-vm/src/validator_txns/timelock.rs:448-464`). A proposer can forge rejections against a rival. The event is only a claim.

---

## Not confirmed

- Whether the master public key check covers the whole polynomial. It interpolates three subsets (`crates/aptos-dkg/src/ibe/mod.rs:434-467`), and a code comment leaves the question "for the cryptographer".
- What happens when stake rounding yields more than 72 shares. The parameters are sized for up to 20 validators (`types/src/dkg/timelock_dkg.rs:408-410`).
- The crypto review packet records "no external sign-off" (fork commit `c99b8acb70`).

---

## Is the path complete?

- **Built:** the DKG, the on-chain master public key, client encryption, share transactions and on-chain key aggregation.
- **Not built:** on-chain decryption (F-6).
- **Off by default:** `timelock_dkg_enabled` is false in genesis (`aptos-move/vm-genesis/src/lib.rs:1559`, `:1615`). The docker testnet turns it on.
- **CI runs:** crate unit tests, VM handler tests, and four-validator swarms with one honest reveal.
- **CI does not run:** a corrupted share on a live swarm, any auction contract against a live reveal, any spam case, or a reveal across an epoch change. The smoke binary is built with test features, so the release binary is not exercised on this path.

---

## Upgrade cost

The delta is mostly additive. The files that will conflict with upstream are `dkg/src/chunky/dkg_manager/mod.rs`, `dkg/src/epoch_manager.rs`, `types/src/dkg/chunky_dkg.rs`, `types/src/validator_txn.rs` and `reconfiguration_with_dkg.move`. The validator transaction tags 3 to 5 are now on chain, and upstream has already taken a tag the fork once used. Header attestation and the outcome-proof endpoints add more fork surface, as the decision record notes.

Retired code still ships: `atomica/proto-fptx-timelock` (and it still runs in CI), `golden_vectors/legacy-v1`, the `reconstruct_ibe_dk` native, `IBEPublicParams`, and the dual-output decision record.

---

## What is solid

- Every share passes a pairing check against chain-stored keys before it is stored (`crates/aptos-dkg/src/ibe/mod.rs:267-290`). The aggregate key is checked again in Move (`ibe_config.move:620`). One bad share cannot poison the key.
- The identity binds chain id, epoch, timelock id and deadline (`ibe_config.move:839-846`), and each epoch has a fresh master secret. A key for one auction opens no other.
- The bid wrapper binds a one-time key and the associated data into the key derivation, the cipher and the signature (`ciphertext.rs:153-181`). A copied or altered rival ciphertext fails.
- Points are validated on decode: subgroup checked, identity rejected.
- A stuck timelock DKG cannot block the epoch change.
- Status is one-way, and every failure ends in `Expired`, which the auction can refund without permission.
- Ethereum headers are written only by a validator transaction, never by an entry function, and a stored header never changes (`aptos-move/framework/aptos-framework/sources/ethereum_headers.move`). The observer defaults to the `finalized` tag (`config/src/config/eth_header_observer_config.rs:29`).
