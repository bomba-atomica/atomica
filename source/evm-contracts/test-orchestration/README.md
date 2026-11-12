# EVM Contracts Test Orchestration

Test orchestration for Atomica EVM contracts on the Ethereum Docker testnet.

## Quick Start

```bash
bun install

# Start the testnet, deploy, and run all tests
bun run start

# Run one test type
bun run test:unit         # test/unit/*.sol
bun run test:integration  # test/integration/*.sol
```

`src/aptos-light-client-live.ts` is a separate live check of the Aptos light client against an
Aptos Docker testnet. The "Aptos Light Client Live (docker)" CI job runs it.

## What the orchestrator does

1. Starts the Ethereum Docker testnet (`ETH_BACKEND` anvil or docker).
2. Deploys FakeETH, FakeUSD and LockBox with `script/DeployLockBox.s.sol`. This testnet has no
   Aptos light client, so LockBox gets a stand-in client address.
3. Runs the Foundry unit and integration tests against the testnet RPC.
4. Tears the testnet down.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ETH_RPC_URL` | RPC endpoint | `http://localhost:8545` |
| `ETHEREUM_DEPLOYER_PRIVATE_KEY` | Deployer private key | shared test constant |
| `FOUNDRY_PROFILE` | Foundry profile | `test` |

## Cleanup

```bash
bun run test-orchestration/src/clean.ts
```
