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
 *   createLiveWindow()      — Seller lock + `create_auction` (which registers
 *                             the window timelock) for the lock's window, read
 *                             back with `get_window_status`
 *   lockBidCollateral()     — FakeUSD collateral receipt for one bid
 *   lockBidCollaterals()    — many FakeUSD receipts proven at one Ethereum block
 *   submitBidDirect()       — `sealBid` + the current `submit_bid` ABI
 *   waitForReveal(), openAndFinalizeWindowDirect(),
 *   settleAuctionDirect()   — the reveal → open_bids batches → finalize_window
 *                             (clears) → settle sequence. openBidsDirect() and
 *                             finalizeWindowDirect() send one call each
 *   getAuctionState(), getWindowStatus(), getReceiptStatus() — chain reads
 *
 * A lock receipt belongs to the depositor's Ethereum-derivable Aptos account,
 * and only that account can claim it (issue 197). So `create_auction` is
 * SIWE-signed as the seller's account and `submit_bid` as the bidder's
 * ({@link submitAsEthAccount}). Calls that claim nothing (registration,
 * openings, settle) use a native Ed25519 account, which has no
 * special rights. Each call simulates first and signs with the SDK's simulated
 * `maxGasAmount`.
 */

import { ethers } from "ethers";
import {
  Aptos,
  Account,
  AccountAddress,
  type InputGenerateTransactionPayloadData,
} from "@aptos-labs/ts-sdk";
import {
  MAX_OPEN_BIDS_PER_CALL,
  getBidPayload,
  getCreateAuctionPayload,
  getFinalizeWindowPayload,
  getOpenBidsPayload,
  getOpenCursor,
  getRegisterLockPayload,
  getSettlePayload,
  isRevealed,
  sealBid,
} from "@atomica/sdk/aptos";
import {
  getDerivedAddress,
  quoteForFill,
  simulateMaxGasAmount,
  submitNativeTransaction,
} from "@atomica/sdk";
import {
  currentWindowId as windowIdAt,
  windowCloseSecs,
  type WindowSchedule,
} from "@atomica/sdk/ethereum";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";
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
  /** Lock fields Aptos hashes into the commitment (decimal strings) */
  amount: string;
  windowId: string;
  pairHash: string;
  /** LockBox.lockDeadline(windowId); register_ethereum_lock does not take it */
  deadline: string;
  /** Storage key of LockBox.commitments[lockId] */
  storageKey: string;
  /** The proven commitment */
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
 * @param pairBcs    - Pair BCS of the window the lock is bound to (default:
 *                     the SDK `LAUNCH_PAIR_BCS`). Aptos claims the lock only
 *                     into that pair's current window.
 */
// The default 10 FakeETH lock is above the 0.01 FakeETH minimum seller lock.
export async function generateEthLockProof(
  fixture: IntegrationFixture,
  lockAmount: bigint = ethers.parseEther("10"),
  mintAmount: bigint = ethers.parseEther("1000"),
  token: string = fixture.eth.contracts.fakeETH,
  depositor: EthSigner = fixture.eth.seller,
  pairBcs: Uint8Array = LAUNCH_PAIR_BCS,
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
    ethers.hexlify(pairBcs),
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

/**
 * `lock_receipt::register_ethereum_lock<asset>` for `proof`, built by the SDK
 * `getRegisterLockPayload` (the app's own builder), which sends no deadline:
 * Aptos recomputes it from the window id. The SDK addresses its
 * `CONTRACT_ADDR`, so this throws if that is not `moduleAddr`.
 */
function registerLockPayload(
  moduleAddr: string,
  proof: LockedBalanceProof,
  asset: "FakeETH" | "FakeUSD",
): InputGenerateTransactionPayloadData {
  const payload = getRegisterLockPayload(
    {
      ...proof,
      lockNonce: BigInt(proof.lockNonce),
      amount: BigInt(proof.amount),
      windowId: BigInt(proof.windowId),
      deadline: BigInt(proof.deadline),
    },
    asset,
  ) as InputGenerateTransactionPayloadData & { function: string };
  const sdkModule = payload.function.split("::")[0];
  if (
    AccountAddress.from(sdkModule).toString() !==
    AccountAddress.from(moduleAddr).toString()
  ) {
    throw new Error(
      `SDK CONTRACT_ADDR ${sdkModule} is not the test module ${moduleAddr}`,
    );
  }
  return payload;
}

/**
 * Default FakeUSD collateral locked for one bid (6 decimals). The lock mints
 * 20x this, which must fit FakeUSD's 10,000 FakeUSD MAX_MINT_AMOUNT, so 500
 * FakeUSD is also the ceiling. A bid is invalid at opening unless its
 * collateral covers `quote_for_fill(quantity, price)` (SDK `quoteForFill`,
 * price in whole USD per whole FakeETH). It is sized as the quote of the
 * largest test bid: 0.25 FakeETH at 2000 is 500 FakeUSD, and the usual
 * 0.1 FakeETH at 2000 costs 200 FakeUSD.
 */
export const DEFAULT_COLLATERAL = quoteForFill(ethers.parseEther("0.25"), 2000n);
// DEFAULT_COLLATERAL is above the 10 FakeUSD minimum bid collateral (auction::get_window_limits).

/**
 * `lock_receipt` status codes (`status_active`, `status_claimed`,
 * `status_revoked`, `status_filled`). Revoked returns the lock to its
 * depositor; filled pays a counterparty per the auction outcome.
 */
export const RECEIPT_ACTIVE = 0;
export const RECEIPT_CLAIMED = 1;
export const RECEIPT_REVOKED = 2;
export const RECEIPT_FILLED = 3;

/**
 * Window length of the test schedule, in seconds: CI boots the testnet with
 * `ATOMICA_TEST_WINDOW_SCHEDULE=900:900`, one window close every 900 s. A
 * window created now closes at most this long after.
 */
export const TEST_WINDOW_SECS = 900;

/**
 * The window clock in force on the chain (`eth_proof::get_window_schedule`):
 * the test schedule on the testnet, the 07:45 and 16:15 UTC closes otherwise.
 */
export async function getChainWindowSchedule(
  aptosClient: Aptos,
  moduleAddr: string,
): Promise<WindowSchedule> {
  const [daySecs, offsets] = await aptosClient.view({
    payload: {
      function: `${moduleAddr}::eth_proof::get_window_schedule`,
      functionArguments: [],
    },
  });
  return {
    daySecs: BigInt(daySecs as string),
    closeOffsetsSecs: (offsets as string[]).map((o) => BigInt(o)),
  };
}

/**
 * The window `create_auction` accepts right now, from the chain clock.
 *
 * `auction::current_window_id` is not a view function, so this applies the SDK
 * mirror to the chain clock, on the chain's window schedule.
 */
export async function currentWindowId(
  aptosClient: Aptos,
  moduleAddr: string,
): Promise<bigint> {
  const schedule = await getChainWindowSchedule(aptosClient, moduleAddr);
  const { ledger_timestamp } = await aptosClient.getLedgerInfo();
  return windowIdAt(BigInt(ledger_timestamp) / 1_000_000n, schedule);
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
  timeoutSecs = 1200,
): Promise<void> {
  await pollUntil(`chain time ${deadlineUs} us`, timeoutSecs, async () =>
    (await chainNowUs(aptosClient)) >= deadlineUs ? true : undefined,
  );
}

/**
 * Send `0x1::ibe_config::register_timelock(deadline_us)` from `sender`. Only
 * the stored registrar, the auction package's object, may register a
 * timelock, so this aborts with the framework's `E_NOT_REGISTRAR` (17) for
 * any test account. Only the test that expects that abort calls it. The
 * payload is local: the SDK builds no registration.
 */
export async function registerTimelockDirect(
  aptosClient: Aptos,
  sender: Account,
  deadlineUs: bigint,
): Promise<string> {
  return submitDirect(aptosClient, sender, {
    function: "0x1::ibe_config::register_timelock",
    functionArguments: [deadlineUs],
  });
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
 * Same 3-argument call as the SDK's `getCreateAuctionPayload`:
 *   create_auction(seller, window_id, pair_bcs, lock_id)
 *
 * The first call for a window id registers the window timelock, with the
 * window close as its deadline. Throws if the transaction aborts. Returns the
 * Aptos transaction hash.
 */
export async function createAuctionDirect(
  aptosClient: Aptos,
  seller: EthSigner,
  lockId: string,
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<string> {
  return submitAsEthAccount(
    aptosClient,
    seller,
    getCreateAuctionPayload(windowId, pairBcs, ethers.getBytes(lockId)),
  );
}

/** A window created on chain, with the timelock its window id registered. */
export interface LiveWindow {
  windowId: bigint;
  pairBcs: Uint8Array;
  /** The window id's timelock (`auction::window_timelock`). */
  timelockId: bigint;
  /** Timelock deadline in chain microseconds, the window close: bids close here. */
  deadlineUs: bigint;
  /** The seller's FakeETH lock id claimed by `create_auction`. */
  sellerLockId: string;
}

/** Seconds a new window must have left by default, so bids have time to land. */
const MIN_WINDOW_LEFT_SECS = 60n;

/**
 * Wait for the close of the current window when less than `minLeftSecs`
 * remain in it, on the chain clock and the chain's window schedule. Locks
 * made right after are bound to a window with at least that long left.
 */
export async function waitForWindowTimeLeft(
  aptosClient: Aptos,
  moduleAddr: string,
  minLeftSecs: bigint,
): Promise<void> {
  const schedule = await getChainWindowSchedule(aptosClient, moduleAddr);
  const nowSecs = (await chainNowUs(aptosClient)) / 1_000_000n;
  const close = windowCloseSecs(windowIdAt(nowSecs, schedule), schedule);
  if (close - nowSecs < minLeftSecs) {
    await waitForChainTime(aptosClient, close * 1_000_000n);
  }
}

/**
 * Lock FakeETH on Ethereum as the seller, register the receipt on Aptos, and
 * create the lock's window for `pairBcs`. `create_auction` registers the
 * window id's timelock on its first call, with the window close as its
 * deadline (`window_deadline_us`); a later call joins it. The operator (no
 * special rights) carries the proof. The seller's Ethereum-derivable account
 * creates the window: only it can claim the seller receipt.
 *
 * When less than `options.minWindowLeftSecs` (default 60) seconds remain in
 * the current window, it first waits for the close, so the new window leaves
 * bids time to land. On the test schedule
 * the window then closes at most {@link TEST_WINDOW_SECS} later.
 *
 * `options.pairBcs` must be on the pair allowlist (the SDK `LAUNCH_PAIR_BCS`),
 * or `create_auction` aborts with `E_PAIR_NOT_ALLOWED`. Each test file starts
 * its own chain, so one pair is enough: two calls for one window id join one
 * window.
 *
 * Throws unless `get_window_status` reads back the window id's timelock with
 * `reveal_final` and `refunded` both false.
 */
export async function createLiveWindow(
  fixture: IntegrationFixture,
  aptosClient: Aptos,
  operator: Account,
  options: {
    pairBcs: Uint8Array;
    lockAmount?: bigint;
    minWindowLeftSecs?: bigint;
  },
): Promise<LiveWindow> {
  const moduleAddr = fixture.aptos.moduleAddress;
  // SCOUT(#231) EDIT: registration needs the window close 15 minutes before the epoch end; with UTC-anchored epoch ends a testnet started near a boundary fails in create_auction.
  await waitForTimelockKey(aptosClient);
  await waitForWindowTimeLeft(
    aptosClient,
    moduleAddr,
    options.minWindowLeftSecs ?? MIN_WINDOW_LEFT_SECS,
  );

  const { lockId, proof } = await generateEthLockProof(
    fixture,
    options.lockAmount,
    undefined,
    undefined,
    undefined,
    options.pairBcs,
  );
  await registerLockOnAptos(aptosClient, operator, moduleAddr, proof);

  // The lock is bound to its window: create exactly that one.
  const windowId = BigInt(proof.windowId);
  await createAuctionDirect(
    aptosClient,
    fixture.eth.seller,
    lockId,
    windowId,
    options.pairBcs,
  );

  const timelockId = await getWindowTimelock(aptosClient, moduleAddr, windowId);
  const deadlineUs = await getWindowDeadlineUs(
    aptosClient,
    moduleAddr,
    windowId,
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

// The Node-side path: 09-submit-bid also locks and registers one bid through AuctionBidder.
/**
 * Lock FakeUSD collateral on Ethereum as `bidder`, bound to the current
 * window of `pairBcs`, and register its receipt on Aptos (the operator
 * carries the proof). The receipt belongs to the bidder's Ethereum-derivable
 * account. Returns the lock id that `submit_bid` claims.
 *
 * Lock at least `quoteForFill(quantity, price)` or the bid is invalid at
 * opening. The mint is `amount` times 20 and FakeUSD mints at most 10,000
 * per call, so `amount` cannot exceed 500 FakeUSD.
 */
export async function lockBidCollateral(
  fixture: IntegrationFixture,
  aptosClient: Aptos,
  operator: Account,
  pairBcs: Uint8Array,
  amount: bigint = DEFAULT_COLLATERAL,
  bidder: EthSigner = fixture.eth.bidder,
): Promise<string> {
  const { lockId, proof } = await generateEthLockProof(
    fixture,
    amount,
    amount * 20n,
    fixture.eth.contracts.fakeUSD,
    bidder,
    pairBcs,
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
 * bound to the current window of `pairBcs`, prove them all at one certified
 * block, and register every receipt (the operator carries the proofs).
 * Returns the lock ids in lock order.
 *
 * It mints `amount` times `count` in one call. 100 locks share the 10,000
 * FakeUSD mint cap, so each bid has at most 100 FakeUSD of collateral.
 */
export async function lockBidCollaterals(
  fixture: IntegrationFixture,
  aptosClient: Aptos,
  operator: Account,
  pairBcs: Uint8Array,
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
      ethers.hexlify(pairBcs),
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

/** A bid submitted on chain. Nothing is kept to open it: the chain does. */
export interface SubmittedBid {
  hash: string;
  price: bigint;
  ciphertext: Uint8Array;
}

/**
 * Seal a bid with the SDK's `sealBid` (the AuctionBidder code path) and send
 * it with the current `submit_bid` ABI from `getBidPayload`:
 *
 *   submit_bid(bidder, window_id, pair_bcs, ciphertext, collateral_lock_id,
 *              quantity)
 *
 * The bidder's Ethereum-derivable account signs (SIWE): only it can claim
 * the bidder's collateral receipt.
 *
 * `quantity` must be above zero and at most the window supply, or
 * `submit_bid` aborts (37, 38). `price` is whole USD per whole FakeETH
 * (`parsePrice` unit). The collateral must cover
 * `quoteForFill(quantity, price)`, or the bid is invalid at opening.
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
      ethers.getBytes(collateralLockId),
      quantity,
    ),
  );
  return { hash, price, ciphertext: sealed.ciphertext };
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
 * Send one `auction::open_bids(window_id, pair_bcs, max_bids)` from any
 * account (no SIWE). The chain decrypts up to `maxBids` bids from the opening
 * cursor, clamped to `MAX_OPEN_BIDS_PER_CALL`. It never clears. Throws if the
 * transaction aborts.
 */
export async function openBidsDirect(
  aptosClient: Aptos,
  sender: Account,
  window: { windowId: bigint; pairBcs: Uint8Array },
  maxBids: bigint = MAX_OPEN_BIDS_PER_CALL,
): Promise<string> {
  return submitDirect(
    aptosClient,
    sender,
    getOpenBidsPayload(window.windowId, window.pairBcs, maxBids),
  );
}

/**
 * Send one `auction::finalize_window(window_id, pair_bcs)` from any account
 * (no SIWE): it clears a window whose bids are all opened. Throws if the
 * transaction aborts.
 */
export async function finalizeWindowDirect(
  aptosClient: Aptos,
  sender: Account,
  window: { windowId: bigint; pairBcs: Uint8Array },
): Promise<string> {
  return submitDirect(
    aptosClient,
    sender,
    getFinalizeWindowPayload(window.windowId, window.pairBcs),
  );
}

/**
 * Open every bid of a window with `open_bids` batches of
 * `MAX_OPEN_BIDS_PER_CALL` until `get_open_cursor` reports every bid opened,
 * then clear it with one `finalize_window`, all from `sender`. `settle` can
 * follow directly. A bid that does not decrypt to an 8-byte price, or whose
 * collateral is below its quote, opens without abort: the chain marks it
 * invalid (`getBidInfo(...).valid`) and it never fills.
 *
 * Returns the hashes of the `open_bids` calls and of `finalize_window`. The
 * SDK's Aptos instance must point at the testnet (`setAptosInstance`).
 */
export async function openAndFinalizeWindowDirect(
  aptosClient: Aptos,
  sender: Account,
  window: { windowId: bigint; pairBcs: Uint8Array },
): Promise<{ openHashes: string[]; finalizeHash: string }> {
  const openHashes: string[] = [];
  let cursor = await getOpenCursor(window.windowId, window.pairBcs);
  while (cursor.next < cursor.total) {
    openHashes.push(await openBidsDirect(aptosClient, sender, window));
    const after = await getOpenCursor(window.windowId, window.pairBcs);
    if (after.next <= cursor.next) {
      throw new Error(
        `open_bids did not move the cursor of window ${window.windowId} (${cursor.next} of ${cursor.total})`,
      );
    }
    cursor = after;
  }
  const finalizeHash = await finalizeWindowDirect(aptosClient, sender, window);
  return { openHashes, finalizeHash };
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
// `reveal_final` is true once `finalize_window` cleared the window.
export async function getWindowStatus(
  aptosClient: Aptos,
  moduleAddr: string,
  windowId: bigint,
  pairBcs: Uint8Array = LAUNCH_PAIR_BCS,
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
 * settled flag and the clearing price (whole USD per whole base token).
 * Throws when the window does not exist.
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

/**
 * Join `count` more seller locks of `lockAmount` FakeETH wei into an existing
 * window, to fill it to the seller cap. The seller locks `count` times in a
 * few Ethereum blocks (`generateEthLockProofs`), the operator registers the
 * receipts in batches, and the seller's Ethereum-derivable account calls
 * `create_auction` for each. `lockAmount` must be at least the minimum seller
 * lock, and the window must still be the current one. Returns the lock ids.
 */
export async function joinWindowAsSellers(
  fixture: IntegrationFixture,
  aptosClient: Aptos,
  operator: Account,
  window: LiveWindow,
  count: number,
  lockAmount: bigint,
): Promise<string[]> {
  const moduleAddr = fixture.aptos.moduleAddress;
  const results: CommandEthLockProofResult[] =
    await commands.generateEthLockProofs(
      fixture.eth.rpcUrl,
      fixture.aptos.nodeUrl,
      fixture.eth.seller.privateKey,
      fixture.eth.contracts.fakeETH,
      fixture.eth.contracts.lockBox,
      lockAmount.toString(),
      count,
      ethers.hexlify(window.pairBcs),
    );
  const proofs: LockedBalanceProof[] = results.map((r) => ({
    ...r.proof,
    storageValue: BigInt(r.proof.storageValue),
  }));
  await submitManyDirect(
    aptosClient,
    operator,
    proofs.map((p) => registerLockPayload(moduleAddr, p, "FakeETH")),
  );
  for (const { lockId } of results) {
    await createAuctionDirect(
      aptosClient,
      fixture.eth.seller,
      lockId,
      window.windowId,
      window.pairBcs,
    );
  }
  return results.map((r) => r.lockId);
}

// ---------------------------------------------------------------------------
// Window timelock reads
// ---------------------------------------------------------------------------

/**
 * Read `auction::window_timelock(window_id)`: the timelock the first
 * `create_auction` of the window id registered. Throws until one did.
 */
export async function getWindowTimelock(
  aptosClient: Aptos,
  moduleAddr: string,
  windowId: bigint,
): Promise<bigint> {
  const [id] = await aptosClient.view({
    payload: {
      function: `${moduleAddr}::auction::window_timelock`,
      functionArguments: [windowId],
    },
  });
  return BigInt(id as string);
}

/**
 * Read `auction::window_deadline_us(window_id)`: the timelock deadline that
 * `create_auction` derived from the window id, the window close in
 * microseconds. The SDK reader (`getWindowDeadlineUs` of `@atomica/sdk/aptos`)
 * reads the same view through the SDK's own client; tests pass theirs.
 */
export async function getWindowDeadlineUs(
  aptosClient: Aptos,
  moduleAddr: string,
  windowId: bigint,
): Promise<bigint> {
  const [deadline] = await aptosClient.view({
    payload: {
      function: `${moduleAddr}::auction::window_deadline_us`,
      functionArguments: [windowId],
    },
  });
  return BigInt(deadline as string);
}
