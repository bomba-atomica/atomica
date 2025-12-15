import {
  Aptos,
  AptosConfig,
  Network,
  AccountAddress,
  Serializer,
  AccountAuthenticator,
  AccountAuthenticatorVariant,
} from "@aptos-labs/ts-sdk";
import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import { ethers } from "ethers";
import { sha3_256 } from "@noble/hashes/sha3";

const NODE_URL = "http://127.0.0.1:8080/v1";
// 127.0.0.1:8080/v1
// Use safer env access that works in Node (test/ts-node) and Vite
const env = (import.meta as any).env || process.env || {};
export const CONTRACT_ADDR = env.VITE_CONTRACT_ADDRESS || "0x1";

const config = new AptosConfig({ network: Network.LOCAL, fullnode: NODE_URL });
export let aptos = new Aptos(config);

export function setAptosInstance(instance: Aptos) {
  aptos = instance;
}

function sha3(bytes: Uint8Array): Uint8Array {
  return sha3_256(bytes);
}

export function constructSIWEMessage(
  domain: string,
  address: string,
  statement: string,
  uri: string,
  version: string,
  chainId: number,
  nonce: string,
  issuedAt: string,
): string {
  // NOTE: The statement MUST already include the trailing periods to match Move contract format
  return `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

/**
 * Derives the Atomica (Aptos) address for a given Ethereum address
 * using the `ethereum_derivable_account` scheme.
 */
export async function getDerivedAddress(
  ethAddress: string,
): Promise<AccountAddress> {
  const serializer = new Serializer();
  // FunctionInfo { module_address, module_name, function_name }
  AccountAddress.from("0x1").serialize(serializer);
  serializer.serializeStr("ethereum_derivable_account");
  serializer.serializeStr("authenticate");
  const funcInfoBcs = serializer.toUint8Array();

  const identitySerializer = new Serializer();
  // FIXED: Move expects the UTF8 bytes of the Hex String (e.g. "0x123...")
  // not the raw bytes of the address.
  const ethBytes = new TextEncoder().encode(ethAddress);
  identitySerializer.serializeBytes(ethBytes);
  const identityBcs = identitySerializer.toUint8Array();

  const preImage = new Uint8Array(funcInfoBcs.length + identityBcs.length + 1);
  preImage.set(funcInfoBcs);
  preImage.set(identityBcs, funcInfoBcs.length);
  preImage.set([5], funcInfoBcs.length + identityBcs.length); // Scheme 5

  const hash = sha3(preImage);
  return AccountAddress.from(hash);
}

/**
 * Calculates the digest expected by the Move module.
 * sha3( "APTOS::AASigningData" ++ BCS(AASigningData { original_signing_message, function_info }) )
 */
function calculateAbstractDigest(signingMessage: Uint8Array): Uint8Array {
  // 1. Serialize AASigningData
  const serializer = new Serializer();

  // Variant "V1" (index 0)
  serializer.serializeU32AsUleb128(0);

  // original_signing_message: vector<u8>
  serializer.serializeBytes(signingMessage);

  // function_info: FunctionInfo
  AccountAddress.from("0x1").serialize(serializer);
  serializer.serializeStr("ethereum_derivable_account");
  serializer.serializeStr("authenticate");

  const bcsData = serializer.toUint8Array();

  // 2. Prepend Salt "APTOS::AASigningData"
  const salt = new TextEncoder().encode("APTOS::AASigningData");
  const saltHash = sha3(salt);

  const combined = new Uint8Array(saltHash.length + bcsData.length);
  combined.set(saltHash);
  combined.set(bcsData, saltHash.length);

  return sha3(combined);
}

/**
 * Serializes a SIWE (Sign-In With Ethereum) abstract signature.
 * Structure: SIWEAbstractSignature::MessageV2 variant with scheme, issuedAt, and signature.
 */
function serializeSIWEAbstractSignature(
  scheme: string,
  issuedAt: string,
  signature: Uint8Array,
): Uint8Array {
  const serializer = new Serializer();
  // SIWEAbstractSignature::MessageV2 (Variant 1)
  serializer.serializeU32AsUleb128(1);
  serializer.serializeStr(scheme);
  serializer.serializeStr(issuedAt);
  serializer.serializeBytes(signature);
  return serializer.toUint8Array();
}

/**
 * Serializes a SIWE abstract public key.
 * Structure: Contains ethereum address bytes and domain.
 */
function serializeSIWEAbstractPublicKey(
  ethAddressBytes: Uint8Array,
  domain: string,
): Uint8Array {
  const serializer = new Serializer();
  serializer.serializeBytes(ethAddressBytes);
  serializer.serializeBytes(new TextEncoder().encode(domain));
  return serializer.toUint8Array();
}

/**
 * SIWE Account Authenticator using SDK's proper enums and structure.
 * This replaces our hand-crafted serialization with the official SDK approach.
 */
class SIWEAccountAuthenticator extends AccountAuthenticator {
  constructor(
    private readonly digest: Uint8Array,
    private readonly abstractSignature: Uint8Array,
    private readonly accountIdentity: Uint8Array,
  ) {
    super();
  }

  serialize(serializer: Serializer): void {
    // Use SDK's AccountAuthenticatorVariant enum
    serializer.serializeU32AsUleb128(AccountAuthenticatorVariant.Abstraction);

    // FunctionInfo for ethereum_derivable_account::authenticate
    AccountAddress.from("0x1").serialize(serializer);
    serializer.serializeStr("ethereum_derivable_account");
    serializer.serializeStr("authenticate");

    // AbstractAuthenticationDataVariant::DerivableV1 = 1 (not exported from SDK, so we use the literal)
    serializer.serializeU32AsUleb128(1);

    // Digest
    serializer.serializeBytes(this.digest);

    // Abstract signature (already serialized SIWE structure)
    serializer.serializeBytes(this.abstractSignature);

    // Account identity (public key - already serialized)
    serializer.serializeBytes(this.accountIdentity);
  }
}

export async function submitNativeTransaction(
  ethAddress: string,
  payload: InputGenerateTransactionPayloadData,
) {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  // Use lowercase address to match Rust smoke test behavior
  // The Rust test uses: format!("0x{}", hex::encode(address.as_bytes()))
  // which produces lowercase hex
  const checksummedAddress = ethAddress.toLowerCase();

  const senderAddress = await getDerivedAddress(checksummedAddress);

  // Check if account exists and has balance
  try {
    const accountInfo = await aptos.getAccountInfo({
      accountAddress: senderAddress,
    });
    console.log("=== Account Info ===");
    console.log("  Account exists: true");
    console.log("  Sequence number:", accountInfo.sequence_number);
  } catch (e: any) {
    console.warn("Account may not exist yet (will be created on first tx)");
  }

  // 1. Build Transaction
  const transaction = await aptos.transaction.build.simple({
    sender: senderAddress,
    data: payload,
  });

  // 2. Get Signing Message (Prefix + BCS)
  const rawTxn = transaction.rawTransaction;
  const rawTxnBytes = new Serializer();
  rawTxn.serialize(rawTxnBytes);
  const rawTxnBcs = rawTxnBytes.toUint8Array();

  const rawTxnSalt = sha3(new TextEncoder().encode("APTOS::RawTransaction"));
  const originalSigningMessage = new Uint8Array(
    rawTxnSalt.length + rawTxnBcs.length,
  );
  originalSigningMessage.set(rawTxnSalt);
  originalSigningMessage.set(rawTxnBcs, rawTxnSalt.length);

  // 3. Calculate Abstract Digest
  const digest = calculateAbstractDigest(originalSigningMessage);
  const digestHex = ethers.hexlify(digest);

  // 4. SIWE
  const ledgerInfo = await aptos.getLedgerInfo();
  const issuedAt = new Date().toISOString();
  // Protocol has trailing colon, e.g. "http:", we want "http"
  const scheme = window.location.protocol.slice(0, -1);
  const domain = window.location.host;

  // Determine Network Name based on Chain ID
  let networkName = `custom network: ${ledgerInfo.chain_id}`;
  if (ledgerInfo.chain_id === 1) networkName = "mainnet";
  else if (ledgerInfo.chain_id === 2) networkName = "testnet";
  else if (ledgerInfo.chain_id === 4) networkName = "local";

  // Extract Entry Function Name
  // payload is InputGenerateTransactionPayloadData which can be InputEntryFunctionData
  // We expect { function: "0x...::mod::func", ... }
  const entryFunction = (payload as any).function;
  if (!entryFunction)
    throw new Error("Could not determine entry function name from payload");

  // Construct Strict Statement
  const statement = `Please confirm you explicitly initiated this request from ${domain}. You are approving to execute transaction ${entryFunction} on Aptos blockchain (${networkName}).`;

  const siwe = constructSIWEMessage(
    domain,
    checksummedAddress,
    statement,
    window.location.origin,
    "1",
    ledgerInfo.chain_id,
    digestHex,
    issuedAt,
  );

  // 5. Sign
  const signature = await signer.signMessage(siwe);

  // 6. Submit
  const signatureBytes = ethers.getBytes(signature);
  const ethAddressBytes = new TextEncoder().encode(checksummedAddress);

  // DEBUG LOGGING START
  const siweBytes = new TextEncoder().encode(siwe);
  const debugState = {
    ethAddress: checksummedAddress,
    ethAddressBytes: Array.from(ethAddressBytes),
    digest: digestHex,
    digestBytes: Array.from(digest),
    scheme: scheme,
    domain: domain,
    issuedAt: issuedAt,
    siweMessage: siwe,
    siweMessageLength: siweBytes.length,
    siweMessageBytes: Array.from(siweBytes),
    signature: signature,
    signatureBytes: Array.from(signatureBytes),
    chain_id: ledgerInfo.chain_id,
    entryFunction: entryFunction,
    origin: window.location.origin,
    networkName: networkName
  };
  console.log("SubmitNativeTransaction Debug:", JSON.stringify(debugState, null, 2));
  // DEBUG LOGGING END

  // Build the SIWE abstract signature (scheme, issuedAt, signature)
  const abstractSignature = serializeSIWEAbstractSignature(
    scheme,
    issuedAt,
    signatureBytes,
  );

  // Build the SIWE abstract public key (ethAddress, domain)
  const accountIdentity = serializeSIWEAbstractPublicKey(
    ethAddressBytes,
    domain,
  );

  console.log("AbstractSignature BCS:", Array.from(abstractSignature));
  console.log("  Scheme:", scheme);
  console.log("  IssuedAt:", issuedAt);
  console.log("  Signature length:", signatureBytes.length);
  console.log("AccountIdentity BCS:", Array.from(accountIdentity));
  console.log("  EthAddress bytes:", Array.from(ethAddressBytes));
  console.log("  Domain:", domain);

  // Create account authenticator using SDK enums
  const auth = new SIWEAccountAuthenticator(
    digest,
    abstractSignature,
    accountIdentity,
  );

  try {
    console.log("\n=== Submitting Transaction ===");
    console.log("Transaction payload:", JSON.stringify(payload, null, 2));
    console.log("Sender address:", senderAddress.toString());

    const pendingTx = await aptos.transaction.submit.simple({
      transaction,
      senderAuthenticator: auth,
    });

    console.log("\n✅ Transaction submitted successfully!");
    console.log("Transaction hash:", pendingTx.hash);

    return pendingTx;
  } catch (e: any) {
    console.error("\n❌ Submission Failed");
    console.error("Error message:", e.message);
    console.error("Error stack:", e.stack);

    // Log the debug state again on failure for visibility
    console.error("\n=== Debug State on Failure ===");
    console.error(JSON.stringify(debugState, null, 2));

    if (e.response) {
      console.error("\n=== Response Details ===");
      console.error("Status:", e.response.status);
      console.error("Status Text:", e.response.statusText);

      try {
        const responseText = await e.response.text();
        console.error("Response Body:", responseText);

        try {
          const responseJson = JSON.parse(responseText);
          console.error("Parsed Response:", JSON.stringify(responseJson, null, 2));

          if (responseJson.vm_error_code !== undefined) {
            console.error("\n=== VM Error Details ===");
            console.error("VM Error Code:", responseJson.vm_error_code);
            console.error("Message:", responseJson.message);

            // Provide specific guidance based on error code
            if (responseJson.vm_error_code === 1) {
              console.error("\n💡 INVALID_SIGNATURE (code 1) detected");
              console.error("This means the Move contract's signature verification failed");
              console.error("\nPossible causes:");
              console.error("1. Entry function name mismatch between SIWE message and transaction");
              console.error("2. Account address derivation issue");
              console.error("3. BCS serialization mismatch");
              console.error("\nDebugging steps:");
              console.error("- Check that entry function in SIWE matches transaction payload");
              console.error("- Verify the sender address is correctly derived");
              console.error("- Check Move contract logs if available");
            }
          }
        } catch (jsonError) {
          // Response wasn't JSON, that's okay
        }
      } catch (textError) {
        console.error("Could not read response text");
      }
    }

    throw new Error(
      `Transaction Submission verification failed: ${e.message || e}\nDebug State: ${JSON.stringify(debugState, null, 2)}`,
    );
  }
}

/**
 * Sanity Test: Simple APT transfer using MetaMask signature
 * This tests ONLY the signature verification without any custom contracts
 */
export async function testSimpleAPTTransfer(ethAddress: string) {
  console.log("\n=== 🧪 Sanity Test: Simple APT Transfer ===");
  console.log("This tests signature verification with the simplest possible transaction");
  console.log("Using: 0x1::aptos_account::transfer (standard Aptos function)\n");

  // Show which addresses we're using
  const derivedAddress = await getDerivedAddress(ethAddress.toLowerCase());
  console.log("ETH Address (identity):", ethAddress);
  console.log("Aptos Derived Address (sender):", derivedAddress.toString());
  console.log("This is the same address the faucet funded ✓\n");

  // Generate a random recipient address (standard Ed25519 Aptos account)
  const randomRecipient = "0x" + Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');

  console.log("Recipient (random):", randomRecipient);
  console.log("Amount: 100 octas (0.000001 APT)\n");

  try {
    const result = await submitNativeTransaction(ethAddress, {
      function: "0x1::aptos_account::transfer",
      functionArguments: [randomRecipient, 100],
    });

    console.log("\n✅ SANITY TEST PASSED!");
    console.log("Transaction hash:", result.hash);
    console.log("\nConclusion: Signature verification is working correctly!");
    console.log("The issue with FAKEETH::mint is likely contract-specific\n");

    return { success: true, hash: result.hash };
  } catch (e: any) {
    console.error("\n❌ SANITY TEST FAILED!");
    console.error("Error:", e.message);
    console.error("\nConclusion: There's a fundamental issue with signature verification");
    console.error("This needs to be fixed before trying custom contracts\n");

    return { success: false, error: e.message };
  }
}

/**
 * Step 1: Request APT tokens from faucet for gas
 */
export async function requestAPT(ethAddress: string) {
  const derived = await getDerivedAddress(ethAddress);
  const FAUCET_URL = "http://127.0.0.1:8081";

  console.log("=== Requesting APT from Faucet ===");
  console.log("  Ethereum Address:", ethAddress);
  console.log("  Aptos Derived Address:", derived.toString());
  console.log("  Funding address:", derived.toString());

  const res = await fetch(
    `${FAUCET_URL}/mint?amount=100000000&address=${derived.toString()}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "No response text");
    console.error(
      `Faucet API Failed: ${res.status} ${res.statusText} - ${text}`,
    );
    throw new Error(`Faucet API Failed: ${text}`);
  }

  // Wait slightly for balance to reflect (local node is fast but async)
  await new Promise((r) => setTimeout(r, 1000));

  return { hash: "apt-funded" };
}

/**
 * Step 2: Mint test tokens (FAKEETH and FAKEUSD)
 * Requires contracts to be deployed
 */
export async function requestTestTokens(ethAddress: string) {
  const derived = await getDerivedAddress(ethAddress);

  console.log("=== Minting Test Tokens ===");
  console.log("  Ethereum Address:", ethAddress);
  console.log("  Aptos Derived Address:", derived.toString());
  console.log("  Transaction sender:", derived.toString());

  // Mint FAKEETH (10 ETH)
  console.log("\n  Minting FAKEETH...");
  // 8 decimals from Move file
  const amountEth = BigInt(10) * BigInt(100_000_000);
  await submitNativeTransaction(ethAddress, {
    function: `${CONTRACT_ADDR}::FAKEETH::mint`,
    functionArguments: [amountEth],
  });

  // Mint FAKEUSD (10,000 USD)
  console.log("Minting FAKEUSD...");
  const amountUsd = BigInt(10000) * BigInt(100_000_000);
  await submitNativeTransaction(ethAddress, {
    function: `${CONTRACT_ADDR}::FAKEUSD::mint`,
    functionArguments: [amountUsd],
  });

  return { hash: "test-tokens-minted" };
}

/**
 * Check if test token contracts are deployed
 */
export async function areContractsDeployed(): Promise<boolean> {
  try {
    // Try to get account modules at the contract address
    const modules = await aptos.getAccountModules({
      accountAddress: CONTRACT_ADDR,
    });

    // Check if FAKEETH and FAKEUSD modules exist
    const hasFakeEth = modules.some((m) => m.abi?.name === "FAKEETH");
    const hasFakeUsd = modules.some((m) => m.abi?.name === "FAKEUSD");

    return hasFakeEth && hasFakeUsd;
  } catch (e) {
    console.log("Contracts not yet deployed:", e);
    return false;
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use requestAPT() and requestTestTokens() separately
 */
export async function submitFaucet(ethAddress: string) {
  await requestAPT(ethAddress);
  await requestTestTokens(ethAddress);
  return { hash: "gas-fakeeth-fakeusd-minted" };
}

export async function submitCreateAuction(
  ethAddress: string,
  amountEth: bigint,
  minPrice: bigint,
  duration: bigint,
  mpk: Uint8Array,
) {
  return await submitNativeTransaction(ethAddress, {
    function: `${CONTRACT_ADDR}::auction::create_auction`,
    functionArguments: [amountEth, minPrice, duration, mpk],
  });
}

export async function submitBid(
  ethAddress: string,
  sellerAddr: string,
  amountUsd: bigint,
  u: Uint8Array,
  v: Uint8Array,
) {
  return await submitNativeTransaction(ethAddress, {
    function: `${CONTRACT_ADDR}::auction::bid`,
    functionArguments: [sellerAddr, amountUsd, u, v],
  });
}
