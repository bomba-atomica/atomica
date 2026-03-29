/**
 * Browser-compatible MetaMask wallet mock
 * This runs in the actual browser context and provides window.ethereum
 */
export function setupBrowserWalletMock(testAccount, privateKey) {
    const accounts = [testAccount];
    const chainId = "0x4"; // Rinkeby
    // Simple event emitter for browser
    const eventHandlers = new Map();
    const provider = {
        isMetaMask: true,
        selectedAddress: testAccount,
        chainId,
        on(event, handler) {
            if (!eventHandlers.has(event)) {
                eventHandlers.set(event, new Set());
            }
            eventHandlers.get(event).add(handler);
        },
        removeListener(event, handler) {
            eventHandlers.get(event)?.delete(handler);
        },
        async request(args) {
            switch (args.method) {
                case "eth_requestAccounts":
                case "eth_accounts":
                    return accounts;
                case "eth_chainId":
                    return chainId;
                case "personal_sign": {
                    const params = args.params || [];
                    const message = params[0];
                    if (!message) {
                        throw new Error("Message is required for personal_sign");
                    }
                    // Import ethers dynamically in browser context
                    const { ethers } = await import("ethers");
                    // Create wallet from private key
                    const wallet = new ethers.Wallet(privateKey);
                    // Convert hex message to string if needed
                    let messageStr;
                    if (message.startsWith("0x")) {
                        messageStr = ethers.toUtf8String(message);
                    }
                    else {
                        messageStr = message;
                    }
                    const signature = await wallet.signMessage(messageStr);
                    return signature;
                }
                case "wallet_switchEthereumChain":
                    return null;
                case "eth_getBalance":
                    return "0x0";
                default:
                    throw new Error(`Unhandled method: ${args.method}`);
            }
        },
    };
    // Inject into window
    window.ethereum = provider;
    return provider;
}
