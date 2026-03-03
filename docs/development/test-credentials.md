# Test Credentials

## Rules — read this first

There are exactly two ways to consume credentials, depending on context:

| Context | Source | Behaviour if missing |
|---------|--------|----------------------|
| **Tests** (`bun test`, Vitest, Forge tests, …) | `source/.env.test` via `source/shared/test-constants.ts` | Falls back to hardcoded defaults in `test-constants.ts` — tests always work without extra setup |
| **Operational scripts** (`bun run deploy`, `bun run demo`, …) | `source/.env.test` loaded via `bun --env-file=../.env.test` | **Must abort** with a clear error — never fall back to defaults |

### Do not duplicate credentials

- **Never** hardcode private keys, addresses, or mnemonics anywhere other than `source/.env.test` and its mirror `source/shared/test-constants.ts`.
- **Never** use raw key literals from the Ethereum testnet SDK (`getTestAccounts()`) or Aptos SDK inside a deploy or demo script.
- If an env var is required by an operational script, throw clearly if it's absent:
  ```ts
  const key = process.env.ETHEREUM_DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("ETHEREUM_DEPLOYER_PRIVATE_KEY is not set");
  ```

---

## How credentials are loaded

### Tests (Vitest / `bun test`)

`source/.env.test` is the committed, deterministic credential file. It is loaded automatically in two ways:

- **Vitest (browser + Node.js tests):** `vitest.config.ts` calls `loadEnv("test", "../", "")` which reads `source/.env.test` and injects all vars into the Vite server process. The `env:` key in vitest config forwards them to tests.
- **Non-Vite Node scripts and CI:** pass `--env-file=../.env.test` to bun, e.g.:
  ```bash
  bun --env-file=../.env.test run scripts/deploy.ts
  ```
  The CI workflow (`test-web.yaml`) loads `.env.test` the same way.

### `source/shared/test-constants.ts`

This file exports typed constants for every credential. It reads from `process.env` and falls back to the hardcoded defaults (which match `.env.test`). Use it in tests instead of `process.env` directly:

```ts
import { ETHEREUM_DEPLOYER_PRIVATE_KEY } from "../../shared/test-constants";
```

The fallback values ensure tests pass without `.env.test` present (e.g. in unit tests that don't need real keys).

---

## Variable reference

| Variable | Purpose |
|----------|---------|
| `APTOS_ROOT_ACCOUNT_ADDRESS` | Aptos Core Resources / faucet address |
| `APTOS_ROOT_ACCOUNT_PRIVATE_KEY` | Private key for the root/faucet account |
| `APTOS_ROOT_ACCOUNT_PUBLIC_KEY` | Public key for the root/faucet account |
| `APTOS_DEPLOYER_ADDRESS` | Atomica module deployer account address |
| `APTOS_DEPLOYER_PRIVATE_KEY` | Private key for the Atomica deployer |
| `APTOS_ATOMICA_CONTRACT_ADDRESS` | Address where the Atomica Move module is deployed (same as deployer) |
| `APTOS_VALIDATOR_N_SEED` | 64-char hex seed for validator N (0–6); all validator key material is derived from this at testnet startup |
| `ETHEREUM_DEPLOYER_ADDRESS` | First Ethereum testnet account (pre-funded by genesis) |
| `ETHEREUM_DEPLOYER_PRIVATE_KEY` | Private key for that Ethereum account |
| `ETHEREUM_DEPLOYER_MNEMONIC` | Mnemonic that derives all Ethereum test accounts |
| `ETHEREUM_ACCOUNT_0_ADDRESS` | Hardhat account 0 (used in wallet/integration tests) |
| `ETHEREUM_ACCOUNT_0_PRIVATE_KEY` | Private key for Hardhat account 0 |
| `VITE_CONTRACT_ADDRESS` | Injected into browser bundle as `import.meta.env.VITE_CONTRACT_ADDRESS` |
| `VITE_ETH_RPC_URL` | Ethereum RPC URL for the browser app |
| `VITE_FAKE_ETH_ADDRESS` | Deployed FakeETH contract address (zero in `.env.test`; set by deploy scripts to `.env.local`) |
| `VITE_FAKE_USD_ADDRESS` | Deployed FakeUSD contract address |
| `VITE_LOCK_BOX_ADDRESS` | Deployed LockBox contract address |

### Aptos validator seeds

Aptos validator keys are **not stored directly** — only seeds are stored. The Aptos testnet genesis script derives all key material (account keys, consensus keys, network keys) from the seed at startup using:

```bash
aptos genesis generate-keys --random-seed $SEED --output-dir /path/to/validator-N
```

Seeds 0–6 are pre-generated to cover up to 7 validators. This means:
- The same seed always produces the same keys — deterministic across machines and CI
- Only the seeds need to be in version control, not the derived key files
- `APTOS_VALIDATOR_N_ACCOUNT_PRIVATE_KEY` etc. are **no longer stored** in `.env.test`

---

## Ethereum account origin

The Ethereum deployer and test accounts come from the Ethereum Docker testnet's genesis mnemonic:

```
giant issue aisle success illegal bike spike question tent bar rely arctic volcano long crawl hungry vocal artwork sniff fantasy very lucky have athlete
```

Account 0 (index 0) from this mnemonic is `0x8943545177…` and is pre-funded in genesis. The `getTestAccounts()` method on `EthereumDockerTestnet` returns these same accounts — but only use it in test utilities, never in scripts.

---

## Regenerating credentials

### Regenerate everything

```bash
cd source
./scripts/generate-test-credentials.sh
```

This rewrites `source/.env.test` with a fresh set of deterministic keys and seeds. Commit the result to lock in the new credentials.

After regenerating:
1. Restart any running testnets so they pick up the new genesis keys.
2. Update `source/shared/test-constants.ts` fallback values to match (so tests still pass without `.env.test`).

### Regenerate only Aptos validator keys

Validator keys are re-derived automatically at testnet startup from the seeds in `.env.test`. There is nothing to regenerate manually — just change the seeds if you want different keys.

### Ethereum keys

The Ethereum testnet accounts are fixed by the genesis mnemonic in `.env.test`. To use different accounts, change `ETHEREUM_DEPLOYER_MNEMONIC` and `ETHEREUM_DEPLOYER_ADDRESS`/`ETHEREUM_DEPLOYER_PRIVATE_KEY` to match account 0 of the new mnemonic.

---

## `.env.local` — deployed contract addresses

After running `bun run deploy`, the deploy script writes the live contract addresses to `source/atomica-web/.env.local`:

```
VITE_FAKE_ETH_ADDRESS=0x...
VITE_FAKE_USD_ADDRESS=0x...
VITE_LOCK_BOX_ADDRESS=0x...
```

This file is gitignored and overrides the zero-address placeholders in `.env.test`. The Vite dev server and vitest pick it up automatically via Vite's env merging.
