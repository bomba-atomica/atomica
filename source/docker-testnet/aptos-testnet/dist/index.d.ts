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
     */
    static new(numValidators: number, _options?: {}): Promise<DockerTestnet>;
    /**
     * Tear down the testnet and clean up all resources
     */
    teardown(): Promise<void>;
    private registerCleanupHandlers;
    private unregisterCleanupHandlers;
    validatorApiUrl(index: number): string;
    validatorApiUrls(): string[];
    getNumValidators(): number;
    getValidatorAccount(index: number): Promise<AptosAccount>;
    getFaucetAccount(): AptosAccount;
    getRootAccount(): AptosAccount;
    bootstrapValidators(amountPerValidator?: bigint): Promise<void>;
    faucet(address: string | HexString, amount?: bigint): Promise<string>;
    getLedgerInfo(validatorIndex: number): Promise<LedgerInfo>;
    getBlockHeight(validatorIndex?: number): Promise<number>;
    waitForBlocks(numBlocks: number, timeoutSecs?: number): Promise<void>;
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
    private execCommand;
    private execInContainer;
    private static findComposeDir;
    private static runCompose;
    static ensureDockerRunning(): Promise<void>;
}
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
export declare function probeTestnet(numValidators?: number): Promise<ProbeResult[]>;
export * from "./config.js";
export * from "./siwe.js";
export * from "./transaction.js";
export * from "./payloads.js";
export * from "./localnet.js";
export * from "./browser-commands.js";
export * from "./ensureFramework.js";
export * from "./findAptosBinary.js";
export * from "./genesis.js";
