/**
 * Outcome carrier: brings a validator-signed Aptos `AuctionOutcome` to the
 * Ethereum LockBox, then pays each lock of the auction out per its leaf.
 *
 * Anyone may run it. The carrier holds no authority: LockBox checks every
 * proof through the Aptos light client (signatures of 2/3 of the voting
 * power of the latest known epoch), exactly as for any other sender.
 *
 *   1. Fetch the event proof from `/v1/atomica/event_proof/{version}/{index}`.
 *      A node that pruned the version answers 404 `version_pruned`, so the
 *      carrier asks the next configured node. When no node can serve it the
 *      outcome is unprovable and every lock goes home by reclaim after its
 *      deadline.
 *   2. Advance the light client one epoch at a time, from `latestEpoch()` to
 *      the proof's epoch, with `advanceEpoch` (permissionless).
 *   3. `LockBox.recordOutcome(proof)`. A `StaleEpoch` revert means the
 *      validators changed epoch meanwhile: fetch a fresh proof once and retry.
 *   4. `LockBox.releaseByOutcome` per open lock, with the leaf built from the
 *      per-lock outcomes Aptos stores (`lock_receipt::get_lock_outcome`), or
 *      `LockBox.reclaimUnpayable` for a lock whose leaf is unpayable.
 *
 * Encodings (BCS parsing, EIP-2537 key and signature encodings) follow
 * source/evm-contracts/src/aptos/IAptosLightClient.sol. The golden vector
 * tests/fixtures/outcome_carrier_vectors.json pins the call data byte for
 * byte, and a forge test checks the same file.
 *
 * @see docs/architecture/v0-architecture.md §3
 * @see docs/decisions/trustless-v0-1-unwinding.md
 */

import { ethers } from "ethers";
import { bls12_381 } from "@noble/curves/bls12-381";
import { APTOS_LIGHT_CLIENT_ABI, LOCKBOX_ABI } from "../ethereum/abis.js";
import {
  reclaimUnpayableCall,
  releaseByOutcomeCall,
  type LockBoxCall,
  type LockFields,
} from "../ethereum/lockbox.js";
import {
  buildOutcomeTree,
  outcomeProof,
  type OutcomeEntry,
  type OutcomePayout,
  type OutcomeTree,
} from "./outcome-tree.js";

// ============================================================
// Types
// ============================================================

/** `IAptosLightClient.SignedLedgerInfo`, hex encoded. */
export interface SignedLedgerInfo {
  ledgerInfoWithSignatures: string;
  epochState: string;
  signerPublicKeys: string;
  signature: string;
}

/** `IAptosLightClient.EventProof`, hex encoded. */
export interface EventProof {
  ledgerInfo: SignedLedgerInfo;
  version: bigint;
  transactionInfo: string;
  transactionAccumulatorProof: string;
  eventIndex: bigint;
  contractEvent: string;
  eventAccumulatorProof: string;
}

/** The body of `GET /v1/atomica/event_proof/{version}/{event_index}`. */
export interface NodeEventProof {
  ledger_info_with_signatures: string;
  version: string | number;
  transaction_info: string;
  transaction_accumulator_proof: string;
  event_index: string | number;
  event: string;
  event_accumulator_proof: string;
}

/** The fields of a LedgerInfoWithSignatures the carrier needs. */
export interface ParsedLedgerInfo {
  epoch: bigint;
  version: bigint;
  timestampUsecs: bigint;
  /** BCS of `next_epoch_state` when the LedgerInfo ends its epoch */
  nextEpochState?: Uint8Array;
  bitmask: Uint8Array;
  /** 96-byte compressed aggregate signature */
  signature?: Uint8Array;
}

// ============================================================
// BCS
// ============================================================

class Reader {
  off = 0;
  constructor(readonly b: Uint8Array) {}

  private need(n: number): void {
    if (this.off + n > this.b.length) throw new Error("BCS: out of bounds");
  }

  u8(): number {
    this.need(1);
    return this.b[this.off++];
  }

  u64(): bigint {
    this.need(8);
    let v = 0n;
    for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(this.b[this.off + i]);
    this.off += 8;
    return v;
  }

  skip(n: number): void {
    this.need(n);
    this.off += n;
  }

  len(): number {
    let v = 0;
    let shift = 0;
    for (;;) {
      const byte = this.u8();
      v += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return v;
      shift += 7;
    }
  }

  bytes(): Uint8Array {
    const n = this.len();
    this.need(n);
    const out = this.b.subarray(this.off, this.off + n);
    this.off += n;
    return out;
  }
}

/** Skip one BCS `EpochState { epoch, verifier { validator_infos, ... } }`. */
function skipEpochState(r: Reader): void {
  r.u64();
  const n = r.len();
  for (let i = 0; i < n; i++) {
    r.skip(32); // address
    r.bytes(); // compressed public key
    r.u64(); // voting power
  }
}

/** Parse the BCS of a `LedgerInfoWithSignatures::V0`. */
export function parseLedgerInfoWithSignatures(
  liws: Uint8Array,
): ParsedLedgerInfo {
  const r = new Reader(liws);
  if (r.u8() !== 0)
    throw new Error("LedgerInfoWithSignatures: unknown variant");
  const epoch = r.u64();
  r.skip(8 + 32 + 32); // round, id, executed_state_id
  const version = r.u64();
  const timestampUsecs = r.u64();
  let nextEpochState: Uint8Array | undefined;
  if (r.u8() === 1) {
    const start = r.off;
    skipEpochState(r);
    nextEpochState = liws.slice(start, r.off);
  }
  r.skip(32); // consensus_data_hash
  const bitmask = r.bytes();
  const signature = r.u8() === 1 ? r.bytes() : undefined;
  if (r.off !== liws.length) {
    throw new Error("LedgerInfoWithSignatures: trailing bytes");
  }
  return { epoch, version, timestampUsecs, nextEpochState, bitmask, signature };
}

/** Epoch and compressed validator keys of a BCS `EpochState`. */
export function parseEpochState(bcs: Uint8Array): {
  epoch: bigint;
  compressedKeys: Uint8Array[];
} {
  const r = new Reader(bcs);
  const epoch = r.u64();
  const n = r.len();
  const compressedKeys: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    r.skip(32);
    compressedKeys.push(r.bytes());
    r.u64();
  }
  if (r.off !== bcs.length) throw new Error("EpochState: trailing bytes");
  return { epoch, compressedKeys };
}

// ============================================================
// EIP-2537 encodings
// ============================================================

/** A field element as 64 bytes (16 zero bytes, then 48 big-endian). */
function fp(v: bigint): Uint8Array {
  return ethers.getBytes(ethers.toBeHex(v, 64));
}

/** EIP-2537 G1 encoding (128 bytes) of a 48-byte compressed key. */
function g1Uncompressed(compressed: Uint8Array): Uint8Array {
  const p = bls12_381.G1.ProjectivePoint.fromHex(compressed).toAffine();
  return ethers.getBytes(ethers.concat([fp(p.x), fp(p.y)]));
}

/** EIP-2537 G2 encoding (256 bytes) of a 96-byte compressed signature. */
function g2Uncompressed(compressed: Uint8Array): Uint8Array {
  const p = bls12_381.G2.ProjectivePoint.fromHex(compressed).toAffine();
  return ethers.getBytes(
    ethers.concat([fp(p.x.c0), fp(p.x.c1), fp(p.y.c0), fp(p.y.c1)]),
  );
}

/**
 * The `SignedLedgerInfo` the light client verifies: the LedgerInfo, the full
 * validator set of its epoch, and the uncompressed keys of the signers (in
 * bitmask order) and of the aggregate signature.
 */
export function signedLedgerInfo(
  liws: Uint8Array,
  epochState: Uint8Array,
): SignedLedgerInfo {
  const li = parseLedgerInfoWithSignatures(liws);
  const set = parseEpochState(epochState);
  if (set.epoch !== li.epoch) {
    throw new Error(
      `validator set of epoch ${set.epoch} offered for a LedgerInfo of epoch ${li.epoch}`,
    );
  }
  if (!li.signature) throw new Error("LedgerInfo is unsigned");
  const keys = set.compressedKeys
    .filter((_, i) => ((li.bitmask[i >> 3] ?? 0) & (0x80 >> (i & 7))) !== 0)
    .map(g1Uncompressed);
  return {
    ledgerInfoWithSignatures: ethers.hexlify(liws),
    epochState: ethers.hexlify(epochState),
    signerPublicKeys: ethers.hexlify(ethers.concat(keys)),
    signature: ethers.hexlify(g2Uncompressed(li.signature)),
  };
}

function hex(v: string): string {
  return v.startsWith("0x") ? v.toLowerCase() : `0x${v.toLowerCase()}`;
}

/** The light client `EventProof` of a node proof, signed by `epochState`'s set. */
export function eventProofFromNode(
  node: NodeEventProof,
  epochState: Uint8Array,
): EventProof {
  return {
    ledgerInfo: signedLedgerInfo(
      ethers.getBytes(hex(node.ledger_info_with_signatures)),
      epochState,
    ),
    version: BigInt(node.version),
    transactionInfo: hex(node.transaction_info),
    transactionAccumulatorProof: hex(node.transaction_accumulator_proof),
    eventIndex: BigInt(node.event_index),
    contractEvent: hex(node.event),
    eventAccumulatorProof: hex(node.event_accumulator_proof),
  };
}

const LOCKBOX_INTERFACE = new ethers.Interface(LOCKBOX_ABI);
const LIGHT_CLIENT_INTERFACE = new ethers.Interface(APTOS_LIGHT_CLIENT_ABI);

function signedTuple(s: SignedLedgerInfo) {
  return [
    s.ledgerInfoWithSignatures,
    s.epochState,
    s.signerPublicKeys,
    s.signature,
  ];
}

function proofTuple(p: EventProof) {
  return [
    signedTuple(p.ledgerInfo),
    p.version,
    p.transactionInfo,
    p.transactionAccumulatorProof,
    p.eventIndex,
    p.contractEvent,
    p.eventAccumulatorProof,
  ];
}

/** Call data of `LockBox.recordOutcome(proof)`. */
export function recordOutcomeCalldata(proof: EventProof): string {
  return LOCKBOX_INTERFACE.encodeFunctionData("recordOutcome", [
    proofTuple(proof),
  ]);
}

/** Call data of `AptosLightClient.advanceEpoch(ledgerInfo)`. */
export function advanceEpochCalldata(signed: SignedLedgerInfo): string {
  return LIGHT_CLIENT_INTERFACE.encodeFunctionData("advanceEpoch", [
    signedTuple(signed),
  ]);
}

// ============================================================
// Aptos nodes
// ============================================================

/** No configured node can serve the proof: the lock goes home by reclaim. */
export class UnprovableOutcomeError extends Error {
  constructor(readonly reasons: string[]) {
    super(`no Aptos node can prove the outcome: ${reasons.join("; ")}`);
    this.name = "UnprovableOutcomeError";
  }
}

/** Strip a trailing `/` and `/v1` so paths can be appended. */
export function nodeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/v1$/, "");
}

/**
 * Fetch an event proof, asking each node in turn. A 404 `version_pruned` or a
 * network failure moves on to the next node. Any other error answer is a
 * node bug and also moves on, with its text kept. Throws
 * {@link UnprovableOutcomeError} when no node serves the proof.
 */
export async function fetchEventProof(
  nodes: string[],
  version: bigint,
  eventIndex: bigint,
): Promise<{ node: string; proof: NodeEventProof }> {
  const reasons: string[] = [];
  for (const node of nodes) {
    const url = `${nodeBaseUrl(node)}/v1/atomica/event_proof/${version}/${eventIndex}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      reasons.push(`${node}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (res.ok) return { node, proof: (await res.json()) as NodeEventProof };
    const body = await res.text();
    let code = "";
    try {
      code = String((JSON.parse(body) as { error_code?: unknown }).error_code);
    } catch {
      // not JSON
    }
    reasons.push(
      res.status === 404 && code === "version_pruned"
        ? `${node}: version ${version} pruned`
        : `${node}: HTTP ${res.status} ${body}`,
    );
  }
  throw new UnprovableOutcomeError(reasons);
}

/**
 * The epoch-ending LedgerInfos from `startEpoch` up to, not including,
 * `endEpoch` (`/v1/atomica/epoch_change_proof`). Pages until complete.
 */
export async function fetchEpochChanges(
  node: string,
  startEpoch: bigint,
  endEpoch: bigint,
): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  let next = startEpoch;
  while (next < endEpoch) {
    const url = `${nodeBaseUrl(node)}/v1/atomica/epoch_change_proof?start_epoch=${next}&end_epoch=${endEpoch}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`GET ${url}: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      ledger_infos_with_signatures: string[];
    };
    if (body.ledger_infos_with_signatures.length === 0) {
      throw new Error(`GET ${url}: no epoch change returned`);
    }
    for (const h of body.ledger_infos_with_signatures) {
      const liws = ethers.getBytes(hex(h));
      const epoch = parseLedgerInfoWithSignatures(liws).epoch;
      if (epoch !== next) {
        throw new Error(`GET ${url}: expected epoch ${next}, got ${epoch}`);
      }
      out.push(liws);
      next++;
    }
  }
  return out;
}

// ============================================================
// Carrier
// ============================================================

/**
 * The Ethereum side the carrier writes to. {@link ethersCarrierChain} binds it
 * to a LockBox and its light client. Tests pass a fake.
 */
export interface CarrierChain {
  latestEpoch(): Promise<bigint>;
  advanceEpoch(signed: SignedLedgerInfo): Promise<void>;
  recordOutcome(proof: EventProof): Promise<void>;
}

/** Result of {@link carryOutcome}. */
export type CarryResult =
  | { status: "recorded" | "already-recorded" }
  | { status: "unprovable" | "stale-light-client"; reason: string };

/** Name of a LockBox or light client custom error in a revert, if any. */
export function revertErrorName(e: unknown): string | undefined {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const data = (cur as { data?: unknown }).data;
    if (typeof data === "string" && data.length >= 10) {
      for (const iface of [LOCKBOX_INTERFACE, LIGHT_CLIENT_INTERFACE]) {
        try {
          const parsed = iface.parseError(data);
          if (parsed) return parsed.name;
        } catch {
          // not this interface
        }
      }
    }
    const revert = (cur as { revert?: { name?: unknown } }).revert;
    if (revert && typeof revert.name === "string") return revert.name;
    cur = (cur as { error?: unknown; info?: unknown }).error;
  }
  return undefined;
}

/**
 * Advance the light client to `target` and return the BCS validator set of
 * `target`. Signs each epoch change with the set of its own epoch.
 */
async function advanceTo(
  chain: CarrierChain,
  node: string,
  target: bigint,
): Promise<Uint8Array> {
  let latest = await chain.latestEpoch();
  const start = latest < target ? latest : target;
  if (start === 0n) throw new Error("light client has no epoch 0 set");
  // The LedgerInfo that ended epoch start - 1 names the set of epoch start.
  const changes = await fetchEpochChanges(node, start - 1n, target);
  let set = parseLedgerInfoWithSignatures(changes[0]).nextEpochState;
  for (const liws of changes.slice(1)) {
    if (!set) throw new Error("epoch change has no next epoch state");
    const li = parseLedgerInfoWithSignatures(liws);
    if (li.epoch === latest) {
      try {
        await chain.advanceEpoch(signedLedgerInfo(liws, set));
      } catch (e) {
        // Another carrier advanced the same epoch first: nothing is lost.
        if (revertErrorName(e) !== "EpochAlreadyAdvanced") throw e;
      }
      latest++;
    }
    set = li.nextEpochState;
  }
  if (!set) throw new Error("epoch change has no next epoch state");
  return set;
}

/**
 * Carry the `AuctionOutcome` event at (`version`, `eventIndex`) to LockBox.
 *
 * Advances the light client as needed, then records the outcome. On a
 * `StaleEpoch` revert it fetches a fresh proof once and retries. An outcome
 * someone else recorded counts as done.
 *
 * Returns `unprovable` when no node serves the proof, and
 * `stale-light-client` when the light client passed its age limit. In both
 * cases no outcome can be recorded, and every lock of the auction goes home by
 * `LockBox.reclaim` after its deadline.
 */
export async function carryOutcome(
  chain: CarrierChain,
  nodes: string[],
  version: bigint,
  eventIndex: bigint,
): Promise<CarryResult> {
  for (let attempt = 0; ; attempt++) {
    let fetched: { node: string; proof: NodeEventProof };
    try {
      fetched = await fetchEventProof(nodes, version, eventIndex);
    } catch (e) {
      if (e instanceof UnprovableOutcomeError) {
        return { status: "unprovable", reason: e.message };
      }
      throw e;
    }
    const epoch = parseLedgerInfoWithSignatures(
      ethers.getBytes(hex(fetched.proof.ledger_info_with_signatures)),
    ).epoch;
    try {
      const set = await advanceTo(chain, fetched.node, epoch);
      await chain.recordOutcome(eventProofFromNode(fetched.proof, set));
      return { status: "recorded" };
    } catch (e) {
      const name = revertErrorName(e);
      if (name === "OutcomeAlreadyRecorded") {
        return { status: "already-recorded" };
      }
      if (name === "StaleLightClient") {
        return {
          status: "stale-light-client",
          reason: e instanceof Error ? e.message : String(e),
        };
      }
      if (name === "StaleEpoch" && attempt === 0) continue;
      throw e;
    }
  }
}

/** A {@link CarrierChain} that sends from `signer` to `lockBoxAddress`. */
export async function ethersCarrierChain(
  signer: ethers.Signer,
  lockBoxAddress: string,
): Promise<CarrierChain> {
  const lockBox = new ethers.Contract(lockBoxAddress, LOCKBOX_ABI, signer);
  const lightClient = new ethers.Contract(
    (await lockBox.lightClient()) as string,
    APTOS_LIGHT_CLIENT_ABI,
    signer,
  );
  const send = async (tx: Promise<ethers.ContractTransactionResponse>) => {
    const receipt = await (await tx).wait();
    if (!receipt) throw new Error("carrier transaction has no receipt");
  };
  return {
    latestEpoch: async () => BigInt(await lightClient.latestEpoch()),
    advanceEpoch: (s) => send(lightClient.advanceEpoch(signedTuple(s))),
    recordOutcome: (p) => send(lockBox.recordOutcome(proofTuple(p))),
  };
}

// ============================================================
// Finding the outcome event
// ============================================================

/** Where an `AuctionOutcome` event sits on Aptos. */
export interface OutcomeEventLocation {
  version: bigint;
  eventIndex: bigint;
}

/** Lower-case a Move type tag and drop leading zeros of its address part. */
function normalizeTypeTag(tag: string): string {
  return tag.toLowerCase().replace(/^0x0*/, "0x");
}

/**
 * The `AuctionOutcome` event in one committed transaction (REST JSON, as
 * `GET /v1/transactions/by_hash/{hash}` returns it), or null.
 */
export function outcomeEventInTransaction(
  txn: { version?: unknown; events?: Array<{ type?: unknown }> },
  contractAddress: string,
): OutcomeEventLocation | null {
  const type = normalizeTypeTag(`${contractAddress}::auction::AuctionOutcome`);
  const index = (txn.events ?? []).findIndex(
    (e) => normalizeTypeTag(String(e.type)) === type,
  );
  if (index < 0 || txn.version === undefined) return null;
  return { version: BigInt(String(txn.version)), eventIndex: BigInt(index) };
}

/** Find the `AuctionOutcome` event of a committed transaction by its hash. */
export async function outcomeEventOfTransaction(
  node: string,
  contractAddress: string,
  txnHash: string,
): Promise<OutcomeEventLocation | null> {
  const url = `${nodeBaseUrl(node)}/v1/transactions/by_hash/${txnHash}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return outcomeEventInTransaction(await res.json(), contractAddress);
}

/**
 * Scan committed transactions from `fromVersion` for the `AuctionOutcome` of
 * window (`windowId`, `pairHash`). Returns null when the ledger head is
 * reached first, or after `maxPages` pages of `pageSize`.
 */
export async function findOutcomeEvent(
  node: string,
  contractAddress: string,
  windowId: bigint,
  pairHash: string,
  options: { fromVersion?: bigint; pageSize?: number; maxPages?: number } = {},
): Promise<OutcomeEventLocation | null> {
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 200;
  let next = options.fromVersion ?? 0n;
  for (let page = 0; page < maxPages; page++) {
    const url = `${nodeBaseUrl(node)}/v1/transactions?start=${next}&limit=${pageSize}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
    const txns = (await res.json()) as Array<{
      version?: unknown;
      events?: Array<{ type?: unknown; data?: Record<string, unknown> }>;
    }>;
    for (const txn of txns) {
      const at = outcomeEventInTransaction(txn, contractAddress);
      if (at) {
        const data = txn.events![Number(at.eventIndex)].data ?? {};
        if (
          BigInt(String(data["window_id"])) === windowId &&
          String(data["pair_hash"]).toLowerCase() === pairHash.toLowerCase()
        ) {
          return at;
        }
      }
      next = BigInt(String(txn.version)) + 1n;
    }
    if (txns.length < pageSize) return null;
  }
  return null;
}

// ============================================================
// Release
// ============================================================

/** One lock of an auction with the payouts Aptos recorded for it. */
export interface WindowLockOutcome {
  lockId: string;
  recipients: string[];
  amounts: bigint[];
}

/** The outcome tree of an auction, rebuilt from its per-lock outcomes. */
export function windowOutcomeTree(outcomes: WindowLockOutcome[]): OutcomeTree {
  const entries: OutcomeEntry[] = outcomes.map((o) => ({
    lockId: o.lockId,
    payouts: o.recipients.map((recipient, i) => ({
      recipient,
      amount: o.amounts[i],
    })),
  }));
  return buildOutcomeTree(entries);
}

/** 2^256: a payout sum at or above it overflows LockBox's uint256 sum. */
const UINT256_LIMIT = 1n << 256n;

/**
 * Whether LockBox treats a leaf as unpayable (`LockBox._leafUnpayable`): a
 * zero recipient, or payouts that sum above the lock amount or overflow
 * uint256. `releaseByOutcome` reverts on such a leaf, and
 * `reclaimUnpayable` sends the whole lock to its depositor instead. A sum
 * below the amount is payable: the remainder goes to the depositor.
 */
export function isLeafUnpayable(
  amount: bigint,
  payouts: OutcomePayout[],
): boolean {
  let sum = 0n;
  for (const p of payouts) {
    if (BigInt(p.recipient) === 0n) return true;
    sum += p.amount;
  }
  return sum >= UINT256_LIMIT || sum > amount;
}

/**
 * The calls that close every open lock of an auction: `releaseByOutcome`
 * for a payable leaf, `reclaimUnpayable` for an unpayable one
 * ({@link isLeafUnpayable}).
 *
 * `outcomes` lists every lock of the auction (the tree has one leaf per
 * lock). `openLocks` are the locks still open on Ethereum, with their fields
 * from the `Locked` events. Throws when the rebuilt root differs from the
 * recorded one, so a wrong read never sends a call that would revert.
 */
export function planWindowReleases(input: {
  lockBoxAddress: string;
  outcomes: WindowLockOutcome[];
  openLocks: LockFields[];
  recordedRoot: string;
}): LockBoxCall[] {
  const tree = windowOutcomeTree(input.outcomes);
  if (tree.root.toLowerCase() !== input.recordedRoot.toLowerCase()) {
    throw new Error(
      `outcome root ${tree.root} rebuilt from Aptos differs from the recorded ${input.recordedRoot}`,
    );
  }
  return input.openLocks.map((lock) => {
    const id = ethers.hexlify(ethers.getBytes(lock.lockId));
    const index = tree.leaves.findIndex((l) => l.lockId === id);
    if (index < 0) throw new Error(`lock ${id} is not in the outcome tree`);
    const outcome = input.outcomes.find(
      (o) => ethers.hexlify(ethers.getBytes(o.lockId)) === id,
    )!;
    const payouts = outcome.recipients.map((recipient, i) => ({
      recipient,
      amount: outcome.amounts[i],
    }));
    const call = isLeafUnpayable(lock.amount, payouts)
      ? reclaimUnpayableCall
      : releaseByOutcomeCall;
    return call(input.lockBoxAddress, lock, payouts, {
      index,
      proof: outcomeProof(tree, index),
    });
  });
}
