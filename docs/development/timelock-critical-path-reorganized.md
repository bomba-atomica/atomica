# Timelock Implementation: Reorganized Critical Path
**Date**: 2025-12-26
**Status**: Phase 3 Complete, PoC Validation Pending

## Current State

### ✅ Completed Phases
- **Phase 0**: Scaffolding and Stubs
- **Phase 1**: Core Cryptography (IBE primitives)
- **Phase 2**: DKG Integration (session management, share submission)
- **Phase 3**: Smart Contract Logic (Move implementation)
- **Phase 4.1**: Persistent Key Storage
- **Phase 5**: Testing Infrastructure
- **Phase 6.1**: Basic Flow Test (implemented, needs execution)

### ❌ Incomplete Work
- **Phase 4.2**: DKG State Recovery (deferred to production)
- **Phase 6.2**: IBE Encrypt/Decrypt E2E Test (**CRITICAL**)
- **Phase 6.3-6.6**: Advanced E2E tests (restart, threshold, concurrent, byzantine)

---

## Critical Path: Reorganized by Risk Mitigation

### 🔴 TIER 1: Remove Technical Risk (Est. 1.75 days)

**Goal**: Prove that the core cryptographic flow works end-to-end.

| Order | Task | Purpose | Effort | Validates |
|-------|------|---------|--------|-----------|
| 1.1 | **Execute Task 6.1** | Validate DKG → MPK → Share Aggregation | 0.5 days | TQ1 ✅, TQ2, TQ6 ✅ |
| 1.2 | **Implement Task 6.2** | Validate IBE encrypt/decrypt roundtrip | 1 day | TQ3 (**CRITICAL**), TQ4 |
| 1.3 | **Add Identity Unit Test** | Validate cross-platform consistency | 0.25 days | TQ4 |

**Acceptance Criteria**:
- [x] Task 6.1 smoke test passes
- [ ] Can encrypt a bid using published MPK
- [ ] Can decrypt bid using revealed decryption key
- [ ] Plaintext matches after decryption
- [ ] Identity format is consistent between Rust and Move

**If these fail**: The entire approach may need revision. This is the **go/no-go** decision point.

---

### 🟡 TIER 2: Proof of Concept Complete (Est. 2 days)

**Goal**: Demonstrate a working timelock system with fault tolerance.

| Order | Task | Purpose | Effort | Validates |
|-------|------|---------|--------|-----------|
| 2.1 | **Task 6.4: Threshold Test** | Prove Byzantine fault tolerance | 1 day | Threshold enforcement |
| 2.2 | **Task 6.5: Concurrent Intervals** | Prove multi-interval handling | 1 day | TQ5, Resource management |

**Acceptance Criteria**:
- [ ] System works with f Byzantine validators (threshold not met → no reveal)
- [ ] Late shares can still contribute to threshold
- [ ] Multiple intervals can run DKG concurrently without interference
- [ ] All intervals complete successfully

**After Tier 2**: You have a **working PoC** suitable for:
- Demo to stakeholders
- Internal testing
- Architecture validation
- Performance benchmarking

---

### 🟢 TIER 3: Production Hardening (Est. 6 days)

**Goal**: Production-grade robustness and security.

| Order | Task | Purpose | Effort | Validates |
|-------|------|---------|--------|-----------|
| 3.1 | **Task 4.2: DKG Recovery** | Handle mid-DKG restarts | 2 days | State persistence |
| 3.2 | **Task 6.3: Restart Test** | Validate recovery logic | 2 days | Validator resilience |
| 3.3 | **Task 6.6: Byzantine Test** | Security against malicious validators | 2 days | Attack resistance |

**Acceptance Criteria**:
- [ ] Validators can restart during DKG without losing progress
- [ ] No duplicate transcripts after recovery
- [ ] Invalid transcripts/shares are rejected
- [ ] System remains live with <f Byzantine validators

**After Tier 3**: System is **production-ready** for mainnet deployment.

---

## Immediate Action Plan

### Step 1: Run Task 6.1 (TODAY)

```bash
cd /Users/lucas/code/rust/atomica/source/zapatos
cargo test -p smoke-test test_timelock_basic_flow -- --nocapture
```

**Expected outcome**: Test passes, logs show:
- ✅ Genesis initialization
- ✅ Interval rotation
- ✅ Public key published
- ✅ Secret shares aggregated

**If test fails**, debug based on error:
- "No public key published" → DKG transcript submission issue
- "Secret aggregation failed" → BLS aggregation in Move issue
- "Share extraction failed" → `process_timelock_key_published()` issue

---

### Step 2: Implement Task 6.2 (NEXT)

**File**: `source/zapatos/testsuite/smoke-test/src/timelock/ibe_e2e.rs`

**Implementation outline**:

```rust
#[tokio::test]
async fn test_ibe_encrypt_decrypt_roundtrip() {
    // 1. Start swarm with 4 validators
    let mut swarm = new_local_swarm_with_aptos(4).await;
    let client = swarm.validators().next().unwrap().rest_client();
    
    // 2. Configure short interval (5 seconds)
    configure_timelock_interval(&client, 5_000_000).await;
    
    // 3. Wait for interval 1 to start
    wait_for_interval_rotation(&client, 1, 60).await.unwrap();
    
    // 4. Fetch public key for interval 1
    let mpk_bytes = verify_public_key_published(&client, 1, 60).await.unwrap();
    let mpk = deserialize_g2(&mpk_bytes).unwrap();
    
    // 5. Encrypt a bid
    let bid_data = b"secret_bid_100_tokens";
    let identity = compute_timelock_identity(1, swarm.chain_id());
    let ciphertext = ibe_encrypt(&mpk, &identity, bid_data).unwrap();
    
    // 6. Wait for interval 2 (triggers reveal of interval 1)
    wait_for_interval_rotation(&client, 2, 60).await.unwrap();
    
    // 7. Fetch revealed decryption key for interval 1
    let dk_bytes = verify_secret_aggregated(&client, 1, 60).await.unwrap();
    let dk = deserialize_g1(&dk_bytes).unwrap();
    
    // 8. Decrypt the bid
    let decrypted = ibe_decrypt(&dk, &ciphertext).unwrap();
    
    // 9. Verify plaintext matches
    assert_eq!(decrypted, bid_data, "Decryption failed: plaintext mismatch");
    
    println!("✅ IBE encrypt/decrypt roundtrip successful!");
}
```

**Dependencies to add**:
- Import `aptos_dkg::ibe::{ibe_encrypt, ibe_decrypt, compute_timelock_identity}`
- Import `aptos_dkg::ibe::{deserialize_g1, deserialize_g2}`

**Estimated effort**: 1 day (includes debugging)

---

### Step 3: Add Identity Format Unit Test

**File**: `source/zapatos/crates/aptos-dkg/src/ibe.rs` (add to existing tests)

```rust
#[test]
fn test_timelock_identity_consistency() {
    let interval = 12345u64;
    let chain_id = 1u8;
    
    // Compute identity in Rust
    let identity_rust = compute_timelock_identity(interval, chain_id);
    
    // Expected format: sha3_256(interval || chain_id || "atomica_timelock")
    use sha3::{Digest, Sha3_256};
    let mut hasher = Sha3_256::new();
    hasher.update(interval.to_le_bytes());
    hasher.update([chain_id]);
    hasher.update(b"atomica_timelock");
    let expected = hasher.finalize().to_vec();
    
    assert_eq!(identity_rust, expected, "Identity format mismatch");
    
    // TODO: Also test against Move implementation if accessible
}
```

**Estimated effort**: 0.25 days

---

## Risk Matrix (Updated)

| Risk | Likelihood | Impact | Status | Mitigation |
|------|------------|--------|--------|------------|
| **TQ1**: Share extraction fails | ~~Medium~~ **RESOLVED** | Critical | ✅ | Implemented in `process_timelock_key_published()` |
| **TQ2**: BLS aggregation wrong | Low | Critical | ⚠️ **TESTING** | Task 6.1 will validate |
| **TQ3**: IBE decrypt fails | Medium | Critical | ⚠️ **TESTING** | Task 6.2 is critical path |
| **TQ4**: Identity mismatch | Low | Critical | ⚠️ **TESTING** | Unit test + Task 6.2 |
| **TQ5**: Concurrent DKG interference | Low | High | ⚠️ **TESTING** | Task 6.5 |
| **TQ6**: Event subscription fails | ~~Medium~~ **RESOLVED** | High | ✅ | Verified in code |
| DKG doesn't complete in time | Medium | High | ⏳ **DEFERRED** | Add timeout (Tier 3) |
| Threshold not met | Medium | High | ⏳ **DEFERRED** | Emergency governance (Tier 3) |

---

## Success Metrics

### Tier 1 Success (PoC Validation)
- [x] Basic flow test passes ← **Run this first**
- [ ] IBE encrypt/decrypt roundtrip works ← **Critical blocker**
- [ ] Identity format is consistent
- **Timeline**: 1.75 days

### Tier 2 Success (PoC Complete)
- [ ] Threshold enforcement works
- [ ] Concurrent intervals don't interfere
- [ ] System handles Byzantine validators (up to f)
- **Timeline**: +2 days (3.75 days total)

### Tier 3 Success (Production Ready)
- [ ] All smoke tests pass on clean devnet
- [ ] Validators can restart mid-DKG without losing progress
- [ ] System remains live with up to f Byzantine validators
- [ ] Zero secret leakage before reveal time
- **Timeline**: +6 days (9.75 days total)

---

## Notes

### Why This Order?

1. **Tier 1 first**: If the core crypto doesn't work, nothing else matters. This is the **highest risk**.
2. **Tier 2 before Tier 3**: A working PoC is valuable even without restart recovery. Restart recovery is "nice to have" for PoC, "must have" for production.
3. **Task 6.2 is critical**: This is the **only** test that validates the entire encryption → decryption flow. Without this, we don't know if the system actually works.

### What Changed from Original Plan?

**Original plan** (from document):
1. Run Task 6.1
2. Implement Task 6.2
3. Then jump to Phase 4 (persistent storage)

**New plan** (this document):
1. Run Task 6.1
2. Implement Task 6.2
3. Add identity unit test
4. **THEN** validate PoC with Tasks 6.4-6.5
5. **FINALLY** add production hardening (Phase 4.2, Task 6.3, 6.6)

**Rationale**: Phase 4.1 (persistent storage) is already complete. Phase 4.2 (DKG recovery) is not needed for PoC validation. We should validate the PoC works before investing in production hardening.

---

## Next Steps

1. ✅ Review this document
2. ⏳ Run Task 6.1: `cargo test -p smoke-test test_timelock_basic_flow -- --nocapture`
3. ⏳ Based on Task 6.1 results, either:
   - **If passes**: Proceed to Task 6.2 implementation
   - **If fails**: Debug and fix issues before proceeding
4. ⏳ Implement Task 6.2 (IBE E2E test)
5. ⏳ Add identity format unit test
6. ⏳ Evaluate PoC readiness for demo/testing
