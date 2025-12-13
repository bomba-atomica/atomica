// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import nodeFetch, { Request, Response, Headers } from "node-fetch";
import { MockWallet } from "../utils/MockWallet";
import { setupLocalnet, teardownLocalnet, fundAccount } from "../setup/localnet";
import { aptos, getDerivedAddress, setAptosInstance } from "../../src/lib/aptos";
import { Faucet } from "../../src/components/Faucet";
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
const TEST_PK = "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";

describe.sequential("FakeETH Funding Integration", () => {
    const mockWallet = new MockWallet(TEST_PK);

    beforeAll(async () => {
        console.log("Starting Localnet...");
        await setupLocalnet();

        // INJECT FETCH-COMPATIBLE APTOS INSTANCE
        // This ensures the SDK uses node-fetch instead of got
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
                            // console.log(`[Fetch Data]`, JSON.stringify(data).slice(0, 100));
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

        // Verify connectivity using the injected instance (via the module export)
        try {
            // Re-importing or using 'aptos' should see the update if 'let' works as live binding
            const ledger = await aptos.getLedgerInfo();
            console.log(`[Connectivity check] Connected to chain ID: ${ledger.chain_id}`);
        } catch (e) {
            console.error("[Connectivity check] Failed:", e);
            throw new Error("Could not connect to local node. Aborting test.");
        }

        // Mock window.ethereum
        Object.defineProperty(window, "ethereum", {
            value: mockWallet.getProvider(),
            writable: true
        });

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
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("should sign SIWE and mint FAKEETH when requested", async () => {
        const derivedAddr = await getDerivedAddress(mockWallet.address);
        const derivedAddrStr = derivedAddr.toString();
        console.log(`Test Account: ${mockWallet.address} -> ${derivedAddrStr}`);

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
        render(<Faucet account={mockWallet.address} />);

        const btn = await waitFor(() => {
            const button = screen.getByText("Request Test Tokens");
            expect(button).not.toBeDisabled();
            return button;
        }, { timeout: 30000 });

        // 3. Click Request
        fireEvent.click(btn);

        // 4. Wait for success message
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
