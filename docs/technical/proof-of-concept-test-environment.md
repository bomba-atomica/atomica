# Atomica Proof of Concept: Web Auction with MetaMask Integration

## Goal
Demonstrate an end-to-end auction flow where users (Sellers and Buyers) interact with the Atomica (Aptos-based) contracts using their Ethereum Identity via MetaMask.

## Scope & Constraints
*   **Network**: Local Aptos Testnet (`aptos-node`) running Atomica contracts.
*   **Wallet**: MetaMask (Ethereum) for signing actions.
*   **Gas/Relay**: A "Relayer" mechanism (frontend-embedded or backend) pays Aptos gas fees, verifying the user's MetaMask signature on-chain.
*   **Authentication**: `secp256k1` signature verification within Move contracts to authenticate actions from Ethereum addresses.

## User Stories
1.  **Faucet**: User connects MetaMask and requests `FAKEETH` and `FAKEUSD`. (Relayer submits `mint` tx verifyng sig).
2.  **Seller**: User creates an auction for `FAKEETH`.
3.  **Buyer**: User submits an encrypted bid in `FAKEUSD` (timelocked).
4.  **Observation**: Users see a live dashboard of auction states and deadlines.
5.  **Conclusion**: Auction ends, bids revealed (simulated/manual for PoC), assets swapped.

## Technical Architecture

### 1. Web Interface (`atomica-web`)
*   **Stack**: React, Vite, TailwindCSS.
*   **Libs**: `ethers.js` (for MetaMask interaction), `aptos` (Aptos TS SDK).
*   **Relayer**: The frontend will hold a "Relayer" private key (e.g., a pre-funded local account like `Alice`) to submit transactions to the Aptos node on behalf of the user.
    *   *Note*: In production, this would be a backend service. For PoC, client-side is acceptable.

### 2. Smart Contracts (`atomica-move-contracts`)
*   **Auth Module**: A module to verify `secp256k1` signatures from ETH addresses.
    *   Function: `verify_eth_sig(eth_addr, msg, signature)`.
*   **Action Wrappers**: Entry functions that accept a signature + payload instead of `signer`.
    *   `remote_faucet(relayer: &signer, eth_addr: vector<u8>, sig: vector<u8>, ...)`
    *   `remote_create_auction(...)`
    *   `remote_bid(...)`

### 3. Local Infrastructure
*   `aptos-node`: Running locally Use `tlock-poc` branch.
*   `faucet`: Standard Aptos faucet for funding the Relayer.

## Deliverables
1.  **Specification Doc**: This file.
2.  **Move Contracts**: Updated `Auction` and `Coin` modules with `secp256k1` entry points.
3.  **Web App**: Functional UI connecting to Localhost Aptos.
4.  **Demo Script**: A walkthrough or script to spin up the environment.

## Non-Goals
*   Cross-chain state synchronization.
*   ZKP generation (using mock/placeholder if needed).
*   Production-grade Relayer Security.

