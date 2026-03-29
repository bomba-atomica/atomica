export declare function getDockerTestnetConfigDir(): string;
export type AptosKeyPair = {
    address: string;
    privateKey: string;
    source: string;
};
export declare function getFunderCredentials(): AptosKeyPair;
export declare function getDeployerCredentials(): AptosKeyPair;
