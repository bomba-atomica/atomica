/**
 * Light Client State Management
 *
 * Manages the persisted state of the light client,
 * including sync committee tracking and trusted headers.
 */

import type { LightClientState, LightClientUpdate, LightClientStore } from "./types";
import { promises as fs } from "fs";
import * as path from "path";

const DEFAULT_STATE_FILENAME = "light-client-state.json";

function getDefaultStatePath(): string {
    const configDir = process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || ".", ".config");
    return path.join(configDir, "atomica", DEFAULT_STATE_FILENAME);
}

export function getStatePath(configPath?: string): string {
    return configPath || getDefaultStatePath();
}

/**
 * Check if update is newer than current state
 */
export function isUpdateNewer(update: LightClientUpdate, current: LightClientState): boolean {
    return update.attestedHeader.beacon.slot > current.header.beacon.slot;
}

/**
 * Save state to persistent storage
 */
export async function saveState(store: LightClientStore, configPath?: string): Promise<void> {
    const statePath = getStatePath(configPath);
    const stateDir = path.dirname(statePath);

    try {
        await fs.mkdir(stateDir, { recursive: true });
        const data = JSON.stringify(store, (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
        );
        await fs.writeFile(statePath, data, "utf-8");
    } catch (error) {
        throw new Error(`Failed to save light client state: ${error}`);
    }
}

/**
 * Load state from persistent storage
 */
export async function loadState(configPath?: string): Promise<LightClientStore | null> {
    const statePath = getStatePath(configPath);

    try {
        const data = await fs.readFile(statePath, "utf-8");
        const store = JSON.parse(data, (_key, value) => {
            if (typeof value === "string" && /^\d+$/.test(value)) {
                return BigInt(value);
            }
            return value;
        }) as LightClientStore;
        return store;
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return null;
        }
        throw new Error(`Failed to load light client state: ${error}`);
    }
}

/**
 * Clear stored state
 */
export async function clearState(configPath?: string): Promise<void> {
    const statePath = getStatePath(configPath);

    try {
        await fs.unlink(statePath);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return;
        }
        throw new Error(`Failed to clear light client state: ${error}`);
    }
}
