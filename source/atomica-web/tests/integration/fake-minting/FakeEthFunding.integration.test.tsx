// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import nodeFetch, { Request, Response, Headers } from "node-fetch";
// import { MockWallet } from "../utils/MockWallet"; // Removed in favor of eth-testing
import { generateTestingUtils } from "eth-testing";
import { setupLocalnet, teardownLocalnet, fundAccount } from "../../setup/localnet";
import { aptos, getDerivedAddress, setAptosInstance } from "../../../src/lib/aptos";
import { Faucet } from "../../../src/components/Faucet";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

import { URL } from "url";

// Polyfill full fetch suite for happy-dom/Aptos SDK
global.fetch = nodeFetch as any;
global.Request = Request as any;
global.Response = Response as any;
global.Headers = Headers as any;
global.URL = URL as any;

window.fetch = nodeFetch as any;
(window as any).Request = Request;
(window as any).Response = Response;
(window as any).Headers = Headers;
(window as any).URL = URL;

const DEPLOYER_ADDR = "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";
// Standard Hardhat Account 0 Private Key (for reference, eth-testing simulates the signer)
// const TEST_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat Account 0

import { vi } from "vitest";
// Mock the CONTRACT_ADDR to match our localnet deployer
vi.mock("../../src/lib/aptos", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../src/lib/aptos")>();
    return {
        ...actual,
        CONTRACT_ADDR: "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa"
    };
});

describe.sequential("FakeETH Funding Integration", () => {
    // Generate testing utils
    const testingUtils = generateTestingUtils({ providerType: "MetaMask" });

    beforeAll(async () => {
        console.log("Starting Localnet...");
        await setupLocalnet();

        // INJECT FETCH-COMPATIBLE APTOS INSTANCE
        const config = new AptosConfig({
            network: Network.LOCAL,
            fullnode: "http://127.0.0.1:8080/v1",
            client: {
                provider: async (url: any, init: any) => {
                    let fetchUrl = url;
                    let fetchInit = init;

                    if (typeof url !== 'string' && !(url instanceof URL)) {
                        if (url.url) {
                            fetchUrl = url.url;
                            fetchInit = {
                                ...init,
                                method: url.method,
                                headers: url.headers,
                                body: url.body
                            };
                        }
                    }

                    console.log(`[Fetch] ${fetchInit?.method || 'GET'} ${fetchUrl}`);

                    try {
                        const res = await nodeFetch(fetchUrl, fetchInit);
                        console.log(`[Fetch Response] ${fetchUrl} -> ${res.status}`);

                        // Hack: Polyfill .data for SDKs expecting pre-parsed body (like Axios/Got)
                        try {
                            const bodyClone = res.clone();
                            const data = await bodyClone.json().catch(() => bodyClone.text());
                            Object.defineProperty(res, 'data', { value: data });
                        } catch (e) {
                            console.warn("Failed to polyfill .data on response", e);
                        }

                        return res;
                    } catch (e) {
                        console.error(`[Fetch Error] ${fetchUrl}`, e);
                        throw e;
                    }
                }
            }
        });
        const testAptos = new Aptos(config);
        setAptosInstance(testAptos);
        console.log("Injected test-compatible Aptos instance.");

        // Connectivity Check
        try {
            const ledger = await aptos.getLedgerInfo();
            console.log(`[Connectivity check] Connected to chain ID: ${ledger.chain_id}`);
        } catch (e) {
            console.error("[Connectivity check] Failed:", e);
            throw new Error("Could not connect to local node. Aborting test.");
        }

        // Mock window.ethereum using eth-testing
        // eth-testing provides a mock provider found at testingUtils.getProvider()
        // We ensure it supports request method
        const mockProvider = testingUtils.getProvider();
        Object.defineProperty(window, "ethereum", {
            value: mockProvider,
            writable: true
        });

        // Setup Mock State
        testingUtils.mockChainId("0x4"); // Chain ID 4 (Localnet)
        testingUtils.mockAccounts([TEST_ACCOUNT]);
        testingUtils.mockRequestAccounts([TEST_ACCOUNT]);

        // Ensure window.location has protocol/host
        if (!window.location.protocol) {
            // @ts-ignore
            delete window.location;
            // @ts-ignore
            window.location = {
                protocol: "http:",
                host: "localhost:3000",
                origin: "http://localhost:3000",
                href: "http://localhost:3000/"
            };
        }
    }, 120000);

    afterAll(async () => {
        console.log("Stopping Localnet...");
        await teardownLocalnet();
        testingUtils.clearAllMocks();
    });

    afterEach(() => {
        document.body.innerHTML = "";
        testingUtils.clearAllMocks();
        // Reset essential mocks for next test if any
        testingUtils.mockChainId("0x4");
        testingUtils.mockAccounts([TEST_ACCOUNT]);
    });

    it("should sign SIWE and mint FAKEETH when requested", async () => {
        const derivedAddr = await getDerivedAddress(TEST_ACCOUNT);
        const derivedAddrStr = derivedAddr.toString();
        // IMPORTANT: Move requires lowercase address for hex decoding to work with our fix
        const testAccountLower = TEST_ACCOUNT.toLowerCase();

        console.log(`Test Account: ${TEST_ACCOUNT} -> ${derivedAddrStr}`);

        // 1. Initial funding for Gas (APT)
        const fundRes = await fundAccount(derivedAddrStr, 10_0000_0000);
        console.log("Gas funding initiated.");

        // Wait for gas funding to commit
        let gasConfirmed = false;
        for (let i = 0; i < 20; i++) {
            try {
                const balance = await aptos.getAccountResource({
                    accountAddress: derivedAddrStr,
                    resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
                });
                if (balance) {
                    gasConfirmed = true;
                    console.log("Gas confirmed.");
                    break;
                }
            } catch (e) { }
            await new Promise(r => setTimeout(r, 1000));
        }

        // 2. Render Faucet
        render(<Faucet account={TEST_ACCOUNT} />);

        const btn = await waitFor(() => {
            const button = screen.getByText("Request Test Tokens");
            expect(button).not.toBeDisabled();
            return button;
        }, { timeout: 30000 });

        // 3. Click Request
        fireEvent.click(btn);

        // 4. Handle MetaMask Signature Request
        // eth-testing requires us to manually approve the request if we want to simulate the flow
        // or we can auto-mock it. Since the app awaits the signature, we need to provide it.
        // We'll use a mocked signature that triggers the "verify" logic.
        // Note: Since we are mocking the provider, the app will receive this signature.
        // BUT, the app verifies this signature on-chain using the Move contract.
        // So this signature MUST be valid for the derived address data.

        // PROBLEM: eth-testing generates a random signature or a fixed one?
        // We need a REAL signature for the REAL data validation on-chain.
        // Since we don't have the private key for the mock provider's account inside the test easily accessible
        // (unless we import ethers wallet with the known HK hardhat key).

        // Solution: We will intercept `personal_sign` and verify the message content,
        // then return a REAL signature signed by a local ethers wallet using the Hardhat Key.

        // This is "Faithful Mocking": The provider behaves like MetaMask (async request),
        // but we control the cryptographic output to ensure on-chain validity.

        const { ethers } = await import("ethers");
        const wallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // Hardhat Account 0 PK

        // Wait for personal_sign request
        await waitFor(() => {
            // We can peek at requests?
            // testingUtils.lowLevel.requests contains the log
        }, { timeout: 5000 });

        // We use mockRequest to intercept personal_sign
        testingUtils.lowLevel.mockRequest("personal_sign", async (params: any[]) => {
            const [msgHex, from] = params;
            console.log(`[MockMetaMask] personal_sign requested from ${from}`);

            // Decode message to verify it's the SIWE message we expect
            const msgStr = ethers.toUtf8String(msgHex);
            console.log(`[MockMetaMask] Signing Message:\n${msgStr}`);

            // Sign with the real wallet so on-chain verification passes
            // Note: eth-testing expects the *result* to be returned
            const signature = await wallet.signMessage(msgStr);
            console.log(`[MockMetaMask] Generated Valid Signature: ${signature}`);
            return signature;
        });

        // 5. Wait for success message
        await waitFor(() => {
            expect(screen.getByText("Tokens Received ✓")).toBeInTheDocument();
        }, { timeout: 60000 });

        console.log("UI confirmed tokens received.");

        // 5. Verify Balance On-Chain
        const viewRes = await aptos.view({
            payload: {
                function: "0x1::coin::balance",
                typeArguments: [`${DEPLOYER_ADDR}::FAKEETH::FAKEETH`],
                functionArguments: [derivedAddrStr]
            }
        });

        console.log("FAKEETH Balance via View:", viewRes[0]);
        // 10 units * 10^8 decimals
        expect(viewRes[0]).toBe("1000000000");

    }, 120000);
});
