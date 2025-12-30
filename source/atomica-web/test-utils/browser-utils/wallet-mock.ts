/**
 * Browser-compatible MetaMask wallet mock
 * This runs in the actual browser context and provides window.ethereum
 */

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
  isMetaMask: boolean;
  selectedAddress: string | null;
  chainId: string;
}

declare global {
  interface Window {
    ethereum: EthereumProvider;
  }
}

export function setupBrowserWalletMock(
  testAccount: string,
  privateKey: string,
): EthereumProvider {
  const accounts = [testAccount];
  const chainId = "0x4"; // Rinkeby

  // Simple event emitter for browser
  const eventHandlers: Map<
    string,
    Set<(...args: unknown[]) => void>
  > = new Map();

  const provider: EthereumProvider = {
    isMetaMask: true,
    selectedAddress: testAccount,
    chainId,

    on(event: string, handler: (...args: unknown[]) => void) {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
      }
      eventHandlers.get(event)!.add(handler);
    },

    removeListener(event: string, handler: (...args: unknown[]) => void) {
      eventHandlers.get(event)?.delete(handler);
    },

    async request(args: { method: string; params?: unknown[] }) {
      console.log("[Browser Wallet Mock] Request:", args.method, args.params);

      switch (args.method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return accounts;

        case "eth_chainId":
          return chainId;

        case "personal_sign": {
          const params = args.params || [];
          const message = params[0] as string;
          if (!message) {
            throw new Error("Message is required for personal_sign");
          }

          // Import ethers dynamically in browser context
          const { ethers } = await import("ethers");

          // Create wallet from private key
          const wallet = new ethers.Wallet(privateKey);

          // Convert hex message to string if needed
          let messageStr: string;
          if (message.startsWith("0x")) {
            messageStr = ethers.toUtf8String(message);
          } else {
            messageStr = message;
          }

          console.log(
            "[Browser Wallet Mock] Signing message:",
            messageStr.substring(0, 100),
          );
          const signature = await wallet.signMessage(messageStr);
          console.log("[Browser Wallet Mock] Signature:", signature);
          return signature;
        }

        case "wallet_switchEthereumChain":
          return null;

        case "eth_getBalance":
          return "0x0";

        default:
          console.warn("[Browser Wallet Mock] Unhandled method:", args.method);
          throw new Error(`Unhandled method: ${args.method}`);
      }
    },
  };

  // Inject into window
  window.ethereum = provider;

  console.log("[Browser Wallet Mock] Initialized with account:", testAccount);

  return provider;
}
