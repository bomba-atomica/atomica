# Aptos v1.38 Integration Analysis - Vendor Branch

**Date**: December 9, 2025
**Status**: Draft Implementation Analysis
**Context**: Evaluation of switching base node version from `v1.37.5` to `aptos-release-v1.38` branch.

## Executive Summary

The `aptos-release-v1.38` branch represents a significant infrastructure upgrade for Atomica, primarily due to the native inclusion of **Batched Threshold Encryption** primitives. Unlike `v1.37.5`, which requires a custom implementation (or heavy fork) to support encrypted transactions, v1.38 provides the necessary cryptographic substrate in the core.

**Recommendation**: **Adopt `aptos-release-v1.38` as the base implementation branch.**

**Rationale**:
1.  **Native Cryptography**: Access to `aptos-batch-encryption` and `EncryptedPayload` without maintaining a custom fork of core types.
2.  **MEV Protection**: "TrX" (Encrypted Mempool) support is likely native or easily enabled, providing immediate value.
3.  **Timelock Foundation**: The same DKG and IBE infrastructure used for mempool encryption can be leveraged for Atomica's specific "Timelock Auction" needs.
4.  **Forward Compatibility**: Aligns with Aptos Core roadmap ("Aptos 2.0"), reducing future technical debt.

---

## 1. Feature Map: v1.37.5 vs v1.38

| Feature | v1.37.5 (Current Plan) | v1.38 (Vendor Branch) | Impact on Atomica |
| :--- | :--- | :--- | :--- |
| **Transaction Type** | Standard only | `EncryptedPayload` Supported | **High**: Native support for encrypted auction bids. |
| **Cryptography** | Standard BLS | `aptos-batch-encryption` (IBE) | **Critical**: Removes need for custom crypto crate. |
| **Mempool** | Plaintext | Encrypted (Batched Threshold) | **High**: Native MEV protection for all users. |
| **Consensus** | Standard | Quorum Store + Recovery aware | **Medium**: Safer consensus integration. |
| **DKG** | Randomness only | Weighted PVSS + Decryption | **Critical**: Existing infrastructure for share generation. |

## 2. Implementation Strategy using v1.38

### Phase 1: Base Fork Setup

Instead of forking `v1.37.5`, we initialize Atomica Chain on `v1.38`.

```bash
# New Fork Strategy
git clone https://github.com/aptos-labs/aptos-core.git atomica-chain
cd atomica-chain
git checkout aptos-release-v1.38
git checkout -b atomica/v1.38-base
```

### Phase 2: Leveraging `aptos-batch-encryption` for Timelock

The `aptos-batch-encryption` crate implements **Boneh-Gentry-Waters (BGW) Identity-Based Encryption**.
For the "Encrypted Mempool" feature, the identity is implicitly "the current block" (or immediate decryption).
For "Timelock Auctions", we need to encrypt to "future block height H".

**Extension Plan**:
We do **not** need to rewrite the crypto. We only need to expose the ability to request decryption shares for a *specific identity* (the block height) via the DKG module.

#### Component: `atomica-timelock` Module (Rust)
A new crate in `crates/atomica-timelock` that bridges `aptos-batch-encryption` with the consensus engine.

**Key Logic**:
1.  **Trigger**: Watch for finalized block `H`.
2.  **Action**: If `H` is an auction deadline, the validator node automatically generates a decryption share using `WeightedBIBEMasterSecretKeyShare`.
3.  **Identity**: The identity for IBE is strictly `H` (u64 block height).
4.  **Publish**: Broadcast share to the network (via a new P2P message or on-chain transaction).

This is significantly simpler than building DKG from scratch.

### Phase 3: Adapting `EncryptedPayload`

The native `EncryptedPayload` is designed for privacy-preserving mempool. We can reuse this for auction bids.

**Usage**:
- Users submit bids as `EncryptedPayload` transactions.
- These transactions are gossiped but **not ordered** until decrypted?
    - *Correction*: TrX usually orders *encrypted* transactions and decrypts *after* ordering.
    - **Atomica Requirement**: We want to order them (include in block) but keep them encrypted until deadline.
    - **Adaptation**: We might need a custom transaction type `TimelockPayload` or a flag in `EncryptedPayload` to prevent immediate decryption by the standard TrX pipeline.
    - **Alternative**: Use standard `EntryFunction` payload where the arguments are encrypted bytes (ciphertext), satisfying the `EncryptedPayload` structure if possible, or just standard payload with blob data.
    - *Better Reference*: If `EncryptedPayload` enforces immediate decryption, we might just use it for the *data transport* but strictly control the decryption key generation.

## 3. Risk Analysis of v1.38

| Risk | Description | Mitigation |
| :--- | :--- | :--- |
| **Stability** | `v1.38` branch might be less stable than `v1.37.5` mainnet release. | Extensive soaking on Atomica Testnet. Quarterly rebase. |
| **Breaking Changes** | API or Move changes in v1.38 leading to tooling mismatch. | Update `robert-cli` and SDKs to match v1.38 specifications. |
| **Incomplete Mempool** | If v1.38 has crypto but incomplete mempool logic (as seen in main). | We fill the gap. It's easier to verify "missing glue code" than "missing crypto". |

## 4. Conclusion

Using `aptos-release-v1.38` transforms the "Encrypted Mempool" task from a **Research & Implementation** problem to an **Integration & Configuration** problem.

**Verdict**: **PROCEED**.
Shift implementation plan to target `aptos-release-v1.38`.
Start testing `aptos-batch-encryption` crate immediately.
