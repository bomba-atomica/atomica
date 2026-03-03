# Test Credentials

## Rules — read this first

There are exactly two ways to consume credentials, depending on context:

| Context | Source | Behaviour if missing |
|---------|--------|----------------------|
| **Tests** (`bun test`, Vitest, Forge tests, …) | `source/shared/test-constants.ts` | Falls back to hardcoded testnet defaults — tests always work without `.env` |
| **Operational scripts** (`bun run deploy`, `bun run demo`, …) | `.env` / `.env.local` environment variables | **Must abort** with a clear error — never fall back to defaults |

### Do not duplicate credentials

- **Never** hardcode private keys, addresses, or mnemonics in any file other than `source/shared/test-constants.ts`.
- **Never** use raw key literals from the Ethereum testnet SDK (`getTestAccounts()`) inside a deploy or demo script.
- **Never** copy the default values from `test-constants.ts` into a deploy/demo script as a fallback. If the env var is absent, throw:
  ```ts
  const key = process.env.ETH_DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("ETH_DEPLOYER_PRIVATE_KEY is not set");
  ```

---

## Canonical values

`/.env.example` is the reference list of variables. `/.env.local` (gitignored) should mirror those values locally.

| Variable | Purpose |
|----------|---------|
| `CORE_RESOURCES_ADDRESS` | Aptos faucet/Core Resources address (0x…A550C18) |
| `CORE_RESOURCES_PRIVATE_KEY` | Private key that controls minting/faucet behaviour |
| `APTOS_DEPLOYER_ADDRESS` | Atomica module (deployer) account (default: 0x44eb…) |
| `APTOS_DEPLOYER_PRIVATE_KEY` | Private key for the Atomica deployer |
| `ETH_DEPLOYER_ADDRESS` | First Ethereum testnet account (pre-funded) |
| `ETH_DEPLOYER_PRIVATE_KEY` | Private key for that Ethereum account |
| `ETH_DEPLOYER_MNEMONIC` | Mnemonic that derives the ETH accounts |
| `HARDHAT_ACCOUNT_0_ADDRESS` | First Hardhat account (wallet/integration tests) |
| `HARDHAT_ACCOUNT_0_PRIVATE_KEY` | Private key for Hardhat account 0 |

The hardcoded defaults for all of the above live **only** in `source/shared/test-constants.ts`. That file is the single source of truth for test key material.

---

## Regenerating key material

1. Run the generator script from the workspace root:
   ```bash
   cd source/docker-testnet/config
   ./generate-genesis.sh 4
   ```
2. Copy the new `account_private_key` entries from `genesis-artifacts/root-account-private-keys.yaml` into `.env.local` (`CORE_RESOURCES_PRIVATE_KEY`, `APTOS_DEPLOYER_PRIVATE_KEY`).
3. Update `.env.example` if you want teammates to see the new defaults.
4. Update the defaults in `source/shared/test-constants.ts` to match (tests must still pass without `.env`).
5. Restart Docker / testnet processes so they pick up the new values.
