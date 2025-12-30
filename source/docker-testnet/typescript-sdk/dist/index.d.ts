import { AptosAccount, HexString } from "aptos";
/**
 * Ledger info response from validator REST API
 */
export interface LedgerInfo {
    chain_id: number;
    epoch: string;
    ledger_version: string;
    oldest_ledger_version: string;
    ledger_timestamp: string;
    node_role: string;
    oldest_block_height: string;
    block_height: string;
    git_hash?: string;
}
/**
 * Docker Testnet - Automatic setup and teardown
 */
export declare class DockerTestnet {
    private composeDir;
    private numValidators;
    private validatorUrls;
    private faucetLock;
    private cleanupHandlersRegistered;
    private constructor();
    /**
     * Create a fresh, isolated Docker testnet with N validators
     *
     * @param numValidators Number of validators (1-7)
     * @param options Optional configuration
     * @returns DockerTestnet instance
     *
     * @example
     * // Use published image (default)
     * const testnet = await DockerTestnet.new(4);
     */
    static new(numValidators: number, _options?: {}): Promise<DockerTestnet>;
    /**
     * Tear down the testnet and clean up all resources
     */
    teardown(): Promise<void>;
    /**
     * Register cleanup handlers for process signals and exit.
     * This ensures Docker containers are stopped when the process exits or is interrupted.
     *
     * Handlers are automatically registered when testnet is created via DockerTestnet.new()
     * and unregistered after teardown() completes.
     */
    private registerCleanupHandlers;
    /**
     * Unregister cleanup handlers after teardown
     */
    private unregisterCleanupHandlers;
    /**
     * Get the REST API URL for a specific validator
     */
    validatorApiUrl(index: number): string;
    /**
     * Get all validator API URLs
     */
    validatorApiUrls(): string[];
    /**
     * Get the number of validators
     */
    getNumValidators(): number;
    /**
     * Get a validator account that was funded at genesis
     */
    getValidatorAccount(index: number): Promise<AptosAccount>;
    /**
     * Get the faucet account for test-only minting operations
     *
     * ⚠️ WARNING: This is a TEST-ONLY approach! ⚠️
     * The Core Resources account (0xA550C18) does NOT exist on production mainnet.
     * This is used purely for local testing convenience.
     *
     * In test mode (is_test: true), this account:
     * - Has u64::MAX octas (~18.4M APT) for gas fees
     * - Has minting capability for AptosCoin
     * - Can delegate minting capability to other accounts
     */
    getFaucetAccount(): AptosAccount;
    /**
     * @deprecated Use getFaucetAccount() instead
     */
    getRootAccount(): AptosAccount;
    /**
     * Bootstrap validators with unlocked funds for faucet operations
     *
     * ⚠️ TEST-ONLY: Uses root account to mint funds ⚠️
     *
     * This gives validators unlocked funds so they can act as faucets.
     * Uses aptos_coin::mint which is only available when is_test: true.
     * In production, validators would have unlocked funds from staking rewards.
     *
     * @param amountPerValidator - Amount of unlocked APT (in octas) to give each validator
     */
    bootstrapValidators(amountPerValidator?: bigint): Promise<void>;
    /**
     * Fund a new account using the faucet (Core Resources account)
     *
     * ⚠️ TEST-ONLY: Uses Core Resources account (0xA550C18) which only exists in test mode
     *
     * This creates and funds new accounts for testing.
     * Uses aptos_account::transfer which automatically creates the account's CoinStore if needed.
     *
     * @param address - Address to fund (account will be created if it doesn't exist)
     * @param amount - Amount in octas to fund
     * @returns Transaction hash
     */
    faucet(address: string | HexString, amount?: bigint): Promise<string>;
    /**
     * Query ledger info from a validator
     */
    getLedgerInfo(validatorIndex: number): Promise<LedgerInfo>;
    /**
     * Get current block height from a validator
     */
    getBlockHeight(validatorIndex?: number): Promise<number>;
    /**
     * Wait for a specific number of blocks to be produced
     */
    waitForBlocks(numBlocks: number, timeoutSecs?: number): Promise<void>;
    /**
     * Deploy Move contracts using aptos CLI from within the validator container.
     *
     * This method copies the contract directory into the validator container,
     * compiles and publishes the contracts using the aptos binary inside the container,
     * then runs any initialization functions.
     *
     * @param options Deployment options
     * @returns Promise resolving when deployment completes
     *
     * @example
     * await testnet.deployContracts({
     *   contractsDir: "/path/to/contracts",
     *   deployerPrivateKey: "0x123...",
     *   namedAddresses: { atomica: "default" },
     *   initFunctions: [
     *     { functionId: "default::registry::initialize", args: ["hex:0123"] },
     *     { functionId: "default::fake_eth::initialize", args: [] },
     *   ],
     * });
     */
    deployContracts(options: {
        contractsDir: string;
        deployerPrivateKey: string;
        deployerAddress?: string;
        namedAddresses?: Record<string, string>;
        initFunctions?: Array<{
            functionId: string;
            args: string[];
        }>;
        fundAmount?: bigint;
    }): Promise<void>;
    /**
     * Execute a command on the host system.
     *
     * @param bin Binary to execute (e.g., "aptos")
     * @param args Command arguments
     * @returns Promise resolving to { stdout, stderr }
     * @private
     */
    private execCommand;
    /**
     * Execute a command inside a validator container.
     *
     * @param containerName Container name (e.g., "atomica-validator-0")
     * @param command Command to execute
     * @returns Promise resolving to { stdout, stderr }
     * @private
     */
    private execInContainer;
    /**
     * Find the docker-testnet directory
     */
    private static findComposeDir;
    private static runCompose;
    static ensureDockerRunning(): Promise<void>;
}
/**
 * Network probe result for a single validator
 */
export interface ProbeResult {
    validatorIndex: number;
    containerName: string;
    ipAddress: string;
    apiPort: number;
    validatorPort: number;
    metricsPort: number;
    apiReachable: boolean;
    apiResponse?: LedgerInfo;
    apiError?: string;
    portScans: {
        port: number;
        name: string;
        reachable: boolean;
        error?: string;
    }[];
}
/**
 * Probe all validators in a testnet for connectivity and health
 *
 * This function is useful for debugging network issues. It checks:
 * - REST API endpoints (8080-808X)
 * - Validator network ports (6180)
 * - Metrics ports (9101-910X)
 * - Container network connectivity
 *
 * Usage:
 *   DEBUG_TESTNET=1 node -e "require('./dist/index.js').probeTestnet(4)"
 */
export declare function probeTestnet(numValidators?: number): Promise<ProbeResult[]>;
