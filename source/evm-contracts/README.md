# evm-contracts

Status: `live` (proof-gated LockBox, Aptos light client and test tokens)

## Overview

Ethereum contracts for Atomica auctions. Funds sit in LockBox until a proven Aptos outcome pays
them out, or until their deadline sends them home. There is no relayer, admin or upgrade key
(`docs/decisions/trustless-v0-1-unwinding.md`).

## Contracts

| Contract | Purpose |
|----------|---------|
| `src/escrow/LockBox.sol` | Escrow. `lock`, then `releaseByOutcome` (a proven Aptos `AuctionOutcome`) or `reclaim` after the deadline. Anyone may call either. |
| `src/escrow/OutcomeTree.sol` | The Merkle tree an `AuctionOutcome` commits to |
| `src/aptos/AptosLightClient.sol` | Verifies Aptos events against the validator quorum, from the genesis waypoint. Goes stale for good `maxEpochAge` seconds after its latest epoch change. |
| `src/tokens/FakeETH.sol`, `src/tokens/FakeUSD.sol` | Test tokens |

## Deploy

1. `script/DeployAptosLightClient.s.sol` with `EXPECTED_GENESIS_WAYPOINT` (the genesis waypoint you
   trust) and optionally `MAX_EPOCH_AGE` (default half the Aptos stake lockup).
2. `script/DeployLockBox.s.sol` with `LIGHT_CLIENT` from step 1. A new light client needs a new
   LockBox, because LockBox takes the client address in its constructor.

## Build and test

```bash
forge install
forge build
forge test
```

The EVM Contract Tests (forge) CI job runs the light client and LockBox suites.

## Notes

- Contracts are not upgradeable (no proxy patterns).
- The light client uses the EIP-2537 BLS12-381 precompiles (Prague).

## Security

This is research and development code. It needs an audit before production.
