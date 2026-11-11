/**
 * Browser Commands - RPC Bridge for Browser Tests
 *
 * This module provides WRAPPERS around test-utils/localnet.ts functions that can be
 * called from BROWSER TESTS via Vitest's browser command mechanism (RPC).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CRITICAL CONCEPT: Remote Procedure Call (RPC) Bridge
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS:
 * Browser tests run in Chromium, but certain operations MUST run in Node.js:
 * - Starting/stopping localnet (requires child_process)
 * - Running Aptos CLI commands (requires filesystem access)
 * - Funding accounts (requires HTTP server requests)
 *
 * HOW IT WORKS:
 *   1. Browser test calls: await commands.setupLocalnet()
 *   2. Vitest sends RPC from browser → Node.js server
 *   3. Node.js executes: setupLocalnetCommand()
 *   4. setupLocalnetCommand() calls: setupLocalnet() from ./localnet.ts
 *   5. Result returns to browser via RPC
 *   6. Browser test continues
 *
 * THE PATTERN:
 *
 *   Browser Test (Chromium)           Node.js Server
 *   ====================              ===============
 *
 *   commands.setupLocalnet()    →     setupLocalnetCommand()
 *                                            ↓
 *                                     setupLocalnet()  (from ./localnet.ts)
 *                                            ↓
 *   return { success: true }    ←     return { success: true }
 *
 * USAGE IN BROWSER TESTS:
 *
 *   import { commands } from 'vitest/browser';
 *
 *   describe.sequential("My Browser Test", () => {
 *     beforeAll(async () => {
 *       // This code runs in browser, but setupLocalnet() executes in Node.js
 *       await commands.setupLocalnet();
 *     }, 120000);
 *
 *     it("should test something", async () => {
 *       // Fund account (executes in Node.js)
 *       await commands.fundAccount("0x123...", 1_000_000_000);
 *
 *       // Now test browser-side code...
 *     });
 *   });
 *
 * HOW COMMANDS ARE REGISTERED:
 *
 * These BrowserCommand exports are registered in vitest.config.ts:
 *
 *   export default defineConfig({
 *     test: {
 *       browser: {
 *         commands: {
 *           setupLocalnet: setupLocalnetCommand,    // ← This file
 *           fundAccount: fundAccountCommand,        // ← This file
 *           // ...
 *         }
 *       }
 *     }
 *   });
 *
 * Then accessible in browser tests via:
 *   import { commands } from 'vitest/browser';
 *   commands.setupLocalnet()  // RPC to setupLocalnetCommand
 *
 * IMPORTANT FOR AI AGENTS:
 *
 * 1. This file is for BROWSER TESTS only
 *    - Meta tests import from ./localnet.ts directly
 *    - Browser tests use commands.* (RPC to this file)
 *
 * 2. These are WRAPPERS, not implementations
 *    - Real logic is in ./localnet.ts
 *    - These just proxy function calls via RPC
 *    - Add logging for visibility
 *
 * 3. Return values must be JSON-serializable
 *    - Sent over RPC from Node.js to browser
 *    - Can't return functions, classes, or complex objects
 *    - Keep it simple: { success: boolean, data?: any }
 *
 * 4. When adding new commands:
 *    - Export const myCommand: BrowserCommand<[args]>
 *    - Register in vitest.config.ts commands object
 *    - Document with clear @param and @returns
 *
 * SEE ALSO:
 * - test-utils/localnet.ts - Implementation of all functions
 * - vitest.config.ts - Where these commands are registered
 * - tests/README.md#understanding-browser-commands-architecture
 * - tests/README.md#two-ways-to-use-localnet
 */

import type { BrowserCommand } from "vitest/node";
import {
    setupLocalnet,
    // teardownLocalnet, // Unused in persistent mode
    deployContracts,
    fundAccount,
    // killZombies, // Unused - setupLocalnet handles cleanup internally
} from "./localnet.js";
import { setupEthereumTestnet, teardownEthereumTestnet } from "./ethereum-testnet.js";
import { setupDualChainTestnet, teardownDualChainTestnet } from "./dual-chain-testnet.js";
import type { DualChainTestnetInfo } from "./dual-chain-testnet.js";
import { ethers } from "ethers";
import { waitForCertifiedEthBlock, waitForEthBlock } from "./eth-blocks.js";
import { currentWindowId, lockBinding, type LockBinding } from "@atomica/sdk/ethereum/lock-binding";

/**
 * Module augmentation to add our custom commands to Vitest's browser commands types.
 * This provides TypeScript autocomplete and type checking in browser tests.
 */
export interface EthereumTestnetInfo {
    rpcUrl: string;
    fakeETH: string;
    fakeUSD: string;
    signerPrivateKey: string;
    chainId: number;
}

/**
 * Serializable result of generateEthLockProofCommand.
 * Big integers are decimal strings to survive JSON serialisation over the RPC
 * bridge (bigint cannot be transferred as-is).
 */
export interface EthLockProofResult {
    /** LockBox.getLockId(user, token, nonce): the Aptos receipt id */
    lockId: string;
    proof: {
        blockNumber: number;
        blockHash: string;
        /** The root the validators certified for blockNumber (0x1::ethereum_headers) */
        stateRoot: string;
        contractAddress: string;
        userAddress: string;
        tokenAddress: string;
        /** decimal string of the lock's LockBox nonce */
        lockNonce: string;
        lockId: string;
        /** decimal string of the locked amount */
        amount: string;
        /** decimal string of the auction window the lock is bound to */
        windowId: string;
        /** keccak256 of the window's pair BCS */
        pairHash: string;
        /** decimal string of the lock deadline: auction::eth_lock_deadline(windowId) */
        deadline: string;
        /** storage key of LockBox.commitments[lockId] (slot 0) */
        storageKey: string;
        /** decimal string of the proven commitment */
        storageValue: string;
        accountProof: string[];
        storageProof: string[];
        timestamp: number;
        generatedAt: number;
    };
}

export type { DualChainTestnetInfo };

declare module "vitest/browser" {
    interface BrowserCommands {
        setupLocalnet(): Promise<{ success: boolean }>;
        teardownLocalnet(): Promise<{ success: boolean }>;
        deployContracts(): Promise<{ success: boolean }>;
        fundAccount(
            address: string,
            amount?: number,
        ): Promise<{ success: boolean; txHash: string }>;
        setupDualChainTestnet(siweDomain?: string): Promise<DualChainTestnetInfo>;
        teardownDualChainTestnet(): Promise<{ success: boolean }>;
        setupEthereumTestnet(): Promise<EthereumTestnetInfo>;
        teardownEthereumTestnet(): Promise<void>;
        generateEthLockProof(
            rpcUrl: string,
            aptosNodeUrl: string,
            sellerPrivateKey: string,
            fakeETHAddress: string,
            lockBoxAddress: string,
            lockAmountWei?: string,
            mintAmountWei?: string,
            pairBcsHex?: string,
        ): Promise<EthLockProofResult>;
        generateEthLockProofs(
            rpcUrl: string,
            aptosNodeUrl: string,
            sellerPrivateKey: string,
            tokenAddress: string,
            lockBoxAddress: string,
            lockAmountWei: string,
            count: number,
            pairBcsHex?: string,
        ): Promise<EthLockProofResult[]>;
    }
}

/**
 * Start the local Aptos testnet.
 *
 * WHAT IT DOES:
 * - Calls setupLocalnet() from ./localnet.ts
 * - Starts localnet on ports 8080 (API) and 8081 (faucet)
 * - Waits for readiness (~10-15 seconds)
 * - Idempotent (safe to call multiple times)
 *
 * USAGE (from browser tests):
 *   import { commands } from 'vitest/browser';
 *   await commands.setupLocalnet();
 *
 * EXECUTION:
 * - Runs in Node.js (not browser)
 * - Browser test waits for RPC to complete
 *
 * @returns Promise resolving to { success: true }
 * @throws Error if localnet fails to start
 *
 * See: test-utils/localnet.ts#setupLocalnet for implementation
 * See: tests/README.md#browser-commands for architecture
 */
export const setupLocalnetCommand: BrowserCommand<[]> = async () => {
    // setupLocalnet internally calls killZombies to ensure ports are free
    await setupLocalnet();
    return { success: true };
};

/**
 * Stop the local Aptos testnet.
 *
 * NOTE: Currently a no-op in persistent mode.
 * Localnet stays running between tests for performance.
 *
 * USAGE (from browser tests):
 *   import { commands } from 'vitest/browser';
 *   await commands.teardownLocalnet();
 *
 * @returns Promise resolving to { success: true }
 */
export const teardownLocalnetCommand: BrowserCommand<[]> = async () => {
    // Only teardown if this is the last test file running
    // In persistent mode, we skip teardown between individual test files
    // but still need to cleanup when all tests are done
    return { success: true };
};

/**
 * Deploy Atomica contracts to localnet.
 *
 * WHAT IT DOES:
 * - Calls deployContracts() from ./localnet.ts
 * - Deploys registry, fake_eth, fake_usd modules
 * - Initializes all modules
 * - Takes ~30-60 seconds
 *
 * USAGE (from browser tests):
 *   import { commands } from 'vitest/browser';
 *   await commands.setupLocalnet();
 *   await commands.deployContracts();
 *
 * IMPORTANT:
 * - Must call setupLocalnet() first
 * - Idempotent (deploys only once)
 *
 * @returns Promise resolving to { success: true }
 * @throws Error if deployment fails
 *
 * See: test-utils/localnet.ts#deployContracts for implementation
 */
export const deployContractsCommand: BrowserCommand<[]> = async () => {
    await deployContracts();
    return { success: true };
};

/**
 * Fund an account via the localnet faucet.
 *
 * WHAT IT DOES:
 * - Calls fundAccount() from ./localnet.ts
 * - Makes HTTP POST to http://127.0.0.1:8081/mint
 * - Creates account if needed
 * - Retries up to 3 times on failure
 *
 * USAGE (from browser tests):
 *   import { commands } from 'vitest/browser';
 *   const result = await commands.fundAccount("0x123...", 1_000_000_000);
 *   console.log(result.txHash);
 *
 * IMPORTANT:
 * - Amount is in octas (1 APT = 100_000_000 octas)
 * - Wait ~1 second after funding before checking balance
 *
 * @param _context - Vitest browser context (unused)
 * @param address - Aptos account address (0x... format)
 * @param amount - Amount in octas (default: 100_000_000 = 1 APT)
 * @returns Promise resolving to { success: true, txHash: string }
 * @throws Error if funding fails after all retries
 *
 * See: test-utils/localnet.ts#fundAccount for implementation
 */
export const fundAccountCommand: BrowserCommand<[address: string, amount?: number]> = async (
    _context: unknown,
    address: string,
    amount: number = 100_000_000,
) => {
    const result = await fundAccount(address, amount);
    return { success: true, txHash: result };
};

/**
 * Start an Ethereum Docker testnet and deploy FakeETH + FakeUSD contracts.
 *
 * Returns JSON-serializable connection info so the browser test can set up
 * its wallet mock and verify on-chain balances.
 *
 * EXECUTION: Node.js (browser can't start Docker containers)
 */
export const setupEthereumTestnetCommand: BrowserCommand<[]> = async () => {
    return await setupEthereumTestnet();
};

/**
 * Tear down the Ethereum Docker testnet started by setupEthereumTestnetCommand.
 *
 * EXECUTION: Node.js
 */
export const teardownEthereumTestnetCommand: BrowserCommand<[]> = async () => {
    await teardownEthereumTestnet();
    return { success: true };
};

/**
 * Start both Ethereum and Aptos Docker testnets, deploy all contracts, and
 * fund the seller and bidder test accounts.
 *
 * Returns JSON-serialisable connection info so the browser-side fixture can
 * create wallet mocks and call contracts via RPC.
 *
 * EXECUTION: Node.js (browser can't start Docker containers)
 */
export const setupDualChainTestnetCommand: BrowserCommand<[siweDomain?: string]> = async (
    _ctx,
    siweDomain?: string,
) => {
    return await setupDualChainTestnet(siweDomain);
};

/**
 * Tear down both testnets started by setupDualChainTestnetCommand.
 *
 * EXECUTION: Node.js
 */
export const teardownDualChainTestnetCommand: BrowserCommand<[]> = async () => {
    await teardownDualChainTestnet();
    return { success: true };
};

// ---------------------------------------------------------------------------
// Minimal ABI fragments for LockBox proof generation
// ---------------------------------------------------------------------------

const ERC20_MINT_ABI = [
    "function mint(address to, uint256 amount) external",
    "function approve(address spender, uint256 amount) external returns (bool)",
];

const LOCKBOX_LOCK_ABI = [
    "function lock(address token, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 deadline) returns (bytes32)",
    "event Locked(bytes32 indexed lockId, address indexed depositor, address indexed token, uint256 nonce, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 deadline)",
];

/**
 * The binding of a test lock: the current window by the wall clock (the
 * `auction::current_window_id` formula) and the pair BCS of the window the
 * test claims the lock into (`pairBcsHex`, empty by default). Aptos claims a
 * lock only into the window and pair it is bound to (issue 194). Its deadline
 * is `auction::eth_lock_deadline(windowId)`, 72 hours past the window close,
 * so Aptos registers it and it cannot be reclaimed during a test.
 */
export function testLockBinding(pairBcsHex: string = "0x"): LockBinding {
    return lockBinding(currentWindowId(BigInt(Math.floor(Date.now() / 1000))), ethers.getBytes(pairBcsHex));
}

/**
 * Lock `count` times and return the storage proof of each lock.
 *
 * Steps:
 *   1. Mint the token to the signer
 *   2. Approve LockBox for count * lockAmount
 *   3. Send `count` LockBox.lock() calls with consecutive nonces, bound to
 *      `testLockBinding()`
 *   4. Read each lock nonce from its Locked event
 *   5. Wait 12 blocks past the last lock for archive proof availability
 *   6. Wait until the Aptos validators certify a block at or after the last
 *      lock (0x1::ethereum_headers), and take the highest certified block
 *   7. Fetch one eth_getProof of every commitments[lockId] at that certified
 *      block, where lockId = keccak256(abi.encodePacked(user, token,
 *      uint256(nonce))) (LockBox.getLockId, eth_proof::lock_id)
 *
 * All proofs share one certified block. No one submits a header: Aptos reads
 * the root the validators certified.
 */
async function lockAndProve(
    rpcUrl: string,
    aptosNodeUrl: string,
    sellerPrivateKey: string,
    tokenAddress: string,
    lockBoxAddress: string,
    lockAmount: bigint,
    mintAmount: bigint,
    count: number,
    pairBcsHex: string = "0x",
): Promise<EthLockProofResult[]> {
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
    const seller = new ethers.Wallet(sellerPrivateKey, provider);

    const token = new ethers.Contract(tokenAddress, ERC20_MINT_ABI, seller);
    const lockBox = new ethers.Contract(lockBoxAddress, LOCKBOX_LOCK_ABI, seller);

    // Mint tokens
    const mintTx = await (
        token.mint as (to: string, amount: bigint) => Promise<ethers.ContractTransactionResponse>
    )(seller.address, mintAmount);
    await provider.waitForTransaction(mintTx.hash, 1);

    let nonce = await seller.getNonce();
    const approveTx = await (
        token.approve as (
            spender: string,
            amount: bigint,
            opts: { nonce: number },
        ) => Promise<ethers.ContractTransactionResponse>
    )(lockBoxAddress, lockAmount * BigInt(count), { nonce: nonce++ });
    await provider.waitForTransaction(approveTx.hash, 1);

    const binding = testLockBinding(pairBcsHex);
    const lockHashes: string[] = [];
    for (let i = 0; i < count; i++) {
        const lockTx = await (
            lockBox.lock as (
                token: string,
                amount: bigint,
                windowId: bigint,
                pairHash: string,
                deadline: bigint,
                opts: { nonce: number },
            ) => Promise<ethers.ContractTransactionResponse>
        )(tokenAddress, lockAmount, binding.windowId, binding.pairHash, binding.deadline, {
            nonce: nonce++,
        });
        lockHashes.push(lockTx.hash);
    }

    const lockIface = new ethers.Interface(LOCKBOX_LOCK_ABI);
    const lockNonces: bigint[] = [];
    let proofBlockNumber = 0;
    for (const hash of lockHashes) {
        const receipt = await provider.waitForTransaction(hash, 1);
        if (!receipt || receipt.status !== 1) throw new Error(`Lock ${hash} failed`);
        const lockLog = receipt.logs
            .map((log) => lockIface.parseLog(log))
            .find((parsed) => parsed?.name === "Locked");
        if (!lockLog) throw new Error(`No Locked event in ${hash}`);
        lockNonces.push(lockLog.args.nonce as bigint);
        proofBlockNumber = Math.max(proofBlockNumber, receipt.blockNumber);
    }

    // Wait for archive proof availability (12 blocks). Mines them on anvil.
    await waitForEthBlock(provider, proofBlockNumber + 12, 300, "Lock Proof");

    // Prove at a block the validators certified that includes every lock.
    const lastLockBlock = proofBlockNumber;
    proofBlockNumber = await waitForCertifiedEthBlock(
        aptosNodeUrl,
        lastLockBlock,
        300,
        "Lock Proof",
    );
    console.log(
        `[Lock Proof] Locks mined by block ${lastLockBlock}; proving at certified block ${proofBlockNumber}`,
    );

    // Storage key of commitments[lockId] (LockBox slot 0), as Aptos derives it.
    const lockIds = lockNonces.map((lockNonce) =>
        ethers.keccak256(
            ethers.solidityPacked(
                ["address", "address", "uint256"],
                [ethers.getAddress(seller.address), ethers.getAddress(tokenAddress), lockNonce],
            ),
        ),
    );
    const storageKeys = lockIds.map((lockId) =>
        ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [lockId, 0]),
        ),
    );

    // Fetch block to get blockHash and stateRoot
    const block = await provider.getBlock(proofBlockNumber);
    if (!block) {
        throw new Error(`Block ${proofBlockNumber} not found`);
    }
    if (!block.hash || !block.stateRoot) {
        throw new Error(`Block ${proofBlockNumber} missing hash or stateRoot`);
    }

    // Fetch storage proofs via eth_getProof directly (avoids @ethereumjs dependency)
    const ethProof = await provider.send("eth_getProof", [
        lockBoxAddress,
        storageKeys,
        `0x${proofBlockNumber.toString(16)}`,
    ]);

    return lockIds.map((lockId, i) => ({
        lockId,
        proof: {
            blockNumber: proofBlockNumber,
            blockHash: block.hash!,
            stateRoot: block.stateRoot!,
            contractAddress: ethers.getAddress(lockBoxAddress),
            userAddress: ethers.getAddress(seller.address),
            tokenAddress: ethers.getAddress(tokenAddress),
            lockNonce: lockNonces[i].toString(),
            lockId,
            amount: lockAmount.toString(),
            windowId: binding.windowId.toString(),
            pairHash: binding.pairHash,
            deadline: binding.deadline.toString(),
            storageKey: storageKeys[i],
            storageValue: BigInt(ethProof.storageProof[i].value).toString(),
            accountProof: ethProof.accountProof as string[],
            storageProof: ethProof.storageProof[i].proof as string[],
            timestamp: block.timestamp,
            generatedAt: Date.now(),
        },
    }));
}

/**
 * Generate the Ethereum storage proof of one LockBox lock.
 *
 * This command runs on the Node.js side because @ethereumjs/util (used
 * transitively by @atomica/state-proof-verifier) accesses Node's EventEmitter
 * which is not available in browser context.
 *
 * Mints, approves, locks once, waits 12 blocks and for a certified block,
 * and proves the lock there (see lockAndProve).
 *
 * Returns a JSON-serialisable result (storageValue as decimal string).
 *
 * EXECUTION: Node.js (browser can't use @ethereumjs/* via EventEmitter)
 */
export const generateEthLockProofCommand: BrowserCommand<
    [
        rpcUrl: string,
        aptosNodeUrl: string,
        sellerPrivateKey: string,
        fakeETHAddress: string,
        lockBoxAddress: string,
        lockAmountWei?: string,
        mintAmountWei?: string,
        pairBcsHex?: string,
    ]
> = async (
    _ctx,
    rpcUrl: string,
    aptosNodeUrl: string,
    sellerPrivateKey: string,
    fakeETHAddress: string,
    lockBoxAddress: string,
    lockAmountWei: string = ethers.parseEther("10").toString(),
    mintAmountWei: string = ethers.parseEther("1000").toString(),
    pairBcsHex: string = "0x",
): Promise<EthLockProofResult> => {
    const [result] = await lockAndProve(
        rpcUrl,
        aptosNodeUrl,
        sellerPrivateKey,
        fakeETHAddress,
        lockBoxAddress,
        BigInt(lockAmountWei),
        BigInt(mintAmountWei),
        1,
        pairBcsHex,
    );
    return result;
};

/**
 * Lock `count` times in a few blocks and prove every lock at one block.
 *
 * A 100-bid window needs 100 collateral locks. One lock at a time takes about
 * 15 slots each on the Docker chain; this takes about 15 slots in total.
 * Mints exactly `count * lockAmount`.
 *
 * EXECUTION: Node.js (browser can't use @ethereumjs/* via EventEmitter)
 */
export const generateEthLockProofsCommand: BrowserCommand<
    [
        rpcUrl: string,
        aptosNodeUrl: string,
        sellerPrivateKey: string,
        tokenAddress: string,
        lockBoxAddress: string,
        lockAmountWei: string,
        count: number,
        pairBcsHex?: string,
    ]
> = async (
    _ctx,
    rpcUrl: string,
    aptosNodeUrl: string,
    sellerPrivateKey: string,
    tokenAddress: string,
    lockBoxAddress: string,
    lockAmountWei: string,
    count: number,
    pairBcsHex: string = "0x",
): Promise<EthLockProofResult[]> => {
    const lockAmount = BigInt(lockAmountWei);
    return lockAndProve(
        rpcUrl,
        aptosNodeUrl,
        sellerPrivateKey,
        tokenAddress,
        lockBoxAddress,
        lockAmount,
        lockAmount * BigInt(count),
        count,
        pairBcsHex,
    );
};
