import { describe, it, expect, vi } from 'vitest';
import { TimelockClient } from '../../src/lib/timelock_client';
import { Aptos } from "@aptos-labs/ts-sdk";
import goldenVectors from './ibe_golden_vectors.json';
import { PointG2 } from '@noble/bls12-381';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Mock Aptos
const mockView = vi.fn();
const mockAptos = {
    view: mockView
} as unknown as Aptos;

describe('TimelockClient', () => {
    const client = new TimelockClient(mockAptos);
    const vector = goldenVectors.ibe_roundtrip_vectors[0];
    
    // MPK from golden vector
    const mpkHex = vector.mpk_g2_hex;
    const dkHex = vector.reconstructed_dk_g1_hex;
    const timelockId = 12345n; // Arbitrary for test
    const deadlineUs = 1000000000000n; // Arbitrary

    it('getMpk fetches and parses MPK', async () => {
        mockView.mockResolvedValueOnce([`0x${mpkHex}`]);
        
        const mpk = await client.getMpk();
        expect(bytesToHex(mpk.toRawBytes(true))).toBe(mpkHex);
        
        expect(mockView).toHaveBeenCalledWith({
            payload: {
                function: "0x1::ibe_config::get_mpk",
                functionArguments: []
            }
        });
    });

    it('encrypt produces valid ciphertext structure', async () => {
        // Mock MPK fetch inside encrypt
        mockView.mockResolvedValueOnce([`0x${mpkHex}`]);
        
        const msg = new TextEncoder().encode("Hello World");
        const ct = await client.encrypt(timelockId, deadlineUs, msg);
        
        expect(ct.u).toBeInstanceOf(PointG2);
        expect(ct.v).toBeInstanceOf(Uint8Array);
        expect(ct.v.length).toBe(msg.length);
    });

    it('getDecryptionKey fetches and parses DK', async () => {
        mockView.mockResolvedValueOnce([`0x${dkHex}`]);
        
        const dk = await client.getDecryptionKey(timelockId);
        expect(bytesToHex(dk.toRawBytes(true))).toBe(dkHex);
        
        expect(mockView).toHaveBeenCalledWith({
            payload: {
                function: "0x1::ibe_config::get_decryption_key",
                functionArguments: [timelockId.toString()]
            }
        });
    });

    it('decrypt performs full flow', async () => {
        // Mock getDecryptionKey
        mockView.mockResolvedValueOnce([`0x${dkHex}`]);
        
        // Use golden vector ciphertext
        const u = PointG2.fromHex(vector.ciphertext_u_g2_hex);
        const v = hexToBytes(vector.ciphertext_v_hex);
        
        const decrypted = await client.decrypt(timelockId, { u, v });
        
        // In the golden vector test, we verified this DK decrypts this CT.
        // So checking the result matches golden plaintext proves the flow.
        expect(bytesToHex(decrypted)).toBe(vector.plaintext_hex);
    });

    it('waitForDecryption polls until revealed', async () => {
        // Sequence:
        // 1. is_revealed -> false
        // 2. is_revealed -> true
        // 3. get_decryption_key -> dk
        mockView
            .mockResolvedValueOnce([false])
            .mockResolvedValueOnce([true])
            .mockResolvedValueOnce([`0x${dkHex}`]);
            
        const dk = await client.waitForDecryption(timelockId, 10, 1000);
        expect(bytesToHex(dk.toRawBytes(true))).toBe(dkHex);
        
        expect(mockView).toHaveBeenCalledTimes(3 + 4); // +4 from previous tests
    });
});
