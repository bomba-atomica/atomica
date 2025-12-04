# SNARK Auction Clearing Specification

## Overview

This document specifies the requirements and architecture for the Zero-Knowledge SNARK circuit responsible for proving the correctness of the Atomica auction clearing process.

## Objective

The goal is to generate a succinct cryptographic proof that attests to the validity of the auction settlement without requiring verifiers to re-execute the clearing logic or access the raw bid data (though in this specific context, bids are decrypted, so privacy is less of a concern for the *proof* itself than correctness and succinctness for on-chain or light-client verification).

**Primary Statement:**
"Given a set of decrypted bids and reserve prices, the resulting settlement transfers (represented by a Merkle Root) were generated correctly according to the deterministic Uniform Price Auction rules."

## System Requirements

1.  **Proving Speed:** The proof must be generated within **seconds**. This is critical for the user experience and settlement finality.
2.  **Setup:** Must use a **Universal Setup** (e.g., SRS from Powers of Tau). Circuit-specific trusted setups (like Groth16) are disqualified to ensure upgradability and security.
3.  **Verification Cost:** Verification should be cheap, ideally capable of running on an EVM chain or a light client.

## Circuit Architecture

### Public Inputs
- **`input_merkle_root`**: The Merkle Root of the generated transfers. This is the commitment to the output of the auction.
- **`auction_params`**: Global parameters (e.g., auction ID, token pair, timestamp).

### Private Witnesses (Inputs)
- **`decrypted_bids`**: List of all valid bids (Price, Quantity, Bidder Public Key).
- **`reserve_prices`**: The reserve price(s) set by the auctioneer/protocol.

### Circuit Logic

1.  **Input Validation**:
    - Verify integrity of bids (signatures, formats).
    
2.  **Sorting**:
    - Sort bids by Price (descending) and Time/Index (FIFO) to determine priority.
    
3.  **Clearing Algorithm (Uniform Price)**:
    - Iterate through sorted bids to find the clearing price where Supply meets Demand.
    - Determine the `clearing_price`.
    - Identify winning bids (all bids $\ge$ clearing price).
    - Calculate fill amounts for each winning bid.

4.  **Transfer Generation**:
    - For each winning bid, calculate the `TokenOut` amount and `TokenIn` amount based on the `clearing_price`.
    - Construct a `Transfer` object: `{ recipient, token, amount }`.

5.  **Output Commitment**:
    - Construct a Merkle Tree from the list of `Transfer` objects.
    - Compute the `calculated_merkle_root`.

6.  **Constraint Check**:
    - Enforce `calculated_merkle_root == input_merkle_root`.

## Data Structures

### Bid
```rust
struct Bid {
    bidder: PublicKey,
    price: u64,
    quantity: u64,
    nonce: u64,
}
```

### Transfer
```rust
struct Transfer {
    recipient: PublicKey,
    token_id: u32,
    amount: u64,
}
```

## Challenges & Considerations

- **Sorting in Circuits**: Sorting is expensive. We will leverage **Halo2 Lookup Tables** to perform efficient range checks ($a < b$) to validate sorting without expensive boolean decomposition.
- **Variable Number of Bids**: SNARK circuits are fixed size. We will pad inputs to a maximum capacity (e.g., 1024 bids).
- **Precision**: Prices will be represented as field elements (BN254 scalar field), ensuring no overflow for reasonable values (u64 fits comfortably).

## Selected Proving System

**Halo2 (KZG)** has been selected for implementation.

- **Curve**: BN254 (alt_bn128) for native Ethereum verification.
- **Arithmetization**: Plonkish (Custom Gates + Lookup Tables).
- **Commitment Scheme**: KZG (Universal Setup via Powers of Tau).
