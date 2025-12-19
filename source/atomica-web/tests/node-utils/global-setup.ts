/**
 * Global setup for browser tests
 * This runs in Node.js before browser tests start
 */
import { setupLocalnet, deployContracts } from "./localnet";

export async function setup() {
    console.log("[Global Setup] Starting localnet for browser tests...");
    await setupLocalnet();
    await deployContracts();
    console.log("[Global Setup] Localnet ready");
}

export async function teardown() {
    console.log("[Global Setup] Teardown - localnet will be cleaned up by process exit");
}
