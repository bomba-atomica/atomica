
import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { getDerivedAddress, constructSIWEMessage } from '../../src/lib/aptos';

describe('Aptos Helpers', () => {
    describe('getDerivedAddress', () => {
        it('should derive a consistent address', async () => {
            const ethAddr = "0x1234567890123456789012345678901234567890";
            const addr1 = await getDerivedAddress(ethAddr);
            const addr2 = await getDerivedAddress(ethAddr);

            expect(addr1.toString()).toEqual(addr2.toString());
            // We know it produces an Aptos address (32 bytes / 64 hex chars + 0x)
            expect(addr1.toString()).toMatch(/^0x[a-f0-9]{64}$/);
        });
    });

    describe('constructSIWEMessage', () => {
        // Mock window location for tests if needed, but the function takes args
        it('should format message correctly', () => {
            const domain = "example.com";
            const address = "0x123...";
            const statement = "Test Statement";
            const uri = "https://example.com";
            const version = "1";
            const chainId = 4;
            const nonce = "0xnonce";
            const issuedAt = "2023-01-01T00:00:00.000Z";

            const msg = constructSIWEMessage(
                domain,
                address,
                statement,
                uri,
                version,
                chainId,
                nonce,
                issuedAt
            );

            const expected = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`;

            expect(msg).toBe(expected);
        });
    });
});
