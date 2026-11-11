// SCOUT(#222) EDIT: the header below names two ways out of LockBox; reclaimUnpayable is a third.
// SCOUT(#221) EDIT: the header below says a lock names its auction by deadline too; the auction key is (window id, pair hash), and LockBox computes the deadline.
/**
 * LockBox Contract Helpers
 *
 * Ethereum-side interactions for locking FakeETH/FakeUSD in the proof-gated
 * LockBox.sol. Covers approve → lock → query → reclaim.
 *
 * Every lock names its auction (window id, pair hash, deadline; see
 * lock-binding.ts). It leaves LockBox in one of two ways, and anyone may
 * trigger either: `releaseByOutcome` pays it out per a proven Aptos
 * `AuctionOutcome`, or `reclaim` returns it to its depositor after its
 * deadline. There is no relayer.
 */

import { ethers, type TransactionReceipt } from "ethers";
import { getChainConfig } from "../chain-config.js";
import {
  FAKE_ETH_ABI,
  FAKE_USD_ABI,
  LOCKBOX_ABI,
  LOCK_STATUS,
} from "./abis.js";
import type { LockBinding } from "./lock-binding.js";

/** The fields one lock commits to (`LockBox.Lock`), plus its id. */
export interface LockFields {
  lockId: string;
  depositor: string;
  token: string;
  nonce: bigint;
  amount: bigint;
  windowId: bigint;
  pairHash: string;
  deadline: bigint;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// SCOUT(#234) EDIT: this configured address must equal the eth_proof pin before any approve or lock.
function getLockBoxAddress(): string {
  return getChainConfig().ethereum.lockBox;
}

function getFakeEthAddress(): string {
  return getChainConfig().ethereum.fakeETH;
}

function getFakeUsdAddress(): string {
  return getChainConfig().ethereum.fakeUSD;
}

/**
 * Get a LockBox contract instance with a MetaMask signer attached.
 */
async function getLockBoxWithSigner(provider: ethers.BrowserProvider) {
  const signer = await provider.getSigner();
  const address = getLockBoxAddress();
  return new ethers.Contract(address, LOCKBOX_ABI, signer);
}

/**
 * Get a FakeETH ERC-20 contract instance with a MetaMask signer attached.
 */
async function getFakeEthWithSigner(provider: ethers.BrowserProvider) {
  const signer = await provider.getSigner();
  const address = getFakeEthAddress();
  return new ethers.Contract(address, FAKE_ETH_ABI, signer);
}

/**
 * Get a FakeUSD ERC-20 contract instance with a MetaMask signer attached.
 *
 * Used for the bidder collateral lock step (Phase 3b #87).
 * @see docs/architecture/v0-architecture.md §2.5
 */
async function getFakeUsdWithSigner(provider: ethers.BrowserProvider) {
  const signer = await provider.getSigner();
  const address = getFakeUsdAddress();
  return new ethers.Contract(address, FAKE_USD_ABI, signer);
}

// SCOUT(#221) EDIT: call lock(token, amount, windowId, pairHash); LockBox computes the deadline.
// SCOUT(#234) EDIT: assert the pin here before the lock is sent; lockFakeEth and lockFakeUsd both pass through.
async function lockToken(
  provider: ethers.BrowserProvider,
  token: string,
  amount: bigint,
  binding: LockBinding,
): Promise<TransactionReceipt> {
  const lockBox = await getLockBoxWithSigner(provider);
  const tx = await lockBox.lock(
    token,
    amount,
    binding.windowId,
    binding.pairHash,
    // SCOUT(#221) REMOVE: the deadline argument.
    binding.deadline,
  );
  const receipt = await tx.wait();
  if (!receipt) throw new Error("lock() tx receipt is null");
  return receipt;
}

// ── Public API ────────────────────────────────────────────────────────────────

// SCOUT(#234) EDIT: call assertEthereumConfigMatchesPin before the approve is sent.
/**
 * Approve LockBox to spend `amount` of FakeETH on the user's behalf.
 *
 * This must be called before `lockFakeEth` if the current allowance is
 * insufficient.
 */
export async function approveFakeEth(
  provider: ethers.BrowserProvider,
  amount: bigint,
): Promise<TransactionReceipt> {
  const fakeEth = await getFakeEthWithSigner(provider);
  const lockBoxAddress = getLockBoxAddress();

  const tx = await fakeEth.approve(lockBoxAddress, amount);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("approve() tx receipt is null");
  return receipt;
}

// SCOUT(#234) EDIT: refuses on a pin mismatch, through lockToken.
/**
 * Lock `amount` of FakeETH in LockBox into the auction `binding` names
 * (see `lockBinding`).
 *
 * The caller must have approved LockBox for at least `amount` first.
 */
export async function lockFakeEth(
  provider: ethers.BrowserProvider,
  amount: bigint,
  binding: LockBinding,
): Promise<TransactionReceipt> {
  return lockToken(provider, getFakeEthAddress(), amount, binding);
}

/**
 * The lock made by a `lock()` transaction, read from its `Locked` event.
 * The nonce names the lock: its Aptos receipt id is
 * `getLockId(depositor, token, nonce)`.
 */
export function lockFromReceipt(receipt: TransactionReceipt): LockFields {
  const iface = new ethers.Interface(LOCKBOX_ABI);
  for (const log of receipt.logs) {
    let parsed: ethers.LogDescription | null = null;
    try {
      parsed = iface.parseLog(log);
    } catch {
      continue;
    }
    if (parsed?.name === "Locked") {
      const a = parsed.args;
      return {
        lockId: a.lockId as string,
        depositor: a.depositor as string,
        token: a.token as string,
        nonce: a.nonce as bigint,
        amount: a.amount as bigint,
        windowId: a.windowId as bigint,
        pairHash: a.pairHash as string,
        deadline: a.deadline as bigint,
      };
    }
  }
  throw new Error(`No Locked event in transaction ${receipt.hash}`);
}

/** Nonce of the lock made by a `lock()` transaction (see `lockFromReceipt`). */
export function lockNonceFromReceipt(receipt: TransactionReceipt): bigint {
  return lockFromReceipt(receipt).nonce;
}

/**
 * `LockBox.statuses(lockId)`: 0 none, 1 open, 2 released, 3 reclaimed
 * (`LOCK_STATUS`).
 */
export async function getLockStatus(
  provider: ethers.Provider,
  lockId: string,
): Promise<number> {
  const contract = new ethers.Contract(
    getLockBoxAddress(),
    LOCKBOX_ABI,
    provider,
  );
  return Number(await contract.statuses(lockId));
}

/** Every lock `depositor` made of `token`, from the `Locked` events. */
export async function getLocks(
  provider: ethers.Provider,
  depositor: string | null,
  token: string,
): Promise<LockFields[]> {
  const contract = new ethers.Contract(
    getLockBoxAddress(),
    LOCKBOX_ABI,
    provider,
  );
  const events = await contract.queryFilter(
    contract.filters.Locked(null, depositor, token),
  );
  return events.map((event) => {
    const a = (event as ethers.EventLog).args;
    return {
      lockId: a.lockId as string,
      depositor: a.depositor as string,
      token: a.token as string,
      nonce: a.nonce as bigint,
      amount: a.amount as bigint,
      windowId: a.windowId as bigint,
      pairHash: a.pairHash as string,
      deadline: a.deadline as bigint,
    };
  });
}

/**
 * Get the FakeETH amount `userAddress` still holds in open locks.
 */
export async function getLockedBalance(
  provider: ethers.Provider,
  userAddress: string,
): Promise<bigint> {
  const locks = await getLocks(provider, userAddress, getFakeEthAddress());
  let total = 0n;
  for (const lock of locks) {
    if ((await getLockStatus(provider, lock.lockId)) === LOCK_STATUS.Open) {
      total += lock.amount;
    }
  }
  return total;
}

// SCOUT(#221) EDIT: the tuple below follows the final LockBox.Lock struct, with or without its deadline.
// SCOUT(#236) EDIT: ReleaseButton calls recordOutcome and releaseByOutcome bindings that do not exist yet; the SDK unwind issue (195) adds them to this file.
/**
 * Return an open lock to its depositor after its deadline (`LockBox.reclaim`).
 * Anyone may send it. This form carries no non-membership proof, so it works
 * only while the lock's auction has no recorded outcome.
 */
export async function reclaimLock(
  provider: ethers.BrowserProvider,
  lock: Omit<LockFields, "lockId">,
): Promise<TransactionReceipt> {
  const lockBox = await getLockBoxWithSigner(provider);
  const tx = await lockBox.reclaim(
    [
      lock.depositor,
      lock.token,
      lock.nonce,
      lock.amount,
      lock.windowId,
      lock.pairHash,
      lock.deadline,
    ],
    [],
  );
  const receipt = await tx.wait();
  if (!receipt) throw new Error("reclaim() tx receipt is null");
  return receipt;
}

/**
 * Get the FakeETH allowance the user has granted to LockBox.
 */
export async function getLockBoxAllowance(
  provider: ethers.Provider,
  userAddress: string,
): Promise<bigint> {
  const fakeEthAddress = getFakeEthAddress();
  const lockBoxAddress = getLockBoxAddress();
  const contract = new ethers.Contract(fakeEthAddress, FAKE_ETH_ABI, provider);
  return contract.allowance(userAddress, lockBoxAddress) as Promise<bigint>;
}

/**
 * Get total FakeETH ever locked by all users in LockBox.
 * Queries all Locked events and sums the amounts.
 */
export async function getTotalLockedEth(
  provider: ethers.Provider,
): Promise<bigint> {
  const locks = await getLocks(provider, null, getFakeEthAddress());
  return locks.reduce((total, lock) => total + lock.amount, 0n);
}

// ── FakeUSD bidder-collateral lock helpers (Phase 3b #87) ──────────────────────

// SCOUT(#234) EDIT: call assertEthereumConfigMatchesPin before the approve is sent.
/**
 * Approve LockBox to spend `amount` of FakeUSD on the bidder's behalf.
 *
 * Must be called before `lockFakeUsd` if the current FakeUSD allowance is
 * insufficient.  Mirrors `approveFakeEth` for the bidder collateral path.
 *
 * @see docs/architecture/v0-architecture.md §2.5 — Bidder Collateral
 */
export async function approveFakeUsd(
  provider: ethers.BrowserProvider,
  amount: bigint,
): Promise<TransactionReceipt> {
  const fakeUsd = await getFakeUsdWithSigner(provider);
  const lockBoxAddress = getLockBoxAddress();

  const tx = await fakeUsd.approve(lockBoxAddress, amount);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("FakeUSD approve() tx receipt is null");
  return receipt;
}

// SCOUT(#234) EDIT: refuses on a pin mismatch, through lockToken.
/**
 * Lock `amount` of FakeUSD in LockBox as bidder collateral margin, into the
 * auction `binding` names.
 *
 * The caller must have approved LockBox for at least `amount` first (via
 * `approveFakeUsd`).  Returns the transaction receipt; its `Locked` event
 * (`lockFromReceipt`) gives the `collateral_lock_id` for `auction::submit_bid`.
 *
 * @see docs/architecture/v0-architecture.md §2.5 — Bidder Collateral
 */
export async function lockFakeUsd(
  provider: ethers.BrowserProvider,
  amount: bigint,
  binding: LockBinding,
): Promise<TransactionReceipt> {
  return lockToken(provider, getFakeUsdAddress(), amount, binding);
}
