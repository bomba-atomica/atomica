import { spawn } from "child_process";
import { resolve as pathResolve } from "path";
import { existsSync, readFileSync } from "fs";

/**
 * Ethereum Docker Testnet - Multi-validator PoS setup
 * 
 * Provides a mainnet-like Ethereum environment with:
 * - Geth execution layer
 * - Lighthouse beacon node
 * - Lighthouse validator client
 * - Full PoS consensus with sync committees
 */
export class EthereumDockerTestnet {
    private configDir: string;
    private numValidators: number;

    private constructor(configDir: string, numValidators: number) {
        this.configDir = configDir;
        this.numValidators = numValidators;
    }

    /**
     * Create and start a new Ethereum PoS testnet with N validators
     */
    static async start(numValidators: number = 4): Promise<EthereumDockerTestnet> {
        const configDir = this.findConfigDir();

        console.log(`Setting up Ethereum PoS testnet with ${numValidators} validators...`);

        // 1. Generate genesis and keys
        const generateScript = pathResolve(configDir, "generate-genesis.sh");
        await this.runCommand("bash", [generateScript, numValidators.toString()], configDir);

        // 2. Start Docker Compose
        await this.runCommand("docker", ["compose", "up", "-d"], configDir);

        return new EthereumDockerTestnet(configDir, numValidators);
    }

    /**
     * Alias for start() - backwards compatibility
     */
    static async new(numValidators: number = 4): Promise<EthereumDockerTestnet> {
        return this.start(numValidators);
    }

    /**
     * Terminate the testnet and clean up
     */
    async teardown(): Promise<void> {
        console.log("Tearing down Ethereum testnet...");
        await EthereumDockerTestnet.runCommand(
            "docker", 
            ["compose", "down", "-v", "--remove-orphans"], 
            this.configDir
        );
    }

    // ==================== URLs ====================

    /**
     * Get the execution layer JSON-RPC URL (Geth)
     */
    getExecutionRpcUrl(): string {
        return "http://localhost:8545";
    }

    /**
     * Get the execution layer WebSocket URL (Geth)
     */
    getExecutionWsUrl(): string {
        return "ws://localhost:8546";
    }

    /**
     * Get the beacon node REST API URL (Lighthouse)
     */
    getBeaconApiUrl(): string {
        return "http://localhost:5052";
    }

    /**
     * Get the number of validators
     */
    getNumValidators(): number {
        return this.numValidators;
    }

    // ==================== Execution Layer APIs ====================

    /**
     * Get the current block number
     */
    async getBlockNumber(): Promise<number> {
        const response = await this.rpcCall("eth_blockNumber", []);
        return parseInt(response.result, 16);
    }

    /**
     * Get the chain ID
     */
    async getChainId(): Promise<number> {
        const response = await this.rpcCall("eth_chainId", []);
        return parseInt(response.result, 16);
    }

    /**
     * Get a block by number
     */
    async getBlock(blockNumber: number | "latest" | "finalized" | "safe"): Promise<any> {
        const blockParam = typeof blockNumber === "number" 
            ? `0x${blockNumber.toString(16)}` 
            : blockNumber;
        const response = await this.rpcCall("eth_getBlockByNumber", [blockParam, false]);
        return response.result;
    }

    /**
     * Get account balance
     */
    async getBalance(address: string, block: string = "latest"): Promise<bigint> {
        const response = await this.rpcCall("eth_getBalance", [address, block]);
        return BigInt(response.result);
    }

    /**
     * Get a Merkle-Patricia proof for an account and storage slots
     * This is the key API for state proof verification
     */
    async getProof(
        address: string, 
        storageKeys: string[], 
        block: string = "latest"
    ): Promise<EthereumProof> {
        const response = await this.rpcCall("eth_getProof", [address, storageKeys, block]);
        return response.result as EthereumProof;
    }

    /**
     * Send a raw signed transaction
     */
    async sendRawTransaction(signedTx: string): Promise<string> {
        const response = await this.rpcCall("eth_sendRawTransaction", [signedTx]);
        return response.result;
    }

    /**
     * Get transaction receipt
     */
    async getTransactionReceipt(txHash: string): Promise<any> {
        const response = await this.rpcCall("eth_getTransactionReceipt", [txHash]);
        return response.result;
    }

    // ==================== Beacon Chain APIs ====================

    /**
     * Get the latest beacon block header
     */
    async getBeaconHeader(blockId: string = "head"): Promise<BeaconHeader> {
        const response = await fetch(`${this.getBeaconApiUrl()}/eth/v1/beacon/headers/${blockId}`);
        if (!response.ok) throw new Error(`Failed to fetch beacon header: ${response.statusText}`);
        const data = await response.json();
        return data.data;
    }

    /**
     * Get the sync committee for a given state
     */
    async getSyncCommittee(stateId: string = "head"): Promise<SyncCommittee> {
        const response = await fetch(
            `${this.getBeaconApiUrl()}/eth/v1/beacon/states/${stateId}/sync_committees`
        );
        if (!response.ok) throw new Error(`Failed to fetch sync committee: ${response.statusText}`);
        const data = await response.json();
        return data.data;
    }

    /**
     * Get the beacon genesis information
     */
    async getBeaconGenesis(): Promise<BeaconGenesis> {
        const response = await fetch(`${this.getBeaconApiUrl()}/eth/v1/beacon/genesis`);
        if (!response.ok) throw new Error(`Failed to fetch beacon genesis: ${response.statusText}`);
        const data = await response.json();
        return data.data;
    }

    /**
     * Get finality checkpoints
     */
    async getFinalityCheckpoints(stateId: string = "head"): Promise<FinalityCheckpoints> {
        const response = await fetch(
            `${this.getBeaconApiUrl()}/eth/v1/beacon/states/${stateId}/finality_checkpoints`
        );
        if (!response.ok) throw new Error(`Failed to fetch finality checkpoints: ${response.statusText}`);
        const data = await response.json();
        return data.data;
    }

    /**
     * Get a beacon block with execution payload
     */
    async getBeaconBlock(blockId: string = "head"): Promise<any> {
        const response = await fetch(`${this.getBeaconApiUrl()}/eth/v2/beacon/blocks/${blockId}`);
        if (!response.ok) throw new Error(`Failed to fetch beacon block: ${response.statusText}`);
        const data = await response.json();
        return data.data;
    }

    /**
     * Get light client bootstrap data
     */
    async getLightClientBootstrap(blockRoot: string): Promise<any> {
        const response = await fetch(
            `${this.getBeaconApiUrl()}/eth/v1/beacon/light_client/bootstrap/${blockRoot}`
        );
        if (!response.ok) throw new Error(`Failed to fetch light client bootstrap: ${response.statusText}`);
        const data = await response.json();
        return data.data;
    }

    /**
     * Get light client updates
     */
    async getLightClientUpdates(startPeriod: number, count: number = 1): Promise<any[]> {
        const response = await fetch(
            `${this.getBeaconApiUrl()}/eth/v1/beacon/light_client/updates?start_period=${startPeriod}&count=${count}`
        );
        if (!response.ok) throw new Error(`Failed to fetch light client updates: ${response.statusText}`);
        const data = await response.json();
        return data;
    }

    // ==================== Health & Sync ====================

    /**
     * Wait for the beacon node to be healthy and synced
     */
    async waitForHealthy(timeoutSecs: number = 120): Promise<void> {
        const deadline = Date.now() + timeoutSecs * 1000;

        console.log("Waiting for Ethereum testnet to become healthy...");

        // First wait for Geth
        while (Date.now() < deadline) {
            try {
                const blockNum = await this.getBlockNumber();
                if (blockNum >= 0) {
                    console.log("✓ Geth execution layer is ready");
                    break;
                }
            } catch (_e) {
                // Not ready yet
            }
            await this.sleep(2000);
        }

        // Then wait for Beacon node
        while (Date.now() < deadline) {
            try {
                const genesis = await this.getBeaconGenesis();
                if (genesis.genesis_time) {
                    console.log("✓ Lighthouse beacon node is ready");
                    console.log(`  Genesis time: ${new Date(parseInt(genesis.genesis_time) * 1000).toISOString()}`);
                    return;
                }
            } catch (_e) {
                // Not ready yet
            }
            await this.sleep(2000);
        }

        throw new Error("Timeout waiting for Ethereum testnet health");
    }

    /**
     * Wait for N blocks to be produced
     */
    async waitForBlocks(count: number, timeoutSecs: number = 60): Promise<number> {
        const deadline = Date.now() + timeoutSecs * 1000;
        const startBlock = await this.getBlockNumber();
        const targetBlock = startBlock + count;

        console.log(`Waiting for ${count} blocks (current: ${startBlock}, target: ${targetBlock})...`);

        while (Date.now() < deadline) {
            const currentBlock = await this.getBlockNumber();
            if (currentBlock >= targetBlock) {
                console.log(`✓ Reached block ${currentBlock}`);
                return currentBlock;
            }
            await this.sleep(1000);
        }

        throw new Error(`Timeout waiting for block ${targetBlock}`);
    }

    /**
     * Wait for a slot to be finalized
     */
    async waitForFinality(timeoutSecs: number = 300): Promise<FinalityCheckpoints> {
        const deadline = Date.now() + timeoutSecs * 1000;

        console.log("Waiting for finality...");

        while (Date.now() < deadline) {
            try {
                const checkpoints = await this.getFinalityCheckpoints();
                if (checkpoints.finalized.epoch !== "0") {
                    console.log(`✓ Finalized epoch: ${checkpoints.finalized.epoch}`);
                    return checkpoints;
                }
            } catch (_e) {
                // Not ready yet
            }
            await this.sleep(5000);
        }

        throw new Error("Timeout waiting for finality");
    }

    // ==================== Validator Info ====================

    /**
     * Get validator public keys from the generated keystore
     */
    getValidatorPublicKeys(): string[] {
        const pubkeysPath = pathResolve(this.configDir, "validator_keys/pubkeys.json");
        if (existsSync(pubkeysPath)) {
            try {
                return JSON.parse(readFileSync(pubkeysPath, "utf-8"));
            } catch {
                return [];
            }
        }
        return [];
    }

    // ==================== Test Accounts ====================

    /**
     * Get pre-funded test accounts
     * These accounts have 1000 ETH each at genesis
     */
    getTestAccounts(): TestAccount[] {
        return [
            { address: "0x8943545177806ED17B9F23F0a21ee5948eCaa776", privateKey: null },
            { address: "0x71bE63f3384f5fb98995898A86B02Fb2426c5788", privateKey: null },
            { address: "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a", privateKey: null },
            { address: "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec", privateKey: null },
        ];
    }

    // ==================== Internal Helpers ====================

    private async rpcCall(method: string, params: any[]): Promise<any> {
        const response = await fetch(this.getExecutionRpcUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method,
                params,
            }),
        });

        if (!response.ok) {
            throw new Error(`RPC call failed: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(`RPC error: ${data.error.message}`);
        }

        return data;
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private static findConfigDir(): string {
        const candidates = [
            pathResolve(__dirname, "../../config"),
            pathResolve(process.cwd(), "source/docker-testnet/ethereum-testnet/config"),
            pathResolve(process.cwd(), "config"),
        ];

        for (const path of candidates) {
            if (existsSync(pathResolve(path, "docker-compose.yaml"))) {
                return path;
            }
        }

        throw new Error("Could not find ethereum-testnet/config directory");
    }

    private static async runCommand(command: string, args: string[], cwd: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = spawn(command, args, { cwd, stdio: "inherit" });
            proc.on("close", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
            });
            proc.on("error", reject);
        });
    }
}

// ==================== Type Definitions ====================

export interface EthereumProof {
    address: string;
    accountProof: string[];
    balance: string;
    codeHash: string;
    nonce: string;
    storageHash: string;
    storageProof: StorageProof[];
}

export interface StorageProof {
    key: string;
    value: string;
    proof: string[];
}

export interface BeaconHeader {
    root: string;
    canonical: boolean;
    header: {
        message: {
            slot: string;
            proposer_index: string;
            parent_root: string;
            state_root: string;
            body_root: string;
        };
        signature: string;
    };
}

export interface SyncCommittee {
    validators: string[];
    validator_aggregates: string[];
}

export interface BeaconGenesis {
    genesis_time: string;
    genesis_validators_root: string;
    genesis_fork_version: string;
}

export interface FinalityCheckpoints {
    previous_justified: { epoch: string; root: string };
    current_justified: { epoch: string; root: string };
    finalized: { epoch: string; root: string };
}

export interface TestAccount {
    address: string;
    privateKey: string | null;
}
