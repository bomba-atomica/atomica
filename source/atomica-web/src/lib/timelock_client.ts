import { Aptos } from "@aptos-labs/ts-sdk";
import { TimelockCrypto, type Ciphertext } from "./timelock";
import { PointG1, PointG2 } from "@noble/bls12-381";

export class TimelockClient {
    crypto: TimelockCrypto;
    aptos: Aptos;
    
    constructor(aptos: Aptos) {
        this.aptos = aptos;
        this.crypto = new TimelockCrypto();
    }

    /**
     * Fetches the Master Public Key (MPK) from the blockchain.
     */
    async getMpk(): Promise<PointG2> {
        const result = await this.aptos.view({
             payload: {
                 function: "0x1::ibe_config::get_mpk",
                 functionArguments: []
             }
        });
        
        // Result is [vector<u8>] -> [string (hex)]
        const mpkHex = result[0] as string;
        // Aptos view returns hex string prefixed with 0x usually, or just hex.
        // Actually, vector<u8> in JSON view response is usually hex string.
        
        // Remove 0x prefix if present
        const cleanHex = mpkHex.startsWith('0x') ? mpkHex.slice(2) : mpkHex;
        return PointG2.fromHex(cleanHex);
    }

    /**
     * Encrypts a message for a specific timelock.
     */
    async encrypt(timelockId: bigint, deadlineUs: bigint, message: Uint8Array): Promise<Ciphertext> {
        const mpk = await this.getMpk();
        const identity = this.crypto.computeIdentity(timelockId, deadlineUs);
        return this.crypto.encrypt(mpk, identity, message);
    }

    /**
     * Fetches the decryption key for a revealed timelock.
     * Throws if not yet revealed.
     */
    async getDecryptionKey(timelockId: bigint): Promise<PointG1> {
        const result = await this.aptos.view({
             payload: {
                 function: "0x1::ibe_config::get_decryption_key",
                 functionArguments: [timelockId.toString()]
             }
        });
        
        const dkHex = result[0] as string;
        const cleanHex = dkHex.startsWith('0x') ? dkHex.slice(2) : dkHex;
        return PointG1.fromHex(cleanHex);
    }

    /**
     * Decrypts a ciphertext for a revealed timelock.
     * Fetches the key from the blockchain.
     */
    async decrypt(timelockId: bigint, ciphertext: Ciphertext): Promise<Uint8Array> {
        const dk = await this.getDecryptionKey(timelockId);
        return this.crypto.decrypt(dk, ciphertext);
    }

    /**
     * Gets public info about a timelock.
     */
    async getTimelockInfo(timelockId: bigint): Promise<{
        deadline: bigint;
        isRevealed: boolean;
        shareCount: bigint;
    }> {
        const result = await this.aptos.view({
            payload: {
                function: "0x1::ibe_config::get_timelock",
                functionArguments: [timelockId.toString()]
            }
        });
        
        return {
            deadline: BigInt(result[0] as string),
            // identity: result[1]
            isRevealed: result[2] as boolean,
            shareCount: BigInt(result[3] as string)
        };
    }

    /**
     * Waits for a timelock to be revealed and then returns the decryption key.
     * Polls every `intervalMs`.
     */
    async waitForDecryption(timelockId: bigint, intervalMs = 1000, timeoutMs = 60000): Promise<PointG1> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                // Check if revealed first to avoid error spam
                const isRevealedRes = await this.aptos.view({
                    payload: {
                        function: "0x1::ibe_config::is_revealed",
                        functionArguments: [timelockId.toString()]
                    }
                });
                
                if (isRevealedRes[0] === true) {
                    return await this.getDecryptionKey(timelockId);
                }
            } catch (_e) {
                // Ignore errors (e.g. timelock not found yet) and retry
            }
            
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        throw new Error(`Timeout waiting for timelock ${timelockId} reveal`);
    }
}
