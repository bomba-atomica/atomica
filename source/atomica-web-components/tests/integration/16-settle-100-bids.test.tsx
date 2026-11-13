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
 * The window is at both caps: 100 seller locks of the 0.01 FakeETH minimum
 * (1 FakeETH supply) and 100 bids of 0.02 FakeETH, so 50 win and 50 lose.
 * Settle loops over winners times seller locks and records an outcome for
 * every lock, so this is the most expensive settle a window allows; its
 * gas_used must stay below the chain's maximum gas per transaction.
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
  joinWindowAsSellers,
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
import { getGasLimits, submitNativeTransaction } from "@atomica/sdk";
import {
  setAptosInstance,
  sealBid,
  getBidPayload,
  getSettlePayload,
  getBidResults,
  getWindowLimits,
  getWindowLockIds,
} from "@atomica/sdk/aptos";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";
import { ethers } from "ethers";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";

/** The bid cap, MAX_BIDS_PER_WINDOW. */
const BID_COUNT = 100;
/** The seller lock cap, MAX_SELLER_LOCKS_PER_WINDOW. */
const SELLER_LOCK_COUNT = 100;
/** Each seller lock is the minimum seller lock, 0.01 FakeETH. */
const SELLER_LOCK = ethers.parseEther("0.01");
/** The lowest bid price (whole USD per whole FakeETH); each later bid adds PRICE_STEP. */
const BASE_PRICE = 1_000n;
const PRICE_STEP = 10n;
/** The window supply: every seller lock, 1 FakeETH. */
const SUPPLY = SELLER_LOCK * BigInt(SELLER_LOCK_COUNT);
/** Half the bids fill the supply. */
const BID_QUANTITY = SUPPLY / 50n;
/**
 * FakeUSD per bid, at or above the 10 FakeUSD minimum bid collateral. 100
 * locks must fit one 10,000 FakeUSD MAX_MINT_AMOUNT. A winner pays
 * BID_QUANTITY at the clearing price (USD per whole FakeETH,
 * `quoteForFill`): at most 0.02 * 1_990 = 39.8 FakeUSD.
 */
const COLLATERAL = 50n * 10n ** 6n;
// The launch pair: the only pair on the allowlist.
const PAIR_BCS = LAUNCH_PAIR_BCS;
/**
 * The window is created with at least this long left before its close, so
 * the 100 collaterals, the 99 joining seller locks and the 100 bids land in
 * it (seconds). A test window is 900 seconds.
 */
const MIN_WINDOW_LEFT_SECS = 840n;
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
      lockAmount: SELLER_LOCK,
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

    // The limits this test fills: both caps, at the minimum seller lock and
    // above the minimum collateral.
    const limits = await getWindowLimits();
    expect(limits.maxBidsPerWindow).toBe(BigInt(BID_COUNT));
    expect(limits.maxSellerLocksPerWindow).toBe(BigInt(SELLER_LOCK_COUNT));
    expect(limits.minSellerLockAmount).toBe(SELLER_LOCK);
    expect(COLLATERAL >= limits.minBidCollateral).toBe(true);

    await joinWindowAsSellers(
      fixture,
      aptosClient,
      operator,
      auction,
      SELLER_LOCK_COUNT - 1,
      SELLER_LOCK,
    );
    const { sellers } = await getWindowLockIds(auction.windowId, PAIR_BCS);
    expect(sellers).toHaveLength(SELLER_LOCK_COUNT);

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
    "opens and clears 100 bids in one call and logs gas_used",
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
    },
    (TEST_WINDOW_SECS + REVEAL_TIMEOUT_SECS + 300) * 1000,
  );

  it("a window with the maximum seller locks and 100 bids settles in one transaction and its gas used is below the maximum transaction gas", async () => {
    const { hash: settleHash } = await submitNativeTransaction(
      aptosClient,
      settlerEthAddress,
      getSettlePayload(auction.windowId, PAIR_BCS),
    );
    const settleTx = await logGas(aptosClient, "settle", settleHash);
    expect(settleTx.success).toBe(true);
    // One transaction settles both caps, below the chain's gas ceiling.
    const { maxGasAmount } = await getGasLimits(aptosClient);
    console.log(
      `[gas] settle at both caps (${SELLER_LOCK_COUNT} seller locks, ${BID_COUNT} bids): gas_used=${settleTx.gas_used} max_transaction_gas=${maxGasAmount}`,
    );
    expect(Number(settleTx.gas_used)).toBeLessThan(maxGasAmount);
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
  }, 300_000);

  it.todo(
    "SCOUT(#228) 100 bids are opened in batches by an account that is not the bidder, and the window settles",
  );
});
