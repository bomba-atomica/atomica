/**
 * Node-side signing as an Ethereum-derivable Aptos account.
 *
 * A lock receipt belongs to the depositor's Ethereum-derivable account, so
 * `auction::create_auction` and `auction::submit_bid` must be signed by it
 * (SIWE). The SDK path (`prepareNativeTransaction` in
 * source/atomica-sdk/src/transaction.ts) needs `window.ethereum` and
 * `window.location`, which a Node test does not have. This module signs the
 * same SIWE message with an ethers wallet instead. The browser tests use
 * `submitAsEthAccount` in
 * source/atomica-web-components/tests/integration/helpers/auction-setup.ts.
 */
import {
    generateSigningMessageForTransaction,
    type Aptos,
    type InputGenerateTransactionPayloadData,
} from "@aptos-labs/ts-sdk";
import { ethers } from "ethers";
import {
    calculateAbstractDigest,
    constructSIWEMessage,
    getDerivedAddress,
    serializeSIWEAbstractPublicKey,
    serializeSIWEAbstractSignature,
    simulateMaxGasAmount,
    SIWEAccountAuthenticator,
} from "@atomica/sdk";

/** URI scheme of the SIWE message. The testnet pages are served over http. */
const SIWE_SCHEME = "http";

/** Network name the Move authenticator puts in the SIWE statement. */
function networkName(chainId: number): string {
    if (chainId === 1) return "mainnet";
    if (chainId === 2) return "testnet";
    if (chainId === 4) return "local";
    return `custom network: ${chainId}`;
}

/**
 * The Aptos address of the Ethereum-derivable account of `ethPrivateKey` for
 * `siweDomain`: the owner of its lock receipts.
 */
export async function ethAccountAddress(
    ethPrivateKey: string,
    siweDomain: string,
): Promise<string> {
    const ethAddress = new ethers.Wallet(ethPrivateKey).address.toLowerCase();
    return (await getDerivedAddress(ethAddress, siweDomain)).toString();
}

/**
 * SIWE-sign `data` with `ethPrivateKey` for the SIWE domain pinned in
 * `eth_proof::initialize`, submit it as the key's Ethereum-derivable account,
 * and return the Aptos transaction hash. Throws if the transaction aborts.
 *
 * The account pays its own gas: fund it first.
 */
export async function submitAsEthAccount(
    aptos: Aptos,
    ethPrivateKey: string,
    siweDomain: string,
    data: InputGenerateTransactionPayloadData,
): Promise<string> {
    const wallet = new ethers.Wallet(ethPrivateKey);
    const ethAddress = wallet.address.toLowerCase();
    const sender = await getDerivedAddress(ethAddress, siweDomain);

    // The signature covers maxGasAmount, so simulate before signing.
    const maxGasAmount = await simulateMaxGasAmount(aptos, sender, data);
    const transaction = await aptos.transaction.build.simple({
        sender,
        data,
        options: {
            expireTimestamp: Math.floor(Date.now() / 1000) + 300,
            ...(maxGasAmount !== undefined && { maxGasAmount }),
        },
    });

    // Signing message: sha3("APTOS::RawTransaction") || BCS(raw transaction).
    const digest = calculateAbstractDigest(generateSigningMessageForTransaction(transaction));

    const { chain_id: chainId } = await aptos.getLedgerInfo();
    const entryFunction = (data as { function?: string }).function;
    if (!entryFunction) throw new Error("payload has no entry function");
    const issuedAt = new Date().toISOString();
    const statement = `Please confirm you explicitly initiated this request from ${siweDomain}. You are approving to execute transaction ${entryFunction} on Aptos blockchain (${networkName(chainId)}).`;
    const message = constructSIWEMessage(
        siweDomain,
        ethAddress,
        statement,
        `${SIWE_SCHEME}://${siweDomain}`,
        "1",
        chainId,
        ethers.hexlify(digest),
        issuedAt,
    );
    const signature = ethers.getBytes(await wallet.signMessage(message));

    const auth = new SIWEAccountAuthenticator(
        digest,
        serializeSIWEAbstractSignature(SIWE_SCHEME, issuedAt, signature),
        serializeSIWEAbstractPublicKey(new TextEncoder().encode(ethAddress), siweDomain),
    );
    const pending = await aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator: auth,
    });
    await aptos.waitForTransaction({
        transactionHash: pending.hash,
        options: { checkSuccess: true },
    });
    return pending.hash;
}
