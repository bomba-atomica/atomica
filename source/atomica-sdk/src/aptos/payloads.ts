import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import { ethers } from "ethers";
import { CONTRACT_ADDR, aptos } from "./config.js";
import { getDerivedAddress } from "../siwe.js";
import { submitNativeTransaction } from "../transaction.js";
import type { LockedBalanceProof } from "../ethereum/proofs/generator.js";

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

/**
 * Build payload for auction::create_auction (v0 Beta global-registry).
 *
 * Parameters match the Phase 3a rewrite from issue #86:
 *   create_auction(seller, window_id, pair_bcs, lock_id, min_price, mpk_bytes)
 *
 * `pairBcs` is the BCS-encoded Pair struct; callers can compute it with
 * `bcs.serialize` or pass a pre-encoded byte array.
 *
 * @see docs/architecture/v0-architecture.md §2.3
 */
export function getCreateAuctionPayload(
  windowId: bigint,
  pairBcs: Uint8Array,
  lockId: Uint8Array,
  minPrice: bigint,
  mpkBytes: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::create_auction`,
    functionArguments: [windowId, pairBcs, lockId, minPrice, mpkBytes],
  };
}

export async function submitCreateAuction(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
  lockId: Uint8Array,
  minPrice: bigint,
  mpkBytes: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getCreateAuctionPayload(windowId, pairBcs, lockId, minPrice, mpkBytes),
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
 * Build payload for auction::submit_bid (v0 Beta sealed-bid).
 *
 * Parameters match the Phase 3a rewrite from issue #86:
 *   submit_bid(bidder, window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id)
 *
 * `uBytes`    — IBE ephemeral point U = rG (48-byte G1, Boneh-Franklin)
 * `ciphertext` — AES-GCM ciphertext of the plaintext price
 * `collateralLockId` — FakeUSD LockReceipt ID held as margin
 *
 * @see docs/architecture/v0-architecture.md §2.5
 */
export function getBidPayload(
  windowId: bigint,
  pairBcs: Uint8Array,
  uBytes: Uint8Array,
  ciphertext: Uint8Array,
  collateralLockId: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::submit_bid`,
    functionArguments: [
      windowId,
      pairBcs,
      uBytes,
      ciphertext,
      collateralLockId,
    ],
  };
}

export async function submitBid(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
  uBytes: Uint8Array,
  ciphertext: Uint8Array,
  collateralLockId: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getBidPayload(windowId, pairBcs, uBytes, ciphertext, collateralLockId),
  );
}

/**
 * Build payload for auction::settle (v0 Beta global-registry).
 *
 * Parameters match the Phase 3a rewrite from issue #86:
 *   settle(caller, window_id, pair_bcs)
 *
 * @see docs/architecture/v0-architecture.md §2.7
 */
export function getSettlePayload(
  windowId: bigint,
  pairBcs: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::settle`,
    functionArguments: [windowId, pairBcs],
  };
}

export async function submitSettle(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getSettlePayload(windowId, pairBcs),
  );
}

/**
 * Query `auction::is_settled` view function (v0 Beta window-keyed).
 *
 * Returns true if the auction window identified by (windowId, pairBcs) has
 * been settled. Returns false if no window exists.
 *
 * @see docs/architecture/v0-architecture.md §2.3
 */
export async function isSettled(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<boolean> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::auction::is_settled`,
      functionArguments: [windowId, pairBcs],
    },
  });
  return result[0] as boolean;
}

/**
 * Query `auction::get_settlement` view function (v0 Beta window-keyed).
 *
 * Returns { clearingPrice, totalFilled } after settlement.
 * Aborts if no window exists for (windowId, pairBcs).
 *
 * @see docs/architecture/v0-architecture.md §2.7
 */
export async function getSettlement(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<{ clearingPrice: bigint; totalFilled: bigint }> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::auction::get_settlement`,
      functionArguments: [windowId, pairBcs],
    },
  });
  return {
    clearingPrice: BigInt(result[0] as string),
    totalFilled: BigInt(result[1] as string),
  };
}

/**
 * Build payload for fake_eth::mint (Demo-phase winner payout).
 *
 * Entry function: mint(account: &signer, amount: u64)
 * In Demo phase, `mint` is a public faucet anyone can call. It mints FakeETH
 * to the signer's own Aptos account. The winner calls this directly via SIWE
 * to self-mint the payout amount.
 */
export function getClaimMintPayload(
  amount: bigint,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::fake_eth::mint`,
    functionArguments: [amount],
  };
}

/**
 * Submit a Demo-phase claim: the winner self-mints FakeETH via SIWE.
 */
export async function submitClaim(ethAddress: string, amount: bigint) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getClaimMintPayload(amount),
  );
}

/**
 * Query `fake_eth::balance` view function.
 * Returns the FakeETH FA balance for the given Aptos address.
 */
export async function getFakeEthBalance(ownerAddr: string): Promise<bigint> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::fake_eth::balance`,
      functionArguments: [ownerAddr],
    },
  });
  return BigInt(result[0] as string);
}
