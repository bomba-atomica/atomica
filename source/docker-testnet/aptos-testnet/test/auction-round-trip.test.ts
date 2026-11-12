import { describe, it } from "vitest";

/**
 * Live cross-chain round trip: lock, auction, outcome, release (issue 219).
 *
 * Planned flow, on the live dual-chain testnet (../src/dual-chain-testnet):
 * a seller locks FakeETH and two bidders lock FakeUSD in LockBox, bound to one
 * window and the launch pair. Each lock is proven on Aptos. The seller creates
 * the auction, both bidders bid, the timelock key is released, the bids are
 * opened and `auction::settle` emits one `AuctionOutcome`. A carrier account
 * proves that event to LockBox (`recordOutcome`) and releases all three locks
 * (`releaseByOutcome`).
 */

// SCOUT(#219) TEST: whole file, todo cases only. It needs the outcome records of pull request 213, a real AptosLightClient in setupDualChainTestnet, ../src/outcome-carrier and ../src/eth-derivable-account.
describe("Live cross-chain round trip: lock, auction, outcome, release", () => {
    it.todo(
        "SCOUT(#219) LockBox.outcomes(auctionKey) holds the root and leaf count of the AuctionOutcome event that auction::settle emitted",
    );
    it.todo(
        "SCOUT(#219) releaseByOutcome with one payout amount changed reverts, before the valid release of that lock",
    );
    it.todo(
        "SCOUT(#219) the seller's FakeUSD balance rises by clearing price times filled quantity, and unsold FakeETH returns",
    );
    it.todo(
        "SCOUT(#219) the winner's FakeETH balance rises by the filled quantity and its excess FakeUSD collateral returns",
    );
    it.todo("SCOUT(#219) the loser's FakeUSD balance equals its balance before the lock");
    it.todo(
        "SCOUT(#219) LockBox holds zero FakeETH and zero FakeUSD at the end, and statuses(lockId) is Released for all three locks",
    );
    it.todo(
        "SCOUT(#219) the account that calls recordOutcome and releaseByOutcome is neither a depositor nor the deployer of the Aptos package",
    );
});
