/**
 * Shared setup helpers for auction browser integration tests (07–10).
 *
 * Provides reusable functions for the test setup chain:
 *
 *   generateEthLockProof()  — Mint → Approve → Lock on Ethereum, generate storage proof
 *                             (runs via vitest browser command on Node.js side to avoid
 *                             @ethereumjs/util EventEmitter incompatibility in browser)
 *   registerLockOnAptos()   — Register the proof on Aptos using an authorized
 *                             Demo-phase signer (`@atomica` deployer or the
 *                             zero-padded Ethereum address from the proof)
 *   setupAuctionState()     — Combined convenience: both steps above using the
 *                             fixture deployer as the Aptos signer
 *
 * All Aptos calls here use Account.fromPrivateKey + signAndSubmitTransaction
 * (no SIWE / MetaMask).  The UI callbacks in actual test cases DO go through
 * SIWE so the wallet mock must be set up before those calls.
 */

import { ethers } from "ethers";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import { commands } from "vitest/browser";
import type { EthLockProofResult as CommandEthLockProofResult } from "@atomica/aptos-docker-testnet/browser-commands";
import type { IntegrationFixture } from "../fixtures/dual-chain";

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

export interface AuctionSetupResult extends EthLockProofResult {
  /** Aptos client pointed at the testnet Aptos node */
  aptosClient: Aptos;
  /** Deployer Account for direct Aptos signing (no SIWE) */
  deployerAccount: Account;
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
 * @param fixture    - Dual-chain integration fixture
 * @param lockAmount - Amount of FakeETH to lock (wei, default: 10 ETH)
 * @param mintAmount - Amount of FakeETH to mint (wei, default: 1000 ETH)
 */
export async function generateEthLockProof(
  fixture: IntegrationFixture,
  lockAmount: bigint = ethers.parseEther("10"),
  mintAmount: bigint = ethers.parseEther("1000"),
): Promise<EthLockProofResult> {
  const { eth } = fixture;

  const result: CommandEthLockProofResult = await commands.generateEthLockProof(
    eth.rpcUrl,
    eth.seller.privateKey,
    eth.contracts.fakeETH,
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
 * Register a lock proof on Aptos under the given sender account.
 *
 * Demo-phase authorization is stricter than the generic signature suggests:
 * `lock_receipt::register_ethereum_lock` only accepts the zero-padded Ethereum
 * address embedded in the proof or the `@atomica` deployer/admin account.
 *
 * @param aptosClient - Aptos client
 * @param sender      - Account to sign the register transaction
 * @param moduleAddr  - Atomica module address
 * @param proof       - Storage proof returned by generateEthLockProof
 */
export async function registerLockOnAptos(
  aptosClient: Aptos,
  sender: Account,
  moduleAddr: string,
  proof: LockedBalanceProof,
): Promise<void> {
  const registerTxn = await aptosClient.transaction.build.simple({
    sender: sender.accountAddress,
    data: {
      function: `${moduleAddr}::lock_receipt::register_ethereum_lock`,
      typeArguments: [`${moduleAddr}::lock_receipt::FakeETH`],
      functionArguments: [
        proof.blockNumber,
        ethers.getBytes(proof.blockHash),
        ethers.getBytes(proof.stateRoot),
        ethers.getBytes(proof.contractAddress),
        ethers.getBytes(proof.userAddress),
        ethers.getBytes(proof.tokenAddress),
        ethers.getBytes(proof.storageKey),
        proof.storageValue.toString(),
        proof.accountProof.map((p: string) => ethers.getBytes(p)),
        proof.storageProof.map((p: string) => ethers.getBytes(p)),
      ],
    },
  });

  const submitted = await aptosClient.signAndSubmitTransaction({
    signer: sender,
    transaction: registerTxn,
  });

  await aptosClient.waitForTransaction({
    transactionHash: submitted.hash,
    options: { checkSuccess: true },
  });
}

/**
 * Execute the full Ethereum lock → Aptos proof registration flow using the
 * deployer's Ed25519 account as the Aptos sender.
 *
 * @param fixture    - Dual-chain integration fixture
 * @param lockAmount - Amount of FakeETH to lock (wei, default: 10 ETH)
 * @param mintAmount - Amount of FakeETH to mint (wei, default: 1000 ETH)
 */
export async function setupAuctionState(
  fixture: IntegrationFixture,
  lockAmount: bigint = ethers.parseEther("10"),
  mintAmount: bigint = ethers.parseEther("1000"),
): Promise<AuctionSetupResult> {
  const { aptos: aptosInfo } = fixture;

  // Step 1: Ethereum lock + proof (no Aptos registration yet)
  const { lockId, proof } = await generateEthLockProof(
    fixture,
    lockAmount,
    mintAmount,
  );

  // Step 2: Aptos client + deployer account
  const aptosConfig = new AptosConfig({
    network: Network.LOCAL,
    fullnode: aptosInfo.nodeUrl,
  });
  const aptosClient = new Aptos(aptosConfig);

  const deployerAccount = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(aptosInfo.deployerPrivateKey),
  });

  // Step 3: Register the lock under the deployer account
  await registerLockOnAptos(
    aptosClient,
    deployerAccount,
    aptosInfo.moduleAddress,
    proof,
  );

  return { lockId, proof, aptosClient, deployerAccount };
}

/**
 * Default pair BCS bytes used by test helpers.
 *
 * Phase 3a scaffold: all entry functions abort with E_NOT_IMPLEMENTED (99),
 * so the actual pair value does not matter for tests. An empty byte array
 * is accepted by the Move ABI parser.
 */
export const TEST_PAIR_BCS = new Uint8Array(0);

/**
 * Default window ID used by test helpers (Phase 3a scaffold).
 *
 * The value 0 is passed to the new v0 Beta function signatures. Since all
 * entry functions abort with E_NOT_IMPLEMENTED, the window ID is never
 * validated on-chain in this phase.
 */
export const TEST_WINDOW_ID = 0n;

/**
 * Create an auction directly (no SIWE) using the deployer's native account.
 *
 * v0 Beta signature: create_auction(seller, window_id, pair_bcs, lock_id, min_price, mpk_bytes)
 *
 * Phase 3a: the body aborts with E_NOT_IMPLEMENTED (99). This helper uses
 * Throws if the transaction aborts (including Phase 3a E_NOT_IMPLEMENTED).
 *
 * Returns the Aptos transaction hash.
 */
export async function createAuctionDirect(
  aptosClient: Aptos,
  deployer: Account,
  moduleAddr: string,
  lockId: string,
  minPrice: bigint,
  _duration: bigint,
  windowId: bigint = TEST_WINDOW_ID,
  pairBcs: Uint8Array = TEST_PAIR_BCS,
): Promise<string> {
  const createTxn = await aptosClient.transaction.build.simple({
    sender: deployer.accountAddress,
    data: {
      function: `${moduleAddr}::auction::create_auction`,
      typeArguments: [],
      functionArguments: [
        windowId,
        pairBcs,
        ethers.getBytes(lockId),
        minPrice,
        new Uint8Array(0), // mpk_bytes
      ],
    },
  });

  const submitted = await aptosClient.signAndSubmitTransaction({
    signer: deployer,
    transaction: createTxn,
  });

  // Phase 3a: the scaffold body aborts with E_NOT_IMPLEMENTED (99).
  // checkSuccess: true causes waitForTransaction to throw on abort.
  // Tests that rely on successful setup must catch this error.
  await aptosClient.waitForTransaction({
    transactionHash: submitted.hash,
    options: { checkSuccess: true },
  });

  return submitted.hash;
}

/**
 * Submit a bid directly (no SIWE) using the given bidder Account.
 *
 * v0 Beta signature: submit_bid(bidder, window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id)
 *
 * Phase 3a: the body aborts with E_NOT_IMPLEMENTED (99). This helper uses
 * Throws if the transaction aborts (including Phase 3a E_NOT_IMPLEMENTED).
 */
export async function submitBidDirect(
  aptosClient: Aptos,
  bidder: Account,
  moduleAddr: string,
  _sellerAddress: string,
  _price: bigint,
  windowId: bigint = TEST_WINDOW_ID,
  pairBcs: Uint8Array = TEST_PAIR_BCS,
): Promise<string> {
  const bidTxn = await aptosClient.transaction.build.simple({
    sender: bidder.accountAddress,
    data: {
      function: `${moduleAddr}::auction::submit_bid`,
      typeArguments: [],
      functionArguments: [
        windowId,
        pairBcs,
        new Uint8Array(0), // u_bytes (IBE ephemeral point)
        new Uint8Array(0), // ciphertext
        new Uint8Array(0), // collateral_lock_id
      ],
    },
  });

  const submitted = await aptosClient.signAndSubmitTransaction({
    signer: bidder,
    transaction: bidTxn,
  });

  // Phase 3a: the scaffold body aborts with E_NOT_IMPLEMENTED (99).
  // checkSuccess: true causes waitForTransaction to throw on abort.
  await aptosClient.waitForTransaction({
    transactionHash: submitted.hash,
    options: { checkSuccess: true },
  });

  return submitted.hash;
}

/**
 * Settle an auction directly (no SIWE) using the given settler Account.
 *
 * v0 Beta signature: settle(caller, window_id, pair_bcs)
 *
 * Phase 3a: the body aborts with E_NOT_IMPLEMENTED (99). This helper uses
 * Throws if the transaction aborts (including Phase 3a E_NOT_IMPLEMENTED).
 */
export async function settleAuctionDirect(
  aptosClient: Aptos,
  settler: Account,
  moduleAddr: string,
  _sellerAddress: string,
  windowId: bigint = TEST_WINDOW_ID,
  pairBcs: Uint8Array = TEST_PAIR_BCS,
): Promise<string> {
  const settleTxn = await aptosClient.transaction.build.simple({
    sender: settler.accountAddress,
    data: {
      function: `${moduleAddr}::auction::settle`,
      typeArguments: [],
      functionArguments: [windowId, pairBcs],
    },
  });

  const submitted = await aptosClient.signAndSubmitTransaction({
    signer: settler,
    transaction: settleTxn,
  });

  // Phase 3a: the scaffold body aborts with E_NOT_IMPLEMENTED (99).
  // checkSuccess: true causes waitForTransaction to throw on abort.
  await aptosClient.waitForTransaction({
    transactionHash: submitted.hash,
    options: { checkSuccess: true },
  });

  return submitted.hash;
}

/**
 * Call an Aptos view function and return the raw result array.
 */
export async function viewFunction(
  aptosClient: Aptos,
  functionName: string,
  typeArguments: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functionArguments: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const result = await aptosClient.view({
    payload: { function: functionName, typeArguments, functionArguments },
  });
  return result;
}
