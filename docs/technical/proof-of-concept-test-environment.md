# Atomica Proof of Concept: Web Auction with MetaMask Integration

## Goal
Demonstrate an end-to-end auction flow where users (Sellers and Buyers) interact with the Atomica (Aptos-based) contracts using their Ethereum Identity via MetaMask.

## Scope & Constraints
*   **Network**: Local Aptos Testnet (`aptos-node`) running Atomica contracts.
*   **Wallet**: MetaMask (Ethereum) for signing actions.
*   **Authentication**: `secp256k1` signature verification within Move contracts to authenticate actions from Ethereum addresses.

## User Stories
1.  **Faucet**: User connects MetaMask and requests `FAKEETH` and `FAKEUSD`. (Relayer submits `mint` tx verifyng sig).
2.  **Seller**: User creates an auction for `FAKEETH`.
3.  **Buyer**: User submits an encrypted bid in `FAKEUSD` (timelocked).
4.  **Observation**: Users see a live dashboard of auction states and deadlines.
5.  **Conclusion**: Auction ends, bids revealed (simulated/manual for PoC), assets swapped.

# Proof of Concept Test Environment

This document outlines the test environment for the "Atomica Web PoC" demo.

## Components

*   **Frontend**: `atomica-web` (React/Vite). Serves the UI for Faucet, Auction Creation, and Bidding.
*   **Blockchain**: `aptos-node` (Local Validator). Runs the Atomica Move contracts.
*   **Wallet**: MetaMask (User's Ethereum Wallet).
*   **Authentication**: **Native Ethereum Wallet Submission** via SIWE (Sign In With Ethereum). The user signs a specific message, and the frontend constructs an `AbstractAuthenticator` transaction submitted directly to the chain. (No Relayer required).
*   **Orchestrator**: `orchestrator.ts` (Node.js). Manages the lifecycle: starts node, cleans up ports, builds contracts, runs setup scripts.

## Flow

1.  **Faucet**: User connects MetaMask and requests funds. The frontend calls the local faucet service to fund the user's **Derived Aptos Address**.
2.  **Create Auction**: User inputs parameters.
    *   Frontend generates a **SIWE Message** with `Nonce = Transaction Hash`.
    *   User signs via MetaMask.
    *   Frontend submits the transaction to the local node using `AbstractAuthenticator`.
3.  **Bid**: User inputs bid amount and target auction.
    *   Frontend encrypts the bid (IBE) and generates a SIWE Message.
    *   User signs.
    *   Frontend submits native transaction.
4.  **Verification**: The Move contracts (`ethereum_derivable_account`) verify the signature and recovered address on-chain.

## Key APIs (Local)

*   `node`: `http://127.0.0.1:8080` (Aptos REST API)
*   `faucet`: `http://127.0.0.1:8081` (Native Aptos Faucet for funding derived accounts)
*   `webapp`: `http://localhost:5173`

## Out of Scope (PoC)

*   Production-grade Key Management.
*   Real Settlement (Bridge) Relayers (Mocked for this stage if needed).

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

