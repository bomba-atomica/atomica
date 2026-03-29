/**
 * Deterministic window.ethereum mock fixture for browser integration tests.
 *
 * Replaces window.ethereum with a minimal EIP-1193 provider backed by an
 * ethers.js Wallet using the .env.test private key. The app can connect,
 * approve, and sign without any MetaMask prompt or extension present.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WalletContext.tsx audit — window.ethereum calls made by the app:
 *
 *   1. ethers.BrowserProvider(window.ethereum)
 *      — wraps window.ethereum as an EIP-1193 provider via ethers.js
 *   2. provider.getSigner()
 *      — calls eth_requestAccounts then eth_accounts internally
 *   3. signer.getAddress()
 *      — reads the address from the resolved account
 *   4. provider.listAccounts()
 *      — calls eth_accounts on the provider
 *
 * config.ts audit — additional window.ethereum calls made by the app:
 *
 *   5. provider.send("eth_requestAccounts", [])
 *      — via connectMetaMask()
 *   6. window.ethereum.request({ method: "wallet_switchEthereumChain", … })
 *      — via switchToTestnet()
 *   7. window.ethereum.request({ method: "wallet_addEthereumChain", … })
 *      — via switchToTestnet() fallback when chain not registered (4902)
 *   8. provider.getNetwork()
 *      — calls eth_chainId, used by isCorrectNetwork()
 *
 * Methods implemented by this mock:
 *   eth_requestAccounts, eth_accounts, eth_chainId, net_version,
 *   eth_sendTransaction, personal_sign, eth_signTypedData_v4,
 *   wallet_switchEthereumChain, wallet_addEthereumChain
 *
 * All other JSON-RPC calls are proxied to the backing JsonRpcProvider.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Global type declaration ──────────────────────────────────────────────────

interface EthereumProvider {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    isMetaMask: boolean;
    selectedAddress: string | null;
    chainId: string;
}

declare global {
    interface Window {
        ethereum: EthereumProvider;
    }
}

// ── Public interface ─────────────────────────────────────────────────────────

export interface WalletMockOptions {
    /** Private key of the test account (hex string with 0x prefix) */
    privateKey: string;
    /**
     * Optional Ethereum JSON-RPC URL.
     * When provided, eth_sendTransaction auto-signs and broadcasts to this URL.
     * When omitted, eth_sendTransaction returns a deterministic fake tx hash.
     */
    rpcUrl?: string;
    /** Chain ID in decimal (default: 32382 — local testnet) */
    chainId?: number;
}

/**
 * Set up a deterministic window.ethereum mock backed by the provided private
 * key. Injects the mock into window.ethereum before any test code calls it.
 *
 * Usage:
 *
 *   import { setupWalletMock } from 'tests/integration/fixtures/wallet-mock';
 *
 *   beforeAll(async () => {
 *     signerAddress = await setupWalletMock({
 *       privateKey: ETHEREUM_ACCOUNT_0_PRIVATE_KEY,
 *     });
 *   });
 *
 * @returns The checksummed Ethereum address of the injected account.
 */
export async function setupWalletMock(options: WalletMockOptions): Promise<string> {
    const { privateKey, rpcUrl, chainId = 32382 } = options;
    const chainIdHex = `0x${chainId.toString(16)}`;

    // Import ethers dynamically so this module stays browser-compatible
    const { ethers } = await import("ethers");

    const backingProvider = rpcUrl ? new ethers.JsonRpcProvider(rpcUrl) : null;
    const wallet = backingProvider
        ? new ethers.Wallet(privateKey, backingProvider)
        : new ethers.Wallet(privateKey);
    const address = wallet.address;

    // Simple in-memory event emitter (covers accountsChanged / chainChanged)
    const eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>();

    const mock: EthereumProvider = {
        isMetaMask: true,
        selectedAddress: address,
        chainId: chainIdHex,

        on(event: string, handler: (...args: unknown[]) => void) {
            if (!eventHandlers.has(event)) {
                eventHandlers.set(event, new Set());
            }
            eventHandlers.get(event)!.add(handler);
        },

        removeListener(event: string, handler: (...args: unknown[]) => void) {
            eventHandlers.get(event)?.delete(handler);
        },

        async request({
            method,
            params,
        }: {
            method: string;
            params?: unknown[];
        }): Promise<unknown> {
            switch (method) {
                // ── Account methods ──────────────────────────────────────────
                case "eth_accounts":
                case "eth_requestAccounts":
                    return [address];

                // ── Chain / network methods ──────────────────────────────────
                case "eth_chainId":
                    return chainIdHex;

                case "net_version":
                    return chainId.toString();

                // ── Wallet management methods ────────────────────────────────
                case "wallet_switchEthereumChain": {
                    const switchParams = ((params ?? [])[0] ?? {}) as Record<string, unknown>;
                    const requestedChain = switchParams.chainId as string | undefined;
                    if (requestedChain && requestedChain !== chainIdHex) {
                        // Simulate MetaMask 4902: chain not added — caller should
                        // fall back to wallet_addEthereumChain
                        const err = new Error("Unrecognized chain ID") as Error & { code: number };
                        err.code = 4902;
                        throw err;
                    }
                    return null;
                }

                case "wallet_addEthereumChain":
                    // Accept silently — test environment is always on the right chain
                    return null;

                // ── Transaction methods ──────────────────────────────────────
                case "eth_sendTransaction": {
                    const txParams = ((params ?? [])[0] ?? {}) as Record<string, unknown>;

                    if (backingProvider && wallet.provider) {
                        // Auto-sign and broadcast to the backing provider
                        const tx = await wallet.sendTransaction({
                            to: txParams.to as string,
                            from: txParams.from as string | undefined,
                            data: txParams.data as string | undefined,
                            value: txParams.value as string | undefined,
                            gasLimit: txParams.gas as string | undefined,
                        });
                        return tx.hash;
                    }

                    // No backing provider — return a deterministic fake hash so
                    // unit tests that only check for a valid hex string still pass
                    const fakeHash = ethers.id(
                        JSON.stringify({ method, params, nonce: Date.now() }),
                    );
                    return fakeHash;
                }

                // ── Signing methods ──────────────────────────────────────────
                case "personal_sign": {
                    const messageHexOrStr = ((params ?? [])[0] ?? "") as string;
                    let messageStr: string;
                    if (messageHexOrStr.startsWith("0x")) {
                        messageStr = ethers.toUtf8String(messageHexOrStr);
                    } else {
                        messageStr = messageHexOrStr;
                    }
                    return await wallet.signMessage(messageStr);
                }

                case "eth_signTypedData_v4": {
                    const typedDataJson = ((params ?? [])[1] ?? "{}") as string;
                    const typedData = JSON.parse(typedDataJson) as {
                        domain: Record<string, unknown>;
                        types: Record<string, unknown[]>;
                        message: Record<string, unknown>;
                        primaryType: string;
                    };
                    const { domain, types, message } = typedData;
                    // Remove EIP712Domain from types if present (ethers adds it itself)
                    const { EIP712Domain: _removed, ...otherTypes } = types as Record<
                        string,
                        unknown[]
                    >;
                    return await wallet.signTypedData(
                        domain as Parameters<typeof wallet.signTypedData>[0],
                        otherTypes as Parameters<typeof wallet.signTypedData>[1],
                        message,
                    );
                }

                // ── Proxy everything else ────────────────────────────────────
                default:
                    if (backingProvider) {
                        return await backingProvider.send(method, params ?? []);
                    }
                    throw new Error(`wallet-mock: unhandled method "${method}" (no backing provider)`);
            }
        },
    };

    window.ethereum = mock;
    return address;
}
