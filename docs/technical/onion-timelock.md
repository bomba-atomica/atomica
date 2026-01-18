# Onion Timelock Encryption (N-Layer)

## 1. Overview

The Onion Timelock system is a flexible, multi-layer encryption scheme designed for sealed-bid auctions and other time-sensitive secrets on Atomica. Unlike traditional timelock schemes that rely on a single trusted beacon or validator set, the Onion Timelock allows users to compose multiple encryption layers from independent key providers (e.g., Validators, Drand, Seller).

**Key Feature**: Users have complete control over the **selection** and **ordering** of these layers, enabling dynamic security configurations that prevent attackers from pre-computing exploits against fixed architectural patterns.

## 2. Core Concepts

### 2.1 User-Defined Layering
The system exposes a registry of available public keys (Layer Providers). Users (sellers or bidders) can elect to encrypt their sensitive data (e.g., bid price, reserve price) with **any combination** of these keys.

- **Quantity**: 1 to N layers.
- **Selection**: Flexible choice of providers (e.g., just Validators, or Validators + Seller).

### 2.2 Arbitrary Layer Order
**Critical Security Feature**: Users can specify the **order** of encryption layers.
- There is no fixed system-wide order (e.g., it is NOT always Validator -> Drand).
- A user can choose `Validator(Outer) -> Seller(Inner)` or `Seller(Outer) -> Validator(Inner)`.
- The specific layer order is encoded in the timelock metadata attached to the ciphertext.

### 2.3 Layer Independence
Each layer uses independent key material and cryptographic schemes. The system treats each layer as an abstract "Lock" that requires a specific "Key" to open.
- **Validators**: BLS12-381 IBE schemes.
- **Drand**: Tlock (IBE-like) schemes.
- **Sellers**: Threshold ElGamal or simple public key encryption.

## 3. Architecture

### 3.1 Encryption Flow (Client-Side)
Encryption is performed sequentially by the user's client.

1.  **Plaintext**: $M$
2.  **Layer 1 (Inner)**: Encrypt $M$ with Key $K_1$ $\rightarrow$ $C_1$
3.  **Layer 2 (Middle)**: Encrypt $C_1$ with Key $K_2$ $\rightarrow$ $C_2$
4.  **Layer 3 (Outer)**: Encrypt $C_2$ with Key $K_3$ $\rightarrow$ $C_3$
5.  **Metadata**: Construct a list `[Provider3, Provider2, Provider1]` indicating the decryption order.

Final Payload: `{ Ciphertext: C_3, EncryptionOrder: [ID_3, ID_2, ID_1] }`

### 3.2 Decryption Flow (On-Chain / Off-Chain)
Decryption occurs sequentially at the end of the timelock period (or when conditions are met).

1.  **Trigger**: Auction deadline reached.
2.  **Layer 3 (Outer)**: Provider 3 publishes secret $S_3$. System decrypts $C_3$ using $S_3$ $\rightarrow$ $C_2$.
3.  **Layer 2 (Middle)**: Provider 2 publishes secret $S_2$. System decrypts $C_2$ using $S_2$ $\rightarrow$ $C_1$.
4.  **Layer 1 (Inner)**: Provider 1 publishes secret $S_1$. System decrypts $C_1$ using $S_1$ $\rightarrow$ $M$.

## 4. Security Analysis

### 4.1 Mitigation of Pre-Computation Attacks
By allowing arbitrary layer ordering, the system mitigates "Pre-computation Attacks" where an exploiter might target a known, long-running master key or a fixed protocol structure.
- **Fixed Order Vulnerability**: If the system always forced `Validator -> Seller`, an attacker could focus entirely on compromising the Validator layer well in advance, knowing exactly how it wraps important data.
- **Dynamic Order Defense**: With user-defined ordering, an attacker cannot predict the structure of future timelocks. They must compromise *specific* layers in a *specific* order, often determined only at the moment of bid submission.

### 4.2 Collusion Resistance
To decrypt the message before the deadline, an attacker must compromise **ALL** $N$ layers selected by the user.
- If a user selects `[Validator, Drand, Seller]`, the attacker needs:
    1.  $>2/3$ of Validators (to break Validator layer)
    2.  Drand network compromise (to break Drand layer)
    3.  The Seller's private key (to break Seller layer)
- This multiplicative security model drastically increases the cost of attack.

## 5. Example Configurations

| Configuration | Layers | Pros | Cons |
| :--- | :--- | :--- | :--- |
| **Standard** | `Validator` | Fast, simple, decent security. | Trust placed solely in validators. |
| **Grief-Free** | `Validator -> Drand` | Adds diversity; if purely computational validators halt, Drand might still release (though nesting usually implies AND security). | Slightly more complex. |
| **User-Sovereign** | `Validator -> Seller` | Seller MUST consent to reveal (by releasing inner key) but ensures time-based release of outer layer first. | Seller can grief by refusing to decrypt inner layer (but cannot change value). |
| **Max Security** | `Validator -> Drand -> Seller` | Requires compromising three independent entities to break privacy. | Higher gas cost, highest complexity. |

