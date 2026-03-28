import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { ethers } from "ethers";
import {
  compileContracts,
  getFakeETHArtifact,
  getFakeUSDArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "../solidity-compiler";

export interface EthereumTestFixture {
  testnet: EthereumDockerTestnet;
  provider: ethers.JsonRpcProvider;
  signer: ethers.Wallet;
  contracts: {
    fakeETH: string;
    fakeUSD: string;
    lockBox: string;
  };
}

/**
 * Set up a complete Ethereum testnet environment with deployed contracts.
 *
 * This includes:
 * - Starting a Geth testnet in Docker
 * - Compiling Solidity contracts
 * - Deploying FakeETH, FakeUSD, and LockBox contracts
 * - Funding the deployer account
 *
 * @param fundAmount - Amount of ETH to fund the deployer (default: 100 ETH)
 * @returns Complete test fixture with testnet, provider, signer, and contract addresses
 */
export async function setupEthereumTestnet(
  fundAmount: bigint = ethers.parseEther("100"),
): Promise<EthereumTestFixture> {
  console.log("\n[Ethereum Testnet Setup] Starting...");

  // Start testnet
  console.log("  Starting Geth testnet in Docker...");
  const testnet = new EthereumDockerTestnet();
  await testnet.start();
  console.log("  ✓ Testnet started");

  // Create provider and signer
  const provider = new ethers.JsonRpcProvider(testnet.getRpcUrl());
  const deployerPrivateKey = testnet.getDeployerPrivateKey();
  const signer = new ethers.Wallet(deployerPrivateKey, provider);
  console.log(`  ✓ Deployer address: ${signer.address}`);

  // Fund deployer
  console.log(
    `  Funding deployer with ${ethers.formatEther(fundAmount)} ETH...`,
  );
  await testnet.fundAddress(signer.address, fundAmount);
  const balance = await provider.getBalance(signer.address);
  console.log(`  ✓ Deployer balance: ${ethers.formatEther(balance)} ETH`);

  // Compile contracts
  console.log("  Compiling Solidity contracts...");
  await compileContracts();
  console.log("  ✓ Contracts compiled");

  // Deploy FakeETH
  console.log("  Deploying FakeETH...");
  const fakeETHArtifact = await getFakeETHArtifact();
  const fakeETH = await deployWithRetry(
    signer,
    fakeETHArtifact.abi,
    fakeETHArtifact.bytecode,
    [],
  );
  console.log(`  ✓ FakeETH deployed at: ${fakeETH}`);

  // Deploy FakeUSD
  console.log("  Deploying FakeUSD...");
  const fakeUSDArtifact = await getFakeUSDArtifact();
  const fakeUSD = await deployWithRetry(
    signer,
    fakeUSDArtifact.abi,
    fakeUSDArtifact.bytecode,
    [],
  );
  console.log(`  ✓ FakeUSD deployed at: ${fakeUSD}`);

  // Deploy LockBox
  console.log("  Deploying LockBox...");
  const lockBoxArtifact = await getLockBoxArtifact();
  const lockBox = await deployWithRetry(
    signer,
    lockBoxArtifact.abi,
    lockBoxArtifact.bytecode,
    [],
  );
  console.log(`  ✓ LockBox deployed at: ${lockBox}`);

  console.log("[Ethereum Testnet Setup] Complete\n");

  return {
    testnet,
    provider,
    signer,
    contracts: {
      fakeETH,
      fakeUSD,
      lockBox,
    },
  };
}

/**
 * Tear down the Ethereum testnet and clean up resources.
 *
 * @param fixture - The test fixture to tear down
 */
export async function teardownEthereumTestnet(
  fixture: EthereumTestFixture,
): Promise<void> {
  console.log("\n[Ethereum Testnet Teardown] Stopping testnet...");
  await fixture.testnet.stop();
  console.log("[Ethereum Testnet Teardown] Complete\n");
}

/**
 * Mint tokens to an address.
 *
 * @param signer - Signer to use for the transaction
 * @param tokenAddress - Address of the ERC20 token contract
 * @param recipient - Address to receive the tokens
 * @param amount - Amount of tokens to mint (in wei)
 */
export async function mintTokens(
  signer: ethers.Wallet,
  tokenAddress: string,
  recipient: string,
  amount: bigint,
): Promise<void> {
  const erc20Abi = ["function mint(address to, uint256 amount) public"];
  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);

  const tx = await tokenContract.mint(recipient, amount);
  await tx.wait();
}

/**
 * Lock tokens in the LockBox contract.
 *
 * @param signer - Signer to use for the transaction
 * @param lockBoxAddress - Address of the LockBox contract
 * @param tokenAddress - Address of the ERC20 token to lock
 * @param amount - Amount of tokens to lock (in wei)
 * @param aptosRecipient - Aptos address to receive the tokens (as bytes32)
 */
export async function lockTokens(
  signer: ethers.Wallet,
  lockBoxAddress: string,
  tokenAddress: string,
  amount: bigint,
  aptosRecipient: string,
): Promise<void> {
  // First approve LockBox to spend tokens
  const erc20Abi = [
    "function approve(address spender, uint256 amount) public returns (bool)",
  ];
  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);

  const approveTx = await tokenContract.approve(lockBoxAddress, amount);
  await approveTx.wait();

  // Then lock tokens
  const lockBoxAbi = [
    "function lock(address token, uint256 amount, bytes32 aptosRecipient) public",
  ];
  const lockBoxContract = new ethers.Contract(
    lockBoxAddress,
    lockBoxAbi,
    signer,
  );

  const lockTx = await lockBoxContract.lock(
    tokenAddress,
    amount,
    aptosRecipient,
  );
  await lockTx.wait();
}

/**
 * Get the balance of an address for a specific token.
 *
 * @param provider - Provider to use for the query
 * @param tokenAddress - Address of the ERC20 token contract
 * @param address - Address to check the balance of
 * @returns The balance in wei
 */
export async function getTokenBalance(
  provider: ethers.JsonRpcProvider,
  tokenAddress: string,
  address: string,
): Promise<bigint> {
  const erc20Abi = [
    "function balanceOf(address account) public view returns (uint256)",
  ];
  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);

  return await tokenContract.balanceOf(address);
}
