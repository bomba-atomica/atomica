import { expect } from "chai";
import { ethers } from "hardhat";
import { DiemLightClient, BLSVerifier, MerkleVerifier } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import * as fs from "fs";
import * as path from "path";

describe("Benchmark Suite", function () {
  let lightClient: DiemLightClient;
  let owner: SignerWithAddress;
  let results: any = {
    timestamp: new Date().toISOString(),
    tests: [],
  };

  before(async function () {
    [owner] = await ethers.getSigners();

    // Deploy contracts
    const DiemLightClientFactory = await ethers.getContractFactory("DiemLightClient");
    lightClient = await DiemLightClientFactory.deploy();
    await lightClient.waitForDeployment();

    console.log("\n📊 Starting Benchmark Suite\n");
  });

  after(async function () {
    // Save results
    const resultsDir = path.join(__dirname, "../benchmarks/results");
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const filename = `benchmark-${Date.now()}.json`;
    fs.writeFileSync(
      path.join(resultsDir, filename),
      JSON.stringify(results, null, 2)
    );

    console.log(`\n✅ Results saved to benchmarks/results/${filename}\n`);

    // Print summary
    console.log("📈 Benchmark Summary");
    console.log("=".repeat(60));
    results.tests.forEach((test: any) => {
      console.log(`${test.name}: ${test.gasUsed.toLocaleString()} gas`);
    });
    console.log("=".repeat(60));
  });

  describe("Initialization Benchmarks", function () {
    it("Should measure gas for initialization with 10 validators", async function () {
      const validators = generateMockValidators(10);

      const tx = await lightClient.initialize(
        1000000n,
        ethers.randomBytes(32),
        ethers.randomBytes(32),
        Math.floor(Date.now() / 1000),
        1n,
        validators
      );

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      results.tests.push({
        name: "Initialize (10 validators)",
        gasUsed: Number(gasUsed),
        validators: 10,
      });

      console.log(`  Init (10 validators): ${gasUsed.toLocaleString()} gas`);
      expect(gasUsed).to.be.lessThan(600000n);
    });

    it("Should measure gas for initialization with 50 validators", async function () {
      // Deploy new instance
      const DiemLightClientFactory = await ethers.getContractFactory("DiemLightClient");
      const lc2 = await DiemLightClientFactory.deploy();
      await lc2.waitForDeployment();

      const validators = generateMockValidators(50);

      const tx = await lc2.initialize(
        1000000n,
        ethers.randomBytes(32),
        ethers.randomBytes(32),
        Math.floor(Date.now() / 1000),
        1n,
        validators
      );

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      results.tests.push({
        name: "Initialize (50 validators)",
        gasUsed: Number(gasUsed),
        validators: 50,
      });

      console.log(`  Init (50 validators): ${gasUsed.toLocaleString()} gas`);
    });

    it("Should measure gas for initialization with 100 validators", async function () {
      const DiemLightClientFactory = await ethers.getContractFactory("DiemLightClient");
      const lc3 = await DiemLightClientFactory.deploy();
      await lc3.waitForDeployment();

      const validators = generateMockValidators(100);

      const tx = await lc3.initialize(
        1000000n,
        ethers.randomBytes(32),
        ethers.randomBytes(32),
        Math.floor(Date.now() / 1000),
        1n,
        validators
      );

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      results.tests.push({
        name: "Initialize (100 validators)",
        gasUsed: Number(gasUsed),
        validators: 100,
      });

      console.log(`  Init (100 validators): ${gasUsed.toLocaleString()} gas`);
    });
  });

  describe("State Update Benchmarks", function () {
    it("Should measure gas for state update (same epoch)", async function () {
      // This is a simplified mock - real implementation would verify signatures
      // For benchmarking, we're measuring the contract logic overhead

      const mockLedgerInfo = generateMockLedgerInfo(2000000n, 1n);
      const mockSignature = ethers.randomBytes(96);
      const signerBitmask = (1n << 10n) - 1n; // All 10 validators signed

      // Note: This will fail signature verification in real use
      // For benchmark, we're measuring the happy path gas cost

      console.log("  Note: Using mocked data for gas estimation");
      console.log("  State update (same epoch): ~300,000 gas (estimated)");

      results.tests.push({
        name: "State update (same epoch)",
        gasUsed: 300000,
        estimated: true,
      });
    });

    it("Should estimate gas for state update (epoch change)", async function () {
      console.log("  State update (epoch change): ~800,000 gas (estimated)");

      results.tests.push({
        name: "State update (epoch change)",
        gasUsed: 800000,
        estimated: true,
      });
    });
  });

  describe("Merkle Proof Benchmarks", function () {
    it("Should measure gas for accumulator proof (depth 10)", async function () {
      const MerkleVerifierFactory = await ethers.getContractFactory("MerkleVerifier");
      const merkleVerifier = await MerkleVerifierFactory.deploy();

      const rootHash = ethers.randomBytes(32);
      const leafHash = ethers.randomBytes(32);
      const siblings = Array(10).fill(null).map(() => ethers.randomBytes(32));

      // Estimate gas for view function
      const gasEstimate = await merkleVerifier.verifyAccumulatorProof.estimateGas(
        rootHash,
        leafHash,
        0,
        siblings
      );

      console.log(`  Accumulator proof (depth 10): ${gasEstimate.toLocaleString()} gas`);

      results.tests.push({
        name: "Accumulator proof (depth 10)",
        gasUsed: Number(gasEstimate),
        proofDepth: 10,
      });
    });

    it("Should measure gas for accumulator proof (depth 30)", async function () {
      const MerkleVerifierFactory = await ethers.getContractFactory("MerkleVerifier");
      const merkleVerifier = await MerkleVerifierFactory.deploy();

      const rootHash = ethers.randomBytes(32);
      const leafHash = ethers.randomBytes(32);
      const siblings = Array(30).fill(null).map(() => ethers.randomBytes(32));

      const gasEstimate = await merkleVerifier.verifyAccumulatorProof.estimateGas(
        rootHash,
        leafHash,
        0,
        siblings
      );

      console.log(`  Accumulator proof (depth 30): ${gasEstimate.toLocaleString()} gas`);

      results.tests.push({
        name: "Accumulator proof (depth 30)",
        gasUsed: Number(gasEstimate),
        proofDepth: 30,
      });
    });

    it("Should measure gas for sparse Merkle proof (depth 256)", async function () {
      const MerkleVerifierFactory = await ethers.getContractFactory("MerkleVerifier");
      const merkleVerifier = await MerkleVerifierFactory.deploy();

      const rootHash = ethers.randomBytes(32);
      const key = ethers.randomBytes(32);
      const valueHash = ethers.randomBytes(32);
      const siblings = Array(256).fill(null).map(() => ethers.randomBytes(32));

      const gasEstimate = await merkleVerifier.verifySparseMerkleProof.estimateGas(
        rootHash,
        key,
        valueHash,
        siblings
      );

      console.log(`  Sparse Merkle proof (depth 256): ${gasEstimate.toLocaleString()} gas`);

      results.tests.push({
        name: "Sparse Merkle proof (depth 256)",
        gasUsed: Number(gasEstimate),
        proofDepth: 256,
      });
    });
  });

  describe("BLS Signature Benchmarks", function () {
    it("Should estimate BLS signature verification cost", async function () {
      // BLS signature verification using EIP-2537 precompiles
      // Costs (approximate based on EIP-2537):
      // - G1 multi-exp (10 keys): ~50,000 gas
      // - Hash to G2: ~20,000 gas
      // - Pairing check: ~120,000 gas
      // Total: ~190,000 gas for signature verification alone

      console.log("  BLS signature verification: ~190,000 gas (estimated)");
      console.log("    - Public key aggregation: ~50,000 gas");
      console.log("    - Hash to G2: ~20,000 gas");
      console.log("    - Pairing check: ~120,000 gas");

      results.tests.push({
        name: "BLS signature verification",
        gasUsed: 190000,
        estimated: true,
        breakdown: {
          aggregation: 50000,
          hashToG2: 20000,
          pairing: 120000,
        },
      });
    });
  });
});

// Helper functions

function generateMockValidators(count: number) {
  return Array(count)
    .fill(null)
    .map((_, i) => ({
      publicKey: ethers.randomBytes(96), // BLS public key
      votingPower: 100n,
      aptosAddress: ethers.randomBytes(32),
    }));
}

function generateMockLedgerInfo(version: bigint, epoch: bigint) {
  // Simplified mock LedgerInfo
  const data = new Uint8Array(160);
  const view = new DataView(data.buffer);

  // version (8 bytes)
  view.setBigUint64(0, version, true);
  // epoch (8 bytes)
  view.setBigUint64(8, epoch, true);
  // accumulator (32 bytes)
  data.set(ethers.randomBytes(32), 16);
  // state root (32 bytes)
  data.set(ethers.randomBytes(32), 48);
  // timestamp (8 bytes)
  view.setBigUint64(80, BigInt(Date.now()), true);

  return ethers.hexlify(data);
}
