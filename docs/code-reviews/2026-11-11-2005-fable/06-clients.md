# Chapter 6: SDK, Web Components and Demo

**Scope:** `source/atomica-sdk/src`, `source/atomica-web-components/src`, `source/atomica-demo`, `source/shared`, `source/test-utils`.
**Method:** A delegated reviewer read the code at commit `cbd03f4`. The LockBox change (212) then merged and touched some of these files. I re-read the lines behind C-1 to C-5 at `main` commit `4ca0acd` and dropped the findings that the merge fixed. Line numbers are at `4ca0acd` where I re-checked them, and at `cbd03f4` otherwise (marked "before the merge"). A second pass re-read C-1 to C-5 at `4ca0acd`, updated the line numbers it could, and lowered C-4 and C-5 to Medium. Nothing was built or run.

---

## Summary

| ID | Severity | Finding |
| --- | --- | --- |
| C-1 | High | The client cannot complete a trade end to end |
| C-2 | High | The price unit differs by one million between screens |
| C-3 | High | The bidder screen locks FakeUSD that can never become a receipt |
| C-4 | Medium | Every bid from the bidder screen is sealed to the wrong address |
| C-5 | Medium | The client never checks its host against the pinned sign-in domain |
| C-6 | Medium | Bid encryption trusts the RPC for the key and the identity |
| C-7 | Medium | The relayer bridge targets a contract that no longer exists |
| C-8 | Medium | The settlement status panel goes blind on a long chain |
| C-9 | Low | Smaller defects |

---

## C-1 High: the client cannot complete a trade end to end

**Evidence**

- No client code calls `recordOutcome` or `releaseByOutcome`. The only mentions are comments and one ABI line (`source/atomica-sdk/src/ethereum/abis.ts:35`). I confirmed this with a search.
- `source/atomica-demo/src/App.tsx:57-58` mounts only `AuctionCreator` and `AuctionBidder`. `SellFlow` and `AuctionRevealer` are not exported from the component package index.
- `ClaimButton` "claims" by calling the public faucet `fake_eth::mint` (`source/atomica-sdk/src/aptos/payloads.ts`, `getClaimMintPayload`). It moves nothing from the seller.
- `openBid`, `finalizeReveal` and `refundExpiredWindow` payload builders have no caller in any component (`payloads.ts:760-828`).
- `AuctionCreator` defaults the lock id to 32 zero bytes, so the user must paste a real one (`AuctionCreator.tsx:58`). It also registers its own timelock one hour out (`:47-52`), which is the caller-chosen close of A-7.
- The demo has no dev-server proxy for the `/aptos-api` and `/eth-api` paths the SDK calls in a browser (before the merge: `source/atomica-sdk/src/network-host.ts:69`, `:97`).

**Consequence**

A user can lock, register, create an auction and (with hand edits) bid. Nothing in the client reveals, settles to Ethereum or pays a counterparty. The SDK issue (195) covers the carrier and the unwind buttons. It does not list the dead reveal path or the faucet claim.

---

## C-2 High: the price unit differs by one million between screens

**Evidence** (all confirmed at `4ca0acd`)

- The settlement math uses whole dollars: "USD per base token, no decimal shift" (`source/atomica-sdk/src/settlement/bridge.ts:478-487`).
- The sell flow sends micro-dollars: `parseUnits(minPrice || "0", 6)` (`source/atomica-web-components/src/components/SellFlow/steps/Step2Lock.tsx:17`).
- The bidder sends whole dollars: `BigInt(bidAmount)` (`components/AuctionBidder.tsx:133`).
- The settle display divides by one million (`components/SettleButton.tsx:148`).
- The happy-path test bids `2_000_000n` with 500 dollars of collateral (`tests/integration/14-happy-path.test.tsx:172`, `:178`).
- The unwind pull request (213) ports the whole-dollar meaning into Move as `quote_for_fill`. I read that part only.

**Failure scenario**

A bid of "2000000" from the test is two million dollars per token under the settlement math. No collateral covers it. Because the chain never checks collateral (A-1), the bid still wins. The Move contract has no unit at all: `price` is a bare `u64`.

**Smallest fix**

Define the unit once in the Move module's documentation and in one SDK pair of functions (`parsePrice`, `formatPrice`). Use them in every input, in the display and in the payout math.

---

## C-3 High: the bidder screen locks FakeUSD that can never become a receipt

**Evidence** (confirmed at `4ca0acd`)

- After the lock, the screen fills the collateral lock id with the transaction hash: `const placeholder = lockReceipt.hash ?? lockReceipt.blockHash ?? ""` (`components/AuctionBidder.tsx:108`).
- The register payload hardcodes the FakeETH receipt type (`source/atomica-sdk/src/aptos/payloads.ts:264`). The client has no FakeUSD registration path.

**Failure scenario**

A bidder clicks "Approve & Lock FakeUSD". Real tokens enter LockBox. The bid aborts, because a transaction hash is not a receipt id and no receipt exists. The tokens wait for the reclaim deadline.

**Smallest fix**

Add an asset parameter to `getRegisterLockPayload`. Reuse the seller's proof steps in the bidder. Derive the id with `getLockId` from the lock event.

---

## C-4 Medium: every bid from the bidder screen is sealed to the wrong address

**Evidence** (confirmed at `4ca0acd`)

- The bidder derives its Aptos address from the checksummed wallet address: `getDerivedAddress(account)` (`components/AuctionBidder.tsx:158`), where `account` comes from `signer.getAddress()` (`context/WalletContext.tsx:49`) or from `listAccounts()` (`:68-73`). ethers returns a mixed-case checksum address on both paths.
- Every other component lowercases first (`ClaimButton.tsx:93`, `useAptosBalances.ts:53`, `useTokenBalances.ts:59`). The bidder is the one caller that does not.
- The seal step asks the chain for the associated data of that wrong address (`source/atomica-sdk/src/aptos/sealed-bid.ts:93`).
- `getDerivedAddress` hashes the text of the address as given (`source/atomica-sdk/src/siwe.ts:56-70`).
- The transaction sender is derived from the lowercase address (`source/atomica-sdk/src/transaction.ts:166-168`).

**Failure scenario**

The associated data names a different Aptos address from the sender. `submit_bid` rebuilds it from the real sender (`auction.move:614`), so the one-time signature fails and the bid aborts with `E_INVALID_CIPHERTEXT`. The unit test hides this by mocking `getDerivedAddress`, and the integration helper lowercases first.

**Severity**

Lowered from High. The bid fails closed and nothing is lost by this defect alone. The screen is already unable to bid because of C-3. The fix is one line.

**Smallest fix**

Lowercase inside `getDerivedAddress`.

---

## C-5 Medium: the client never checks its host against the pinned sign-in domain

**Evidence**

- Sign-in uses `window.location.host` (`source/atomica-sdk/src/siwe.ts`, `transaction.ts`).
- The receipt owner is derived from the domain pinned on chain (`source/atomica-move-contracts/sources/eth_proof.move:148-161`).
- No client file reads `eth_proof::siwe_domain` or the pinned LockBox address.

**Failure scenario**

A user opens the app on another host or port, locks, and registers. The receipt belongs to an account that only the pinned host can sign for. The lock waits for reclaim. A stale LockBox address in the environment has the same effect.

The SDK issue (195) adds the domain check. Add the LockBox address check to it.

**Severity**

Lowered from High. It needs the app served from a host other than the pinned one, or a wrong address in the environment. The funds come back at the reclaim deadline.

---

## C-6 Medium: bid encryption trusts the RPC for the key and the identity

`source/atomica-sdk/src/aptos/sealed-bid.ts:164-169` (before the merge) reads the master public key, the identity and the associated data from unauthenticated view calls. The chain checks only the ciphertext shape. A malicious full node can return its own key. The bid is accepted on chain, the node reads the price at once, and nobody else can ever open it. The bidder cannot open it either, because the screen discards the salt.

**Smallest fix:** build the identity and the associated data locally with the existing `computeTimelockIdentityV2` and `buildBidAd`, and compare. Read the key from two endpoints. Persist the salt.

---

## C-7 Medium: the relayer bridge targets a contract that no longer exists

`source/atomica-sdk/src/settlement/bridge.ts:678-679` still declares `refund` and `settleFill`, and line 92 still takes a relayer private key that "must be the LockBox settlementAuthority". The merged LockBox has neither function. `source/atomica-demo/scripts/settlement-relayer.ts` still ships. The bridge is now dead code that reads like the live settlement path. The SDK issue (195) retires it.

---

## C-8 Medium: the settlement status panel goes blind on a long chain

`components/SettlementStatus.tsx:81` (before the merge) scans events from version 0, capped at 50 pages of 100, every 10 seconds. On a chain past about 5 000 versions it reports "No settled events" forever. Read `auction::is_settled` instead.

---

## C-9 Low: smaller defects

- The bid price is written to `localStorage` in clear before the reveal (`components/AuctionBidder.tsx:174`).
- `useSellFlow.ts:125` deletes the stored lock fields on reset. The user loses the data that a later `reclaim` needs.
- `useSellFlow.ts:289`, `:417` and `:425` take the window id and a one-hour auction end from the local clock.
- Lock and approve never assert the Ethereum chain id.
- The sign-in prompt shows only the entry function name. The arguments are an opaque digest.
- Hex inputs are not validated. Bad input becomes zero bytes.
- The contract address defaults to `0x1` in one config file and to the zero address in another.
- Demo scripts import files that do not exist (`source/atomica-demo/scripts/dual-testnet-orchestrator.ts`, `deploy-lockbox-real.ts`).

---

## Duplication

- Two Aptos client singletons: `source/atomica-sdk/src/aptos/config.ts` and `source/docker-testnet/aptos-testnet/src/config.ts`. Shipped components import the test package's copy (`TxButton.tsx:6`, `Faucet.tsx:2`, `useTokenBalances.ts:6`).
- `network-host.ts` and `chain-config.ts` exist in both the SDK and the docker testnet package.
- Four sources of configuration: `VITE_*` variables, two `localStorage` keys, and a private block in `SettlementStatus.tsx`.
- At least four copies of `hexToBytes`. Two declarations of `BidResult`.
- Dead modules: the pre-V2 identity code, the slot 0 and slot 1 storage key helpers, the `Settlement` and `BLSVerifierTestnet` bindings, `address-converter.ts`, and every `Mock*` class in `source/test-utils` (about 1 050 lines that nothing imports).

---

## What is solid

- The bid cipher is used correctly: fresh randomness per bid, a random salt, a fixed-length plaintext, bound associated data.
- `decryptWindowBids` checks each opening against the on-chain commitment before use.
- The register payload sends no state root and no storage key. The chain derives both.
- Lock id and storage key derivation match the contracts.
- Gas is simulated before signing, and transactions expire in five minutes.
- The sell flow's cancel now calls `reclaimLock` (`useSellFlow.ts:467`), the permissionless path.
