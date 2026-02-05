import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import {
  calculateLockedBalanceStorageKey,
  generateLockedBalanceProof,
  validateProof,
  formatProof,
  isProofFinalized,
  serializeProofForAptos,
} from "../../../src/lib/ethereum/proofs/index.js";
import {
  compileContracts,
  getFakeETHArtifact,
  getFakeUSDArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "./solidity-compiler.js";
import {
  sendAndWaitForTx,
  pollUntil,
} from "../helpers/transaction-utils.js";

/**
 * Integration tests for state proof generation
 *
 * These tests:
 * 1. Deploy LockBox and tokens to Ethereum testnet
 * 2. Lock tokens
 * 3. Generate state proofs
 * 4. Verify proof structure
 */
describe("Ethereum State Proof Generation", () => {
  let testnet: EthereumDockerTestnet;
  let provider: ethers.Provider;
  let deployer: ethers.Wallet;

  let fakeETHAddress: string;
  let fakeUSDAddress: string;
  let lockBoxAddress: string;

  let fakeETH: ethers.Contract;
  let fakeUSD: ethers.Contract;
  let lockBox: ethers.Contract;

  beforeAll(async () => {
    console.log("Starting Ethereum testnet...");
    testnet = await EthereumDockerTestnet.start(4);
    await testnet.waitForHealthy(180);

    provider = new ethers.JsonRpcProvider(testnet.getExecutionRpcUrl());

    // Get pre-funded deployer account
    const testAccounts = testnet.getTestAccounts();
    deployer = new ethers.Wallet(testAccounts[0].privateKey, provider);

    console.log("Compiling contracts...");
    await compileContracts();

    console.log("Deploying contracts...");

    // Deploy FakeETH
    const fakeETHArtifact = getFakeETHArtifact();
    const FakeETHFactory = new ethers.ContractFactory(
      fakeETHArtifact.abi,
      fakeETHArtifact.bytecode.object,
      deployer,
    );

    fakeETH = await deployWithRetry(FakeETHFactory, deployer);
    await fakeETH.waitForDeployment();
    fakeETHAddress = await fakeETH.getAddress();

    // Deploy FakeUSD
    const fakeUSDArtifact = getFakeUSDArtifact();
    const FakeUSDFactory = new ethers.ContractFactory(
      fakeUSDArtifact.abi,
      fakeUSDArtifact.bytecode.object,
      deployer,
    );

    fakeUSD = await deployWithRetry(FakeUSDFactory, deployer);
    await fakeUSD.waitForDeployment();
    fakeUSDAddress = await fakeUSD.getAddress();

    // Deploy LockBox
    const lockBoxArtifact = getLockBoxArtifact();
    const LockBoxFactory = new ethers.ContractFactory(
      lockBoxArtifact.abi,
      lockBoxArtifact.bytecode.object,
      deployer,
    );

    lockBox = await deployWithRetry(LockBoxFactory, deployer, [
      fakeETHAddress,
      fakeUSDAddress,
    ]);
    await lockBox.waitForDeployment();
    lockBoxAddress = await lockBox.getAddress();

    console.log("Contracts deployed:");
    console.log(`  FakeETH: ${fakeETHAddress}`);
    console.log(`  FakeUSD: ${fakeUSDAddress}`);
    console.log(`  LockBox: ${lockBoxAddress}`);
  }, 300000); // 5 min timeout

  afterAll(async () => {
    if (testnet) {
      console.log("Tearing down Ethereum testnet...");
      await testnet.teardown();
    }
  });

  it("should calculate storage keys correctly", async () => {
    const user = deployer.address;
    const token = fakeETHAddress;

    // Calculate off-chain
    const offChainKey = calculateLockedBalanceStorageKey(user, token);

    // Get from contract
    const onChainKey = await lockBox.calculateStorageKey(user, token);

    // Should match
    expect(offChainKey.toLowerCase()).toBe(onChainKey.toLowerCase());
  });

  it("should generate proof for locked balance", async () => {
    // Mint and lock some tokens
    const lockAmount = ethers.parseEther("10");

    // Use explicit nonce management for sequential transactions
    let nonce = await deployer.getNonce();

    const mintReceipt = await sendAndWaitForTx(
      fakeETH.mint(deployer.address, lockAmount, { nonce: nonce++ }),
      1,
    );
    console.log(`✓ Minted FakeETH: ${mintReceipt.hash}`);

    const approveReceipt = await sendAndWaitForTx(
      fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
      1,
    );
    console.log(`✓ Approved FakeETH: ${approveReceipt.hash}`);

    const lockReceipt = await sendAndWaitForTx(
      lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ }),
      1,
    );
    console.log(`✓ Locked FakeETH: ${lockReceipt.hash}`);

    // Poll proof generation until state trie is indexed and proof is available
    const proof = await pollUntil(
      () =>
        generateLockedBalanceProof(
          provider,
          lockBoxAddress,
          deployer.address,
          fakeETHAddress,
        ),
      (proof) => proof.storageValue === lockAmount,
      {
        description: "proof with correct locked balance",
        timeout: 30000,
      },
    );
    console.log(`✓ Proof generated with correct storage value`);

    // Verify proof structure
    expect(proof.blockNumber).toBeGreaterThan(0);
    expect(proof.blockHash).toBeTruthy();
    expect(proof.stateRoot).toBeTruthy();
    expect(proof.contractAddress).toBe(lockBoxAddress);
    expect(proof.userAddress).toBe(deployer.address);
    expect(proof.tokenAddress).toBe(fakeETHAddress);
    expect(proof.storageValue).toBe(lockAmount);
    expect(proof.accountProof.length).toBeGreaterThan(0);
    expect(proof.storageProof.length).toBeGreaterThan(0);

    console.log("\nGenerated proof:");
    console.log(formatProof(proof));
  });

  it("should validate proof structure", async () => {
    // Lock tokens
    const lockAmount = ethers.parseEther("5");

    let nonce = await deployer.getNonce();
    await sendAndWaitForTx(
      fakeETH.mint(deployer.address, lockAmount, { nonce: nonce++ }),
      1,
    );
    await sendAndWaitForTx(
      fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
      1,
    );
    await sendAndWaitForTx(
      lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ }),
      1,
    );

    // Generate proof
    const proof = await generateLockedBalanceProof(
      provider,
      lockBoxAddress,
      deployer.address,
      fakeETHAddress,
    );

    // Should not throw
    expect(() => validateProof(proof)).not.toThrow();
  });

  it("should generate proof for FakeUSD", async () => {
    // Lock FakeUSD
    const lockAmount = BigInt(10_000 * 10 ** 6); // 10k USD

    let nonce = await deployer.getNonce();
    await sendAndWaitForTx(
      fakeUSD.mint(deployer.address, lockAmount, { nonce: nonce++ }),
      1,
    );
    await sendAndWaitForTx(
      fakeUSD.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
      1,
    );
    await sendAndWaitForTx(
      lockBox.lock(fakeUSDAddress, lockAmount, { nonce: nonce++ }),
      1,
    );

    // Poll proof generation until state trie is indexed and proof is available
    const proof = await pollUntil(
      () =>
        generateLockedBalanceProof(
          provider,
          lockBoxAddress,
          deployer.address,
          fakeUSDAddress,
        ),
      (proof) => proof.storageValue === lockAmount,
      {
        description: "proof with correct locked balance",
        timeout: 30000,
      },
    );

    expect(proof.storageValue).toBe(lockAmount);
    expect(proof.tokenAddress).toBe(fakeUSDAddress);
  });

  it("should check proof finality", async () => {
    // Lock tokens
    const lockAmount = ethers.parseEther("1");

    let nonce = await deployer.getNonce();
    await sendAndWaitForTx(
      fakeETH.mint(deployer.address, lockAmount, { nonce: nonce++ }),
      1,
    );
    await sendAndWaitForTx(
      fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
      1,
    );
    await sendAndWaitForTx(
      lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ }),
      1,
    );

    // Generate proof at current block
    const proof = await generateLockedBalanceProof(
      provider,
      lockBoxAddress,
      deployer.address,
      fakeETHAddress,
    );

    // Should not be finalized (need 64 confirmations)
    const isFinalized = await isProofFinalized(provider, proof, 64);
    expect(isFinalized).toBe(false);

    // But should be "finalized" with 0 confirmations
    const isImmediatelyFinalized = await isProofFinalized(provider, proof, 0);
    expect(isImmediatelyFinalized).toBe(true);
  });

  it("should serialize proof for Aptos", async () => {
    // Lock tokens
    const lockAmount = ethers.parseEther("3");

    let nonce = await deployer.getNonce();
    await sendAndWaitForTx(
      fakeETH.mint(deployer.address, lockAmount, { nonce: nonce++ }),
      1,
    );
    await sendAndWaitForTx(
      fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
      1,
    );
    await sendAndWaitForTx(
      lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ }),
      1,
    );

    // Generate proof
    const proof = await generateLockedBalanceProof(
      provider,
      lockBoxAddress,
      deployer.address,
      fakeETHAddress,
    );

    // Serialize for Aptos
    const serialized = serializeProofForAptos(proof);

    expect(serialized.block_hash).toBeTruthy();
    expect(serialized.state_root).toBeTruthy();
    expect(serialized.contract_address).toBe(lockBoxAddress);
    expect(serialized.storage_key).toBeTruthy();
    expect(serialized.storage_value).toBeTruthy();
    expect(serialized.account_proof).toBeInstanceOf(Array);
    expect(serialized.storage_proof).toBeInstanceOf(Array);
  });

  it("should generate proof for zero balance", async () => {
    // Don't lock anything, just generate proof
    const randomUser = ethers.Wallet.createRandom().address;

    const proof = await generateLockedBalanceProof(
      provider,
      lockBoxAddress,
      randomUser,
      fakeETHAddress,
    );

    // Should have zero value
    expect(proof.storageValue).toBe(0n);

    // But still have valid proof structure
    expect(proof.accountProof.length).toBeGreaterThan(0);
    expect(proof.storageProof.length).toBeGreaterThan(0);
  });
});
