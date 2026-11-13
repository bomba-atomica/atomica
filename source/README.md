# Source Directory Overview

This directory contains Atomica's implementation workspaces.

## Main Modules

- `atomica-web/`: Main web app/demo and cross-chain integration tests.
- `evm-contracts/`: EVM contracts, deployment helpers, and test orchestration.
- `state-proofs/`: State-proof tooling and TypeScript integration utilities.
- `docker-testnet/`: Local testnet infra and SDK for development/testing.
- `atomica-move-contracts/`: Move contract workspace.
- `test-utils/`: Browser test helpers (`browser-commands.ts`, `browser-utils/`) imported by `atomica-web-components` tests.
- `web/`: Additional web-facing module(s).

## Where to Start

- App/demo setup: `source/atomica-web/README.md`
- EVM contracts: `source/evm-contracts/README.md`
- Local testnet: `source/docker-testnet/README.md`
- State proofs: `source/state-proofs/typescript/README.md`

## Note

Older documentation may reference historical folders such as `diem-prover-native` and `diem-prover-zkp`.
Those are not part of the current repository structure.
