interface GenesisConfig {
    numValidators: number;
    chainId: number;
    workspaceDir: string;
    baseIp?: string;
}
/**
 * Generate a multi-validator genesis for local testnet
 *
 * Runs the generate-genesis.sh script inside a Docker container,
 * producing all necessary artifacts in workspaceDir.
 */
export declare function generateGenesis(config: GenesisConfig): Promise<void>;
export {};
