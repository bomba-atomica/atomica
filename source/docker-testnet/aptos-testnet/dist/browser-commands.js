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
import { setupLocalnet, 
// teardownLocalnet, // Unused in persistent mode
deployContracts, fundAccount,
// killZombies, // Unused - setupLocalnet handles cleanup internally
 } from "./localnet.js";
import { setupEthereumTestnet, teardownEthereumTestnet } from "./ethereum-testnet.js";
import { setupDualChainTestnet, teardownDualChainTestnet } from "./dual-chain-testnet.js";
import { ethers } from "ethers";
import { fetchProof } from "@atomica/state-proof-verifier";
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
export const setupLocalnetCommand = async () => {
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
export const teardownLocalnetCommand = async () => {
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
export const deployContractsCommand = async () => {
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
export const fundAccountCommand = async (_context, address, amount = 100_000_000) => {
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
export const setupEthereumTestnetCommand = async () => {
    return await setupEthereumTestnet();
};
/**
 * Tear down the Ethereum Docker testnet started by setupEthereumTestnetCommand.
 *
 * EXECUTION: Node.js
 */
export const teardownEthereumTestnetCommand = async () => {
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
export const setupDualChainTestnetCommand = async () => {
    return await setupDualChainTestnet();
};
/**
 * Tear down both testnets started by setupDualChainTestnetCommand.
 *
 * EXECUTION: Node.js
 */
export const teardownDualChainTestnetCommand = async () => {
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
const LOCKBOX_LOCK_ABI = ["function lock(address token, uint256 amount) external"];
/**
 * Generate an Ethereum storage proof for a locked balance.
 *
 * This command runs on the Node.js side because @ethereumjs/util (used
 * transitively by @atomica/state-proof-verifier) accesses Node's EventEmitter
 * which is not available in browser context.
 *
 * Steps:
 *   1. Mint FakeETH to seller
 *   2. Approve LockBox for lockAmount
 *   3. Call LockBox.lock()
 *   4. Wait 12 blocks for archive proof availability
 *   5. Fetch eth_getProof storage proof
 *   6. Compute lockId = keccak256(blockHash || contractAddress || userAddress || tokenAddress || storageKey)
 *
 * Returns a JSON-serialisable result (storageValue as decimal string).
 *
 * EXECUTION: Node.js (browser can't use @ethereumjs/* via EventEmitter)
 */
export const generateEthLockProofCommand = async (_ctx, rpcUrl, sellerPrivateKey, fakeETHAddress, lockBoxAddress, lockAmountWei = ethers.parseEther("10").toString(), mintAmountWei = ethers.parseEther("1000").toString()) => {
    const lockAmount = BigInt(lockAmountWei);
    const mintAmount = BigInt(mintAmountWei);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const seller = new ethers.Wallet(sellerPrivateKey, provider);
    const fakeETH = new ethers.Contract(fakeETHAddress, ERC20_MINT_ABI, seller);
    const lockBox = new ethers.Contract(lockBoxAddress, LOCKBOX_LOCK_ABI, seller);
    // Mint tokens
    const mintTx = await fakeETH.mint(seller.address, mintAmount);
    await provider.waitForTransaction(mintTx.hash, 1);
    let nonce = await seller.getNonce();
    const approveTx = await fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ });
    await provider.waitForTransaction(approveTx.hash, 1);
    const lockTx = await lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ });
    const lockReceipt = await provider.waitForTransaction(lockTx.hash, 1);
    const lockBlockNumber = lockReceipt.blockNumber;
    // Wait for archive proof availability (12 blocks)
    const targetBlock = lockBlockNumber + 12;
    for (let i = 0; i < 180; i++) {
        const current = await provider.getBlockNumber();
        if (current >= targetBlock)
            break;
        await new Promise((r) => setTimeout(r, 1000));
    }
    // Calculate storage key (single-level mapping: keccak256(abi.encode(compositeKey, slot=0)))
    const compositeKey = ethers.keccak256(ethers.solidityPacked(["address", "address"], [ethers.getAddress(seller.address), ethers.getAddress(fakeETHAddress)]));
    const storageKey = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [compositeKey, 0]));
    // Fetch storage proof
    const proofData = await fetchProof(rpcUrl, lockBoxAddress, [storageKey], lockBlockNumber);
    // Fetch block to get blockHash and stateRoot
    const block = await provider.getBlock(lockBlockNumber);
    if (!block) {
        throw new Error(`Block ${lockBlockNumber} not found`);
    }
    if (!block.hash || !block.stateRoot) {
        throw new Error(`Block ${lockBlockNumber} missing hash or stateRoot`);
    }
    // Compute lockId
    const lockIdData = Buffer.concat([
        Buffer.from(block.hash.slice(2), "hex"),
        Buffer.from(ethers.getAddress(lockBoxAddress).slice(2), "hex"),
        Buffer.from(ethers.getAddress(seller.address).slice(2), "hex"),
        Buffer.from(ethers.getAddress(fakeETHAddress).slice(2), "hex"),
        Buffer.from(storageKey.slice(2), "hex"),
    ]);
    const lockId = ethers.keccak256(lockIdData);
    return {
        lockId,
        proof: {
            blockNumber: lockBlockNumber,
            blockHash: block.hash,
            stateRoot: block.stateRoot,
            contractAddress: ethers.getAddress(lockBoxAddress),
            userAddress: ethers.getAddress(seller.address),
            tokenAddress: ethers.getAddress(fakeETHAddress),
            storageKey,
            storageValue: proofData.storageProof[0].value.toString(),
            accountProof: proofData.accountProof,
            storageProof: proofData.storageProof[0].proof,
            timestamp: block.timestamp,
            generatedAt: Date.now(),
        },
    };
};
