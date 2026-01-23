import { ethers } from "ethers";

export class MockWallet {
  chainId: string;
  wallet: ethers.Wallet;

  constructor(privateKey: string, chainId: number | string = 31337) {
    this.wallet = new ethers.Wallet(privateKey);
    // Ensure hex string format
    this.chainId =
      typeof chainId === "number" ? `0x${chainId.toString(16)}` : chainId;
  }

  get address() {
    return this.wallet.address;
  }

  // Mock for window.ethereum
  getProvider() {
    return {
      isMetaMask: true,

      request: async ({
        method,
        params,
      }: {
        method: string;
        params: unknown[];
      }) => {
        // console.log(`[MockWallet] handling ${method}`, params);
        switch (method) {
          case "eth_requestAccounts":
          case "eth_accounts":
            return [this.wallet.address];
          case "personal_sign": {
            // Params: [message, address]
            // ethers jsonRpcSigner sends the message as a hex string.
            // We need to decode it to bytes so wallet.signMessage treats it correctly (and adds prefix).
            const rawMessage = ethers.getBytes(params[0] as string);
            return await this.wallet.signMessage(rawMessage);
          }
          case "eth_chainId":
            return this.chainId;
          case "net_version":
            return parseInt(this.chainId, 16).toString();
          default:
            throw new Error(`Method ${method} not implemented in MockWallet`);
        }
      },
      on: () => {},
      removeListener: () => {},
    };
  }
}
