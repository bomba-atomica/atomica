/**
 * Shared helpers for the live auction browser integration tests (07–14).
 *
 * Every helper here talks to the live dual-chain testnet and throws when a
 * chain call fails. Tests must not swallow those errors: a test that expects
 * a rejection asserts the abort code with `rejects.toThrow`.
 *
 *   generateEthLockProof()  — Mint → Approve → Lock on Ethereum, wait for the
 *                             Aptos validators to certify a block that covers
 *                             the lock, and prove the lock at that block
 *                             (runs via vitest browser command on Node.js side to avoid
 *                             @ethereumjs/util EventEmitter incompatibility in browser)
 *   registerLockOnAptos()   — Register the lock on Aptos from any account: no
 *                             header submission, no special signer
 *   submitAsEthAccount()    — SIWE-sign a transaction as the Ethereum-derivable
 *                             account of an Ethereum key (the receipt owner)
 *   createLiveWindow()      — Seller lock + timelock + `create_auction` for the
 *                             current window, read back with `get_window_status`
 *   lockBidCollateral()     — FakeUSD collateral receipt for one bid
 *   lockBidCollaterals()    — many FakeUSD receipts proven at one Ethereum block
 *   submitBidDirect()       — `sealBid` + the current `submit_bid` ABI
 *   waitForReveal(), openWindowBidsDirect(),
 *   settleAuctionDirect()   — the reveal → open (clears) → settle sequence
 *   getAuctionState(), getWindowStatus(), getReceiptStatus() — chain reads
 *
 * A lock receipt belongs to the depositor's Ethereum-derivable Aptos account,
 * and only that account can claim it (issue 197). So `create_auction` is
 * SIWE-signed as the seller's account and `submit_bid` as the bidder's
 * ({@link submitAsEthAccount}). Calls that claim nothing (registration,
 * timelocks, openings, settle) use a native Ed25519 account, which has no
 * special rights. Each call simulates first and signs with the SDK's simulated
 * `maxGasAmount`.
 */

import { ethers } from "ethers";
import {
  Aptos,
  Account,
  type InputGenerateTransactionPayloadData,
} from "@aptos-labs/ts-sdk";
import {
  decryptWindowBids,
  getBidPayload,
  getCreateAuctionPayload,
  getRegisterTimelockPayload,
  getSettlePayload,
  getSubmitCleartextPayload,
  isRevealed,
  sealBid,
  timelockIdFromEvents,
  type OpenedBid,
} from "@atomica/sdk/aptos";
import {
  getDerivedAddress,
  simulateMaxGasAmount,
  submitNativeTransaction,
} from "@atomica/sdk";
import { commands } from "vitest/browser";
import type { EthLockProofResult as CommandEthLockProofResult } from "@atomica/aptos-docker-testnet/browser-commands";
import type { IntegrationFixture } from "../fixtures/dual-chain";
import { setupWalletMock } from "../fixtures/wallet-mock";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * LockedBalanceProof shape expected by getRegisterLockPayload and
 * registerLockOnAptos. Mirrors atomica-web-ui's LockedBalanceProof but
 * with storageValue as bigint (reconstructed after JSON round-trip).
 */
export interface LockedBalanceProof {
  blockNumber: number;
  blockHash: string;
  stateRoot: string;
  contractAddress: string;
  userAddress: string;
  tokenAddress: string;
  /** LockBox nonce of the lock (decimal string) */
  lockNonce: string;
  /** LockBox.getLockId(user, token, nonce): the Aptos receipt id */
  lockId: string;
  storageKey: string;
  storageValue: bigint;
  accountProof: string[];
  storageProof: string[];
  timestamp: number;
  generatedAt: number;
}

export interface EthLockProofResult {
  /** Keccak256 lock ID (hex with 0x prefix) */
  lockId: string;
  /** Raw storage proof data */
  proof: LockedBalanceProof;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lock FakeETH on Ethereum and generate a storage proof, but do NOT register
 * the lock on Aptos.  Allows tests to choose which Aptos account to register
 * under without incurring a deployer registration in advance.
 *
 * Delegates to commands.generateEthLockProof() which runs on the Node.js side
 * (browser can't access @ethereumjs/util EventEmitter).
 *
 * The proof block is one the Aptos validators certified, so no header is
 * submitted before registration.
 *
 * @param fixture    - Dual-chain integration fixture
 * @param lockAmount - Amount of the token to lock (base units, default: 10 ETH)
 * @param mintAmount - Amount of the token to mint (base units, default: 1000 ETH)
 * @param token      - ERC-20 to mint and lock (default: FakeETH)
 * @param depositor  - Ethereum account that locks (default: the seller)
 */
export async function generateEthLockProof(
  fixture: IntegrationFixture,
  lockAmount: bigint = ethers.parseEther("10"),
  mintAmount: bigint = ethers.parseEther("1000"),
  token: string = fixture.eth.contracts.fakeETH,
  depositor: EthSigner = fixture.eth.seller,
): Promise<EthLockProofResult> {
  const { eth } = fixture;

  const result: CommandEthLockProofResult = await commands.generateEthLockProof(
    eth.rpcUrl,
    fixture.aptos.nodeUrl,
    depositor.privateKey,
    token,
    eth.contracts.lockBox,
    lockAmount.toString(),
    mintAmount.toString(),
  );

  return {
    lockId: result.lockId,
    proof: {
      ...result.proof,
      // Reconstruct bigint from decimal string (JSON serialization loses bigint)
      storageValue: BigInt(result.proof.storageValue),
    },
  };
}

/**
 * Register the lock on Aptos. Any account may carry the proof: `sender`
 * needs no special rights. Aptos checks the proof against the root the
 * validators certified for the proof block, derives the storage key and lock
 * id from the user, the token and the lock nonce, and gives the receipt to
 * the depositor's Ethereum-derivable account.
 *
 * @param aptosClient - Aptos client
 * @param sender      - Account that carries the proof
 * @param moduleAddr  - Atomica module address
 * @param proof       - Storage proof returned by generateEthLockProof
 * @param asset       - Receipt asset type (default: FakeETH)
 */
export async function registerLockOnAptos(
  aptosClient: Aptos,
  sender: Account,
  moduleAddr: string,
  proof: LockedBalanceProof,
  asset: "FakeETH" | "FakeUSD" = "FakeETH",
): Promise<void> {
  await submitDirect(
    aptosClient,
    sender,
    registerLockPayload(moduleAddr, proof, asset),
  );
}

// ---------------------------------------------------------------------------
// Ethereum-derivable accounts (receipt owners)
// ---------------------------------------------------------------------------

/** An Ethereum key, e.g. `fixture.eth.seller` or `fixture.eth.bidder`. */
export interface EthSigner {
  privateKey: string;
}

/**
 * Aptos address of the Ethereum-derivable account of `signer`: the owner of
 * its lock receipts. The SIWE domain is `window.location.host`, which the
 * fixture pinned in `eth_proof`.
 */
export async function ethAccountAddress(signer: EthSigner): Promise<string> {
  const ethAddress = new ethers.Wallet(signer.privateKey).address;
  return (await getDerivedAddress(ethAddress.toLowerCase())).toString();
}

/** APT the derivable account keeps for gas (5 APT). */
const ETH_ACCOUNT_GAS_OCTAS = 500_000_000;

/** Fund the Ethereum-derivable account of `signer` once it runs low on gas. */
async function ensureEthAccountGas(
  aptosClient: Aptos,
  signer: EthSigner,
): Promise<string> {
  const address = await ethAccountAddress(signer);
  const balance = await aptosClient
    .getAccountAPTAmount({ accountAddress: address })
    .catch(() => 0);
  if (balance < ETH_ACCOUNT_GAS_OCTAS / 5) {
    await commands.fundAccount(address, ETH_ACCOUNT_GAS_OCTAS);
  }
  return address;
}

/**
 * SIWE-sign and submit `data` as the Ethereum-derivable account of `signer`,
 * through the SDK's `submitNativeTransaction` (the app's own signing path).
 * Funds the account first if it is low on gas. Leaves the test's wallet mock
 * in place afterwards. Throws if the transaction aborts.
 */
export async function submitAsEthAccount(
  aptosClient: Aptos,
  signer: EthSigner,
  data: InputGenerateTransactionPayloadData,
): Promise<string> {
  await ensureEthAccountGas(aptosClient, signer);
  const previous = window.ethereum;
  try {
    const ethAddress = await setupWalletMock({ privateKey: signer.privateKey });
    const pending = await submitNativeTransaction(
      aptosClient,
      ethAddress,
      data,
    );
    return pending.hash;
  } finally {
    window.ethereum = previous;
  }
}

/** `lock_receipt::register_ethereum_lock<asset>` for `proof`. */
function registerLockPayload(
  moduleAddr: string,
  proof: LockedBalanceProof,
  asset: "FakeETH" | "FakeUSD",
): InputGenerateTransactionPayloadData {
  return {
    function: `${moduleAddr}::lock_receipt::register_ethereum_lock`,
    typeArguments: [`${moduleAddr}::lock_receipt::${asset}`],
    functionArguments: [
      proof.blockNumber,
      ethers.getBytes(proof.userAddress),
      proof.lockNonce,
      proof.accountProof.map((p: string) => ethers.getBytes(p)),
      proof.storageProof.map((p: string) => ethers.getBytes(p)),
    ],
  };
}

/** Default pair BCS bytes. Tests that need several windows pass distinct bytes. */
export const TEST_PAIR_BCS = new Uint8Array(0);

/** Default FakeUSD collateral locked for one bid (6 decimals). */
export const DEFAULT_COLLATERAL = 500n * 10n ** 6n;

/** `lock_receipt` status codes (`status_active`, `status_claimed`, `status_revoked`). */
export const RECEIPT_ACTIVE = 0;
export const RECEIPT_CLAIMED = 1;
export const RECEIPT_REVOKED = 2;

/**
 * The window `create_auction` accepts right now, from the chain clock.
 *
 * Mirrors `auction::current_window_id` (not a view function): two windows per
 * 43 200 s epoch, the second starting at offset 28 500 s.
 */
export async function currentWindowId(aptosClient: Aptos): Promise<bigint> {
  const { ledger_timestamp } = await aptosClient.getLedgerInfo();
  const nowSec = BigInt(ledger_timestamp) / 1_000_000n;
  const epoch = nowSec / 43200n;
  return epoch * 2n + (nowSec % 43200n >= 28500n ? 1n : 0n);
}

/** Poll `probe` every 2 s until it returns a value, or throw after `timeoutSecs`. */
export async function pollUntil<T>(
  what: string,
  timeoutSecs: number,
  probe: () => Promise<T | undefined>,
): Promise<T> {
  const deadline = Date.now() + timeoutSecs * 1000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value !== undefined) return value;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Timed out after ${timeoutSecs}s waiting for ${what}: ${String(lastError)}`,
  );
}

/**
 * Wait until the epoch's timelock key exists (`0x1::ibe_config::is_ready`).
 *
 * The docker testnet runs the timelock DKG at the first reconfiguration, so
 * the key exists only from epoch 2. The fixture returns before that.
 */
export async function waitForTimelockKey(
  aptosClient: Aptos,
  timeoutSecs = 600,
): Promise<void> {
  await pollUntil("ibe_config::is_ready", timeoutSecs, async () => {
    const [ready] = await aptosClient.view({
      payload: { function: "0x1::ibe_config::is_ready", functionArguments: [] },
    });
    return ready === true ? true : undefined;
  });
}

/** The chain clock in microseconds (`ledger_timestamp`). */
export async function chainNowUs(aptosClient: Aptos): Promise<bigint> {
  const { ledger_timestamp } = await aptosClient.getLedgerInfo();
  return BigInt(ledger_timestamp);
}

/** Wait until the chain clock is at or past `deadlineUs`. */
export async function waitForChainTime(
  aptosClient: Aptos,
  deadlineUs: bigint,
  timeoutSecs = 600,
): Promise<void> {
  await pollUntil(`chain time ${deadlineUs} us`, timeoutSecs, async () =>
    (await chainNowUs(aptosClient)) >= deadlineUs ? true : undefined,
  );
}

/**
 * Register a timelock for `deadlineUs` with `0x1::ibe_config::register_timelock`
 * and return its id from the `TimelockRegistrationEvent`.
 */
export async function registerTimelockDirect(
  aptosClient: Aptos,
  sender: Account,
  deadlineUs: bigint,
): Promise<bigint> {
  const txn = await aptosClient.transaction.build.simple({
    sender: sender.accountAddress,
    data: getRegisterTimelockPayload(deadlineUs),
  });
  const submitted = await aptosClient.signAndSubmitTransaction({
    signer: sender,
    transaction: txn,
  });
  const done = await aptosClient.waitForTransaction({
    transactionHash: submitted.hash,
    options: { checkSuccess: true },
  });
  return timelockIdFromEvents("events" in done ? done.events : []);
}

/**
 * Build a native-account transaction with `maxGasAmount` (the ts-sdk default
 * when undefined) and an optional explicit sequence number.
 */
async function buildDirect(
  aptosClient: Aptos,
  sender: Account,
  data: InputGenerateTransactionPayloadData,
  maxGasAmount: number | undefined,
  accountSequenceNumber?: bigint,
) {
  return aptosClient.transaction.build.simple({
    sender: sender.accountAddress,
    data,
    options: {
      ...(maxGasAmount !== undefined && { maxGasAmount }),
      ...(accountSequenceNumber !== undefined && { accountSequenceNumber }),
    },
  });
}

/** Sign and submit an entry-function payload with a native account; throws on abort. */
export async function submitDirect(
  aptosClient: Aptos,
  sender: Account,
  data: InputGenerateTransactionPayloadData,
): Promise<string> {
  const maxGasAmount = await simulateMaxGasAmount(
    aptosClient,
    sender.accountAddress,
    data,
  );
  const txn = await buildDirect(aptosClient, sender, data, maxGasAmount);
  const submitted = await aptosClient.signAndSubmitTransaction({
    signer: sender,
    transaction: txn,
  });
  await aptosClient.waitForTransaction({
    transactionHash: submitted.hash,
    options: { checkSuccess: true },
  });
  return submitted.hash;
}

/**
 * Submit many payloads from one native account, `batchSize` at a time with
 * consecutive sequence numbers and the SDK's simulated `maxGasAmount`, and
 * wait for each batch. Throws if any
 * transaction aborts. Returns the hashes in payload order.
 */
export async function submitManyDirect(
  aptosClient: Aptos,
  sender: Account,
  payloads: InputGenerateTransactionPayloadData[],
  batchSize = 20,
): Promise<string[]> {
  const hashes: string[] = [];
  for (let start = 0; start < payloads.length; start += batchSize) {
    const batchPayloads = payloads.slice(start, start + batchSize);
    // Simulate the whole batch before sending it: a simulation built while
    // earlier batch transactions commit races the sequence number.
    const maxGas: (number | undefined)[] = [];
    for (const data of batchPayloads) {
      maxGas.push(
        await simulateMaxGasAmount(aptosClient, sender.accountAddress, data),
      );
    }
    const { sequence_number } = await aptosClient.getAccountInfo({
      accountAddress: sender.accountAddress,
    });
    let sequence = BigInt(sequence_number);
    const batch: string[] = [];
    for (const [i, data] of batchPayloads.entries()) {
      const txn = await buildDirect(
        aptosClient,
        sender,
        data,
        maxGas[i],
        sequence++,
      );
      const submitted = await aptosClient.signAndSubmitTransaction({
        signer: sender,
        transaction: txn,
      });
      batch.push(submitted.hash);
    }
    for (const hash of batch) {
      await aptosClient.waitForTransaction({
        transactionHash: hash,
        options: { checkSuccess: true },
      });
    }
    hashes.push(...batch);
  }
  return hashes;
}

/**
 * Create an auction as the seller's Ethereum-derivable account (SIWE), the
 * only account that can claim the seller's FakeETH receipt.
 *
 * Same 6-argument call as the SDK's `getCreateAuctionPayload`:
 *   create_auction(seller, window_id, pair_bcs, lock_id, min_price,
 *                  timelock_id, mpk_bytes)
 *
 * Throws if the transaction aborts. Returns the Aptos transaction hash.
 */
export async function createAuctionDirect(
  aptosClient: Aptos,
  seller: EthSigner,
  lockId: string,
  minPrice: bigint,
  windowId: bigint,
  pairBcs: Uint8Array,
  timelockId: bigint,
): Promise<string> {
  return submitAsEthAccount(
    aptosClient,
    seller,
    getCreateAuctionPayload(
      windowId,
      pairBcs,
      ethers.getBytes(lockId),
      minPrice,
      timelockId,
      new Uint8Array(0), // mpk_bytes, reserved
    ),
  );
}

/** A window created on chain with its own timelock. */
export interface LiveWindow {
  windowId: bigint;
  pairBcs: Uint8Array;
  timelockId: bigint;
  /** Timelock deadline in chain microseconds: bids close here. */
  deadlineUs: bigint;
  /** The seller's FakeETH lock id claimed by `create_auction`. */
  sellerLockId: string;
}

/**
 * Lock FakeETH on Ethereum as the seller, register the receipt on Aptos,
 * register a timelock that closes `deadlineAheadUs` after the chain clock, and
 * create the current window for `pairBcs` bound to it. The operator (no
 * special rights) carries the proof and registers the timelock. The seller's
 * Ethereum-derivable account creates the window: only it can claim the
 * seller receipt.
 *
 * Throws unless `get_window_status` reads back the new timelock with
 * `reveal_final` and `refunded` both false.
 */
export async function createLiveWindow(
  fixture: IntegrationFixture,
  aptosClient: Aptos,
  operator: Account,
  options: {
    pairBcs: Uint8Array;
    minPrice: bigint;
    deadlineAheadUs: bigint;
    lockAmount?: bigint;
  },
): Promise<LiveWindow> {
  const moduleAddr = fixture.aptos.moduleAddress;
  const { lockId, proof } = await generateEthLockProof(
    fixture,
    options.lockAmount,
  );
  await registerLockOnAptos(aptosClient, operator, moduleAddr, proof);

  await waitForTimelockKey(aptosClient);
  const deadlineUs = (await chainNowUs(aptosClient)) + options.deadlineAheadUs;
  const timelockId = await registerTimelockDirect(
    aptosClient,
    operator,
    deadlineUs,
  );

  const windowId = await currentWindowId(aptosClient);
  await createAuctionDirect(
    aptosClient,
    fixture.eth.seller,
    lockId,
    options.minPrice,
    windowId,
    options.pairBcs,
    timelockId,
  );

  const status = await getWindowStatus(
    aptosClient,
    moduleAddr,
    windowId,
    options.pairBcs,
  );
  if (
    status.timelockId !== timelockId ||
    status.revealFinal ||
    status.refunded
  ) {
    throw new Error(
      `window ${windowId} reads back ${JSON.stringify({
        timelockId: status.timelockId.toString(),
        revealFinal: status.revealFinal,
        refunded: status.refunded,
      })}, expected timelock ${timelockId}`,
    );
  }

  return {
    windowId,
    pairBcs: options.pairBcs,
    timelockId,
    deadlineUs,
    sellerLockId: lockId,
  };
}

/**
 * Lock FakeUSD collateral on Ethereum as `bidder` and register its receipt on
 * Aptos (the operator carries the proof). The receipt belongs to the bidder's
 * Ethereum-derivable account. Returns the lock id that `submit_bid` claims.
 */
export async function lockBidCollateral(
  fixture: IntegrationFixture,
  aptosClient: Aptos,
  operator: Account,
  amount: bigint = DEFAULT_COLLATERAL,
  bidder: EthSigner = fixture.eth.bidder,
): Promise<string> {
  const { lockId, proof } = await generateEthLockProof(
    fixture,
    amount,
    amount * 20n,
    fixture.eth.contracts.fakeUSD,
    bidder,
  );
  await registerLockOnAptos(
    aptosClient,
    operator,
    fixture.aptos.moduleAddress,
    proof,
    "FakeUSD",
  );
  return lockId;
}

/**
 * Lock FakeUSD collateral `count` times as `bidder` in a few Ethereum blocks,
 * prove them all at one certified block, and register every receipt (the
 * operator carries the proofs). Returns the lock ids in lock order.
 */
export async function lockBidCollaterals(
  fixture: IntegrationFixture,
  aptosClient: Aptos,
  operator: Account,
  count: number,
  amount: bigint = DEFAULT_COLLATERAL,
  bidder: EthSigner = fixture.eth.bidder,
): Promise<string[]> {
  const moduleAddr = fixture.aptos.moduleAddress;
  const results: CommandEthLockProofResult[] =
    await commands.generateEthLockProofs(
      fixture.eth.rpcUrl,
      fixture.aptos.nodeUrl,
      bidder.privateKey,
      fixture.eth.contracts.fakeUSD,
      fixture.eth.contracts.lockBox,
      amount.toString(),
      count,
    );
  const proofs: LockedBalanceProof[] = results.map((r) => ({
    ...r.proof,
    storageValue: BigInt(r.proof.storageValue),
  }));
  await submitManyDirect(
    aptosClient,
    operator,
    proofs.map((p) => registerLockPayload(moduleAddr, p, "FakeUSD")),
  );
  return results.map((r) => r.lockId);
}

/** A bid submitted on chain. Keep `salt`: it opens the bid. */
export interface SubmittedBid {
  hash: string;
  price: bigint;
  salt: Uint8Array;
  ciphertext: Uint8Array;
  commitment: Uint8Array;
}

/**
 * Seal a bid with the SDK's `sealBid` (the AuctionBidder code path) and send
 * it with the current `submit_bid` ABI from `getBidPayload`:
 *
 *   submit_bid(bidder, window_id, pair_bcs, ciphertext, commitment,
 *              collateral_lock_id, quantity)
 *
 * The bidder's Ethereum-derivable account signs (SIWE): only it can claim
 * the bidder's collateral receipt.
 *
 * The SDK's Aptos instance must point at the testnet (`setAptosInstance`).
 * Throws if the transaction aborts.
 */
export async function submitBidDirect(
  aptosClient: Aptos,
  bidder: EthSigner,
  window: { windowId: bigint; pairBcs: Uint8Array },
  price: bigint,
  collateralLockId: string,
  quantity: bigint,
): Promise<SubmittedBid> {
  const sealed = await sealBid(
    window.windowId,
    window.pairBcs,
    await ethAccountAddress(bidder),
    price,
  );
  const hash = await submitAsEthAccount(
    aptosClient,
    bidder,
    getBidPayload(
      window.windowId,
      window.pairBcs,
      sealed.ciphertext,
      sealed.commitment,
      ethers.getBytes(collateralLockId),
      quantity,
    ),
  );
  return {
    hash,
    price,
    salt: sealed.salt,
    ciphertext: sealed.ciphertext,
    commitment: sealed.commitment,
  };
}

/** Wait until the validators reveal the timelock key (`timelock::is_revealed`). */
export async function waitForReveal(
  timelockId: bigint,
  timeoutSecs: number,
): Promise<void> {
  await pollUntil(`timelock ${timelockId} reveal`, timeoutSecs, async () =>
    (await isRevealed(timelockId)) ? true : undefined,
  );
}

/**
 * Decrypt every bid of a window with the revealed key (`decryptWindowBids`)
 * and open them all in one `submit_cleartext_and_clear`. Opening the last bid
 * finalizes the reveal and clears the window, so `settle` can follow directly.
 * Throws unless every bid decrypts to an opening that matches its commitment.
 */
export async function openWindowBidsDirect(
  aptosClient: Aptos,
  sender: Account,
  window: { windowId: bigint; pairBcs: Uint8Array },
): Promise<OpenedBid[]> {
  const opened = await decryptWindowBids(window.windowId, window.pairBcs);
  const bad = opened.filter((b) => !b.matchesCommitment);
  if (bad.length > 0) {
    throw new Error(
      `bids ${bad.map((b) => b.index).join(", ")} did not decrypt to their commitment: ` +
        bad.map((b) => b.error ?? "commitment mismatch").join("; "),
    );
  }
  await submitDirect(
    aptosClient,
    sender,
    getSubmitCleartextPayload(
      window.windowId,
      window.pairBcs,
      opened.map((b) => b.price!),
      opened.map((b) => b.salt!),
    ),
  );
  return opened;
}

/**
 * Settle a window directly (no SIWE): `settle(caller, window_id, pair_bcs)`.
 * Throws if the transaction aborts.
 */
export async function settleAuctionDirect(
  aptosClient: Aptos,
  settler: Account,
  window: { windowId: bigint; pairBcs: Uint8Array },
): Promise<string> {
  return submitDirect(
    aptosClient,
    settler,
    getSettlePayload(window.windowId, window.pairBcs),
  );
}

/**
 * Read `auction::get_window_status(window_id, pair_bcs)`.
 * Aborts (throws) with E_AUCTION_NOT_FOUND when the window does not exist.
 */
export async function getWindowStatus(
  aptosClient: Aptos,
  moduleAddr: string,
  windowId: bigint,
  pairBcs: Uint8Array = TEST_PAIR_BCS,
): Promise<{ timelockId: bigint; revealFinal: boolean; refunded: boolean }> {
  const [timelockId, revealFinal, refunded] = await aptosClient.view({
    payload: {
      function: `${moduleAddr}::auction::get_window_status`,
      functionArguments: [windowId, pairBcs],
    },
  });
  return {
    timelockId: BigInt(timelockId as string),
    revealFinal: revealFinal as boolean,
    refunded: refunded as boolean,
  };
}

/**
 * Read `auction::get_auction(window_id, pair_bcs)`: supply, bid count, the
 * settled flag and the clearing price. Throws when the window does not exist.
 */
export async function getAuctionState(
  aptosClient: Aptos,
  moduleAddr: string,
  window: { windowId: bigint; pairBcs: Uint8Array },
): Promise<{
  totalSupply: bigint;
  bidCount: bigint;
  settled: boolean;
  clearingPrice: bigint;
}> {
  const [, totalSupply, bidCount, settled, clearingPrice] =
    await aptosClient.view({
      payload: {
        function: `${moduleAddr}::auction::get_auction`,
        functionArguments: [window.windowId, window.pairBcs],
      },
    });
  return {
    totalSupply: BigInt(totalSupply as string),
    bidCount: BigInt(bidCount as string),
    settled: settled as boolean,
    clearingPrice: BigInt(clearingPrice as string),
  };
}

/**
 * Read the status of a lock receipt
 * (`lock_receipt::get_receipt<Ethereum, Asset>`): one of
 * {@link RECEIPT_ACTIVE}, {@link RECEIPT_CLAIMED}, {@link RECEIPT_REVOKED}.
 */
export async function getReceiptStatus(
  aptosClient: Aptos,
  moduleAddr: string,
  asset: "FakeETH" | "FakeUSD",
  lockId: string,
): Promise<number> {
  const [, , , status] = await aptosClient.view({
    payload: {
      function: `${moduleAddr}::lock_receipt::get_receipt`,
      typeArguments: [
        `${moduleAddr}::lock_receipt::Ethereum`,
        `${moduleAddr}::lock_receipt::${asset}`,
      ],
      functionArguments: [ethers.getBytes(lockId)],
    },
  });
  return Number(status);
}
