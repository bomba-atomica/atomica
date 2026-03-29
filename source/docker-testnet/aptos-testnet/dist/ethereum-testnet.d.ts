/**
 * Ethereum testnet lifecycle for browser test commands.
 *
 * Runs in Node.js (browser command handlers). Starts an Ethereum Docker
 * testnet, compiles + deploys FakeETH and FakeUSD, and returns the
 * connection info needed by the browser-side wallet mock.
 */
import type { EthereumTestnetInfo } from "./browser-commands.js";
export declare function setupEthereumTestnet(): Promise<EthereumTestnetInfo>;
export declare function teardownEthereumTestnet(): Promise<void>;
