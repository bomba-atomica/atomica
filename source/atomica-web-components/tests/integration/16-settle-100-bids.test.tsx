/**
 * 16-settle-100-bids.test.tsx
 *
 * Live gas test: one window filled to MAX_BIDS_PER_WINDOW = 100 sealed bids
 * is opened and settled on the dual-chain testnet, and the gas_used of each
 * step is logged. Opening the last bid finalizes the reveal and clears the
 * window in the same `submit_cleartext_and_clear` transaction, so its gas
 * includes the clearing and `settle` needs no separate clearing call.
 *
 * Gas feature version 53 charges 10x the gas of the old schedule, and the
 * ts-sdk default maxGasAmount stays at 200,000 units. The settle goes through
 * the SDK's SIWE path (`submitNativeTransaction`), which simulates first and
 * signs with the simulated gas plus a margin, capped at the chain maximum.
 * Every bid and the operator's direct calls use the same simulated limit.
 *
 * 100 bids of 0.1 FakeETH compete for 5 FakeETH, so 50 win and 50 lose.
 * The bidder's Ethereum-derivable account places every bid (SIWE): only it
 * can claim the bidder's collateral receipts. The operator (no special
 * rights) relays openings.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { commands } from "vitest/browser";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import {
  createLiveWindow,
  lockBidCollaterals,
  submitAsEthAccount,
  ethAccountAddress,
  waitForReveal,
  openWindowBidsDirect,
  getAuctionState,
  TEST_WINDOW_SECS,
  type LiveWindow,
} from "./helpers/auction-setup";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
  type UserTransactionResponse,
} from "@aptos-labs/ts-sdk";
import { submitNativeTransaction } from "@atomica/sdk";
import {
  setAptosInstance,
  sealBid,
  getBidPayload,
  getSettlePayload,
  getBidResults,
} from "@atomica/sdk/aptos";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";
import { ethers } from "ethers";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";

// SCOUT(#218) EDIT: fill the same window to the seller cap as well (proposed 100 seller locks).
const BID_COUNT = 100;
// SCOUT(#217) EDIT: price ladder in whole USD (for example 1000 plus 10 per bid).
/** The lowest bid price; each later bid adds PRICE_STEP. */
const BASE_PRICE = 1_000_000n;
const PRICE_STEP = 10_000n;
const BID_QUANTITY = ethers.parseEther("0.00002");
/** Half the bids fill the supply. */
const SUPPLY = BID_QUANTITY * 50n;
/**
 * FakeUSD per bid. 100 locks must fit one 10,000 FakeUSD MAX_MINT_AMOUNT. A
 * winner pays BID_QUANTITY at the clearing price (USD per whole FakeETH,
 * `quoteForFill`): at most 0.00002 * 1_990_000 = 39.8 FakeUSD.
 */
const COLLATERAL = 50n * 10n ** 6n;
// SCOUT(#218) EDIT: COLLATERAL above (50 FakeUSD per bid) must stay at or above the minimum collateral.
// The launch pair: the only pair on the allowlist.
const PAIR_BCS = LAUNCH_PAIR_BCS;
/**
 * The window is created with at least this long left before its close, so
 * the 100 collaterals and the 100 bids land in it (seconds).
 */
const MIN_WINDOW_LEFT_SECS = 600n;
/** Seconds to wait after the deadline for the validators to reveal the key. */
const REVEAL_TIMEOUT_SECS = 300;
/** The ts-sdk default maxGasAmount, used when nothing sets one. */
const TS_SDK_DEFAULT_MAX_GAS = 200_000;

/** Read the committed `step` transaction, check its entry function, and log its gas. */
async function logGas(
  aptosClient: Aptos,
  step: string,
  hash: string,
): Promise<UserTransactionResponse> {
  const tx = (await aptosClient.getTransactionByHash({
    transactionHash: hash,
  })) as UserTransactionResponse;
  expect((tx.payload as { function: string }).function).toMatch(
    new RegExp(`::auction::${step}$`),
  );
  console.log(
    `[gas] ${step} (${BID_COUNT} bids): gas_used=${tx.gas_used} max_gas_amount=${tx.max_gas_amount} success=${tx.success}`,
  );
  return tx;
}

describe.sequential("16: Settle a 100-bid window", () => {
  let fixture: IntegrationFixture;
  let aptosClient: Aptos;
  let moduleAddr: string;
  let operator: Account;
  let settlerEthAddress: string;
  let auction: LiveWindow;
  const prices: bigint[] = [];

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();
    moduleAddr = fixture.aptos.moduleAddress;

    aptosClient = new Aptos(
      new AptosConfig({
        network: Network.LOCAL,
        fullnode: fixture.aptos.nodeUrl,
      }),
    );
    setAptosInstance(aptosClient);

    operator = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(fixture.aptos.deployerPrivateKey),
    });

    // The settle signs with SIWE: fund the seller's derived Aptos address.
    settlerEthAddress = await setupWalletMock({
      privateKey: fixture.eth.seller.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });
    const settlerAptosAddress = await getDerivedAddress(
      settlerEthAddress.toLowerCase(),
    );
    await commands.fundAccount(settlerAptosAddress.toString(), 500_000_000);

    // The window first: the collaterals lock into the window open then.
    auction = await createLiveWindow(fixture, aptosClient, operator, {
      pairBcs: PAIR_BCS,
      minWindowLeftSecs: MIN_WINDOW_LEFT_SECS,
      // SCOUT(#218) EDIT: pull request 213 sets SUPPLY to 0.001 FakeETH (50 x 0.00002), below the proposed 0.01 FakeETH minimum seller lock, so create_auction aborts.
      lockAmount: SUPPLY,
    });

    const bidderAptosAddress = await ethAccountAddress(fixture.eth.bidder);
    const collateral = await lockBidCollaterals(
      fixture,
      aptosClient,
      operator,
      PAIR_BCS,
      BID_COUNT,
      COLLATERAL,
    );
    expect(new Set(collateral).size).toBe(BID_COUNT);

    const payloads = [];
    for (let i = 0; i < BID_COUNT; i++) {
      // SCOUT(#217) EDIT: price ladder; PRICE_STEP and its base move to whole USD.
      const price = BASE_PRICE + PRICE_STEP * BigInt(i);
      prices.push(price);
      // SCOUT(#228) EDIT: five-argument getBidPayload with no commitment.
      const sealed = await sealBid(
        auction.windowId,
        PAIR_BCS,
        bidderAptosAddress,
        price,
      );
      payloads.push(
        getBidPayload(
          auction.windowId,
          PAIR_BCS,
          sealed.ciphertext,
          sealed.commitment,
          ethers.getBytes(collateral[i]),
          BID_QUANTITY,
        ),
      );
    }
    for (const payload of payloads) {
      await submitAsEthAccount(aptosClient, fixture.eth.bidder, payload);
    }

    const state = await getAuctionState(aptosClient, moduleAddr, auction);
    expect(state).toEqual({
      totalSupply: SUPPLY,
      bidCount: BigInt(BID_COUNT),
      settled: false,
      clearingPrice: 0n,
    });
  }, 2_400_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  // SCOUT(#228) EDIT: open the 100 bids in batches with open_bids and log the gas of each batch.
  it(
    "opens and clears 100 bids in one call, settles them and logs gas_used",
    async () => {
      await waitForReveal(
        auction.timelockId,
        TEST_WINDOW_SECS + REVEAL_TIMEOUT_SECS,
      );

      // The opening is the operator's next transaction: find it by sequence number.
      const { sequence_number: openSequence } =
        await aptosClient.getAccountInfo({
          accountAddress: operator.accountAddress,
        });
      const opened = await openWindowBidsDirect(aptosClient, operator, auction);
      expect(opened.map((b) => b.price)).toEqual(prices);
      const [openTx] = await aptosClient.getAccountTransactions({
        accountAddress: operator.accountAddress,
        options: { offset: Number(openSequence), limit: 1 },
      });
      // SCOUT(#228) EDIT: the entry function name that logGas checks becomes open_bids.
      const openTxResponse = await logGas(
        aptosClient,
        "submit_cleartext_and_clear",
        openTx.hash,
      );
      expect(openTxResponse.success).toBe(true);

      // The opening call cleared the window: bid results exist before settle.
      const cleared = await getAuctionState(aptosClient, moduleAddr, auction);
      expect(cleared.settled).toBe(false);
      // Every bid is valid, so the 50 highest win and the lowest of them,
      // bid 50 of the ladder, sets the clearing price.
      expect(cleared.clearingPrice).toBe(BASE_PRICE + PRICE_STEP * 50n);
      expect(await getBidResults(auction.windowId, PAIR_BCS)).toHaveLength(
        BID_COUNT,
      );

      const { hash: settleHash } = await submitNativeTransaction(
        aptosClient,
        settlerEthAddress,
        getSettlePayload(auction.windowId, PAIR_BCS),
      );
      const settleTx = await logGas(aptosClient, "settle", settleHash);
      expect(settleTx.success).toBe(true);
      // The SDK set the limit from the simulation, not the ts-sdk default.
      expect(Number(settleTx.max_gas_amount)).not.toBe(TS_SDK_DEFAULT_MAX_GAS);
      expect(Number(settleTx.max_gas_amount)).toBeGreaterThan(
        Number(settleTx.gas_used),
      );

      const state = await getAuctionState(aptosClient, moduleAddr, auction);
      expect(state.settled).toBe(true);
      expect(state.bidCount).toBe(BigInt(BID_COUNT));
      const results = await getBidResults(auction.windowId, PAIR_BCS);
      expect(results).toHaveLength(BID_COUNT);
      // 50 winners only if every bid is valid: each holds COLLATERAL, above
      // its quote at its own price.
      const winners = results.filter((r) => r.isWinner);
      expect(winners).toHaveLength(BID_COUNT / 2);
      expect(winners.reduce((sum, r) => sum + r.fillAmount, 0n)).toBe(SUPPLY);
    },
    (TEST_WINDOW_SECS + REVEAL_TIMEOUT_SECS + 300) * 1000,
  );

  it.todo("SCOUT(#218) a window with the maximum seller locks and 100 bids settles in one transaction and its gas used is below the maximum transaction gas");
  it.todo("SCOUT(#228) 100 bids are opened in batches by an account that is not the bidder, and the window settles");
});
