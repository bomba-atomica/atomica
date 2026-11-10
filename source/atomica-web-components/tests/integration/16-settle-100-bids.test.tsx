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
 * The operator's direct calls use the same simulated limit.
 *
 * 100 bids of 0.1 FakeETH compete for 5 FakeETH, so 50 win and 50 lose.
 * The `@atomica` operator bids and relays openings (Demo-phase claim rule).
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
  submitManyDirect,
  waitForReveal,
  openWindowBidsDirect,
  getAuctionState,
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

const BID_COUNT = 100;
const MIN_PRICE = 1_000_000n;
const PRICE_STEP = 10_000n;
const SUPPLY = ethers.parseEther("5");
const BID_QUANTITY = ethers.parseEther("0.1");
/** FakeUSD per bid. 100 locks must fit one 10,000 FakeUSD MAX_MINT_AMOUNT. */
const COLLATERAL = 50n * 10n ** 6n;
const PAIR_BCS = new TextEncoder().encode("16-settle-100-bids");
const DEADLINE_AHEAD_US = 300_000_000n;
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

    const collateral = await lockBidCollaterals(
      fixture,
      aptosClient,
      operator,
      BID_COUNT,
      COLLATERAL,
    );
    expect(new Set(collateral).size).toBe(BID_COUNT);

    auction = await createLiveWindow(fixture, aptosClient, operator, {
      pairBcs: PAIR_BCS,
      minPrice: MIN_PRICE,
      deadlineAheadUs: DEADLINE_AHEAD_US,
      lockAmount: SUPPLY,
    });

    const payloads = [];
    for (let i = 0; i < BID_COUNT; i++) {
      const price = MIN_PRICE + PRICE_STEP * BigInt(i);
      prices.push(price);
      const sealed = await sealBid(
        auction.windowId,
        PAIR_BCS,
        operator.accountAddress.toString(),
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
    await submitManyDirect(aptosClient, operator, payloads);

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

  it(
    "opens and clears 100 bids in one call, settles them and logs gas_used",
    async () => {
      await waitForReveal(
        auction.timelockId,
        Number(DEADLINE_AHEAD_US / 1_000_000n) + REVEAL_TIMEOUT_SECS,
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
      const openTxResponse = await logGas(
        aptosClient,
        "submit_cleartext_and_clear",
        openTx.hash,
      );
      expect(openTxResponse.success).toBe(true);

      // The opening call cleared the window: bid results exist before settle.
      const cleared = await getAuctionState(aptosClient, moduleAddr, auction);
      expect(cleared.settled).toBe(false);
      expect(cleared.clearingPrice).toBeGreaterThan(0n);
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
      const winners = results.filter((r) => r.isWinner);
      expect(winners).toHaveLength(BID_COUNT / 2);
      expect(winners.reduce((sum, r) => sum + r.fillAmount, 0n)).toBe(SUPPLY);
    },
    (Number(DEADLINE_AHEAD_US / 1_000_000n) + REVEAL_TIMEOUT_SECS + 300) * 1000,
  );
});
