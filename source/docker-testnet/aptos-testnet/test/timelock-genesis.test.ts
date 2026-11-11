import { describe, it } from "vitest";

/**
 * Timelock genesis test (issue 239 moves it here).
 *
 * The live copy is source/docker-testnet/typescript-sdk/test/timelock-genesis.test.ts
 * (bun:test, old SDK lifecycle helpers). It starts 4 validators, waits for
 * epoch 2 and checks that ibe_config holds a ready timelock key.
 */

// SCOUT(#239) TEST: whole file, todo cases only. Port the old copy from bun:test to vitest and from helpers/testnet-lifecycle to ../src/localnet (setupLocalnet, getTestnet, teardownLocalnet).
describe("Timelock genesis", () => {
    it.todo(
        "SCOUT(#239) epoch 2 has a ready 96-byte timelock key: ibe_config::is_ready is true and get_mpk is 96 bytes",
    );
    it.todo(
        "SCOUT(#243) genesis names the package's timelock registrar: 0x1::ibe_config::timelock_registrar equals the address derived from the deployer address",
    );
});
