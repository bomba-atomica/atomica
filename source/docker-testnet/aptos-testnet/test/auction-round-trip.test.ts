import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import {
    Account,
    AccountAddress,
    Aptos,
    AptosConfig,
    Ed25519PrivateKey,
    Network,
    Serializer,
    type CommittedTransactionResponse,
    type InputGenerateTransactionPayloadData,
} from "@aptos-labs/ts-sdk";
import { simulateMaxGasAmount } from "@atomica/sdk";
import {
    CONTRACT_ADDR,
    decryptWindowBids,
    getBidPayload,
    getCreateAuctionPayload,
    getLockOutcome,
    getRegisterLockPayload,
    getRegisterTimelockPayload,
    getSettlePayload,
    getSettlement,
    getSubmitCleartextPayload,
    isRevealed,
    sealBid,
    setAptosInstance,
    timelockIdFromEvents,
    type ReceiptAsset,
} from "@atomica/sdk/aptos";
import {
    auctionKey,
    currentWindowId,
    pairHashOf,
    type LockBinding,
} from "@atomica/sdk/ethereum/lock-binding";
import {
    carryOutcome,
    ethersCarrierChain,
    findOutcomeEvent,
    type CarryResult,
} from "@atomica/sdk/settlement/outcome-carrier";
import { buildOutcomeTree, outcomeProof } from "@atomica/sdk/settlement/outcome-tree";
import {
    setupDualChainTestnet,
    teardownDualChainTestnet,
    type DualChainTestnetInfo,
} from "../src/dual-chain-testnet";
import { lockAndProve, type EthLockProofResult } from "../src/browser-commands";
import { ethAccountAddress, submitAsEthAccount } from "../src/eth-derivable-account";
import { fundAccount } from "../src/localnet";

/**
 * Live cross-chain round trip of one filled trade: lock, auction, outcome,
 * release (issue 219).
 *
 * Both chains run for real: the Aptos Docker testnet and the Docker PoS
 * Ethereum chain (ETH_BACKEND unset), where Prague gives AptosLightClient its
 * EIP-2537 BLS precompiles. setupDualChainTestnet deploys AptosLightClient from
 * the Aptos genesis and a LockBox that verifies outcomes with it.
 *
 * Flow: a seller locks FakeETH and two bidders lock FakeUSD in LockBox, all
 * bound to one window and the launch pair. Each lock is proven on Aptos with
 * `lock_receipt::register_ethereum_lock`. The seller creates the auction and
 * both bidders submit sealed bids, each signing as its Ethereum-derivable
 * Aptos account (SIWE, ../src/eth-derivable-account). The winner bids for the
 * whole supply at the higher price; the loser bids lower and gets nothing.
 * After the timelock key is revealed the bids are opened and `auction::settle`
 * emits one `AuctionOutcome`. The carrier account (Ethereum test account 2,
 * no depositor) carries it with the SDK `carryOutcome` through the light
 * client to `LockBox.recordOutcome`, then releases all three locks with
 * `releaseByOutcome`, each leaf rebuilt from `lock_receipt::get_lock_outcome`.
 *
 * Unwind and reclaim are covered by 17-unwind.test.tsx and the forge suites.
 * Fails loudly when Docker, the Aptos CLI or forge output is missing.
 */

/** Pair { ethereum, FakeETH, aptos, FakeUSD } in BCS: the launch pair. */
const LAUNCH_PAIR_BCS = (() => {
    const s = new Serializer();
    for (const field of ["ethereum", "FakeETH", "aptos", "FakeUSD"]) {
        s.serializeBytes(new TextEncoder().encode(field));
    }
    return s.toUint8Array();
})();

const ETH = 10n ** 18n;
const USD = 10n ** 6n;
/** The seller's FakeETH lock: the window's whole supply. */
const SUPPLY = 1n * ETH;
/** FakeUSD collateral each bidder locks. */
const COLLATERAL = 500n * USD;
/** Whole USD per whole FakeETH. The winner pays 200 FakeUSD for the supply. */
const WIN_PRICE = 200n;
const LOSE_PRICE = 100n;
/** Bids close this long after the timelock is registered. */
const BID_WINDOW_US = 240_000_000n;
/** Gas the Ethereum-derivable accounts get (5 APT). */
const ETH_ACCOUNT_GAS_OCTAS = 500_000_000;
/** `maxEpochAge` of the testnet light client (LIGHT_CLIENT_MAX_EPOCH_AGE). */
const MAX_EPOCH_AGE = 43_200n;
/** `LockBox.Status.Released`. */
const STATUS_RELEASED = 2n;

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const LIGHT_CLIENT_ABI = ["function maxEpochAge() view returns (uint64)"];
const LOCK_TUPLE =
    "(address depositor, address token, uint256 nonce, uint256 amount, uint64 windowId, bytes32 pairHash, uint64 deadline)";
const LOCKBOX_ABI = [
    "function outcomes(bytes32 auctionKey) view returns (bytes32 root, uint64 leafCount)",
    "function statuses(bytes32 lockId) view returns (uint8)",
    "function lightClient() view returns (address)",
    `function releaseByOutcome(${LOCK_TUPLE} l, (address recipient, uint256 amount)[] payouts, (uint256 index, bytes32[] proof) leaf)`,
    "event OutcomeRecorded(bytes32 indexed auctionKey, uint64 windowId, bytes32 pairHash, uint64 deadline, bytes32 root, uint64 leafCount, uint64 aptosVersion)",
    "event LockReleased(bytes32 indexed lockId, bytes32 indexed auctionKey)",
    "error PayoutSumMismatch(uint256 sum, uint256 amount)",
    "error InvalidProof()",
];

type Proof = EthLockProofResult["proof"];

/** One depositor's lock, with its token balance just after locking. */
interface TestLock {
    asset: ReceiptAsset;
    privateKey: string;
    address: string;
    proof: Proof;
    /** Balance of the locked token before the lock (after the test mint) */
    preLock: bigint;
}

/** Fields of the window's `AuctionOutcome` event. */
interface OutcomeEventData {
    window_id: string;
    pair_hash: string;
    eth_lock_deadline: string;
    dispositions_root: string;
    leaf_count: string;
}

let info: DualChainTestnetInfo;
let provider: ethers.JsonRpcProvider;
let aptos: Aptos;
let operator: Account;
let carrier: ethers.Wallet;
let lockBox: ethers.Contract;
let fakeEth: ethers.Contract;
let fakeUsd: ethers.Contract;

let seller: TestLock;
let winner: TestLock;
let loser: TestLock;
let windowId: bigint;
let binding: LockBinding;
let carry: CarryResult;
let outcomeEvent: OutcomeEventData;
/** Balances read after the locks, before any release. */
let sellerUsdBefore: bigint;
let winnerEthBefore: bigint;

/** Poll `probe` every 2 s until it returns a value, or throw after `timeoutSecs`. */
async function pollUntil<T>(
    what: string,
    timeoutSecs: number,
    probe: () => Promise<T | undefined>,
): Promise<T> {
    const deadline = Date.now() + timeoutSecs * 1000;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            const value = await probe();
            if (value !== undefined) return value;
        } catch (e) {
            lastError = e;
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Timed out after ${timeoutSecs}s waiting for ${what}: ${String(lastError)}`);
}

async function chainNowUs(): Promise<bigint> {
    return BigInt((await aptos.getLedgerInfo()).ledger_timestamp);
}

/** Submit as the operator (the Aptos deployer, here just any account); throws on abort. */
async function submitAsOperator(
    data: InputGenerateTransactionPayloadData,
): Promise<CommittedTransactionResponse> {
    const maxGasAmount = await simulateMaxGasAmount(aptos, operator.accountAddress, data);
    const txn = await aptos.transaction.build.simple({
        sender: operator.accountAddress,
        data,
        options: maxGasAmount !== undefined ? { maxGasAmount } : undefined,
    });
    const submitted = await aptos.signAndSubmitTransaction({ signer: operator, transaction: txn });
    return aptos.waitForTransaction({
        transactionHash: submitted.hash,
        options: { checkSuccess: true },
    });
}

/**
 * Lock `amount` of `asset` for `privateKey` in LockBox, bound to the current
 * window and the launch pair, and prove the lock at a certified block.
 */
async function lockFor(
    privateKey: string,
    asset: ReceiptAsset,
    amount: bigint,
    mintAmount: bigint,
): Promise<TestLock> {
    const token = asset === "FakeETH" ? info.eth.contracts.fakeETH : info.eth.contracts.fakeUSD;
    const [{ proof }] = await lockAndProve(
        info.eth.rpcUrl,
        info.aptos.nodeUrl,
        privateKey,
        token,
        info.eth.contracts.lockBox,
        amount,
        mintAmount,
        1,
        ethers.hexlify(LAUNCH_PAIR_BCS),
    );
    const address = new ethers.Wallet(privateKey).address;
    const erc20 = asset === "FakeETH" ? fakeEth : fakeUsd;
    const preLock = ((await erc20.balanceOf(address)) as bigint) + amount;
    return { asset, privateKey, address, proof, preLock };
}

/** Register a lock on Aptos with the SDK builder; the operator carries the proof. */
async function register(lock: TestLock): Promise<void> {
    const p = lock.proof;
    await submitAsOperator(
        getRegisterLockPayload(
            {
                ...p,
                lockNonce: BigInt(p.lockNonce),
                amount: BigInt(p.amount),
                windowId: BigInt(p.windowId),
                deadline: BigInt(p.deadline),
                storageValue: BigInt(p.storageValue),
            },
            lock.asset,
        ),
    );
}

function lockTuple(p: Proof) {
    return [
        p.userAddress,
        p.tokenAddress,
        BigInt(p.lockNonce),
        BigInt(p.amount),
        BigInt(p.windowId),
        p.pairHash,
        BigInt(p.deadline),
    ];
}

/** The payouts Aptos recorded for each lock, and the outcome tree they rebuild. */
async function outcomeLeaves() {
    const locks = [seller, winner, loser];
    const outcomes = await Promise.all(locks.map((l) => getLockOutcome(l.asset, l.proof.lockId)));
    const entries = locks.map((l, i) => ({
        lockId: l.proof.lockId,
        payouts: outcomes[i].recipients.map((recipient, j) => ({
            recipient,
            amount: outcomes[i].amounts[j],
        })),
    }));
    return { entries, tree: buildOutcomeTree(entries) };
}

/** Expect `call` to revert with the LockBox custom error `name`. */
async function expectRevert(call: Promise<unknown>, name: string): Promise<void> {
    const error = await call.then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(error, `expected ${name}`).toBeDefined();
    const revert = (error as { revert?: { name?: string } }).revert;
    expect(revert?.name ?? String(error)).toContain(name);
}

/** The winner's FakeETH fill and the seller's FakeUSD proceeds (`auction::quote_for_fill`). */
async function settlement(): Promise<{ filled: bigint; quote: bigint; clearingPrice: bigint }> {
    const { clearingPrice, totalFilled } = await getSettlement(windowId, LAUNCH_PAIR_BCS);
    return {
        filled: totalFilled,
        clearingPrice,
        quote: (totalFilled * clearingPrice * USD) / ETH,
    };
}

describe.sequential("Live cross-chain round trip: lock, auction, outcome, release", () => {
    beforeAll(async () => {
        info = await setupDualChainTestnet();
        provider = new ethers.JsonRpcProvider(info.eth.rpcUrl, undefined, { cacheTimeout: -1 });
        aptos = new Aptos(
            new AptosConfig({ network: Network.LOCAL, fullnode: info.aptos.nodeUrl }),
        );
        setAptosInstance(aptos);
        // The SDK builders address CONTRACT_ADDR (VITE_CONTRACT_ADDRESS, .env.test).
        if (
            AccountAddress.from(CONTRACT_ADDR).toString() !==
            AccountAddress.from(info.aptos.moduleAddress).toString()
        ) {
            throw new Error(
                `SDK CONTRACT_ADDR ${CONTRACT_ADDR} is not the test module ${info.aptos.moduleAddress}`,
            );
        }
        operator = Account.fromPrivateKey({
            privateKey: new Ed25519PrivateKey(info.aptos.deployerPrivateKey),
        });
        carrier = new ethers.Wallet(info.eth.carrierPrivateKey, provider);
        lockBox = new ethers.Contract(info.eth.contracts.lockBox, LOCKBOX_ABI, carrier);
        fakeEth = new ethers.Contract(info.eth.contracts.fakeETH, ERC20_ABI, provider);
        fakeUsd = new ethers.Contract(info.eth.contracts.fakeUSD, ERC20_ABI, provider);
        const domain = info.aptos.siweDomain;
        const moduleAddr = info.aptos.moduleAddress;

        // 1. Three locks on Ethereum, one per depositor, proven at certified blocks.
        [seller, winner, loser] = await Promise.all([
            lockFor(info.eth.deployerPrivateKey, "FakeETH", SUPPLY, 10n * SUPPLY),
            lockFor(info.eth.bidderPrivateKey, "FakeUSD", COLLATERAL, 2n * COLLATERAL),
            lockFor(info.eth.secondBidderPrivateKey, "FakeUSD", COLLATERAL, 2n * COLLATERAL),
        ]);
        sellerUsdBefore = (await fakeUsd.balanceOf(seller.address)) as bigint;
        winnerEthBefore = (await fakeEth.balanceOf(winner.address)) as bigint;
        windowId = BigInt(seller.proof.windowId);
        binding = {
            windowId,
            pairHash: seller.proof.pairHash,
            deadline: BigInt(seller.proof.deadline),
        };
        for (const l of [winner, loser]) {
            expect(l.proof.windowId).toBe(seller.proof.windowId);
        }

        // 2. Each lock proven on Aptos.
        for (const l of [seller, winner, loser]) await register(l);

        // 3. The window's timelock, once the epoch's timelock key exists.
        await pollUntil("ibe_config::is_ready", 600, async () => {
            const [ready] = await aptos.view({
                payload: { function: "0x1::ibe_config::is_ready", functionArguments: [] },
            });
            return ready === true ? true : undefined;
        });
        const bidDeadlineUs = (await chainNowUs()) + BID_WINDOW_US;
        const registered = await submitAsOperator(getRegisterTimelockPayload(bidDeadlineUs));
        const timelockId = timelockIdFromEvents("events" in registered ? registered.events : []);
        const chainWindow = currentWindowId((await chainNowUs()) / 1_000_000n);
        if (chainWindow !== windowId) {
            throw new Error(
                `the locks are bound to window ${windowId}, but the chain is in window ${chainWindow}`,
            );
        }

        // 4. The seller creates the auction and both bidders bid, each as its
        //    Ethereum-derivable account (only it can claim its receipt).
        for (const l of [seller, winner, loser]) {
            await fundAccount(await ethAccountAddress(l.privateKey, domain), ETH_ACCOUNT_GAS_OCTAS);
        }
        await submitAsEthAccount(
            aptos,
            seller.privateKey,
            domain,
            getCreateAuctionPayload(
                windowId,
                LAUNCH_PAIR_BCS,
                ethers.getBytes(seller.proof.lockId),
                timelockId,
            ),
        );
        for (const [bidder, price] of [
            [winner, WIN_PRICE],
            [loser, LOSE_PRICE],
        ] as const) {
            const sealed = await sealBid(
                windowId,
                LAUNCH_PAIR_BCS,
                await ethAccountAddress(bidder.privateKey, domain),
                price,
            );
            await submitAsEthAccount(
                aptos,
                bidder.privateKey,
                domain,
                getBidPayload(
                    windowId,
                    LAUNCH_PAIR_BCS,
                    sealed.ciphertext,
                    sealed.commitment,
                    ethers.getBytes(bidder.proof.lockId),
                    SUPPLY,
                ),
            );
        }

        // 5. Bids close, the validators reveal the key, the bids are opened
        //    (which clears the window) and the window settles.
        await pollUntil("the bid deadline", 600, async () =>
            (await chainNowUs()) >= bidDeadlineUs ? true : undefined,
        );
        await pollUntil(`timelock ${timelockId} reveal`, 900, async () =>
            (await isRevealed(timelockId)) ? true : undefined,
        );
        const opened = await decryptWindowBids(windowId, LAUNCH_PAIR_BCS);
        expect(opened.map((b) => b.matchesCommitment)).toEqual([true, true]);
        await submitAsOperator(
            getSubmitCleartextPayload(
                windowId,
                LAUNCH_PAIR_BCS,
                opened.map((b) => b.price!),
                opened.map((b) => b.salt!),
            ),
        );
        const settled = await submitAsOperator(getSettlePayload(windowId, LAUNCH_PAIR_BCS));

        // 6. The carrier finds the AuctionOutcome and carries it to LockBox.
        const at = await findOutcomeEvent(
            info.aptos.nodeUrl,
            moduleAddr,
            windowId,
            pairHashOf(LAUNCH_PAIR_BCS),
            { fromVersion: BigInt(settled.version) },
        );
        if (!at) throw new Error(`no AuctionOutcome found for window ${windowId}`);
        const txn = (await aptos.getTransactionByVersion({ ledgerVersion: at.version })) as {
            events?: Array<{ data: unknown }>;
        };
        outcomeEvent = txn.events![Number(at.eventIndex)].data as OutcomeEventData;
        carry = await carryOutcome(
            await ethersCarrierChain(carrier, info.eth.contracts.lockBox),
            [info.aptos.nodeUrl],
            at.version,
            at.eventIndex,
        );
    }, 2_400_000);

    afterAll(async () => {
        await teardownDualChainTestnet();
    }, 300_000);

    it("LockBox.outcomes(auctionKey) holds the root and leaf count of the AuctionOutcome event that auction::settle emitted", async () => {
        expect(carry).toEqual({ status: "recorded" });

        const lightClient = new ethers.Contract(
            (await lockBox.lightClient()) as string,
            LIGHT_CLIENT_ABI,
            provider,
        );
        expect(await lightClient.maxEpochAge()).toBe(MAX_EPOCH_AGE);
        expect(await lockBox.lightClient()).toBe(info.eth.contracts.lightClient);

        expect(BigInt(outcomeEvent.window_id)).toBe(windowId);
        expect(outcomeEvent.pair_hash).toBe(pairHashOf(LAUNCH_PAIR_BCS));
        expect(BigInt(outcomeEvent.eth_lock_deadline)).toBe(binding.deadline);
        const [root, leafCount] = (await lockBox.outcomes(auctionKey(binding))) as [string, bigint];
        expect(root).toBe(outcomeEvent.dispositions_root);
        expect(leafCount).toBe(BigInt(outcomeEvent.leaf_count));
        expect(leafCount).toBe(3n);
    });

    it("releaseByOutcome with one payout amount changed reverts, before the valid release of that lock", async () => {
        const { entries, tree } = await outcomeLeaves();
        const [root] = (await lockBox.outcomes(auctionKey(binding))) as [string, bigint];
        expect(tree.root).toBe(root);

        const leafOf = (l: TestLock) => {
            const index = tree.leaves.findIndex((leaf) => leaf.lockId === l.proof.lockId);
            expect(index).toBeGreaterThanOrEqual(0);
            const payouts = entries.find((e) => e.lockId === l.proof.lockId)!.payouts;
            return { index, proof: outcomeProof(tree, index), payouts };
        };

        // The winner's collateral pays the seller and refunds the winner.
        const { index, proof, payouts } = leafOf(winner);
        expect(payouts).toHaveLength(2);
        const asTuples = (ps: { recipient: string; amount: bigint }[]) =>
            ps.map((p) => [p.recipient, p.amount]);
        // One amount raised: the payouts no longer sum to the lock amount.
        await expectRevert(
            lockBox.releaseByOutcome.staticCall(
                lockTuple(winner.proof),
                asTuples([{ ...payouts[0], amount: payouts[0].amount + 1n }, payouts[1]]),
                [index, proof],
            ),
            "PayoutSumMismatch",
        );
        // One unit moved between the payouts: the sum holds, the leaf does not.
        await expectRevert(
            lockBox.releaseByOutcome.staticCall(
                lockTuple(winner.proof),
                asTuples([
                    { ...payouts[0], amount: payouts[0].amount + 1n },
                    { ...payouts[1], amount: payouts[1].amount - 1n },
                ]),
                [index, proof],
            ),
            "InvalidProof",
        );

        // The valid release of every lock, from the carrier.
        for (const l of [winner, seller, loser]) {
            const leaf = leafOf(l);
            const tx = (await lockBox.releaseByOutcome(lockTuple(l.proof), asTuples(leaf.payouts), [
                leaf.index,
                leaf.proof,
            ])) as ethers.ContractTransactionResponse;
            const receipt = await tx.wait();
            expect(receipt?.status).toBe(1);
        }
    });

    it("the seller's FakeUSD balance rises by clearing price times filled quantity, and unsold FakeETH returns", async () => {
        const { filled, quote, clearingPrice } = await settlement();
        expect(clearingPrice).toBe(WIN_PRICE);
        // The winner took the whole supply, so nothing is unsold here.
        expect(filled).toBe(SUPPLY);
        expect(quote).toBe(200n * USD);
        expect(await fakeUsd.balanceOf(seller.address)).toBe(sellerUsdBefore + quote);
        // Unsold FakeETH (lock amount minus fill) returns to the seller.
        const unsold = SUPPLY - filled;
        expect(await fakeEth.balanceOf(seller.address)).toBe(seller.preLock - SUPPLY + unsold);
    });

    it("the winner's FakeETH balance rises by the filled quantity and its excess FakeUSD collateral returns", async () => {
        const { filled, quote } = await settlement();
        expect(await fakeEth.balanceOf(winner.address)).toBe(winnerEthBefore + filled);
        expect(await fakeUsd.balanceOf(winner.address)).toBe(winner.preLock - quote);
    });

    it("the loser's FakeUSD balance equals its balance before the lock", async () => {
        expect(await fakeUsd.balanceOf(loser.address)).toBe(loser.preLock);
    });

    it("LockBox holds zero FakeETH and zero FakeUSD at the end, and statuses(lockId) is Released for all three locks", async () => {
        expect(await fakeEth.balanceOf(info.eth.contracts.lockBox)).toBe(0n);
        expect(await fakeUsd.balanceOf(info.eth.contracts.lockBox)).toBe(0n);
        for (const l of [seller, winner, loser]) {
            expect(await lockBox.statuses(l.proof.lockId)).toBe(STATUS_RELEASED);
        }
    });

    it("the account that calls recordOutcome and releaseByOutcome is neither a depositor nor the deployer of the Aptos package", async () => {
        const depositors = [seller, winner, loser].map((l) => l.address.toLowerCase());
        expect(depositors).not.toContain(carrier.address.toLowerCase());
        const carrierAptos = AccountAddress.from(
            await ethAccountAddress(info.eth.carrierPrivateKey, info.aptos.siweDomain),
        ).toString();
        expect(carrierAptos).not.toBe(AccountAddress.from(info.aptos.moduleAddress).toString());
        expect(carrierAptos).not.toBe(operator.accountAddress.toString());

        // Every OutcomeRecorded and LockReleased of this auction came from the carrier.
        const key = auctionKey(binding);
        const logs = [
            ...(await lockBox.queryFilter(lockBox.filters.OutcomeRecorded(key))),
            ...(await lockBox.queryFilter(lockBox.filters.LockReleased(null, key))),
        ];
        expect(logs).toHaveLength(4);
        for (const log of logs) {
            const tx = await provider.getTransaction(log.transactionHash);
            expect(tx?.from).toBe(carrier.address);
        }
    });
});
