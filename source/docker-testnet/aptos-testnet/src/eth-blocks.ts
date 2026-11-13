/**
 * Block-height waits that work on both Ethereum test backends.
 *
 * The Docker PoS chain makes one block per 12 s slot, so callers poll. anvil
 * (ETH_BACKEND=anvil) mines only when a transaction arrives, so polling would
 * stall: there we mine the missing blocks, 12 s apart in block time.
 */
import type { ethers } from "ethers";

const SLOT_SECONDS = 12;
const anvilCache = new WeakMap<object, boolean>();

/** True when the RPC endpoint is anvil (checked once per provider). */
export async function isAnvil(provider: ethers.JsonRpcProvider): Promise<boolean> {
    const cached = anvilCache.get(provider);
    if (cached !== undefined) return cached;
    let anvil = false;
    try {
        const version: string = await provider.send("web3_clientVersion", []);
        anvil = /anvil/i.test(version);
    } catch {
        anvil = false;
    }
    anvilCache.set(provider, anvil);
    return anvil;
}

/**
 * Bring the anvil clock up to the host clock before a lock.
 *
 * Each lock proof mines blocks 12 s apart on anvil (`waitForEthBlock`), and
 * anvil otherwise stamps a block one second after the last one, so its clock
 * drifts from the host's. A lock binds to a window by `block.timestamp`, so on
 * anvil, when the latest block is behind the host second, this sets the next
 * block's timestamp to that second (`evm_setNextBlockTimestamp`). Anvil cannot
 * move back, so when it is ahead this sends nothing. Off anvil it sends nothing.
 */
export async function syncAnvilClockToHost(
    provider: ethers.JsonRpcProvider,
    hostNowSecs: number = Math.floor(Date.now() / 1000),
): Promise<void> {
    if (!(await isAnvil(provider))) return;
    const latest = await provider.getBlock("latest");
    if (!latest || latest.timestamp >= hostNowSecs) return;
    await provider.send("evm_setNextBlockTimestamp", [hostNowSecs]);
}

/**
 * Wait until the chain reaches `target`. Mines on anvil, polls on docker.
 * Throws after `timeoutSecs` so a stalled chain fails loudly.
 */
export async function waitForEthBlock(
    provider: ethers.JsonRpcProvider,
    target: number,
    timeoutSecs: number = 60,
    label: string = "Ethereum",
): Promise<number> {
    let current = await provider.getBlockNumber();
    if (current >= target) return current;

    if (await isAnvil(provider)) {
        const missing = target - current;
        await provider.send("anvil_mine", [
            `0x${missing.toString(16)}`,
            `0x${SLOT_SECONDS.toString(16)}`,
        ]);
        current = await provider.getBlockNumber();
        console.log(`[${label}] ✓ Mined to block ${current} (anvil)`);
        return current;
    }

    const deadline = Date.now() + timeoutSecs * 1000;
    while (Date.now() < deadline) {
        current = await provider.getBlockNumber();
        if (current >= target) {
            console.log(`[${label}] ✓ Block ${current} reached`);
            return current;
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`[${label}] Timed out waiting for block ${target} (at ${current})`);
}

/**
 * Wait until the Aptos validators certify an Ethereum block at or after
 * `minBlock` (`0x1::ethereum_headers::latest_block_number`) and return the
 * highest certified block. A lock proof registers only at a certified block.
 *
 * Mirrors `waitForCertifiedBlock` in `@atomica/sdk/aptos`. This package reads
 * the view directly: in Node, `@atomica/sdk/aptos` also loads the IBE bundle.
 * Throws after `timeoutSecs` so a testnet that never certifies fails loudly.
 */
export async function waitForCertifiedEthBlock(
    aptosNodeUrl: string,
    minBlock: number,
    timeoutSecs: number = 300,
    label: string = "Ethereum headers",
): Promise<number> {
    const deadline = Date.now() + timeoutSecs * 1000;
    let latest: number | undefined;
    for (;;) {
        const res = await fetch(`${aptosNodeUrl.replace(/\/$/, "")}/view`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                function: "0x1::ethereum_headers::latest_block_number",
                type_arguments: [],
                arguments: [],
            }),
        });
        if (!res.ok) {
            throw new Error(
                `[${label}] latest_block_number view failed: ${res.status} ${await res.text()}`,
            );
        }
        // Option<u64> is returned as [{ vec: [] }] or [{ vec: ["123"] }].
        const [option] = (await res.json()) as [{ vec: string[] }];
        latest = option.vec.length === 0 ? undefined : Number(option.vec[0]);
        if (latest !== undefined && latest >= minBlock) {
            console.log(`[${label}] ✓ Block ${latest} certified (needed ${minBlock})`);
            return latest;
        }
        if (Date.now() >= deadline) break;
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(
        `[${label}] No certified Ethereum block at or after ${minBlock} within ${timeoutSecs}s (latest certified: ${latest ?? "none"})`,
    );
}
