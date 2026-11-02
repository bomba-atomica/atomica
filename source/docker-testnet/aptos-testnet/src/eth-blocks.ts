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
