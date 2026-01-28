import { startTestnet, stopTestnet } from "../src/index";

export async function setupTestnet() {
    await startTestnet();
}

export async function teardownTestnet() {
    await stopTestnet();
}
