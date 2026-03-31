import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import { ethers } from "ethers";
import { CONTRACT_ADDR, aptos } from "./config";
import { getDerivedAddress } from "./siwe";
import { submitNativeTransaction } from "./transaction";
import type { LockedBalanceProof } from "../ethereum/proofs/generator";

/**
 * Sanity Test: Simple APT transfer using MetaMask signature
 * This tests ONLY the signature verification without any custom contracts
 */
export async function testSimpleAPTTransfer(
  ethAddress: string,
  customRecipient?: string,
) {
  console.log("\n=== 🧪 Sanity Test: Simple APT Transfer ===");
  console.log(
    "This tests signature verification with the simplest possible transaction",
  );
  console.log(
    "Using: 0x1::aptos_account::transfer (standard Aptos function)\n",
  );

  // Show which addresses we're using
  const derivedAddress = await getDerivedAddress(ethAddress.toLowerCase());
  console.log("ETH Address (identity):", ethAddress);
  console.log("Aptos Derived Address (sender):", derivedAddress.toString());
  console.log("This is the same address the faucet funded ✓\n");

  // Generate a random recipient address (standard Ed25519 Aptos account) if not provided
  const randomRecipient =
    "0x" +
    Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");

  const recipient = customRecipient || randomRecipient;

  console.log("Recipient:", recipient);
  console.log("Amount: 100 octas (0.000001 APT)\n");

  try {
    const result = await submitNativeTransaction(aptos, ethAddress, {
      function: "0x1::aptos_account::transfer",
      functionArguments: [recipient, 100],
    });

    console.log("\n✅ SANITY TEST PASSED!");
    console.log("Transaction hash:", result.hash);
    console.log("\nConclusion: Signature verification is working correctly!");
    console.log(
      "The issue with the custom contract call is likely contract-specific\n",
    );

    return { success: true, hash: result.hash };
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("\n❌ SANITY TEST FAILED!");
    console.error("Error:", errorMessage);
    console.error(
      "\nConclusion: There's a fundamental issue with signature verification",
    );
    console.error("This needs to be fixed before trying custom contracts\n");

    return { success: false, error: errorMessage };
  }
}

/**
 * Step 1: Request APT tokens for gas via web funding API
 */
export async function requestAPT(ethAddress: string) {
  // Always use lowercase for consistency with submitNativeTransaction
  const derived = await getDerivedAddress(ethAddress.toLowerCase());

  // Do not pass host from the client — the server determines the Aptos node
  // URL from its own environment (ATOMICA_APTOS_HOST). Passing a client-side
  // host value caused TLS errors when localStorage held a stale https:// URL.
  const res = await fetch("/api/aptos/fund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: derived.toString(),
      amount: 100000000,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    txHash?: string;
    error?: string;
  };

  if (!res.ok) {
    const text = body.error || "No response text";
    console.error(
      `Funding API Failed: ${res.status} ${res.statusText} - ${text}`,
    );
    throw new Error(`Funding API Failed: ${text}`);
  }

  return { hash: body.txHash || "apt-funded" };
}

/**
 * Check if auction contracts are deployed
 */
export async function areContractsDeployed(): Promise<boolean> {
  return areCoreContractsDeployed();
}

export async function areCoreContractsDeployed(): Promise<boolean> {
  const requiredModules = ["registry", "lock_receipt", "eth_proof"];
  try {
    const modules = await aptos.getAccountModules({
      accountAddress: CONTRACT_ADDR,
    });
    const deployed = new Set(
      modules
        .map((module: { abi?: { name?: string } }) => module.abi?.name)
        .filter(Boolean),
    );
    return requiredModules.every((name) => deployed.has(name));
  } catch (e) {
    console.log("Core Aptos contracts not yet deployed:", e);
    return false;
  }
}

export function getCreateAuctionPayload(
  lockId: Uint8Array,
  minPrice: bigint,
  duration: bigint,
  mpk: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::create_auction`,
    functionArguments: [lockId, minPrice, duration, mpk],
  };
}

export async function submitCreateAuction(
  ethAddress: string,
  lockId: Uint8Array,
  minPrice: bigint,
  duration: bigint,
  mpk: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getCreateAuctionPayload(lockId, minPrice, duration, mpk),
  );
}

/**
 * Build payload for lock_receipt::register_ethereum_lock<FakeETH>.
 *
 * Serialises directly from LockedBalanceProof, matching the Move entry function:
 *   register_ethereum_lock<Asset>(account, block_number, block_hash, state_root,
 *     contract_address, user_address, token_address, storage_key, storage_value,
 *     account_proof, storage_proof)
 *
 * Do NOT use serializeProofForAptos() — it is missing block_number, user_address,
 * token_address and returns wrong types.
 */
export function getRegisterLockPayload(
  proof: LockedBalanceProof,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::lock_receipt::register_ethereum_lock`,
    typeArguments: [`${CONTRACT_ADDR}::lock_receipt::FakeETH`],
    functionArguments: [
      proof.blockNumber,
      ethers.getBytes(proof.blockHash),
      ethers.getBytes(proof.stateRoot),
      ethers.getBytes(proof.contractAddress),
      ethers.getBytes(proof.userAddress),
      ethers.getBytes(proof.tokenAddress),
      ethers.getBytes(proof.storageKey),
      proof.storageValue.toString(), // u256 as decimal string
      proof.accountProof.map((node) => ethers.getBytes(node)),
      proof.storageProof.map((node) => ethers.getBytes(node)),
    ],
  };
}

/**
 * Build payload for fake_eth::mint_from_lock.
 *
 * Entry function: mint_from_lock(account: &signer, lock_id: vector<u8>)
 * Used in Demo/MVP phases. Production may replace with receipt-direct-escrow.
 */
export function getMintFakeEthPayload(
  lockId: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::fake_eth::mint_from_lock`,
    functionArguments: [lockId],
  };
}

export function getBidPayload(
  sellerAddr: string,
  amountUsd: bigint,
  _u: Uint8Array,
  _v: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::submit_bid`,
    functionArguments: [sellerAddr, amountUsd],
  };
}

export async function submitBid(
  ethAddress: string,
  sellerAddr: string,
  amountUsd: bigint,
  u: Uint8Array,
  v: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getBidPayload(sellerAddr, amountUsd, u, v),
  );
}

export function getSettlePayload(
  sellerAddr: string,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::settle`,
    functionArguments: [sellerAddr],
  };
}

export async function submitSettle(
  ethAddress: string,
  sellerAddr: string,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getSettlePayload(sellerAddr),
  );
}

/**
 * Query `auction::is_settled` view function.
 * Returns true if the auction for the given seller has been settled.
 */
export async function isSettled(sellerAddr: string): Promise<boolean> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::auction::is_settled`,
      functionArguments: [sellerAddr],
    },
  });
  return result[0] as boolean;
}

/**
 * Query `auction::get_settlement` view function.
 * Returns { winner, clearingPrice } after settlement.
 * winner == "0x0" means no valid bid was found.
 */
export async function getSettlement(
  sellerAddr: string,
): Promise<{ winner: string; clearingPrice: bigint }> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::auction::get_settlement`,
      functionArguments: [sellerAddr],
    },
  });
  return {
    winner: result[0] as string,
    clearingPrice: BigInt(result[1] as string),
  };
}
