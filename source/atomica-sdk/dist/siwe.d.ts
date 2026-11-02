import { Serializer, AccountAuthenticator, AccountAddress } from "@aptos-labs/ts-sdk";
/**
 * Construct a SIWE (Sign-In with Ethereum) message string.
 *
 * The resulting string must be signed by the Ethereum wallet and the signature
 * submitted as part of the Aptos abstract-account authenticator.
 *
 * @param domain - The requesting domain (e.g. `"localhost:3000"`)
 * @param address - Lowercase Ethereum hex address of the signer
 * @param statement - Human-readable statement; MUST include trailing period to match Move format
 * @param uri - Origin URI of the requesting application
 * @param version - SIWE version string (currently `"1"`)
 * @param chainId - Aptos chain ID from `getLedgerInfo().chain_id`
 * @param nonce - Hex-encoded SHA-3 digest of the Aptos signing message
 * @param issuedAt - ISO-8601 timestamp
 * @returns Formatted SIWE message ready for `wallet.signMessage()`
 * @see docs/architecture/v0-architecture.md#§1-package-layout
 */
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
