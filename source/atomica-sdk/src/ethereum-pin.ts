/**
 * Lock guard: the client refuses to approve or lock when its LockBox or token
 * address differs from the pin in `eth_proof`.
 *
 * Aptos accepts a lock proof only for the LockBox and tokens that
 * `eth_proof::initialize` pinned. Tokens locked in any other contract can
 * never be registered, and only wait for the reclaim deadline.
 *
 * This module imports nothing from `aptos/`, so `ethereum/lockbox.ts` can call
 * the guard without pulling the Aptos client into the light
 * `@atomica/sdk/ethereum` entry. The Aptos view reader
 * (`getPinnedEthereumConfig` in `aptos/payloads.ts`) registers itself here
 * when that module loads. With no reader registered, the guard refuses.
 *
 * @see docs/specifications/cross-chain-locking.md (Header Trust Model)
 */
import { getChainConfig } from "./chain-config.js";

/** The LockBox and token addresses pinned in `eth_proof` (`get_config`). */
export interface PinnedEthereumConfig {
  lockBox: string;
  fakeETH: string;
  fakeUSD: string;
}

/** Reads the pinned addresses from Aptos. */
export type PinnedEthereumConfigReader = () => Promise<PinnedEthereumConfig>;

let registeredReader: PinnedEthereumConfigReader | undefined;

/** Set the reader the guard uses by default. `aptos/payloads.ts` calls it. */
export function setPinnedEthereumConfigReader(
  reader: PinnedEthereumConfigReader,
): void {
  registeredReader = reader;
}

const FIELDS: { key: keyof PinnedEthereumConfig; name: string }[] = [
  { key: "lockBox", name: "LockBox" },
  { key: "fakeETH", name: "FakeETH" },
  { key: "fakeUSD", name: "FakeUSD" },
];

/**
 * Throw unless the client's chain configuration (`getChainConfig().ethereum`,
 * the addresses the SDK approve and lock functions send to) equals the
 * `eth_proof` pin, ignoring letter case. The error names the field, the
 * pinned address and the configured address. It also throws when the pin
 * cannot be read.
 */
export async function assertEthereumConfigMatchesPin(
  readPin: PinnedEthereumConfigReader | undefined = registeredReader,
): Promise<void> {
  let pinned: PinnedEthereumConfig;
  try {
    if (!readPin) throw new Error("no Aptos view reader is loaded");
    pinned = await readPin();
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Cannot read the LockBox and token addresses pinned in eth_proof (${reason}). Refusing to approve or lock.`,
    );
  }
  const configured = getChainConfig().ethereum;
  for (const { key, name } of FIELDS) {
    if (pinned[key].toLowerCase() !== configured[key].toLowerCase()) {
      throw new Error(
        `${name} address mismatch: Aptos pins ${pinned[key]}, but this client is configured with ${configured[key]}. Aptos accepts locks only in ${pinned[key]}. Refusing to approve or lock.`,
      );
    }
  }
}
