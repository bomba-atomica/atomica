/**
 * Live dual-chain check of the Aptos light client.
 *
 * Starts a 4-validator Aptos Docker testnet from the Atomica validator image (IMAGE_NAME) and
 * anvil with the Prague hardfork. Deploys AptosLightClient with DeployAptosLightClient.s.sol from
 * the node's /v1/atomica endpoints, pinned to the genesis waypoint from the testnet's genesis
 * files (EXPECTED_GENESIS_WAYPOINT), advances it to the current epoch, then:
 *   1. verifyEvent accepts a live event proof (the FeeStatement event of a faucet transfer);
 *   2. verifyEvent rejects the same proof with one signature byte changed;
 *   3. verifyEvent rejects a valid G2 point that is not the signature (the pairing check).
 *
 * Exits 0 only when every check passes. A missing image, docker, anvil or forge fails loudly:
 * this check never skips.
 *
 * Usage (from source/evm-contracts):
 *   IMAGE_NAME=<atomica validator image> bun test-orchestration/src/aptos-light-client-live.ts
 */
import { DockerTestnet } from "../../../docker-testnet/aptos-testnet/dist/index.js";
import { bls12_381 } from "@noble/curves/bls12-381";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { readFileSync } from "fs";
import { dirname, resolve as pathResolve } from "path";
import { fileURLToPath } from "url";
import {
    BaseError,
    ContractFunctionRevertedError,
    createPublicClient,
    createWalletClient,
    http,
    type Abi,
    type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const CONTRACTS_DIR = pathResolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ANVIL_PORT = 8545;
const ETH_RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
// anvil's first default account.
const DEPLOYER_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const FEE_STATEMENT_TYPE = "0x1::transaction_fee::FeeStatement";

// ---------------------------------------------------------------- bytes and BCS

function fromHex(h: string): Uint8Array {
    return Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));
}

function toHex(b: Uint8Array): Hex {
    return `0x${Buffer.from(b).toString("hex")}`;
}

function concat(...parts: Uint8Array[]): Uint8Array {
    return Uint8Array.from(Buffer.concat(parts.map((p) => Buffer.from(p))));
}

function uleb(n: number): Uint8Array {
    const out: number[] = [];
    do {
        let b = n & 0x7f;
        n >>>= 7;
        if (n !== 0) b |= 0x80;
        out.push(b);
    } while (n !== 0);
    return Uint8Array.from(out);
}

class Reader {
    constructor(
        readonly b: Uint8Array,
        public off = 0,
    ) {}

    need(n: number): void {
        if (this.off + n > this.b.length) throw new Error("BCS: out of bounds");
    }

    u8(): number {
        this.need(1);
        return this.b[this.off++];
    }

    u64(): bigint {
        this.need(8);
        const v = Buffer.from(this.b.subarray(this.off, this.off + 8)).readBigUInt64LE();
        this.off += 8;
        return v;
    }

    skip(n: number): void {
        this.need(n);
        this.off += n;
    }

    len(): number {
        let v = 0;
        let shift = 0;
        for (;;) {
            const byte = this.u8();
            v |= (byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) return v;
            shift += 7;
        }
    }

    bytes(): Uint8Array {
        const n = this.len();
        this.need(n);
        const out = this.b.subarray(this.off, this.off + n);
        this.off += n;
        return out;
    }
}

interface ValidatorSet {
    epoch: bigint;
    bcs: Uint8Array;
    compressedKeys: Uint8Array[];
}

interface LedgerInfo {
    epoch: bigint;
    version: bigint;
    nextEpochState?: ValidatorSet;
    bitmask: Uint8Array;
    signature?: Uint8Array;
}

function readEpochState(r: Reader): ValidatorSet {
    const start = r.off;
    const epoch = r.u64();
    const n = r.len();
    const compressedKeys: Uint8Array[] = [];
    for (let i = 0; i < n; i++) {
        r.skip(32);
        compressedKeys.push(r.bytes());
        r.skip(8);
    }
    return { epoch, bcs: r.b.slice(start, r.off), compressedKeys };
}

function parseLedgerInfo(liws: Uint8Array): LedgerInfo {
    const r = new Reader(liws);
    if (r.u8() !== 0) throw new Error("LedgerInfoWithSignatures: unknown variant");
    const epoch = r.u64();
    r.skip(8 + 32 + 32);
    const version = r.u64();
    r.skip(8);
    const nextEpochState = r.u8() === 1 ? readEpochState(r) : undefined;
    r.skip(32);
    const bitmask = r.bytes();
    const signature = r.u8() === 1 ? r.bytes() : undefined;
    if (r.off !== liws.length) throw new Error("LedgerInfoWithSignatures: trailing bytes");
    return { epoch, version, nextEpochState, bitmask, signature };
}

/** A struct TypeTag `addr::module::name` with no type arguments. */
function structTag(type: string): Uint8Array {
    const [addr, module, name] = type.split("::");
    const address = fromHex(addr.replace(/^0x/, "").padStart(64, "0"));
    const enc = new TextEncoder();
    return concat(
        Uint8Array.of(7),
        address,
        uleb(module.length),
        enc.encode(module),
        uleb(name.length),
        enc.encode(name),
        Uint8Array.of(0),
    );
}

// ---------------------------------------------------------------- BLS encodings

function fp(v: bigint): Uint8Array {
    return fromHex(v.toString(16).padStart(128, "0"));
}

/** EIP-2537 G1 encoding of a 48-byte compressed key. */
function g1Uncompressed(compressed: Uint8Array): Uint8Array {
    const p = bls12_381.G1.ProjectivePoint.fromHex(compressed).toAffine();
    return concat(fp(p.x), fp(p.y));
}

type G2Point = ReturnType<typeof bls12_381.G2.ProjectivePoint.fromHex>;

function g2Encode(point: G2Point): Uint8Array {
    const p = point.toAffine();
    return concat(fp(p.x.c0), fp(p.x.c1), fp(p.y.c0), fp(p.y.c1));
}

// ---------------------------------------------------------------- chains

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
}

function requireTool(cmd: string): void {
    const res = spawnSync(cmd, ["--version"], { encoding: "utf-8" });
    if (res.error || res.status !== 0) {
        throw new Error(`${cmd} is required and was not found on PATH`);
    }
}

async function startAnvil(): Promise<ChildProcess> {
    const anvil = spawn(
        "anvil",
        ["--hardfork", "prague", "--port", String(ANVIL_PORT), "--silent"],
        {
            stdio: "inherit",
        },
    );
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(ETH_RPC_URL, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
            });
            if (res.ok) return anvil;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    anvil.kill();
    throw new Error("anvil did not start");
}

function loadAbi(): Abi {
    const names = ["AptosLightClient", "Bls12381", "AptosTypes", "AptosHash", "Bcs"];
    const abi: Abi[number][] = [];
    for (const name of names) {
        const artifact = JSON.parse(
            readFileSync(pathResolve(CONTRACTS_DIR, `out/${name}.sol/${name}.json`), "utf-8"),
        );
        for (const item of artifact.abi as Abi) {
            if (name === "AptosLightClient" || item.type === "error") abi.push(item);
        }
    }
    return abi;
}

/**
 * Deploys with EXPECTED_GENESIS_WAYPOINT from the testnet's genesis files, so the script checks
 * the node's waypoint against a value the node did not supply.
 */
function deployLightClient(nodeUrl: string, expectedWaypoint: string): Hex {
    const res = spawnSync(
        "forge",
        [
            "script",
            "script/DeployAptosLightClient.s.sol:DeployAptosLightClient",
            "--rpc-url",
            ETH_RPC_URL,
            "--broadcast",
        ],
        {
            cwd: CONTRACTS_DIR,
            stdio: "inherit",
            env: {
                ...process.env,
                PRIVATE_KEY: DEPLOYER_KEY,
                APTOS_NODE_URL: nodeUrl,
                EXPECTED_GENESIS_WAYPOINT: expectedWaypoint,
            },
        },
    );
    if (res.status !== 0) throw new Error("DeployAptosLightClient failed");
    const deployment = JSON.parse(
        readFileSync(pathResolve(CONTRACTS_DIR, "test-results/deployment.json"), "utf-8"),
    );
    if (!deployment.AptosLightClient) throw new Error("deployment.json has no AptosLightClient");
    return deployment.AptosLightClient as Hex;
}

function revertName(err: unknown): string {
    if (err instanceof BaseError) {
        const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
        if (reverted instanceof ContractFunctionRevertedError) {
            return reverted.data?.errorName ?? reverted.signature ?? "unknown";
        }
    }
    throw err;
}

function check(ok: boolean, message: string): void {
    if (!ok) throw new Error(`FAIL: ${message}`);
    console.log(`ok: ${message}`);
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
    const image = process.env.IMAGE_NAME;
    if (!image) throw new Error("IMAGE_NAME must name the Atomica validator image under test");
    requireTool("anvil");
    requireTool("forge");
    requireTool("docker");

    let anvil: ChildProcess | undefined;
    let testnet: DockerTestnet | undefined;
    try {
        anvil = await startAnvil();
        console.log(`anvil (prague) at ${ETH_RPC_URL}`);
        testnet = await DockerTestnet.new(4);
        const node = testnet.validatorApiUrl(0);
        console.log(`Aptos testnet (${image}) at ${node}`);

        // An event to prove: the FeeStatement V2 event of a user transaction.
        const recipient = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
        const hash = await testnet.faucet(recipient, 1000n);
        let txn: any;
        for (let i = 0; i < 120; i++) {
            const res = await fetch(`${node}/v1/transactions/by_hash/${hash}`);
            if (res.ok) {
                txn = await res.json();
                if (txn.type === "user_transaction") break;
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        check(
            txn?.type === "user_transaction" && txn.success === true,
            `faucet transaction ${hash} committed`,
        );
        const eventIndex = (txn.events as { type: string }[]).findIndex(
            (e) => e.type === FEE_STATEMENT_TYPE,
        );
        check(eventIndex >= 0, `transaction ${txn.version} emitted ${FEE_STATEMENT_TYPE}`);

        // Deploy from the node's genesis LedgerInfo and waypoint.
        const waypoint = testnet.genesisWaypoint();
        console.log(`Genesis waypoint from the testnet genesis files: ${waypoint}`);
        const address = deployLightClient(node, waypoint);
        console.log(`AptosLightClient at ${address}`);
        const abi = loadAbi();
        const publicClient = createPublicClient({ chain: foundry, transport: http(ETH_RPC_URL) });
        const walletClient = createWalletClient({
            chain: foundry,
            transport: http(ETH_RPC_URL),
            account: privateKeyToAccount(DEPLOYER_KEY),
        });

        const proof = await getJson<Record<string, string>>(
            `${node}/v1/atomica/event_proof/${txn.version}/${eventIndex}`,
        );
        const signedLi = fromHex(proof.ledger_info_with_signatures);
        const target = parseLedgerInfo(signedLi).epoch;

        // Validator sets by epoch, from the genesis LedgerInfo and each epoch change.
        const sets = new Map<bigint, ValidatorSet>();
        const genesis = await getJson<{ ledger_info_with_signatures: string }>(
            `${node}/v1/atomica/genesis_waypoint`,
        );
        const first = parseLedgerInfo(fromHex(genesis.ledger_info_with_signatures)).nextEpochState;
        if (!first) throw new Error("genesis LedgerInfo has no next epoch state");
        sets.set(first.epoch, first);

        const signed = (liws: Uint8Array) => {
            const li = parseLedgerInfo(liws);
            const set = sets.get(li.epoch);
            if (!set) throw new Error(`no validator set for epoch ${li.epoch}`);
            if (!li.signature) throw new Error("LedgerInfo is unsigned");
            const keys = set.compressedKeys
                .filter((_, i) => (li.bitmask[i >> 3] & (0x80 >> (i & 7))) !== 0)
                .map(g1Uncompressed);
            return {
                ledgerInfoWithSignatures: toHex(liws),
                epochState: toHex(set.bcs),
                signerPublicKeys: toHex(concat(...keys)),
                signature: toHex(g2Encode(bls12_381.G2.ProjectivePoint.fromHex(li.signature))),
            };
        };

        // Advance one epoch at a time up to the event's epoch.
        let latest = (await publicClient.readContract({
            address,
            abi,
            functionName: "latestEpoch",
        })) as bigint;
        while (latest < target) {
            const changes = await getJson<{ ledger_infos_with_signatures: string[] }>(
                `${node}/v1/atomica/epoch_change_proof?start_epoch=${latest}&end_epoch=${target}`,
            );
            for (const hex of changes.ledger_infos_with_signatures) {
                const liws = fromHex(hex);
                const next = parseLedgerInfo(liws).nextEpochState;
                if (!next) throw new Error("epoch change LedgerInfo has no next epoch state");
                const tx = await walletClient.writeContract({
                    address,
                    abi,
                    functionName: "advanceEpoch",
                    args: [signed(liws)],
                });
                const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
                check(receipt.status === "success", `advanceEpoch to epoch ${next.epoch}`);
                sets.set(next.epoch, next);
            }
            latest = (await publicClient.readContract({
                address,
                abi,
                functionName: "latestEpoch",
            })) as bigint;
        }

        const typeTag = toHex(structTag(FEE_STATEMENT_TYPE));
        const eventProof = {
            ledgerInfo: signed(signedLi),
            version: BigInt(proof.version),
            transactionInfo: proof.transaction_info,
            transactionAccumulatorProof: proof.transaction_accumulator_proof,
            eventIndex: BigInt(proof.event_index),
            contractEvent: proof.event,
            eventAccumulatorProof: proof.event_accumulator_proof,
        };

        // 1. The live proof verifies and returns the event payload.
        const [version, data] = (await publicClient.readContract({
            address,
            abi,
            functionName: "verifyEvent",
            args: [eventProof, typeTag],
        })) as [bigint, Hex];
        const event = new Reader(fromHex(proof.event), 1 + fromHex(typeTag).length);
        check(version === BigInt(txn.version), `verifyEvent returned version ${version}`);
        check(
            data === toHex(event.bytes()),
            `verifyEvent returned the ${FEE_STATEMENT_TYPE} payload`,
        );

        // 2. One signature byte changed: the last byte of the compressed signature.
        const tampered = Uint8Array.from(signedLi);
        tampered[tampered.length - 1] ^= 0x01;
        const tamperedProof = {
            ...eventProof,
            ledgerInfo: { ...eventProof.ledgerInfo, ledgerInfoWithSignatures: toHex(tampered) },
        };
        const reason = await publicClient
            .readContract({
                address,
                abi,
                functionName: "verifyEvent",
                args: [tamperedProof, typeTag],
            })
            .then(
                () => "accepted",
                (e: unknown) => revertName(e),
            );
        check(
            reason === "SignatureEncodingMismatch",
            `one changed signature byte is rejected (${reason})`,
        );

        // 3. A valid G2 point that is not the signature fails the pairing check.
        const li = parseLedgerInfo(signedLi);
        const wrong = bls12_381.G2.ProjectivePoint.fromHex(li.signature!).add(
            bls12_381.G2.ProjectivePoint.BASE,
        );
        const wrongLi = concat(signedLi.subarray(0, signedLi.length - 96), wrong.toRawBytes(true));
        const wrongProof = {
            ...eventProof,
            ledgerInfo: {
                ...eventProof.ledgerInfo,
                ledgerInfoWithSignatures: toHex(wrongLi),
                signature: toHex(g2Encode(wrong)),
            },
        };
        const pairing = await publicClient
            .readContract({
                address,
                abi,
                functionName: "verifyEvent",
                args: [wrongProof, typeTag],
            })
            .then(
                () => "accepted",
                (e: unknown) => revertName(e),
            );
        check(
            pairing === "InvalidSignature",
            `a wrong signature fails the pairing check (${pairing})`,
        );
    } finally {
        if (testnet) await testnet.teardown().catch((e) => console.error("teardown failed:", e));
        anvil?.kill();
    }
}

main().then(
    () => {
        console.log("Aptos light client live check passed");
        process.exit(0);
    },
    (err) => {
        console.error(err);
        process.exit(1);
    },
);
