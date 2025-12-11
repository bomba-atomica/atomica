import {
    Aptos,
    AptosConfig,
    Network,
    AccountAddress,
    Serializer,
    AccountAuthenticator
} from '@aptos-labs/ts-sdk';
import type { InputGenerateTransactionPayloadData } from '@aptos-labs/ts-sdk';
import { ethers } from 'ethers';
import { sha3_256 } from '@noble/hashes/sha3';

const NODE_URL = "http://127.0.0.1:8080/v1";
export const CONTRACT_ADDR = "0x1";

const config = new AptosConfig({ network: Network.LOCAL, fullnode: NODE_URL });
export const aptos = new Aptos(config);

function sha3(bytes: Uint8Array): Uint8Array {
    return sha3_256(bytes);
}

function constructSIWEMessage(
    domain: string,
    address: string,
    statement: string,
    uri: string,
    version: string,
    chainId: number,
    nonce: string,
    issuedAt: string
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
export async function getDerivedAddress(ethAddress: string): Promise<AccountAddress> {
    const serializer = new Serializer();
    // FunctionInfo { module_address, module_name, function_name }
    AccountAddress.from("0x1").serialize(serializer);
    serializer.serializeStr("ethereum_derivable_account");
    serializer.serializeStr("authenticate");
    const funcInfoBcs = serializer.toUint8Array();

    const identitySerializer = new Serializer();
    const ethBytes = ethers.getBytes(ethAddress);
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

class CustomAbstractAuthenticator extends AccountAuthenticator {
    constructor(
        public digest: Uint8Array,
        public signature: Uint8Array,
        public ethAddress: Uint8Array
    ) { super(); }

    serialize(serializer: Serializer): void {
        // Variant 4 (Abstract)
        serializer.serializeU32AsUleb128(4);

        // FunctionInfo
        AccountAddress.from("0x1").serialize(serializer);
        serializer.serializeStr("ethereum_derivable_account");
        serializer.serializeStr("authenticate");

        // AuthData
        // Variant 1 (DerivableV1)
        serializer.serializeU32AsUleb128(1);

        // digest (vector<u8>)
        serializer.serializeBytes(this.digest);

        // signature (vector<u8>)
        serializer.serializeBytes(this.signature);

        // public_key (vector<u8>) - SIWEAbstractPublicKey serialized
        const pkSerializer = new Serializer();
        pkSerializer.serializeBytes(this.ethAddress); // ethereum_address
        pkSerializer.serializeBytes(new TextEncoder().encode(window.location.host)); // domain
        const pkBcs = pkSerializer.toUint8Array();

        serializer.serializeBytes(pkBcs);
    }
}

export async function submitNativeTransaction(
    ethAddress: string,
    payload: InputGenerateTransactionPayloadData
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
    const originalSigningMessage = new Uint8Array(rawTxnSalt.length + rawTxnBcs.length);
    originalSigningMessage.set(rawTxnSalt);
    originalSigningMessage.set(rawTxnBcs, rawTxnSalt.length);

    // 3. Calculate Abstract Digest
    const digest = calculateAbstractDigest(originalSigningMessage);
    const digestHex = ethers.hexlify(digest);

    // 4. SIWE
    const ledgerInfo = await aptos.getLedgerInfo();
    const siwe = constructSIWEMessage(
        window.location.host,
        ethAddress,
        "Approve Atomica Transaction",
        window.location.origin,
        "1",
        ledgerInfo.chain_id,
        digestHex,
        new Date().toISOString()
    );

    // 5. Sign
    const signature = await signer.signMessage(siwe);

    // 6. Submit
    const signatureBytes = ethers.getBytes(signature);
    const ethBytes = ethers.getBytes(ethAddress);

    const auth = new CustomAbstractAuthenticator(digest, signatureBytes, ethBytes);

    try {
        const pendingTx = await aptos.transaction.submit.simple({
            transaction,
            senderAuthenticator: auth
        });
        return pendingTx;
    } catch (e: any) {
        console.error("Submission Failed. Details:", e);
        if (e.response) {
            console.error("Response Status:", e.response.status);
            console.error("Response Text:", await e.response.text().catch(() => "Could not read text"));
        }
        throw new Error(`Transaction Submission verification failed: ${e.message || e}`);
    }
}

export async function submitFaucet(ethAddress: string) {
    const derived = await getDerivedAddress(ethAddress);
    const FAUCET_URL = "http://127.0.0.1:8081";

    // 1. Native APT Faucet (for Gas)
    console.log("Funding Gas...");
    const res = await fetch(`${FAUCET_URL}/mint?amount=100000000&address=${derived.toString()}`, { method: 'POST' });
    if (!res.ok) throw new Error("Faucet API Failed");

    // Wait slightly for balance to reflect (local node is fast but async)
    await new Promise(r => setTimeout(r, 1000));

    // 2. Mint FAKEETH (10 ETH)
    console.log("Minting FAKEETH...");
    // 8 decimals from Move file
    const amountEth = BigInt(10) * BigInt(100_000_000);
    await submitNativeTransaction(ethAddress, {
        function: `${CONTRACT_ADDR}::FAKEETH::mint`,
        functionArguments: [amountEth]
    });

    // 3. Mint FAKEUSD (10,000 USD)
    console.log("Minting FAKEUSD...");
    const amountUsd = BigInt(10000) * BigInt(100_000_000);
    await submitNativeTransaction(ethAddress, {
        function: `${CONTRACT_ADDR}::FAKEUSD::mint`,
        functionArguments: [amountUsd]
    });

    return { hash: "gas-fakeeth-fakeusd-minted" };
}

export async function submitCreateAuction(
    ethAddress: string,
    amountEth: bigint,
    minPrice: bigint,
    duration: bigint,
    mpk: Uint8Array
) {
    return await submitNativeTransaction(ethAddress, {
        function: `${CONTRACT_ADDR}::auction::create_auction`,
        functionArguments: [amountEth, minPrice, duration, mpk]
    });
}

export async function submitBid(
    ethAddress: string,
    sellerAddr: string,
    amountUsd: bigint,
    u: Uint8Array,
    v: Uint8Array
) {
    return await submitNativeTransaction(ethAddress, {
        function: `${CONTRACT_ADDR}::auction::bid`,
        functionArguments: [
            sellerAddr,
            amountUsd,
            u,
            v
        ]
    });
}
