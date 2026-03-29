import { Serializer, AccountAuthenticator, AccountAddress } from "@aptos-labs/ts-sdk";
export declare function constructSIWEMessage(domain: string, address: string, statement: string, uri: string, version: string, chainId: number, nonce: string, issuedAt: string): string;
/**
 * Derives the Atomica (Aptos) address for a given Ethereum address
 * using the `ethereum_derivable_account` scheme.
 */
export declare function getDerivedAddress(ethAddress: string, domain?: string): Promise<AccountAddress>;
/**
 * Calculates the digest expected by the Move module.
 * sha3( "APTOS::AASigningData" ++ BCS(AASigningData { original_signing_message, function_info }) )
 */
export declare function calculateAbstractDigest(signingMessage: Uint8Array): Uint8Array;
/**
 * Serializes a SIWE (Sign-In With Ethereum) abstract signature.
 * Structure: SIWEAbstractSignature::MessageV2 variant with scheme, issuedAt, and signature.
 */
export declare function serializeSIWEAbstractSignature(scheme: string, issuedAt: string, signature: Uint8Array): Uint8Array;
/**
 * Serializes a SIWE abstract public key.
 * Structure: Contains ethereum address bytes and domain.
 */
export declare function serializeSIWEAbstractPublicKey(ethAddressBytes: Uint8Array, domain: string): Uint8Array;
/**
 * SIWE Account Authenticator using SDK's proper enums and structure.
 * This replaces our hand-crafted serialization with the official SDK approach.
 */
export declare class SIWEAccountAuthenticator extends AccountAuthenticator {
    private readonly digest;
    private readonly abstractSignature;
    private readonly accountIdentity;
    constructor(digest: Uint8Array, abstractSignature: Uint8Array, accountIdentity: Uint8Array);
    serialize(serializer: Serializer): void;
}
