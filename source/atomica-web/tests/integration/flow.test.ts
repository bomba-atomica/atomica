
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ethers } from 'ethers';
import { submitFaucet, submitCreateAuction, submitBid } from '../../src/lib/aptos';
import * as ibe from '../../src/lib/ibe';

// Mock EIP-1193 Provider
class MockProvider {
    private wallet: ethers.Wallet;

    constructor(privateKey: string) {
        this.wallet = new ethers.Wallet(privateKey);
    }

    async request(args: { method: string, params?: any[] }) {
        switch (args.method) {
            case 'eth_accounts':
            case 'eth_requestAccounts':
                return [this.wallet.address];
            case 'personal_sign':
                // params: [message, address]
                // wallet.signMessage handles correct prefixing
                return await this.wallet.signMessage(args.params![0]);
            case 'eth_chainId':
                return "0x1"; // Mainnet (doesn't matter much for our logic except SIWE check)
            default:
                throw new Error(`Method ${args.method} not implemented in mock`);
        }
    }
}

describe('Atomica Flow Integration', () => {
    // Generate a random wallet for the user
    const wallet = ethers.Wallet.createRandom();
    const mockProvider = new MockProvider(wallet.privateKey);

    beforeAll(() => {
        // Mock window.ethereum
        vi.stubGlobal('window', {
            location: {
                host: 'localhost:3000',
                origin: 'http://localhost:3000',
                protocol: 'http:'
            },
            ethereum: mockProvider
        });
    });

    it('should request funds from faucet', async () => {
        // This hits real localnet faucet (127.0.0.1:8081)
        // Ensure localnet is running
        try {
            const res = await submitFaucet(wallet.address);
            expect(res).toBeDefined();
            console.log("Faucet result:", res);
        } catch (e) {
            console.error("Skipping integration test: Localnet/Faucet likely not running", e);
            // We skip if localnet is down so CI doesn't fail hard, 
            // but for this task we want to verify it works.
            throw e;
        }
    }, 30000); // Higher timeout for network ops

    // These tests depend on contract state, so order matters or we need setup
    it('should create an auction', async () => {
        const amountEth = 100n;
        const minPrice = 500n;
        const duration = 3600n;
        const { mpk } = await ibe.generateSystemParameters();

        const pendingTx = await submitCreateAuction(
            wallet.address,
            amountEth,
            minPrice,
            duration,
            mpk
        );
        expect(pendingTx).toHaveProperty('hash');
        console.log("Create Auction Tx:", pendingTx.hash);

        // Wait for tx? The simple submit returns pending tx.
    }, 30000);

    it('should submit a bid', async () => {
        // Need to know WHO is the seller. In "should create an auction" we acted as seller.
        // We can bid on our own auction for simplicity of testing? 
        // Or create another waller. Let's use same wallet (self-bidding might be allowed or not, let's assume yes or just test tx submission)
        const sellerAddr = await (await import('../../src/lib/aptos')).getDerivedAddress(wallet.address);

        // Encrypt bid
        const identity = sellerAddr.toString(); // Using address string as identity per AuctionBidder
        const { mpk } = await ibe.generateSystemParameters();
        const bidAmount = "150";
        // Real logic uses proper identity bytes matching on-chain, 
        // but verify_crypto just assumed bytes. auction.move uses?
        // Let's stick to what AuctionBidder does:
        const identityBytes = ethers.getBytes(identity);
        const payload = new TextEncoder().encode(bidAmount);
        const { u, v } = await ibe.encrypt(mpk, identityBytes, payload);

        const pendingTx = await submitBid(
            wallet.address,
            identity, // Seller Address (Hex string)
            BigInt(bidAmount),
            u,
            v
        );

        expect(pendingTx).toHaveProperty('hash');
        console.log("Submit Bid Tx:", pendingTx.hash);
    }, 30000);
});
