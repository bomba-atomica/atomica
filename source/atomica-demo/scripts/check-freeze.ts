#!/usr/bin/env bun

import { Aptos, AptosConfig } from "@aptos-labs/ts-sdk";
import { JsonRpcProvider } from "ethers";
import { evmFreezeStatus, moveFreezeStatus } from "@atomica/sdk/freeze-status";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const aptos = new Aptos(
    new AptosConfig({ fullnode: required("APTOS_URL") }),
  );
  const ethereum = new JsonRpcProvider(required("ETH_RPC_URL"));
  const [moveFrozen, evmFrozen] = await Promise.all([
    moveFreezeStatus(aptos, required("ATOMICA_ADDRESS")),
    evmFreezeStatus(ethereum, required("LOCKBOX_PROXY_ADDRESS")),
  ]);
  console.log(`Move AtomicaAuction frozen: ${moveFrozen}`);
  console.log(`EVM LockBox frozen: ${evmFrozen}`);
  if (
    process.argv.includes("--require-frozen") &&
    (!moveFrozen || !evmFrozen)
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
