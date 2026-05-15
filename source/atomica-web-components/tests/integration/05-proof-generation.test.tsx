/**
 * Integration tests: storage proof generation (Step4Proof)
 *
 * Covers:
 *   - Happy path: proof spinner shown then proof-ready div appears
 *   - Storage value matches on-chain locked balance
 *   - Block not yet finalized: retry path re-calls onGenerate
 *
 * All tests run in headless Chromium against a live dual-chain Docker testnet.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import {
    setupIntegrationFixture,
    teardownIntegrationFixture,
    type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { step2Lock, step3Confirm, step4Proof } from "./helpers/selectors";
import { Step4Proof } from "../../src/components/SellFlow/steps/Step4Proof";
import { WalletProvider } from "../../src/context/WalletContext";
import { AppStateProvider } from "../../src/state/app-state";
import { BalancesProvider } from "../../src/context/BalancesContext";
import { SellFlow } from "../../src/components/SellFlow/SellFlow";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.sequential("05 — proof generation", () => {
    let fixture: IntegrationFixture;

    beforeAll(async () => {
        fixture = await setupIntegrationFixture();
    }, 600_000);

    afterAll(async () => {
        await teardownIntegrationFixture();
    });

    afterEach(() => {
        cleanup();
        localStorage.clear();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).ethereum = undefined;
    });

    // ── Component-level: spinner shown while generating ───────────────────────

    it("proof-spinner shown when proof is not yet ready and no error", () => {
        const onGenerate = vi.fn().mockResolvedValue(undefined);
        render(
            <Step4Proof loading={true} onGenerate={onGenerate} />,
        );
        expect(screen.getByTestId(step4Proof.proofSpinner)).toBeTruthy();
        expect(screen.queryByTestId(step4Proof.proofReady)).toBeNull();
    });

    it("proof-ready shown when proof is provided", () => {
        const now = Date.now();
        const mockProof = {
            blockNumber: 42,
            blockHash: "0x" + "a".repeat(64),
            stateRoot: "0x" + "b".repeat(64),
            storageValue: 10_000_000_000_000_000n, // 0.01 FETH
            storageKey: "0x" + "c".repeat(64),
            accountProof: ["0xabc", "0xdef"],
            storageProof: ["0x123", "0x456"],
            contractAddress: "0x" + "d".repeat(40),
            userAddress: "0x" + "e".repeat(40),
            tokenAddress: "0x" + "f".repeat(40),
            timestamp: Math.floor(now / 1000),
            generatedAt: now,
        };

        render(
            <Step4Proof proof={mockProof} loading={false} onGenerate={vi.fn()} />,
        );

        expect(screen.getByTestId(step4Proof.proofReady)).toBeTruthy();
        expect(screen.queryByTestId(step4Proof.proofSpinner)).toBeNull();
        // Block number is shown
        expect(screen.getByText(/42/)).toBeTruthy();
        // Proof node counts
        expect(screen.getByText(/2 account \/ 2 storage/)).toBeTruthy();
    });

    // ── Block not finalized: retry path ───────────────────────────────────────

    it("retry button calls onGenerate when error is shown", () => {
        const onGenerate = vi.fn().mockResolvedValue(undefined);
        render(
            <Step4Proof
                loading={false}
                error="block not yet finalized"
                onGenerate={onGenerate}
            />,
        );

        // Error is shown, retry button is present
        expect(screen.getByText(/block not yet finalized/)).toBeTruthy();
        const retryButton = screen.getByRole("button", { name: /Retry/i });
        expect(retryButton).toBeTruthy();

        // Click Retry
        fireEvent.click(retryButton);
        expect(onGenerate).toHaveBeenCalledOnce();
    });

    // ── Full flow against testnet ─────────────────────────────────────────────

    it(
        "happy path: proof spinner then proof-ready; storageValue matches on-chain balance",
        async () => {
            const lockAmount = "0.01"; // FETH — small enough to complete quickly

            await setupWalletMock({
                privateKey: fixture.eth.seller.privateKey,
                rpcUrl: fixture.eth.rpcUrl,
                chainId: fixture.eth.chainId,
            });

            render(
                <AppStateProvider>
                    <WalletProvider>
                        <BalancesProvider>
                            <SellFlow />
                        </BalancesProvider>
                    </WalletProvider>
                </AppStateProvider>,
            );

            // Wait for Step2Lock
            await waitFor(
                () => {
                    expect(
                        screen.queryByTestId(step2Lock.approveLockButton),
                    ).not.toBeNull();
                },
                { timeout: 10_000 },
            );

            const amountInput = screen.getByTestId(
                step2Lock.lockAmountInput,
            ) as HTMLInputElement;
            fireEvent.change(amountInput, { target: { value: lockAmount } });
            fireEvent.click(screen.getByTestId(step2Lock.approveLockButton));

            // Step3 confirm spinner
            await waitFor(
                () => {
                    expect(
                        screen.queryByTestId(step3Confirm.confirmSpinner),
                    ).not.toBeNull();
                },
                { timeout: 60_000 },
            );

            // Step4 proof spinner (after block confirmation)
            await waitFor(
                () => {
                    expect(screen.queryByTestId(step4Proof.proofSpinner)).not.toBeNull();
                },
                { timeout: 60_000 },
            );

            // Proof-ready div appears once generation completes
            await waitFor(
                () => {
                    expect(screen.queryByTestId(step4Proof.proofReady)).not.toBeNull();
                },
                { timeout: 120_000 },
            );

            // Verify proof-ready content shows the correct amount
            const proofReadyEl = screen.getByTestId(step4Proof.proofReady);
            // 0.01 FETH = 10000000000000000 wei → displayed as "0.0100 FETH"
            expect(proofReadyEl.textContent).toMatch(/0\.0100 FETH/);

            // Verify storageValue matches on-chain locked balance
            const { ethers } = await import("ethers");
            const provider = new ethers.JsonRpcProvider(fixture.eth.rpcUrl);
            const lockBoxAbi = [
                "function getLockedBalance(address user, address token) external view returns (uint256)",
            ];
            const lockBox = new ethers.Contract(
                fixture.eth.contracts.lockBox,
                lockBoxAbi,
                provider,
            );
            const onChainBalance: bigint = await lockBox.getLockedBalance(
                fixture.eth.seller.address,
                fixture.eth.contracts.fakeETH,
            );
            const expectedEth = (Number(onChainBalance) / 1e18).toFixed(4);
            expect(proofReadyEl.textContent).toMatch(new RegExp(expectedEth));
        },
        300_000,
    );
});
