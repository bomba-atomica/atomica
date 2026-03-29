/**
 * @file wallet-mock-smoke.test.tsx
 * @description Smoke tests for the deterministic window.ethereum mock fixture.
 *
 * Validates that:
 *   1. The mock can be injected and the WalletContext connect() flow resolves
 *      the correct Ethereum address without any MetaMask popup.
 *   2. eth_sendTransaction via the mock returns a valid hex tx hash without
 *      any MetaMask popup.
 *   3. Removing the mock injection leaves the app in a disconnected state.
 *
 * These tests run in headless Chromium via Vitest browser mode (Playwright).
 * No Docker testnet or live RPC is required — eth_sendTransaction falls back
 * to a deterministic fake hash when no rpcUrl is provided.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { WalletProvider, useWallet } from "../../src/context/WalletContext";

// ── Test account (from .env.test) ────────────────────────────────────────────
//
// ETHEREUM_ACCOUNT_0_ADDRESS = 0xf39Fd6e51aad88F6f4ce6aB8827279cffFb92266
// ETHEREUM_ACCOUNT_0_PRIVATE_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
//
// These are the standard Hardhat/Anvil test account #0 — not secret.
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDRESS = "0xf39Fd6e51aad88F6f4ce6aB8827279cffFb92266";

// ── Minimal component wrappers ───────────────────────────────────────────────

function ConnectButton() {
    const { account, connect } = useWallet();
    return (
        <div>
            <button data-testid="connect-btn" onClick={connect}>
                Connect
            </button>
            {account && <div data-testid="account">{account}</div>}
            {!account && <div data-testid="disconnected">disconnected</div>}
        </div>
    );
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe.sequential("wallet-mock smoke", () => {
    afterEach(() => {
        cleanup();
        // Reset window.ethereum after each test so tests are isolated
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).ethereum = undefined;
    });

    // ── Smoke test 1: connect wallet ─────────────────────────────────────────

    it("should resolve the Ethereum address after connect() with mock injected", async () => {
        // Inject mock — no backing rpcUrl needed for address resolution
        const injectedAddress = await setupWalletMock({ privateKey: TEST_PRIVATE_KEY });
        expect(injectedAddress.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());

        render(
            <WalletProvider>
                <ConnectButton />
            </WalletProvider>,
        );

        // Before clicking connect: WalletContext's useEffect auto-connects if
        // eth_accounts returns a non-empty list, so the account may already be set
        // by the time the test asserts. Wait for it either way.
        const connectBtn = screen.getByTestId("connect-btn");
        fireEvent.click(connectBtn);

        await waitFor(
            () => {
                const accountEl = screen.queryByTestId("account");
                expect(accountEl).not.toBeNull();
                expect(accountEl!.textContent!.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
            },
            { timeout: 10000 },
        );
    });

    // ── Smoke test 2: eth_sendTransaction ────────────────────────────────────

    it("should return a valid hex tx hash from eth_sendTransaction via the mock", async () => {
        await setupWalletMock({ privateKey: TEST_PRIVATE_KEY });

        const { ethers } = await import("ethers");
        const provider = new ethers.BrowserProvider(window.ethereum);

        // eth_sendTransaction — no live node, so the mock returns a deterministic
        // fake hash (keccak256 of the request). It must be a 32-byte hex string.
        const txHash = await provider.send("eth_sendTransaction", [
            {
                from: TEST_ADDRESS,
                to: TEST_ADDRESS,
                value: "0x0",
                data: "0x",
            },
        ]);

        expect(typeof txHash).toBe("string");
        expect(txHash as string).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    // ── Smoke test 3: no mock → disconnected ─────────────────────────────────

    it("should show disconnected state when window.ethereum is not injected", async () => {
        // Ensure no mock is present (afterEach cleared it, but be explicit)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).ethereum = undefined;

        render(
            <WalletProvider>
                <ConnectButton />
            </WalletProvider>,
        );

        // The WalletContext useEffect will not find window.ethereum and should
        // leave the account as null. Give it a short time to settle.
        await waitFor(
            () => {
                expect(screen.queryByTestId("account")).toBeNull();
                expect(screen.getByTestId("disconnected")).toBeTruthy();
            },
            { timeout: 2000 },
        );
    });
});
