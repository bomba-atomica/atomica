import { Aptos, AptosConfig, Network, Account, AccountAddress, Serializer } from '@aptos-labs/ts-sdk';
import { ethers } from 'ethers';

const NODE_URL = "http://127.0.0.1:8080";
const FAUCET_URL = "http://127.0.0.1:8081";

// Contract Address (Assume deployed at 0x1 or specifically 'atomica')
// For now, let's assume it's under the account we deploy to.
// Placeholder: "0xaddr"
export const CONTRACT_ADDR = "0x1"; // Update this after deployment!

const config = new AptosConfig({ network: Network.LOCAL, fullnode: NODE_URL });
export const aptos = new Aptos(config);

let relayer: Account | null = null;

// Prefixes matches Move
const PREFIX_FAUCET = 1;
const PREFIX_CREATE_AUCTION = 2;
const PREFIX_BID = 3;

export async function getRelayer(): Promise<Account> {
    if (relayer) return relayer;
    relayer = Account.generate();
    console.log("Relayer Address:", relayer.accountAddress.toString());
    try {
        await fetch(`${FAUCET_URL}/mint?amount=100000000&address=${relayer.accountAddress.toString()}`, { method: 'POST' });
    } catch (e) {
        console.error("Failed to fund relayer.", e);
    }
    return relayer;
}

export async function getNonce(ethAddress: string): Promise<number> {
    // Hex string to bytes
    const ethAddressBytes = ethers.getBytes(ethAddress);

    // View function: atomica::registry::get_nonce
    // Arg: vector<u8> (eth_address)
    try {
        const result = await aptos.view({
            payload: {
                function: `${CONTRACT_ADDR}::registry::get_nonce`,
                functionArguments: [ethAddressBytes], // SDK handles generic vector<u8>? Or HexString?
                // SDK usually expects hex string for vector<u8> if it's input arguments?
                // Let's pass HexInput.
            }
        });
        // Result is [nonce]
        return Number(result[0]);
    } catch (e) {
        console.error("Failed to fetch nonce", e);
        return 0;
    }
}

// Computes the inner digest for Faucet action matching Move
export function computeFaucetDigest(nonce: number): Uint8Array {
    const serializer = new Serializer();
    serializer.serializeU8(PREFIX_FAUCET);
    serializer.serializeU64(BigInt(nonce));
    const bytes = serializer.toUint8Array();

    // Keccak256
    const hash = ethers.keccak256(bytes);
    return ethers.getBytes(hash);
}

export async function submitRemoteFaucet(
    ethAddress: string,
    signature: string,
    nonce: number
) {
    const relayerAccount = await getRelayer();
    const ethAddressBytes = ethers.getBytes(ethAddress);
    const signatureBytes = ethers.getBytes(signature); // 65 bytes

    const transaction = await aptos.transaction.build.simple({
        sender: relayerAccount.accountAddress,
        data: {
            function: `${CONTRACT_ADDR}::remote_actions::remote_faucet`,
            functionArguments: [
                ethAddressBytes, // vector<u8>
                signatureBytes,  // vector<u8>
                nonce
            ]
        }
    });

    const pendingTx = await aptos.signAndSubmitTransaction({
        signer: relayerAccount,
        transaction
    });

    return pendingTx;
}

// Compute Digest for Create Auction (Prefix | Nonce | Params...)
export function computeCreateAuctionDigest(
    nonce: number,
    amountEth: bigint,
    minPrice: bigint,
    duration: bigint,
    mpk: Uint8Array
): Uint8Array {
    const serializer = new Serializer();
    serializer.serializeU8(PREFIX_CREATE_AUCTION);
    serializer.serializeU64(BigInt(nonce));
    serializer.serializeU64(amountEth);
    serializer.serializeU64(minPrice);
    serializer.serializeU64(duration);
    serializer.serializeFixedBytes(mpk); // Raw bytes, matching Move's vector::append

    // Note: Move `mpk_bytes` is raw bytes.

    const bytes = serializer.toUint8Array();
    const hash = ethers.keccak256(bytes);
    return ethers.getBytes(hash);
}

export async function submitRemoteCreateAuction(
    ethAddress: string,
    signature: string,
    nonce: number,
    amountEth: bigint,
    minPrice: bigint,
    duration: bigint,
    mpk: Uint8Array
) {
    const relayerAccount = await getRelayer();
    const ethAddressBytes = ethers.getBytes(ethAddress);
    const signatureBytes = ethers.getBytes(signature);

    const transaction = await aptos.transaction.build.simple({
        sender: relayerAccount.accountAddress,
        data: {
            function: `${CONTRACT_ADDR}::remote_actions::remote_create_auction`,
            functionArguments: [
                ethAddressBytes,
                signatureBytes,
                nonce,
                amountEth,
                minPrice,
                duration,
                mpk // SDK handles Uint8Array as vector<u8>
            ]
        }
    });

    return await aptos.signAndSubmitTransaction({
        signer: relayerAccount,
        transaction
    });
}

// Compute Digest for Bid (Prefix | Nonce | Seller | Amount | U | V)
export function computeBidDigest(
    nonce: number,
    sellerAddr: string, // "0x..."
    amountUsd: bigint,
    u: Uint8Array,
    v: Uint8Array
): Uint8Array {
    const serializer = new Serializer();
    serializer.serializeU8(PREFIX_BID);
    serializer.serializeU64(BigInt(nonce));

    // Seller Addr: Move uses `bcs::to_bytes(&address)`.
    // BCS address is 32 bytes without length prefix?
    // Aptos SDK AccountAddress toBytes() matches BCS?
    // Let's use AccountAddress.fromString(sellerAddr).bcsToBytes()
    // Or serializer.serializeFixedBytes(AccountAddress...)

    const sellerAddress = AccountAddress.fromString(sellerAddr);
    // serializeFixedBytes expects Uint8Array? 
    // AccountAddress struct has `data`.
    serializer.serializeFixedBytes(sellerAddress.data);

    serializer.serializeU64(amountUsd);
    serializer.serializeFixedBytes(u); // Raw append
    serializer.serializeFixedBytes(v); // Raw append

    const bytes = serializer.toUint8Array();
    const hash = ethers.keccak256(bytes);
    return ethers.getBytes(hash);
}

export async function submitRemoteBid(
    ethAddress: string,
    signature: string,
    nonce: number,
    sellerAddr: string,
    amountUsd: bigint,
    u: Uint8Array,
    v: Uint8Array
) {
    const relayerAccount = await getRelayer();
    const ethAddressBytes = ethers.getBytes(ethAddress);
    const signatureBytes = ethers.getBytes(signature);

    const transaction = await aptos.transaction.build.simple({
        sender: relayerAccount.accountAddress,
        data: {
            function: `${CONTRACT_ADDR}::remote_actions::remote_bid`,
            functionArguments: [
                ethAddressBytes,
                signatureBytes,
                nonce,
                sellerAddr,
                amountUsd,
                u,
                v
            ]
        }
    });

    return await aptos.signAndSubmitTransaction({
        signer: relayerAccount,
        transaction
    });
}
