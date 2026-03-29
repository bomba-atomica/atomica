/**
 * Ethereum wallet mock for UI tests that mint ERC20 tokens.
 *
 * Unlike the SIWE wallet mock (wallet-mock.ts), this mock also handles
 * eth_sendTransaction by signing and broadcasting to the local Ethereum RPC.
 * All other JSON-RPC calls are forwarded directly to the backing provider.
 *
 * Use this mock when testing components that submit Ethereum transactions
 * (e.g. ERC20 mint calls via MetaMask).
 */
/**
 * Set up a window.ethereum mock that auto-approves and signs Ethereum
 * transactions using the provided private key, forwarding them to the
 * given RPC endpoint. All read-only JSON-RPC calls are proxied through.
 *
 * @returns The injected account address.
 */
export async function setupEthereumMintMock(options) {
    const { privateKey, rpcUrl, chainId = 32382 } = options;
    const chainIdHex = `0x${chainId.toString(16)}`;
    // Import ethers dynamically so this module stays browser-compatible
    const { ethers } = await import("ethers");
    const backingProvider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, backingProvider);
    const address = wallet.address;
    const mock = {
        isMetaMask: true,
        selectedAddress: address,
        chainId: chainIdHex,
        on: () => { },
        removeListener: () => { },
        async request({ method, params, }) {
            switch (method) {
                case "eth_accounts":
                case "eth_requestAccounts":
                    return [address];
                case "eth_chainId":
                    return chainIdHex;
                case "net_version":
                    return chainId.toString();
                case "wallet_switchEthereumChain":
                case "wallet_addEthereumChain":
                    // Accept silently — test environment is always on the right chain
                    return null;
                case "eth_sendTransaction": {
                    // Auto-approve: sign and broadcast via the backing provider
                    const txParams = ((params ?? [])[0] ?? {});
                    const tx = await wallet.sendTransaction({
                        to: txParams.to,
                        from: txParams.from,
                        data: txParams.data,
                        value: txParams.value,
                        gasLimit: txParams.gas,
                    });
                    return tx.hash;
                }
                default:
                    // Proxy all other calls (eth_call, eth_estimateGas, eth_getBalance, …)
                    return await backingProvider.send(method, params ?? []);
            }
        },
    };
    window.ethereum = mock;
    return address;
}
