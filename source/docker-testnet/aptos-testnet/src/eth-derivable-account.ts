/**
 * Node-side signing as an Ethereum-derivable Aptos account.
 *
 * A lock receipt belongs to the depositor's Ethereum-derivable account, so
 * `auction::create_auction` and `auction::submit_bid` must be signed by it
 * (SIWE). The SDK path (`prepareNativeTransaction` in
 * source/atomica-sdk/src/transaction.ts) needs `window.ethereum` and
 * `window.location`, which a Node test does not have. The browser tests use
 * `submitAsEthAccount` in
 * source/atomica-web-components/tests/integration/helpers/auction-setup.ts.
 */
import type { Aptos, InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";

// SCOUT(#219) ADD: whole file, a stub; nothing imports it yet. The issue text names no signer for the node-side test, but its seller and bidders cannot call create_auction or submit_bid without one.

/**
 * SIWE-sign `data` with `ethPrivateKey` for the SIWE domain pinned in
 * `eth_proof::initialize`, submit it as the key's Ethereum-derivable account,
 * and return the Aptos transaction hash. Throws if the transaction aborts.
 */
export async function submitAsEthAccount(
    _aptos: Aptos,
    _ethPrivateKey: string,
    _siweDomain: string,
    _data: InputGenerateTransactionPayloadData,
): Promise<string> {
    throw new Error("NOT_IMPLEMENTED: SCOUT(#219) submitAsEthAccount");
}
