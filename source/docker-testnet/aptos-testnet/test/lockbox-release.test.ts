import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import { Account, Aptos, AptosConfig, Ed25519PrivateKey, Network } from "@aptos-labs/ts-sdk";
import {
    capToLocksInBlock,
    executeLockBoxReleases,
    getLockReceipt,
    planRefundReleases,
    planSettlementReleases,
    quoteForFill,
    RECEIPT_STATUS_REVOKED,
    type BridgeConfig,
    type LockAsset,
    type LockReceiptInfo,
} from "@atomica/sdk/settlement/bridge";
import {
    setupDualChainTestnet,
    teardownDualChainTestnet,
    type DualChainTestnetInfo,
} from "../src/dual-chain-testnet";
import { generateEthLockProofCommand } from "../src/browser-commands";

/**
 * Live dual-chain test: Ethereum LockBox releases follow Aptos outcomes.
 *
 * Both chains run for real (Aptos Docker testnet + Ethereum, ETH_BACKEND).
 * Each case locks real ERC-20s in LockBox, proves the lock on Aptos with
 * `lock_receipt::register_ethereum_lock`, reads the receipt back through
 * the relayer (`getLockReceipt`), sends the planned releases with the
 * relayer's NonceManager (`executeLockBoxReleases`), pulls them with
 * `withdrawWinnings`, and asserts ERC-20 balances.
 *
 * Cases: refund, winner payout, seller payout.
 *
 * The auction outcome itself (AuctionRefunded / AuctionSettled) is applied to
 * the live receipts here. A live auction cannot settle until real V2 bids
 * land (issue 167, then the browser auction suite in issue 168).
 *
 * Fails loudly when Docker, the Aptos CLI or forge output is missing.
 */

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const LOCKBOX_ABI = [
    "function withdrawWinnings(address token)",
    "function getLockedBalance(address user, address token) view returns (uint256)",
    "function getWithdrawable(address user, address token) view returns (uint256)",
];

const ETH = 10n ** 18n;
const USD = 10n ** 6n;

let info: DualChainTestnetInfo;
let provider: ethers.JsonRpcProvider;
let aptos: Aptos;
let aptosDeployer: Account;
let bridge: BridgeConfig;

function token(asset: LockAsset): string {
    return asset === "FakeETH" ? info.eth.contracts.fakeETH : info.eth.contracts.fakeUSD;
}

async function balanceOf(asset: LockAsset, owner: string): Promise<bigint> {
    const erc20 = new ethers.Contract(token(asset), ERC20_ABI, provider);
    return (await erc20.balanceOf(owner)) as bigint;
}

/** Pull every credited balance of `asset` for the holder of `privateKey`. */
async function withdrawWinnings(privateKey: string, asset: LockAsset): Promise<void> {
    const signer = new ethers.NonceManager(new ethers.Wallet(privateKey, provider));
    const lockBox = new ethers.Contract(info.eth.contracts.lockBox, LOCKBOX_ABI, signer);
    const tx = await lockBox.withdrawWinnings(token(asset));
    const receipt = await tx.wait();
    expect(receipt?.status).toBe(1);
}

/**
 * Lock `amount` of `asset` in LockBox for the holder of `privateKey`, prove the
 * lock on Aptos, and return the receipt the relayer reads back from Aptos.
 */
async function lockAndRegister(
    privateKey: string,
    asset: LockAsset,
    amount: bigint,
    mintAmount: bigint,
): Promise<LockReceiptInfo> {
    const { lockId, proof } = await generateEthLockProofCommand(
        {} as never,
        info.eth.rpcUrl,
        privateKey,
        token(asset),
        info.eth.contracts.lockBox,
        amount.toString(),
        mintAmount.toString(),
    );

    const moduleAddr = info.aptos.moduleAddress;
    const txn = await aptos.transaction.build.simple({
        sender: aptosDeployer.accountAddress,
        data: {
            function: `${moduleAddr}::lock_receipt::register_ethereum_lock`,
            typeArguments: [`${moduleAddr}::lock_receipt::${asset}`],
            functionArguments: [
                proof.blockNumber,
                ethers.getBytes(proof.blockHash),
                ethers.getBytes(proof.stateRoot),
                ethers.getBytes(proof.contractAddress),
                ethers.getBytes(proof.userAddress),
                ethers.getBytes(proof.tokenAddress),
                ethers.getBytes(proof.storageKey),
                proof.storageValue,
                proof.accountProof.map((p: string) => ethers.getBytes(p)),
                proof.storageProof.map((p: string) => ethers.getBytes(p)),
            ],
        },
    });
    const submitted = await aptos.signAndSubmitTransaction({
        signer: aptosDeployer,
        transaction: txn,
    });
    await aptos.waitForTransaction({
        transactionHash: submitted.hash,
        options: { checkSuccess: true },
    });

    const receipt = await getLockReceipt(aptos, moduleAddr, asset, lockId);
    const owner = new ethers.Wallet(privateKey).address;
    expect(receipt.user).toBe(owner);
    expect(receipt.amount).toBe(amount);
    // The relayer's per-lock cap reads the real TokensLocked log of the proof block.
    const [capped] = await capToLocksInBlock([receipt], asset, bridge);
    expect(capped.amount).toBe(amount);
    return capped;
}

describe.sequential("LockBox releases follow Aptos outcomes (live dual-chain)", () => {
    beforeAll(async () => {
        info = await setupDualChainTestnet();
        provider = new ethers.JsonRpcProvider(info.eth.rpcUrl, undefined, { cacheTimeout: -1 });
        aptos = new Aptos(
            new AptosConfig({ network: Network.LOCAL, fullnode: info.aptos.nodeUrl }),
        );
        aptosDeployer = Account.fromPrivateKey({
            privateKey: new Ed25519PrivateKey(info.aptos.deployerPrivateKey),
        });
        bridge = {
            aptosRpcUrl: info.aptos.nodeUrl,
            contractAddress: info.aptos.moduleAddress,
            ethRpcUrl: info.eth.rpcUrl,
            lockBoxAddress: info.eth.contracts.lockBox,
            relayerPrivateKey: info.eth.relayerPrivateKey,
        };
    }, 1_200_000);

    afterAll(async () => {
        await teardownDualChainTestnet();
    }, 300_000);

    it("refund: AuctionRefunded returns the locked FakeETH to the seller", async () => {
        const seller = info.eth.deployerAddress;
        const lockAmount = 10n * ETH;
        const sellerReceipt = await lockAndRegister(
            info.eth.deployerPrivateKey,
            "FakeETH",
            lockAmount,
            100n * ETH,
        );
        const afterLock = await balanceOf("FakeETH", seller);

        // Time alone releases nothing: there is no credited balance yet.
        await expect(withdrawWinnings(info.eth.deployerPrivateKey, "FakeETH")).rejects.toThrow();

        // refund_expired_window releases (revokes) every receipt of the window.
        const releases = planRefundReleases({
            sellers: [{ ...sellerReceipt, status: RECEIPT_STATUS_REVOKED }],
            collateral: [],
        });
        expect(releases).toHaveLength(1);
        const hashes = await executeLockBoxReleases(releases, bridge);
        expect(hashes).toHaveLength(1);
        // A relayer retry is a no-op.
        expect(await executeLockBoxReleases(releases, bridge)).toEqual([]);

        await withdrawWinnings(info.eth.deployerPrivateKey, "FakeETH");
        expect(await balanceOf("FakeETH", seller)).toBe(afterLock + lockAmount);
    }, 900_000);

    it("winner payout and seller payout: AuctionSettled swaps the locked tokens at the clearing price", async () => {
        const seller = info.eth.deployerAddress;
        const winner = info.eth.bidderAddress;
        const supply = 5n * ETH;
        const collateral = 10_000n * USD;
        const clearingPrice = 1_500n;
        const payment = quoteForFill(supply, clearingPrice);
        expect(payment).toBe(7_500n * USD);

        const sellerReceipt = await lockAndRegister(
            info.eth.deployerPrivateKey,
            "FakeETH",
            supply,
            100n * ETH,
        );
        const winnerReceipt = await lockAndRegister(
            info.eth.bidderPrivateKey,
            "FakeUSD",
            collateral,
            collateral,
        );

        const before = {
            sellerEth: await balanceOf("FakeETH", seller),
            sellerUsd: await balanceOf("FakeUSD", seller),
            winnerEth: await balanceOf("FakeETH", winner),
            winnerUsd: await balanceOf("FakeUSD", winner),
        };

        // settle: the winner fills the whole supply; its collateral receipt stays claimed.
        const releases = planSettlementReleases({
            clearingPrice,
            sellers: [sellerReceipt],
            bids: [{ isWinner: true, fillAmount: supply, collateral: winnerReceipt }],
        });
        expect(releases.map((r) => r.kind)).toEqual(["fill", "refund"]);
        await executeLockBoxReleases(releases, bridge);

        await withdrawWinnings(info.eth.bidderPrivateKey, "FakeETH");
        await withdrawWinnings(info.eth.bidderPrivateKey, "FakeUSD");
        await withdrawWinnings(info.eth.deployerPrivateKey, "FakeUSD");
        // The seller sold all its FakeETH: nothing is left to take back.
        await expect(withdrawWinnings(info.eth.deployerPrivateKey, "FakeETH")).rejects.toThrow();

        // Winner payout: the FakeETH fill, minus the FakeUSD payment (excess collateral returned).
        expect(await balanceOf("FakeETH", winner)).toBe(before.winnerEth + supply);
        expect(await balanceOf("FakeUSD", winner)).toBe(before.winnerUsd + collateral - payment);
        // Seller payout: the FakeUSD payment; the sold FakeETH stays gone.
        expect(await balanceOf("FakeUSD", seller)).toBe(before.sellerUsd + payment);
        expect(await balanceOf("FakeETH", seller)).toBe(before.sellerEth);

        const lockBox = new ethers.Contract(info.eth.contracts.lockBox, LOCKBOX_ABI, provider);
        expect(await lockBox.getLockedBalance(seller, token("FakeETH"))).toBe(0n);
        expect(await lockBox.getLockedBalance(winner, token("FakeUSD"))).toBe(0n);
    }, 900_000);
});
