# Test Credentials

This document records the deterministic key material that Atomica test suites and the webapp share via the root `.env` files.

## Canonical values

The tracked `/.env.example` defines the following environment variables with the values currently used for the local Docker testnets:

| Variable | Purpose | Source |
| --- | --- | --- |
| `CORE_RESOURCES_ADDRESS` | Aptos faucet/Core Resources address (0x...A550C18) | `source/shared/test-constants.ts` (mirrors `root-account-private-keys.yaml`) |
| `CORE_RESOURCES_PRIVATE_KEY` | Private key that controls minting/faucet behavior | same module (fallback to `root-account-private-keys.yaml`) |
| `APTOS_DEPLOYER_ADDRESS` | Atomica module (deployer) account | `source/shared/test-constants.ts` (default: 0x44eb...) |
| `APTOS_DEPLOYER_PRIVATE_KEY` | Private key for the Atomica deployer | same module (default: 0x52a...) |
| `ETH_DEPLOYER_ADDRESS` | First Ethereum testnet account (pre-funded) | `source/shared/test-constants.ts` (syncs with `ethereum-testnet` SDK) |
| `ETH_DEPLOYER_PRIVATE_KEY` | Private key for that Ethereum account | same module |
| `ETH_DEPLOYER_MNEMONIC` | Mnemonic that derives the above ETH accounts | same module |

`/.env.example` is the reference list; `/.env.local` (gitignored) should mirror those values when you want to run locally. If you ever need a different set of keys, update `.env.local` and, optionally, `.env.example` so teammates can see the new defaults.

## Regenerating key material

If you want to rotate these credentials, regenerate the Aptos key files and copy the resulting hex values into `.env.local`:

1. Run the generator script from the workspace root so it overwrites `source/docker-testnet/config/genesis-artifacts` and the validator directories with freshly generated keys:
   ```bash
   cd source/docker-testnet/config
   ./generate-genesis.sh 4
   ```
   or use the higher-level Docker/testnet helpers that call the same script if you prefer custom validator counts or chain IDs.
2. After the script finishes, copy the new `account_private_key` entries out of `genesis-artifacts/root-account-private-keys.yaml` (for the Core Resources key) and whichever Aptos module address you want to reuse (currently `0x44eb...`) for the deployer.
3. Update `.env.local` (and `.env.example` if you want to share the new defaults) so `CORE_RESOURCES_PRIVATE_KEY` and `APTOS_DEPLOYER_PRIVATE_KEY` point at the new hex values.
4. The Ethereum deployer values live in `source/docker-testnet/ethereum-testnet/typescript-sdk/src/index.ts`. To rotate them, edit that file to hard-code new addresses/keys or generate replacement accounts from the same mnemonic and copy the values into `.env.local`.

When rotating keys, make sure Docker or any running testnet process is restarted so it picks up the new `.env.local` values.
