import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import {
    Account,
    Aptos,
    AptosConfig,
    Ed25519PrivateKey,
    Network,
    type InputGenerateTransactionPayloadData,
} from "@aptos-labs/ts-sdk";
import {
    getLockReceipt,
    type LockAsset,
    type LockReceiptInfo,
} from "@atomica/sdk/settlement/bridge";
import {
    setupDualChainTestnet,
    teardownDualChainTestnet,
    type DualChainTestnetInfo,
} from "../src/dual-chain-testnet";
import { generateEthLockProofCommand, type EthLockProofResult } from "../src/browser-commands";
import { waitForCertifiedEthBlock, waitForEthBlock } from "../src/eth-blocks";

// SCOUT(#219) EDIT: the header comment below says outcome release is covered only by forge tests; test/auction-round-trip.test.ts adds the live release, and setup then deploys a real light client, so the NoOutcome case below still holds but recordOutcome no longer reverts on this testnet.
/**
 * Live dual-chain test of the proof-gated LockBox (issue 203).
 *
 * Both chains run for real (Aptos Docker testnet + Ethereum, ETH_BACKEND).
 * Each case locks real ERC-20s in LockBox, bound to an auction window (window
 * id, pair hash, deadline = auction::eth_lock_deadline(window id)), and proves
 * the lock's commitment slot on Aptos with `lock_receipt::register_ethereum_lock`.
 *
 * Cases: the receipt holds the proven lock and its binding; registration
 * rejects a wrong amount and a wrong deadline; one lock gives one receipt;
 * and LockBox releases nothing without a proven outcome or before the lock
 * deadline. No relayer exists: LockBox has no relayer-only release or
 * pull-payment path. Outcome release (releaseByOutcome) and reclaim are covered
 * by the forge LockBox unit, invariant and light client integration tests.
 *
 * Every proof is checked against a header the Aptos validators certified
 * (0x1::ethereum_headers). No one submits a header. The registering account
 * is the Aptos deployer, which has no special rights: any account may carry
 * a proof.
 *
 * Fails loudly when Docker, the Aptos CLI or forge output is missing.
 */

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
// SCOUT(#221) EDIT: LOCKBOX_ABI below follows the redeployed LockBox: the Lock tuple and lockCommitment keep the deadline only if the Solidity struct and helper keep it.
// SCOUT(#222) EDIT: LOCKBOX_ABI below gains reclaimUnpayable and its errors if this live test covers the new path; the NoOutcome case is unchanged.
const LOCK_TUPLE =
    "(address depositor, address token, uint256 nonce, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 deadline)";
const LOCKBOX_ABI = [
    "function commitments(bytes32 lockId) view returns (bytes32)",
    "function statuses(bytes32 lockId) view returns (uint8)",
    "function lockCommitment(address depositor, address token, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 deadline) pure returns (bytes32)",
    `function reclaim(${LOCK_TUPLE} l, (bytes32 lockId, bytes32 payoutsHash, uint256 index, bytes32[] proof)[] neighbours)`,
    `function releaseByOutcome(${LOCK_TUPLE} l, (address recipient, uint256 amount)[] payouts, (uint256 index, bytes32[] proof) leaf)`,
    "error DeadlineNotReached(uint64 deadline)",
    "error NoOutcome(bytes32 auctionKey)",
];
const STATUS_OPEN = 1n;

const ETH = 10n ** 18n;
const USD = 10n ** 6n;

type Proof = EthLockProofResult["proof"];

let info: DualChainTestnetInfo;
let provider: ethers.JsonRpcProvider;
let aptos: Aptos;
let aptosDeployer: Account;

function token(asset: LockAsset): string {
    return asset === "FakeETH" ? info.eth.contracts.fakeETH : info.eth.contracts.fakeUSD;
}

/** Submit one Aptos entry function as the deployer, here just a carrier account. */
async function submitAsDeployer(data: InputGenerateTransactionPayloadData): Promise<void> {
    const txn = await aptos.transaction.build.simple({
        sender: aptosDeployer.accountAddress,
        data,
    });
    const submitted = await aptos.signAndSubmitTransaction({
        signer: aptosDeployer,
        transaction: txn,
    });
    await aptos.waitForTransaction({
        transactionHash: submitted.hash,
        options: { checkSuccess: true },
    });
}

// SCOUT(#221) EDIT: register() below drops proof.deadline from the register_ethereum_lock arguments.
// SCOUT(#233) EDIT: register() below hand-builds the register payload, a third copy of that ABI; it can call the SDK getRegisterLockPayload once it takes the asset.
/**
 * Register the lock proven at the certified block `proof.blockNumber`. Aptos
 * derives the storage key, recomputes the commitment from the lock fields and
 * checks the proof against the certified root only.
 */
async function register(asset: LockAsset, proof: Proof): Promise<void> {
    const moduleAddr = info.aptos.moduleAddress;
    await submitAsDeployer({
        function: `${moduleAddr}::lock_receipt::register_ethereum_lock`,
        typeArguments: [`${moduleAddr}::lock_receipt::${asset}`],
        functionArguments: [
            proof.blockNumber,
            ethers.getBytes(proof.userAddress),
            proof.lockNonce,
            proof.amount,
            proof.windowId,
            ethers.getBytes(proof.pairHash),
            proof.deadline,
            proof.accountProof.map((p: string) => ethers.getBytes(p)),
            proof.storageProof.map((p: string) => ethers.getBytes(p)),
        ],
    });
}

/** Lock `amount` of `asset` for the holder of `privateKey` and prove it, without registering. */
async function lockAndProve(
    privateKey: string,
    asset: LockAsset,
    amount: bigint,
    mintAmount: bigint,
): Promise<EthLockProofResult> {
    return generateEthLockProofCommand(
        {} as never,
        info.eth.rpcUrl,
        info.aptos.nodeUrl,
        privateKey,
        token(asset),
        info.eth.contracts.lockBox,
        amount.toString(),
        mintAmount.toString(),
    );
}

/** Lock, prove and register; return the receipt Aptos holds for the lock. */
async function lockAndRegister(
    privateKey: string,
    asset: LockAsset,
    amount: bigint,
    mintAmount: bigint,
): Promise<LockReceiptInfo & { proof: Proof }> {
    const { lockId, proof } = await lockAndProve(privateKey, asset, amount, mintAmount);
    await register(asset, proof);

    const receipt = await getLockReceipt(aptos, info.aptos.moduleAddress, asset, lockId);
    const owner = new ethers.Wallet(privateKey).address;
    expect(receipt.user).toBe(owner);
    // The receipt holds exactly this lock (issue 171).
    expect(receipt.amount).toBe(amount);
    return { ...receipt, proof };
}

/** Expect `call` to revert with the LockBox custom error `name`. */
async function expectLockBoxRevert(call: Promise<unknown>, name: string): Promise<void> {
    const error = await call.then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(error, `expected ${name}`).toBeDefined();
    const revert = (error as { revert?: { name?: string } }).revert;
    expect(revert?.name ?? String(error)).toContain(name);
}

function lockTuple(proof: Proof) {
    return [
        proof.userAddress,
        proof.tokenAddress,
        BigInt(proof.lockNonce),
        BigInt(proof.amount),
        BigInt(proof.windowId),
        proof.pairHash,
        BigInt(proof.deadline),
    ];
}

describe.sequential("Proof-gated LockBox with Aptos lock registration (live dual-chain)", () => {
    beforeAll(async () => {
        info = await setupDualChainTestnet();
        provider = new ethers.JsonRpcProvider(info.eth.rpcUrl, undefined, { cacheTimeout: -1 });
        aptos = new Aptos(
            new AptosConfig({ network: Network.LOCAL, fullnode: info.aptos.nodeUrl }),
        );
        aptosDeployer = Account.fromPrivateKey({
            privateKey: new Ed25519PrivateKey(info.aptos.deployerPrivateKey),
        });
    }, 1_200_000);

    afterAll(async () => {
        await teardownDualChainTestnet();
    }, 300_000);

    it("registers the lock's commitment: the receipt holds the amount, the binding and the depositor", async () => {
        const lockAmount = 10n * ETH;
        const receipt = await lockAndRegister(
            info.eth.deployerPrivateKey,
            "FakeETH",
            lockAmount,
            100n * ETH,
        );
        const { proof } = receipt;

        // The proven slot holds LockBox's commitment to the lock fields.
        const lockBox = new ethers.Contract(info.eth.contracts.lockBox, LOCKBOX_ABI, provider);
        const commitment = await lockBox.lockCommitment(
            proof.userAddress,
            proof.tokenAddress,
            lockAmount,
            BigInt(proof.windowId),
            proof.pairHash,
            BigInt(proof.deadline),
        );
        expect(await lockBox.commitments(proof.lockId)).toBe(commitment);
        expect(BigInt(proof.storageValue)).toBe(BigInt(commitment));
        expect(await lockBox.statuses(proof.lockId)).toBe(STATUS_OPEN);

        // SCOUT(#220) EDIT: the deadline this case reads back follows the new window close formula on both sides; no constant here changes.
        // Aptos keeps the binding and accepts only eth_lock_deadline(window id).
        const moduleAddr = info.aptos.moduleAddress;
        const [windowId, pairHash] = await aptos.view({
            payload: {
                function: `${moduleAddr}::lock_receipt::get_receipt_binding`,
                typeArguments: [
                    `${moduleAddr}::lock_receipt::Ethereum`,
                    `${moduleAddr}::lock_receipt::FakeETH`,
                ],
                functionArguments: [ethers.getBytes(proof.lockId)],
            },
        });
        expect(String(windowId)).toBe(proof.windowId);
        expect(String(pairHash)).toBe(proof.pairHash);
        const [deadline] = await aptos.view({
            payload: {
                function: `${moduleAddr}::auction::eth_lock_deadline`,
                functionArguments: [proof.windowId],
            },
        });
        expect(String(deadline)).toBe(proof.deadline);
    }, 900_000);

    // SCOUT(#221) EDIT: the wrong-deadline half of this case goes with the deadline argument and E_WRONG_DEADLINE; a commitment with another deadline can no longer be created through lock().
    it("registration rejects a wrong amount and a wrong deadline", async () => {
        const { proof } = await lockAndProve(
            info.eth.bidderPrivateKey,
            "FakeUSD",
            500n * USD,
            1_000n * USD,
        );
        await expect(
            register("FakeUSD", { ...proof, amount: (BigInt(proof.amount) - 1n).toString() }),
        ).rejects.toThrow(/E_COMMITMENT_MISMATCH/);
        await expect(
            register("FakeUSD", { ...proof, deadline: (BigInt(proof.deadline) + 1n).toString() }),
        ).rejects.toThrow(/E_WRONG_DEADLINE/);
        // The true fields register.
        await register("FakeUSD", proof);
    }, 900_000);

    it("LockBox releases nothing before the deadline or without a proven outcome", async () => {
        const amount = 1n * ETH;
        const { proof } = await lockAndProve(
            info.eth.bidderPrivateKey,
            "FakeETH",
            amount,
            10n * ETH,
        );
        const lockBox = new ethers.Contract(
            info.eth.contracts.lockBox,
            LOCKBOX_ABI,
            new ethers.NonceManager(new ethers.Wallet(info.eth.deployerPrivateKey, provider)),
        );
        const erc20 = new ethers.Contract(token("FakeETH"), ERC20_ABI, provider);
        const held = (await erc20.balanceOf(info.eth.contracts.lockBox)) as bigint;

        // Any caller, before the deadline: reclaim reverts.
        await expectLockBoxRevert(
            lockBox.reclaim.staticCall(lockTuple(proof), []),
            "DeadlineNotReached",
        );
        // No AuctionOutcome was recorded for the lock's auction: nothing to release.
        await expectLockBoxRevert(
            lockBox.releaseByOutcome.staticCall(
                lockTuple(proof),
                [[proof.userAddress, amount]],
                [0n, []],
            ),
            "NoOutcome",
        );

        expect(await lockBox.statuses(proof.lockId)).toBe(STATUS_OPEN);
        expect(await erc20.balanceOf(info.eth.contracts.lockBox)).toBe(held);
        expect(held).toBeGreaterThanOrEqual(amount);
    }, 900_000);

    it("one lock gives one receipt: the same lock proven at a later certified block is rejected", async () => {
        const first = await lockAndRegister(
            info.eth.bidderPrivateKey,
            "FakeETH",
            1n * ETH,
            10n * ETH,
        );
        // Prove the same lock slot at a later certified block, under a new
        // state root. Mine past the first proof block and wait for the
        // validators to certify a later one.
        await waitForEthBlock(provider, first.proof.blockNumber + 1, 300, "Later Proof");
        const later = await waitForCertifiedEthBlock(
            info.aptos.nodeUrl,
            first.proof.blockNumber + 1,
        );
        const block = await provider.getBlock(later);
        expect(block?.stateRoot).toBeTruthy();
        expect(block!.stateRoot).not.toBe(first.proof.stateRoot);
        const ethProof = await provider.send("eth_getProof", [
            info.eth.contracts.lockBox,
            [first.proof.storageKey],
            `0x${later.toString(16)}`,
        ]);
        await expect(
            register("FakeETH", {
                ...first.proof,
                blockNumber: later,
                accountProof: ethProof.accountProof as string[],
                storageProof: ethProof.storageProof[0].proof as string[],
            }),
        ).rejects.toThrow(/E_ALREADY_CLAIMED/);
    }, 900_000);
});
