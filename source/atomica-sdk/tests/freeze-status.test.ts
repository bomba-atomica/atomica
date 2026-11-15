import { describe, expect, it } from "vitest";
import { Interface, type ContractRunner } from "ethers";
import type { Aptos } from "@aptos-labs/ts-sdk";
import { evmFreezeStatus, moveFreezeStatus } from "../src/freeze-status.js";

const freezeInterface = new Interface([
  "function frozen() view returns (bool)",
]);

function aptosWithPackages(packages: unknown): Aptos {
  return {
    getAccountResource: async () => ({ packages }),
  } as unknown as Aptos;
}

function evmRunner(frozen: boolean): ContractRunner {
  return {
    call: async () => freezeInterface.encodeFunctionResult("frozen", [frozen]),
    resolveName: async (name: string) => name,
  } as unknown as ContractRunner;
}

describe("freeze status", () => {
  it("reports Move compatible and immutable policies", async () => {
    const aptos = aptosWithPackages([
      {
        name: { vec: [...new TextEncoder().encode("AtomicaAuction")] },
        upgrade_policy: { policy: 1 },
      },
    ]);
    await expect(moveFreezeStatus(aptos, "0xcafe")).resolves.toBe(false);
    const frozen = aptosWithPackages([
      { name: "AtomicaAuction", upgrade_policy: { policy: 2 } },
    ]);
    await expect(moveFreezeStatus(frozen, "0xcafe")).resolves.toBe(true);
  });

  it("throws when the Atomica package is missing", async () => {
    const aptos = aptosWithPackages([
      { name: "OtherPackage", upgrade_policy: { policy: 2 } },
    ]);
    await expect(moveFreezeStatus(aptos, "0xcafe")).rejects.toThrow(
      "has no AtomicaAuction package",
    );
  });

  it("reads the LockBox frozen flag from the proxy", async () => {
    await expect(
      evmFreezeStatus(
        evmRunner(false),
        "0x000000000000000000000000000000000000cafe",
      ),
    ).resolves.toBe(false);
    await expect(
      evmFreezeStatus(
        evmRunner(true),
        "0x000000000000000000000000000000000000cafe",
      ),
    ).resolves.toBe(true);
  });
});
