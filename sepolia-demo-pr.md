# PR Title: feat: simplify Sepolia state verification demo

## Summary
This PR fixes and simplifies the Ethereum state verification demo, making it easier for users to test the cryptographic MPT verification against live network data.

## Changes
- **Simplified Execution**: Added `bun run demo` as a short command to execute the Sepolia state verification.
- **Reliable Defaults**: Set high-performance public endpoints as defaults (Tenderly for RPC, Lodestar for Beacon API) to ensure the demo works out-of-the-box without manual configuration.
- **Improved Light Client Sync**: Fixed critical bugs in the Beacon API parsing logic where execution payload fields were being zeroed out or incorrectly indexed.
- **Dynamic Bootstrapping**: The demo now automatically fetches a valid finalized block root for light client initialization.
- **Documentation**: Prominently added Quick Start instructions to the top of the `README.md`.

## How to Test
1. Navigate to `source/state-proofs/typescript/`.
2. Run `bun install`.
3. Run `bun run demo`.
4. (Optional) Override defaults: `SEPOLIA_RPC_URL=... bun run demo`.
