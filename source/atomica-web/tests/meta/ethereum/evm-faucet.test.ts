import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { resolve as pathResolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { fundEthereumAccount } from "../../../scripts/ethereum-funding";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const EVM_CONTRACTS_DIR = pathResolve(THIS_DIR, "../../../../evm-contracts");

const FAKE_ETH_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function mint(address to, uint256 amount)",
] as const;

function ensureCompiled(): void {
  const outDir = pathResolve(EVM_CONTRACTS_DIR, "out");
  if (!existsSync(outDir)) {
    execSync("forge build", { cwd: EVM_CONTRACTS_DIR, stdio: "inherit" });
  }
}

function readArtifact(name: string): { abi: object[]; bytecode: { object: string } } {
  const p = pathResolve(EVM_CONTRACTS_DIR, "out", `${name}.sol`, `${name}.json`);
  return JSON.parse(readFileSync(p, "utf-8"));
}

async function deployContract(
  signer: ethers.Wallet,
  artifact: { abi: object[]; bytecode: { object: string } },
): Promise<string> {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  return await contract.getAddress();
}

async function waitForFirstBlock(provider: ethers.JsonRpcProvider): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const block = await provider.getBlockNumber();
    if (block >= 1) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timed out waiting for first block");
}

describe.sequential("EVM server-side faucet (fundEthereumAccount)", () => {
  let testnet: EthereumDockerTestnet;
  let rpcUrl: string;
  let fakeETHAddress: string;
  let fakeUSDAddress: string;
  let provider: ethers.JsonRpcProvider;

  beforeAll(async () => {
    testnet = await EthereumDockerTestnet.start(4);
    await testnet.waitForHealthy(180);

    rpcUrl = testnet.getExecutionRpcUrl();
    const accounts = testnet.getTestAccounts();
    provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(accounts[0].privateKey, provider);

    await waitForFirstBlock(provider);
    ensureCompiled();

    fakeETHAddress = await deployContract(signer, readArtifact("FakeETH"));
    fakeUSDAddress = await deployContract(signer, readArtifact("FakeUSD"));

    console.log(`[evm-faucet] FakeETH: ${fakeETHAddress}`);
    console.log(`[evm-faucet] FakeUSD: ${fakeUSDAddress}`);
  }, 300_000);

  afterAll(async () => {
    await testnet?.teardown();
  });

  it("should mint FakeETH and FakeUSD to recipient with zero initial balance", async () => {
    const recipient = ethers.Wallet.createRandom();

    // Confirm zero balances before faucet
    const fakeETH = new ethers.Contract(fakeETHAddress, FAKE_ETH_ABI, provider);
    const fakeUSD = new ethers.Contract(fakeUSDAddress, FAKE_ETH_ABI, provider);

    const ethBefore = await fakeETH.balanceOf(recipient.address);
    const usdBefore = await fakeUSD.balanceOf(recipient.address);
    expect(ethBefore).toBe(0n);
    expect(usdBefore).toBe(0n);

    // Call the server-side faucet
    const result = await fundEthereumAccount({
      recipientAddress: recipient.address,
      fakeETHAddress,
      fakeUSDAddress,
      rpcUrl,
    });

    expect(result.recipientAddress.toLowerCase()).toBe(recipient.address.toLowerCase());
    expect(result.ethTxHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(result.usdTxHash).toMatch(/^0x[0-9a-f]{64}$/i);

    // Verify balances after minting
    const ethAfter = await fakeETH.balanceOf(recipient.address);
    const usdAfter = await fakeUSD.balanceOf(recipient.address);

    expect(ethAfter).toBe(10n * 10n ** 18n); // 10 FakeETH
    expect(usdAfter).toBe(10_000n * 10n ** 6n); // 10,000 FakeUSD
  }, 120_000);

  it("should allow calling faucet for a second recipient independently", async () => {
    const recipient = ethers.Wallet.createRandom();

    await fundEthereumAccount({
      recipientAddress: recipient.address,
      fakeETHAddress,
      fakeUSDAddress,
      rpcUrl,
    });

    const fakeETH = new ethers.Contract(fakeETHAddress, FAKE_ETH_ABI, provider);
    const balance = await fakeETH.balanceOf(recipient.address);
    expect(balance).toBe(10n * 10n ** 18n);
  }, 120_000);
});
