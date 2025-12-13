import { ethers } from "ethers";

export class MockWallet {
    wallet: ethers.Wallet;

    constructor(privateKey: string) {
        this.wallet = new ethers.Wallet(privateKey);
    }

    get address() {
        return this.wallet.address;
    }

    // Mock for window.ethereum
    getProvider() {
        return {
            isMetaMask: true,
            request: async ({ method, params }: { method: string; params: any[] }) => {
                // console.log(`[MockWallet] handling ${method}`, params);
                switch (method) {
                    case "eth_requestAccounts":
                    case "eth_accounts":
                        return [this.wallet.address];
                    case "personal_sign":
                        // Params: [message, address]
                        // ethers jsonRpcSigner sends the message as a hex string.
                        // We need to decode it to bytes so wallet.signMessage treats it correctly (and adds prefix).
                        const rawMessage = ethers.getBytes(params[0]);
                        return await this.wallet.signMessage(rawMessage);
                    case "eth_chainId":
                        // 31337 is common for local dev/anvil, but we can return whatever.
                        // Aptos doesn't strictly check this for the signature logic itself usually,
                        // but the SIWE message generation might use it.
                        return "0x7a69";
                    case "net_version":
                        return "31337";
                    default:
                        throw new Error(`Method ${method} not implemented in MockWallet`);
                }
            },
            on: () => { },
            removeListener: () => { },
        };
    }
}
