/**
 * Smoke test for the dual-chain integration fixture.
 *
 * Verifies that:
 *   1. setupIntegrationFixture() starts both testnets and returns valid handles.
 *   2. eth.contracts.lockBox is a non-zero Ethereum address.
 *   3. Seller and bidder have non-zero FakeETH balances after setup.
 *   4. teardownIntegrationFixture() runs without error.
 *   5. AUCTION_DURATION_SHORT equals 2.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  AUCTION_DURATION_SHORT,
  type IntegrationFixture,
} from "./fixtures/dual-chain";

describe.sequential("Dual-chain fixture smoke test", () => {
  let fixture: IntegrationFixture;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();
  }, 600_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  it("AUCTION_DURATION_SHORT is 2", () => {
    expect(AUCTION_DURATION_SHORT).toBe(2);
  });

  it("eth.contracts.lockBox is a valid address", () => {
    expect(fixture.eth.contracts.lockBox).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("eth.contracts.fakeETH is a valid address", () => {
    expect(fixture.eth.contracts.fakeETH).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("eth.contracts.fakeUSD is a valid address", () => {
    expect(fixture.eth.contracts.fakeUSD).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("seller address is a valid Ethereum address", () => {
    expect(fixture.eth.seller.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("bidder address is a valid Ethereum address", () => {
    expect(fixture.eth.bidder.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("seller has non-zero FakeETH balance after setup", async () => {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(fixture.eth.rpcUrl);
    // Minimal ERC-20 balanceOf ABI
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const fakeETH = new ethers.Contract(
      fixture.eth.contracts.fakeETH,
      abi,
      provider,
    );
    const balance: bigint = await fakeETH.balanceOf(fixture.eth.seller.address);
    expect(balance).toBeGreaterThan(0n);
  }, 30_000);

  it("bidder has non-zero FakeETH balance after setup", async () => {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(fixture.eth.rpcUrl);
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const fakeETH = new ethers.Contract(
      fixture.eth.contracts.fakeETH,
      abi,
      provider,
    );
    const balance: bigint = await fakeETH.balanceOf(fixture.eth.bidder.address);
    expect(balance).toBeGreaterThan(0n);
  }, 30_000);

  it("aptos.moduleAddress is a valid Aptos address", () => {
    expect(fixture.aptos.moduleAddress).toMatch(/^0x[0-9a-fA-F]{1,64}$/);
  });

  it("aptos.nodeUrl is reachable (HTTP 200)", async () => {
    const response = await fetch(fixture.aptos.nodeUrl);
    expect(response.ok).toBe(true);
  }, 15_000);
});
