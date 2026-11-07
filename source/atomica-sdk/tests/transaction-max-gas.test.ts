/**
 * Unit tests for the simulation-based gas limit in submitNativeTransaction.
 *
 * submitNativeTransaction must simulate the payload before the user signs,
 * then sign with maxGasAmount = ceil(gas_used * GAS_MARGIN) + max_aa_gas,
 * capped at the chain maximum from the gas schedule. The ts-sdk default of
 * 200,000 units is too low for large calls since gas schedule feature
 * version 53.
 *
 * The Aptos client and the EIP-1193 wallet are fakes: no chain is needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Aptos, Serializer } from "@aptos-labs/ts-sdk";
import { ethers } from "ethers";
import {
  GAS_MARGIN,
  maxGasFromSimulation,
  submitNativeTransaction,
} from "../src/transaction";

const CHAIN_MAX_GAS = 2_000_000;
const MAX_AA_GAS = 600;
const TS_SDK_DEFAULT_MAX_GAS = 200_000;
const PAYLOAD = {
  function: "0xabc::auction::settle" as const,
  functionArguments: [1, new Uint8Array(0)],
};

const wallet = ethers.Wallet.createRandom();
let calls: string[];

/** EIP-1193 provider backed by a local wallet; records personal_sign calls. */
function installWallet() {
  window.ethereum = {
    request: async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown[];
    }) => {
      switch (method) {
        case "eth_chainId":
          return "0x1";
        case "eth_accounts":
        case "eth_requestAccounts":
          return [wallet.address];
        case "personal_sign":
          calls.push("sign");
          return wallet.signMessage(ethers.getBytes(params![0] as string));
        default:
          throw new Error(`unexpected wallet method ${method}`);
      }
    },
  } as unknown as typeof window.ethereum;
}

/** Fake Aptos client: records build options and returns `gasUsed` from simulation. */
function fakeAptos(gasUsed: number, success = true) {
  const buildOptions: Array<{ maxGasAmount?: number } | undefined> = [];
  const simulateOptions: unknown[] = [];
  const aptos = {
    getAccountInfo: async () => ({}),
    getLedgerInfo: async () => ({ chain_id: 4 }),
    getAccountResource: async () => ({
      feature_version: "53",
      entries: [
        { key: "txn.min_transaction_gas_units", val: "27600000" },
        {
          key: "txn.maximum_number_of_gas_units",
          val: String(CHAIN_MAX_GAS),
        },
        { key: "txn.max_aa_gas", val: String(MAX_AA_GAS) },
      ],
    }),
    transaction: {
      build: {
        simple: async (args: { options?: { maxGasAmount?: number } }) => {
          calls.push("build");
          buildOptions.push(args.options);
          const maxGas = args.options?.maxGasAmount ?? TS_SDK_DEFAULT_MAX_GAS;
          return {
            rawTransaction: {
              serialize: (s: Serializer) => s.serializeU64(maxGas),
            },
          };
        },
      },
      simulate: {
        simple: async (args: { options?: unknown }) => {
          calls.push("simulate");
          simulateOptions.push(args.options);
          return [
            {
              success,
              vm_status: success ? "Executed successfully" : "ABORTED",
              gas_used: String(gasUsed),
            },
          ];
        },
      },
      submit: {
        simple: async () => {
          calls.push("submit");
          return { hash: "0x01" };
        },
      },
    },
    waitForTransaction: async () => ({ success: true }),
  };
  return {
    aptos: aptos as unknown as Aptos,
    buildOptions,
    simulateOptions,
  };
}

describe("submitNativeTransaction gas limit", () => {
  beforeEach(() => {
    calls = [];
    installWallet();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("simulates before signing and signs with the simulated gas plus the margin", async () => {
    const { aptos, buildOptions, simulateOptions } = fakeAptos(300_000);

    await submitNativeTransaction(aptos, wallet.address, PAYLOAD);

    expect(calls).toEqual(["build", "simulate", "build", "sign", "submit"]);
    expect(simulateOptions).toEqual([{ estimateMaxGasAmount: true }]);
    const expected = Math.ceil(300_000 * GAS_MARGIN) + MAX_AA_GAS;
    expect(expected).toBe(450_600);
    expect(buildOptions[1]?.maxGasAmount).toBe(expected);
    expect(expected).toBeGreaterThan(TS_SDK_DEFAULT_MAX_GAS);
  });

  it("caps maxGasAmount at the chain maximum", async () => {
    const { aptos, buildOptions } = fakeAptos(1_900_000);

    await submitNativeTransaction(aptos, wallet.address, PAYLOAD);

    expect(buildOptions[1]?.maxGasAmount).toBe(CHAIN_MAX_GAS);
  });

  it("keeps the ts-sdk default when the simulation fails", async () => {
    const { aptos, buildOptions } = fakeAptos(1_000, false);

    await submitNativeTransaction(aptos, wallet.address, PAYLOAD);

    expect(calls).toEqual(["build", "simulate", "build", "sign", "submit"]);
    expect(buildOptions[1]?.maxGasAmount).toBeUndefined();
  });
});

describe("maxGasFromSimulation", () => {
  const limits = { maxGasAmount: CHAIN_MAX_GAS, maxAaGas: MAX_AA_GAS };

  it("adds the margin and the authentication gas", () => {
    expect(maxGasFromSimulation(1_001, limits)).toBe(1_502 + MAX_AA_GAS);
  });

  it("never exceeds the chain maximum", () => {
    expect(maxGasFromSimulation(10_000_000, limits)).toBe(CHAIN_MAX_GAS);
  });
});
