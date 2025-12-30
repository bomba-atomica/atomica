import { spawn } from "child_process";
import { resolve as pathResolve } from "path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import * as dotenv from "dotenv";

/**
 * Ethereum Docker Testnet - Multi-validator setup
 */
export class EthereumDockerTestnet {
    private composeDir: string;
    private numValidators: number;

    private constructor(composeDir: string, numValidators: number) {
        this.composeDir = composeDir;
        this.numValidators = numValidators;
    }

    /**
     * Create a new Ethereum devnet with N validators
     */
    static async new(numValidators: number = 4): Promise<EthereumDockerTestnet> {
        const composeDir = pathResolve(process.cwd(), "source/docker-testnet/ethereum-testnet/config");

        console.log(`Setting up Ethereum testnet with ${numValidators} validators...`);

        // 1. Generate genesis and keys
        const generateScript = pathResolve(composeDir, "generate-genesis.sh");
        await this.runCommand(generateScript, [numValidators.toString()], composeDir);

        // 2. Start Docker Compose
        await this.runCommand("docker", ["compose", "up", "-d"], composeDir);

        return new EthereumDockerTestnet(composeDir, numValidators);
    }

    /**
     * Terminate the testnet
     */
    async teardown(): Promise<void> {
        console.log("Tearing down Ethereum testnet...");
        await EthereumDockerTestnet.runCommand("docker", ["compose", "down", "-v"], this.composeDir);
    }

    /**
     * Get the execution layer RPC URL
     */
    getExecutionRpcUrl(): string {
        return "http://localhost:8545";
    }

    /**
     * Get the beacon node API URL
     */
    getBeaconNodeUrl(): string {
        return "http://localhost:5052";
    }

    /**
     * Get validator public keys from the generated set
     */
    getValidatorPublicKeys(): string[] {
        const pubkeysPath = pathResolve(this.composeDir, "validator_keys/pubkeys.json");
        if (existsSync(pubkeysPath)) {
            return JSON.parse(readFileSync(pubkeysPath, "utf-8"));
        }
        return [];
    }

    /**
     * Wait for the beacon node to be healthy
     */
    async waitForHealthy(timeoutSecs: number = 60): Promise<void> {
        const beaconUrl = this.getBeaconNodeUrl();
        const deadline = Date.now() + timeoutSecs * 1000;

        console.log(`Waiting for Ethereum beacon node to become healthy...`);

        while (Date.now() < deadline) {
            try {
                const response = await fetch(`${beaconUrl}/eth/v1/beacon/genesis`);
                if (response.ok) {
                    console.log(`✓ Ethereum beacon node is healthy`);
                    return;
                }
            } catch (e) {
                // Not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        throw new Error("Timeout waiting for Ethereum beacon node health");
    }

    /**
     * Get the latest beacon block header
     */
    async getBeaconHeader(blockId: string = "head"): Promise<any> {
        const response = await fetch(`${this.getBeaconNodeUrl()}/eth/v1/beacon/headers/${blockId}`);
        if (!response.ok) throw new Error(`Failed to fetch beacon header: ${response.statusText}`);
        return (await response.json()).data;
    }

    /**
     * Get the sync committee for a given epoch
     */
    async getSyncCommittee(epoch: string = "head"): Promise<any> {
        const response = await fetch(`${this.getBeaconNodeUrl()}/eth/v1/beacon/states/head/sync_committees?epoch=${epoch}`);
        if (!response.ok) throw new Error(`Failed to fetch sync committee: ${response.statusText}`);
        return (await response.json()).data;
    }

    private static async runCommand(command: string, args: string[], cwd: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = spawn(command, args, { cwd, stdio: "inherit" });
            proc.on("close", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`${command} failed with code ${code}`));
            });
        });
    }
}
