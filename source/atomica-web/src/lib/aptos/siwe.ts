import {
    Serializer,
    AccountAuthenticator,
    AccountAddress,
} from "@aptos-labs/ts-sdk";
import { sha3_256 } from "@noble/hashes/sha3";

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
    domain?: string,
): Promise<AccountAddress> {
    const serializer = new Serializer();
    // FunctionInfo { module_address, module_name, function_name }
    AccountAddress.from("0x1").serialize(serializer);
    serializer.serializeStr("ethereum_derivable_account");
    serializer.serializeStr("authenticate");
    const funcInfoBcs = serializer.toUint8Array();

    // FIXED: Move expects the UTF8 bytes of the Hex String (e.g. "0x123...")
    // not the raw bytes of the address.
    const ethBytes = new TextEncoder().encode(ethAddress);

    // Use provided domain or fallback to window.location.host (or localhost default)
    const actualDomain = domain || (typeof window !== 'undefined' ? window.location.host : "localhost:3000");

    const serializedPubKey = serializeSIWEAbstractPublicKey(ethBytes, actualDomain);

    // FIXED: Move's derive_account_address calls bcs::to_bytes(abstract_public_key).
    // abstract_public_key is passed as a vector<u8>.
    // bcs::to_bytes(&vector<u8>) adds a length prefix to the vector.
    // So we must serialize the public key bytes AS A VECTOR (with length prefix).
    const wrapperSerializer = new Serializer();
    wrapperSerializer.serializeBytes(serializedPubKey);
    const identityBcs = wrapperSerializer.toUint8Array();

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
export function calculateAbstractDigest(signingMessage: Uint8Array): Uint8Array {
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
export function serializeSIWEAbstractSignature(
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
export function serializeSIWEAbstractPublicKey(
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
export class SIWEAccountAuthenticator extends AccountAuthenticator {
    private readonly digest: Uint8Array;
    private readonly abstractSignature: Uint8Array;
    private readonly accountIdentity: Uint8Array;

    constructor(
        digest: Uint8Array,
        abstractSignature: Uint8Array,
        accountIdentity: Uint8Array,
    ) {
        super();
        this.digest = digest;
        this.abstractSignature = abstractSignature;
        this.accountIdentity = accountIdentity;
    }

    serialize(serializer: Serializer): void {
        // Atomica/Zapatos has a shifted enum for AccountAuthenticator:
        // 0: Ed25519, 1: MultiEd25519, 2: SingleKey, 3: MultiKey, 4: NoAccountAuthenticator, 5: Abstract
        // The SDK uses 4 for Abstraction. We must use 5.
        serializer.serializeU32AsUleb128(5);

        // FunctionInfo for ethereum_derivable_account::authenticate
        AccountAddress.from("0x1").serialize(serializer);
        serializer.serializeStr("ethereum_derivable_account");
        serializer.serializeStr("authenticate");

        // The Abstraction variant (index 5) in Zapatos contains `AbstractAuthenticationData` directly (no vector wrapper)
        // AbstractAuthenticator { function_info, auth_data: AbstractAuthenticationData }

        // AbstractAuthenticationDataVariant::DerivableV1 = 1
        serializer.serializeU32AsUleb128(1);

        // Digest
        serializer.serializeBytes(this.digest);

        // Abstract signature (already serialized SIWE structure)
        serializer.serializeBytes(this.abstractSignature);

        // Account identity (public key - already serialized)
        serializer.serializeBytes(this.accountIdentity);
    }
}
