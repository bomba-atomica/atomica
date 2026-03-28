# Test Credentials

## Rules — read this first

There are exactly two ways to consume credentials, depending on context:

| Context | Source | Behaviour if missing |
|---------|--------|----------------------|
| **Tests** (`bun test`, Vitest, Forge tests, …) | `source/.env.test` | **Must abort** with a clear error |
| **Operational scripts** (`bun run deploy`, `bun run demo`, …) | `.env` / `.env.local` environment variables | **Must abort** with a clear error — never fall back to defaults |

### Do not duplicate credentials

- **Never** hardcode private keys, addresses, or mnemonics.
- **Never** use raw key literals from the Ethereum testnet SDK (`getTestAccounts()`) inside a deploy or demo script.
- If the env var is absent, throw:
  ```ts
  const key = process.env.ETHEREUM_DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("ETHEREUM_DEPLOYER_PRIVATE_KEY is not set");
  ```

---

## Canonical values

`source/.env.test` is the single source of truth for test credentials. It is committed to the repository and contains deterministic key material used by all packages. 

**Note: `bun test` and Vitest load the environment variables from `source/.env.test` automatically.**
- **Vite/Vitest** loads `source/.env.test` automatically in test mode (`envDir: '../'`).
- **Non-Vite Node scripts** load this via `bun --env-file=../.env.test` (or equivalent relative path).

### Current Variables

We recently renamed testnet credentials to improve clarity and standardization. Ensure you are using the correct updated variable names below:

| Variable | Purpose |
|----------|---------|
| `APTOS_ROOT_ACCOUNT_ADDRESS` | Aptos root account (faucet/funder) (replaces `CORE_RESOURCES_ADDRESS`) |
| `APTOS_ROOT_ACCOUNT_PRIVATE_KEY` | Private key that controls minting/faucet behaviour |
| `APTOS_DEPLOYER_ADDRESS` | Atomica module (deployer) account |
| `APTOS_DEPLOYER_PRIVATE_KEY` | Private key for the Atomica deployer |
| `APTOS_ATOMICA_CONTRACT_ADDRESS` | Atomica contract address |
| `ETHEREUM_DEPLOYER_ADDRESS` | Ethereum deployer testnet account (replaces `ETH_DEPLOYER_ADDRESS`) |
| `ETHEREUM_DEPLOYER_PRIVATE_KEY` | Private key for the Ethereum deployer |
| `ETHEREUM_DEPLOYER_MNEMONIC` | Mnemonic that derives the ETH deployer account |
| `ETHEREUM_ACCOUNT_0_ADDRESS` | First Hardhat account for tests (replaces `HARDHAT_ACCOUNT_0_ADDRESS`) |
| `ETHEREUM_ACCOUNT_0_PRIVATE_KEY` | Private key for Ethereum Account 0 |

*(Note: There are also Vite compile-time variables like `VITE_CONTRACT_ADDRESS` and Aptos validator seeds explicitly defined in `source/.env.test`)*

---

## Regenerating key material

If you need a completely fresh set of deterministic test keys (for example, if testnet accounts are compromised or you are resetting the network state):

1. Run the credential generator script from the `source` directory:
   ```bash
   cd source
   ./scripts/generate-test-credentials.sh
   ```
2. The script will automatically generate new keys and overwrite `source/.env.test`.
3. Regenerate the genesis validators by running a fresh testnet:
   ```bash
   bun run testnet
   ```
4. Commit the updated `source/.env.test` file to lock in the new credentials.
