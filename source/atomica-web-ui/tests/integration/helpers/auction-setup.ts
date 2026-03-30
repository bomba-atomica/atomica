/**
 * Shared setup helpers for auction browser integration tests (07–10).
 *
 * Provides reusable functions for the test setup chain:
 *
 *   generateEthLockProof()  — Mint → Approve → Lock on Ethereum, generate proof
 *   registerLockOnAptos()   — Register the proof on Aptos under an arbitrary account
 *   setupAuctionState()     — Combined convenience: both steps above using the
 *                             fixture deployer as the Aptos account
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
import { generateLockedBalanceProof } from "../../../src/lib/ethereum/proofs/generator";
import type { LockedBalanceProof } from "../../../src/lib/ethereum/proofs/generator";
import type { IntegrationFixture } from "../fixtures/dual-chain";

// ---------------------------------------------------------------------------
// Minimal ABI fragments
// ---------------------------------------------------------------------------

const ERC20_ABI = [
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
];

const LOCKBOX_ABI = [
  "function lock(address token, uint256 amount) external",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

  const provider = new ethers.JsonRpcProvider(eth.rpcUrl);
  const seller = new ethers.Wallet(eth.seller.privateKey, provider);

  const fakeETH = new ethers.Contract(eth.contracts.fakeETH, ERC20_ABI, seller);
  const lockBox = new ethers.Contract(eth.contracts.lockBox, LOCKBOX_ABI, seller);

  const mintTx = await fakeETH.mint(seller.address, mintAmount);
  await provider.waitForTransaction(mintTx.hash, 1);

  let nonce = await seller.getNonce();
  const approveTx = await fakeETH.approve(eth.contracts.lockBox, lockAmount, {
    nonce: nonce++,
  });
  await provider.waitForTransaction(approveTx.hash, 1);

  const lockTx = await lockBox.lock(eth.contracts.fakeETH, lockAmount, {
    nonce: nonce++,
  });
  const lockReceipt = await provider.waitForTransaction(lockTx.hash, 1);
  const lockBlockNumber = lockReceipt!.blockNumber;

  // Wait for archive proof availability (12 blocks)
  const targetBlock = lockBlockNumber + 12;
  for (let i = 0; i < 180; i++) {
    const current = await provider.getBlockNumber();
    if (current >= targetBlock) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  const proof = await generateLockedBalanceProof(
    provider,
    eth.contracts.lockBox,
    seller.address,
    eth.contracts.fakeETH,
    lockBlockNumber,
  );

  const lockIdData = Buffer.concat([
    Buffer.from(proof.blockHash.slice(2), "hex"),
    Buffer.from(proof.contractAddress.slice(2), "hex"),
    Buffer.from(proof.userAddress.slice(2), "hex"),
    Buffer.from(proof.tokenAddress.slice(2), "hex"),
    Buffer.from(proof.storageKey.slice(2), "hex"),
  ]);
  const lockId = ethers.keccak256(lockIdData);

  return { lockId, proof };
}

/**
 * Register a lock proof on Aptos under the given sender account.
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
 * Create an auction directly (no SIWE) using the deployer's native account.
 * Returns the Aptos transaction hash.
 */
export async function createAuctionDirect(
  aptosClient: Aptos,
  deployer: Account,
  moduleAddr: string,
  lockId: string,
  minPrice: bigint,
  duration: bigint,
): Promise<string> {
  const createTxn = await aptosClient.transaction.build.simple({
    sender: deployer.accountAddress,
    data: {
      function: `${moduleAddr}::auction::create_auction`,
      typeArguments: [],
      functionArguments: [
        ethers.getBytes(lockId),
        minPrice,
        duration,
        new Uint8Array(0),
      ],
    },
  });

  const submitted = await aptosClient.signAndSubmitTransaction({
    signer: deployer,
    transaction: createTxn,
  });

  await aptosClient.waitForTransaction({
    transactionHash: submitted.hash,
    options: { checkSuccess: true },
  });

  return submitted.hash;
}

/**
 * Submit a bid directly (no SIWE) using the given bidder Account.
 */
export async function submitBidDirect(
  aptosClient: Aptos,
  bidder: Account,
  moduleAddr: string,
  sellerAddress: string,
  price: bigint,
): Promise<string> {
  const bidTxn = await aptosClient.transaction.build.simple({
    sender: bidder.accountAddress,
    data: {
      function: `${moduleAddr}::auction::submit_bid`,
      typeArguments: [],
      functionArguments: [sellerAddress, price],
    },
  });

  const submitted = await aptosClient.signAndSubmitTransaction({
    signer: bidder,
    transaction: bidTxn,
  });

  await aptosClient.waitForTransaction({
    transactionHash: submitted.hash,
    options: { checkSuccess: true },
  });

  return submitted.hash;
}

/**
 * Settle an auction directly (no SIWE) using the given settler Account.
 */
export async function settleAuctionDirect(
  aptosClient: Aptos,
  settler: Account,
  moduleAddr: string,
  sellerAddress: string,
): Promise<string> {
  const settleTxn = await aptosClient.transaction.build.simple({
    sender: settler.accountAddress,
    data: {
      function: `${moduleAddr}::auction::settle`,
      typeArguments: [],
      functionArguments: [sellerAddress],
    },
  });

  const submitted = await aptosClient.signAndSubmitTransaction({
    signer: settler,
    transaction: settleTxn,
  });

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
