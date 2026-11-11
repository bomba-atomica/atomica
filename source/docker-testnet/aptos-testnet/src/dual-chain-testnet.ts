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
import { waitForEthBlock } from "./eth-blocks.js";
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
        /** Relayer account (testnet account 2): the LockBox settlementAuthority */
        relayerPrivateKey: string;
        relayerAddress: string;
    };
    aptos: {
        nodeUrl: string;
        moduleAddress: string;
        deployerPrivateKey: string;
        /** SIWE domain pinned in eth_proof: receipts belong to accounts of this domain */
        siweDomain: string;
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

/**
 * Wait for block 1. On geth this also means the transaction indexer is ready
 * (eth_getTransactionReceipt returns -32000 "transaction indexing is in
 * progress" for a short window after startup). On anvil it mines block 1.
 */
async function waitForFirstBlock(provider: ethers.JsonRpcProvider): Promise<void> {
    console.log("[Dual-Chain] Waiting for first block...");
    await waitForEthBlock(provider, 1, 60, "Dual-Chain");
}

async function deployContract(
    signer: ethers.Signer,
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
    fromSigner: ethers.Signer,
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
 * `siweDomain` is pinned in eth_proof: a lock receipt belongs to the
 * depositor's Ethereum-derivable account of this domain, so pass the host the
 * SIWE-signing page runs on (`window.location.host`).
 *
 * The validators certify the Ethereum testnet's headers (genesis
 * `eth_chain_id`, see config/generate-genesis.sh). A lock registers only at a
 * certified block.
 *
 * Idempotent — if called again while a fixture is live the existing info is
 * reconstructed from the running instances.
 */
export async function setupDualChainTestnet(
    siweDomain = "localhost:3000",
): Promise<DualChainTestnetInfo> {
    console.log("[Dual-Chain] Starting dual-chain testnet...");

    // ── Ethereum ──────────────────────────────────────────────────────────────
    ethTestnet = await EthereumDockerTestnet.start(4);
    await ethTestnet.waitForHealthy(180);

    const rpcUrl = ethTestnet.getExecutionRpcUrl();
    const chainId = await ethTestnet.getChainId();
    const accounts = ethTestnet.getTestAccounts();

    const deployerPrivateKey = accounts[0].privateKey;
    const deployerAddress = accounts[0].address;
    // The listed addresses of accounts 1-3 do not match their keys, so derive
    // each address from its key. The deployer funds them with ETH below.
    const bidderPrivateKey = accounts[1].privateKey;
    const bidderAddress = new ethers.Wallet(bidderPrivateKey).address;
    const relayerPrivateKey = accounts[2].privateKey;
    const relayerAddress = new ethers.Wallet(relayerPrivateKey).address;

    // ethers caches eth_getTransactionCount for 250 ms by default. Anvil mines
    // instantly, so back-to-back deploys would reuse a stale nonce.
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
    // NonceManager: deploys and mints from one signer go back to back.
    const deployer = new ethers.NonceManager(new ethers.Wallet(deployerPrivateKey, provider));

    console.log(`[Dual-Chain] ETH RPC: ${rpcUrl}, chainId: ${chainId}`);
    console.log(`[Dual-Chain] Deployer: ${deployerAddress}`);
    console.log(`[Dual-Chain] Bidder:   ${bidderAddress}`);

    await waitForFirstBlock(provider);
    ensureCompiled();

    // Gas for the bidder and the relayer (they sign their own transactions).
    for (const to of [bidderAddress, relayerAddress]) {
        const tx = await deployer.sendTransaction({ to, value: ethers.parseEther("10") });
        await provider.waitForTransaction(tx.hash, 1);
    }
    console.log(`[Dual-Chain] ✓ Funded bidder and relayer with ETH`);

    // FakeETH and FakeUSD share the same deployer signer, so they must be
    // deployed sequentially to avoid nonce collisions.
    const fakeETH = await deployContract(deployer, readArtifact("FakeETH"));
    console.log(`[Dual-Chain] ✓ FakeETH: ${fakeETH}`);

    const fakeUSD = await deployContract(deployer, readArtifact("FakeUSD"));
    console.log(`[Dual-Chain] ✓ FakeUSD: ${fakeUSD}`);

    // Only the relayer can release locks, and only on an Aptos outcome.
    const lockBox = await deployContract(deployer, readArtifact("LockBox"), [
        fakeETH,
        fakeUSD,
        relayerAddress,
    ]);
    console.log(`[Dual-Chain] ✓ LockBox: ${lockBox}`);

    // Fund seller and bidder with FakeETH so tests can lock tokens immediately.
    const fakeETHArtifact = readArtifact("FakeETH");
    const mintAmount = ethers.parseEther("10000");

    // Mint calls share the deployer signer and must be sequential to avoid
    // nonce collisions (ethers v6 does not serialize concurrent transactions).
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
    // The timelock DKG needs 4 validators (see localnet.ts setupLocalnet).
    aptosTestnet = await DockerTestnet.new(4);
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
            // Pin the LockBox, the token behind each asset (issue 171) and
            // the SIWE domain of receipt owners (issue 197).
            {
                functionId: `${aptosModuleAddress}::eth_proof::initialize`,
                args: [
                    ...[lockBox, fakeETH, fakeUSD].map((addr) => `hex:${addr.slice(2)}`),
                    `hex:${Buffer.from(siweDomain, "utf8").toString("hex")}`,
                ],
            },
            {
                functionId: `${aptosModuleAddress}::lock_receipt::initialize`,
                typeArgs: [
                    `${aptosModuleAddress}::lock_receipt::Ethereum`,
                    `${aptosModuleAddress}::lock_receipt::FakeETH`,
                ],
                args: [],
            },
            {
                functionId: `${aptosModuleAddress}::lock_receipt::initialize`,
                typeArgs: [
                    `${aptosModuleAddress}::lock_receipt::Ethereum`,
                    `${aptosModuleAddress}::lock_receipt::FakeUSD`,
                ],
                args: [],
            },
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
            relayerPrivateKey,
            relayerAddress,
        },
        aptos: {
            nodeUrl,
            moduleAddress: aptosModuleAddress,
            deployerPrivateKey: aptosDeployerPrivateKey,
            siweDomain,
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
