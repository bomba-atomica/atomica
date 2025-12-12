// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLocalnet, teardownLocalnet } from '../../setup/localnet';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

const config = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: "http://127.0.0.1:8080/v1",
    faucet: "http://127.0.0.1:8081"
});
const aptos = new Aptos(config);

describe.sequential('Localnet Health Check', () => {
    beforeAll(async () => {
        await setupLocalnet();
    }, 120000);

    afterAll(async () => {
        await teardownLocalnet();
    });

    it('should have a running localnet with correct chain ID', async () => {
        const info = await aptos.getLedgerInfo();
        console.log(`Chain ID: ${info.chain_id}`);
        expect(info.chain_id).toBe(4);
    });
});
