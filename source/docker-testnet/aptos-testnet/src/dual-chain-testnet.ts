/**
 * Dual-chain testnet lifecycle for browser test commands.
 *
 * Runs in Node.js (browser command handlers). Starts both an Ethereum Docker
 * testnet and an Aptos Docker testnet, deploys all contracts, funds test
 * accounts, and returns JSON-serialisable connection info.
 *
 * This mirrors setupDualChainFixture() from the meta-test helpers but returns
 * plain data instead of live SDK handles, so it can cross the RPC boundary to
 * the browser.
 */

import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { DockerTestnet } from "./index.js";
import { setTestnet } from "./localnet.js";
import { ethers } from "ethers";
import { resolve as pathResolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
// Resolve repo-local packages from the browser-test process first so local
// workspace builds win over the package install location under node_modules.
const EVM_CONTRACTS_CANDIDATES = [
    pathResolve(process.cwd(), "../evm-contracts"),
    pathResolve(process.cwd(), "../../evm-contracts"),
    pathResolve(process.cwd(), "../../../evm-contracts"),
    pathResolve(THIS_DIR, "../../../evm-contracts"),
];

const MOVE_CONTRACTS_CANDIDATES = [
    pathResolve(process.cwd(), "../atomica-move-contracts"),
    pathResolve(process.cwd(), "../../atomica-move-contracts"),
    pathResolve(process.cwd(), "../../../atomica-move-contracts"),
    pathResolve(THIS_DIR, "../../../atomica-move-contracts"),
];

// ---------------------------------------------------------------------------
// Shared state — one fixture per Vitest worker process
// ---------------------------------------------------------------------------

let ethTestnet: EthereumDockerTestnet | null = null;
let aptosTestnet: DockerTestnet | null = null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DualChainTestnetInfo {
    eth: {
        rpcUrl: string;
        chainId: number;
        contracts: {
            fakeETH: string;
            fakeUSD: string;
            lockBox: string;
        };
        /** Deployer / seller private key */
        deployerPrivateKey: string;
        deployerAddress: string;
        /** Bidder account (testnet account 1) */
        bidderPrivateKey: string;
        bidderAddress: string;
    };
    aptos: {
        nodeUrl: string;
        moduleAddress: string;
        deployerPrivateKey: string;
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findExistingDir(candidates: string[], markerPath: string): string {
    for (const candidate of candidates) {
        if (existsSync(pathResolve(candidate, markerPath))) {
            return candidate;
        }
    }

    throw new Error(
        [
            `Unable to locate required directory containing ${markerPath}.`,
            "Searched in:",
            ...candidates.map((candidate) => `  - ${candidate}`),
        ].join("\n"),
    );
}

function findEvmContractsDir(): string {
    return findExistingDir(EVM_CONTRACTS_CANDIDATES, "out");
}

function findMoveContractsDir(): string {
    return findExistingDir(MOVE_CONTRACTS_CANDIDATES, "Move.toml");
}

function ensureCompiled(): void {
    const evmContractsDir = findEvmContractsDir();
    const outDir = pathResolve(evmContractsDir, "out");
    if (!existsSync(outDir)) {
        console.log("[Dual-Chain] Compiling Solidity contracts...");
        execSync("forge build", { cwd: evmContractsDir, stdio: "inherit" });
        console.log("[Dual-Chain] ✓ Compiled");
    }
}

function readArtifact(contractName: string): {
    abi: object[];
    bytecode: { object: string };
} {
    const evmContractsDir = findEvmContractsDir();
    const artifactPath = pathResolve(
        evmContractsDir,
        "out",
        `${contractName}.sol`,
        `${contractName}.json`,
    );
    return JSON.parse(readFileSync(artifactPath, "utf-8"));
}

async function waitForFirstBlock(provider: ethers.JsonRpcProvider): Promise<void> {
    console.log("[Dual-Chain] Waiting for first Ethereum block...");
    for (let i = 0; i < 60; i++) {
        const block = await provider.getBlockNumber();
        if (block >= 1) {
            console.log(`[Dual-Chain] ✓ Block ${block} reached`);
            return;
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Timed out waiting for first Ethereum block");
}

async function deployContract(
    signer: ethers.Wallet,
    artifact: { abi: object[]; bytecode: { object: string } },
    constructorArgs: unknown[] = [],
): Promise<string> {
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, signer);
    const contract = await factory.deploy(...constructorArgs);
    await contract.waitForDeployment();
    return await contract.getAddress();
}

async function mintFakeETH(
    provider: ethers.JsonRpcProvider,
    tokenAddress: string,
    abi: object[],
    fromSigner: ethers.Wallet,
    toAddress: string,
    amount: bigint,
): Promise<void> {
    const contract = new ethers.Contract(tokenAddress, abi, fromSigner);
    const tx = await contract.mint(toAddress, amount);
    await provider.waitForTransaction(tx.hash, 1);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start both testnets, deploy all contracts, fund seller and bidder.
 *
 * Idempotent — if called again while a fixture is live the existing info is
 * reconstructed from the running instances.
 */
export async function setupDualChainTestnet(): Promise<DualChainTestnetInfo> {
    console.log("[Dual-Chain] Starting dual-chain testnet...");

    // ── Ethereum ──────────────────────────────────────────────────────────────
    ethTestnet = await EthereumDockerTestnet.start(4);
    await ethTestnet.waitForHealthy(180);

    const rpcUrl = ethTestnet.getExecutionRpcUrl();
    const chainId = await ethTestnet.getChainId();
    const accounts = ethTestnet.getTestAccounts();

    const deployerPrivateKey = accounts[0].privateKey;
    const deployerAddress = accounts[0].address;
    const bidderPrivateKey = accounts[1].privateKey;
    const bidderAddress = accounts[1].address;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const deployer = new ethers.Wallet(deployerPrivateKey, provider);

    console.log(`[Dual-Chain] ETH RPC: ${rpcUrl}, chainId: ${chainId}`);
    console.log(`[Dual-Chain] Deployer: ${deployerAddress}`);
    console.log(`[Dual-Chain] Bidder:   ${bidderAddress}`);

    await waitForFirstBlock(provider);
    ensureCompiled();

    const fakeETH = await deployContract(deployer, readArtifact("FakeETH"));
    console.log(`[Dual-Chain] ✓ FakeETH: ${fakeETH}`);

    const fakeUSD = await deployContract(deployer, readArtifact("FakeUSD"));
    console.log(`[Dual-Chain] ✓ FakeUSD: ${fakeUSD}`);

    const lockBox = await deployContract(deployer, readArtifact("LockBox"), [fakeETH, fakeUSD]);
    console.log(`[Dual-Chain] ✓ LockBox: ${lockBox}`);

    // Fund seller and bidder with FakeETH so tests can lock tokens immediately.
    const fakeETHArtifact = readArtifact("FakeETH");
    const mintAmount = ethers.parseEther("10000");

    await mintFakeETH(
        provider,
        fakeETH,
        fakeETHArtifact.abi,
        deployer,
        deployerAddress,
        mintAmount,
    );
    console.log(`[Dual-Chain] ✓ Minted FakeETH to seller`);

    await mintFakeETH(provider, fakeETH, fakeETHArtifact.abi, deployer, bidderAddress, mintAmount);
    console.log(`[Dual-Chain] ✓ Minted FakeETH to bidder`);

    // ── Aptos ─────────────────────────────────────────────────────────────────
    aptosTestnet = await DockerTestnet.new(2);
    setTestnet(aptosTestnet);
    const nodeUrl = `${aptosTestnet.validatorApiUrl(0)}/v1`;

    const aptosDeployerPrivateKey =
        process.env.APTOS_DEPLOYER_PRIVATE_KEY ||
        "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";
    const aptosModuleAddress =
        process.env.APTOS_ATOMICA_CONTRACT_ADDRESS ||
        "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";

    // Fund the deployer so it can deploy contracts.
    await aptosTestnet.faucet(aptosModuleAddress, 100_000_000_000n);
    console.log(`[Dual-Chain] ✓ Funded Aptos deployer: ${aptosModuleAddress}`);

    const contractsDir = findMoveContractsDir();
    await aptosTestnet.deployContracts({
        contractsDir,
        deployerPrivateKey: aptosDeployerPrivateKey,
        deployerAddress: aptosModuleAddress,
        namedAddresses: { atomica: aptosModuleAddress },
        initFunctions: [
            {
                functionId: `${aptosModuleAddress}::registry::initialize`,
                args: ["hex:0123456789abcdef"],
            },
            { functionId: `${aptosModuleAddress}::fake_eth::initialize`, args: [] },
            { functionId: `${aptosModuleAddress}::fake_usd::initialize`, args: [] },
        ],
        fundAmount: 10_000_000_000n,
    });
    console.log(`[Dual-Chain] ✓ Aptos contracts deployed`);

    console.log("[Dual-Chain] Dual-chain testnet ready.");

    return {
        eth: {
            rpcUrl,
            chainId,
            contracts: { fakeETH, fakeUSD, lockBox },
            deployerPrivateKey,
            deployerAddress,
            bidderPrivateKey,
            bidderAddress,
        },
        aptos: {
            nodeUrl,
            moduleAddress: aptosModuleAddress,
            deployerPrivateKey: aptosDeployerPrivateKey,
        },
    };
}

/**
 * Tear down both testnets.
 */
export async function teardownDualChainTestnet(): Promise<void> {
    console.log("[Dual-Chain] Tearing down dual-chain testnet...");

    await Promise.all([
        ethTestnet
            ? ethTestnet.teardown().finally(() => {
                  ethTestnet = null;
              })
            : Promise.resolve(),
        aptosTestnet
            ? aptosTestnet.teardown().finally(() => {
                  aptosTestnet = null;
                  setTestnet(null);
              })
            : Promise.resolve(),
    ]);

    console.log("[Dual-Chain] ✓ Both testnets stopped");
}
