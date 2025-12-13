import {
  Aptos,
  AptosConfig,
  Network,
  AccountAddress,
  Serializer,
  AccountAuthenticator,
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

export class CustomAbstractAuthenticator extends AccountAuthenticator {
  public digest: Uint8Array;
  public signature: Uint8Array;
  public ethAddressBytes: Uint8Array;
  public scheme: string;
  public issuedAt: string;

  constructor(
    digest: Uint8Array,
    signature: Uint8Array,
    ethAddressBytes: Uint8Array,
    scheme: string,
    issuedAt: string,
  ) {
    super();
    this.digest = digest;
    this.signature = signature;
    this.ethAddressBytes = ethAddressBytes;
    this.scheme = scheme;
    this.issuedAt = issuedAt;
  }

  serialize(serializer: Serializer): void {
    // Variant 4 (Abstract)
    serializer.serializeU32AsUleb128(4);

    // FunctionInfo
    AccountAddress.from("0x1").serialize(serializer);
    serializer.serializeStr("ethereum_derivable_account");
    serializer.serializeStr("authenticate");

    // AuthData
    // Variant 1 (DerivableV1) for AbstractionAuthData
    serializer.serializeU32AsUleb128(1);

    // digest (vector<u8>)
    serializer.serializeBytes(this.digest);

    // abstract_signature (vector<u8>) -> Needs to be BCS SIWEAbstractSignature
    const sigSerializer = new Serializer();
    // SIWEAbstractSignature::MessageV2 (Variant 1)
    sigSerializer.serializeU32AsUleb128(1);
    sigSerializer.serializeStr(this.scheme);
    sigSerializer.serializeStr(this.issuedAt);
    sigSerializer.serializeBytes(this.signature);

    const abstractSignatureBytes = sigSerializer.toUint8Array();
    serializer.serializeBytes(abstractSignatureBytes);

    // public_key (vector<u8>) - SIWEAbstractPublicKey serialized
    const pkSerializer = new Serializer();
    // ethereum_address: vector<u8> (UTF8 bytes of hex string)
    pkSerializer.serializeBytes(this.ethAddressBytes);
    pkSerializer.serializeBytes(new TextEncoder().encode(window.location.host)); // domain
    const pkBcs = pkSerializer.toUint8Array();

    serializer.serializeBytes(pkBcs);
  }
}

export async function submitNativeTransaction(
  ethAddress: string,
  payload: InputGenerateTransactionPayloadData,
) {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  const senderAddress = await getDerivedAddress(ethAddress);

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
    ethAddress,
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
  const ethAddressBytes = new TextEncoder().encode(ethAddress);

  // DEBUG LOGGING START
  const debugState = {
    ethAddress: ethAddress,
    ethAddressBytes: Array.from(ethAddressBytes),
    digest: digestHex,
    scheme: scheme,
    domain: domain,
    issuedAt: issuedAt,
    siweMessage: siwe,
    signature: signature,
    chain_id: ledgerInfo.chain_id,
    entryFunction: entryFunction,
    origin: window.location.origin
  };
  console.log("SubmitNativeTransaction Debug:", JSON.stringify(debugState, null, 2));
  // DEBUG LOGGING END

  const auth = new CustomAbstractAuthenticator(
    digest,
    signatureBytes,
    ethAddressBytes,
    scheme,
    issuedAt,
  );

  try {
    const pendingTx = await aptos.transaction.submit.simple({
      transaction,
      senderAuthenticator: auth,
    });
    return pendingTx;
  } catch (e: any) {
    console.error("Submission Failed. Details:", e);
    // Log the debug state again on failure for visibility
    console.error("Debug State on Failure:", JSON.stringify(debugState, null, 2));
    if (e.response) {
      console.error("Response Status:", e.response.status);
      console.error(
        "Response Text:",
        await e.response.text().catch(() => "Could not read text"),
      );
    }
    throw new Error(
      `Transaction Submission verification failed: ${e.message || e}`,
    );
  }
}

/**
 * Step 1: Request APT tokens from faucet for gas
 */
export async function requestAPT(ethAddress: string) {
  const derived = await getDerivedAddress(ethAddress);
  const FAUCET_URL = "http://127.0.0.1:8081";

  console.log("Funding Gas (APT)...");
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
  // Mint FAKEETH (10 ETH)
  console.log("Minting FAKEETH...");
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
