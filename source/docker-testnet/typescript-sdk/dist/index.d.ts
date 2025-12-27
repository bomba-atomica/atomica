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
    private constructor();
    /**
     * Create a fresh, isolated Docker testnet with N validators
     */
    static new(numValidators: number): Promise<DockerTestnet>;
    /**
     * Tear down the testnet and clean up all resources
     */
    teardown(): Promise<void>;
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
     * Find the docker-testnet directory
     */
    private static findComposeDir;
    private static runCompose;
    static ensureDockerRunning(): Promise<void>;
}
