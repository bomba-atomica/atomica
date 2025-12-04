# Decision: Atomica Validator-Based Timelock Encryption

**Date:** 2025-12-04
**Status:** ACCEPTED
**Decision Makers:** Core team

---

## Decision

**Atomica will implement timelock encryption for sealed bids using Atomica validator BLS threshold signature infrastructure.**

**Note on Technology**: Atomica chain is built using Aptos-core software (consensus layer, BLS cryptography, Move VM) as the blockchain implementation, but runs as an independent network with its own validators, governance, and token economics. References to "Aptos" in this document refer to the Aptos-core software stack that Atomica uses.

Atomica validators will serve dual purposes:
1. **Consensus** (existing): Block production and state certification
2. **Timelock authority** (new): Publish decryption shares at predetermined times

This eliminates dependency on external timelock services (like drand) while providing equivalent security guarantees.

---

## Context

### Sealed Bid Requirement

Atomica auctions require sealed bids to prevent:
- **MEV (Maximal Extractable Value)**: Validators/searchers front-running bids
- **Bid manipulation**: Users adjusting bids based on others' submissions
- **Collusion**: Coordinated bidding based on revealed information

**Solution requirements:**
1. Bids must be encrypted during submission period
2. Automatic decryption at auction deadline (no interactive reveal)
3. Grief-resistant: no single party can prevent decryption
4. Decentralized: no single authority holds decryption key

### Timelock Encryption Options

**Option 1: drand (Distributed Randomness Beacon)**
- External service run by League of Entropy
- Publishes randomness every 30 seconds (some networks: 3 seconds)
- Identity-Based Encryption (IBE) using BLS signatures
- Round-based: encrypt to future round number

**Option 2: Ethereum KZG Ceremony / EIP-4844**
- Uses KZG commitments for future blob availability
- Not designed for timelock encryption
- Requires Ethereum mainnet dependency

**Option 3: Atomica Validator Timelock (CHOSEN)**
- Use Atomica validator BLS threshold signatures (built on Aptos-core infrastructure)
- Validators publish decryption shares at auction deadlines
- No external dependencies
- Shares Atomica's security assumptions (powered by Aptos-core BLS implementation)

---

## Problems with drand (Option 1)

### Problem 1: External Dependency

**Risk:**
- Atomica depends on external service (drand.love)
- drand network outage → all auctions halt
- No control over drand infrastructure
- Must trust League of Entropy operator selection

**Mitigation difficulty:**
- Cannot easily switch drand networks mid-flight
- Encrypted bids tied to specific drand public key
- Service disruption affects all active auctions

### Problem 2: Separate Liveness Assumption

**Aptos liveness:** Requires 2/3+ validators online
**drand liveness:** Requires separate set of nodes online

**Problem:**
- Atomica auctions depend on TWO separate liveness assumptions
- drand up, Aptos down → can't execute auction even with decryption
- Aptos up, drand down → have execution but can't decrypt bids
- **Combined liveness weaker than either alone**

### Problem 3: Integration Complexity

**Clock synchronization:**
- drand uses round numbers (e.g., "round 1234567")
- Atomica uses block height or Unix timestamps
- Mapping between systems required

**Example issue:**
- Auction scheduled for 1:00 PM UTC
- Which drand round corresponds to 1:00 PM?
- Must account for drand round time drift
- Clock skew could cause early/late decryption

### Problem 4: No Economic Alignment

**drand operators:**
- Run nodes pro bono (public good)
- No direct benefit from Atomica auctions
- No economic incentive for uptime

**Risk:**
- Operators could deprioritize drand maintenance
- No recourse if drand quality degrades
- Can't pay for better service

---

## Benefits of Atomica Validator Timelock (Option 3)

### Benefit 1: No External Dependencies

**Self-contained:**
- Atomica validators provide ALL services
- No external networks to monitor
- Full control over infrastructure
- Failure modes aligned with Atomica's own failures

**Operational simplicity:**
- If Atomica is up, timelock works
- If Atomica is down, auctions can't execute anyway
- Single failure mode to reason about

### Benefit 2: Shared Liveness Assumptions

**Unified security model:**
- Atomica consensus requires 2/3+ validators
- Timelock decryption requires 2/3+ validators
- **Same validators, same threshold**

**Property:**
- If Atomica consensus works, timelock works
- If 2/3+ validators are Byzantine, both consensus and timelock fail
- **No additional security assumptions**

### Benefit 3: Economic Alignment

**Validators earn from auctions:**
- Auction fees distributed to validators
- Validators incentivized to publish decryption shares
- Economic penalty for non-participation (reduced rewards)
- Reputation incentive (validator quality matters)

**Enforcement:**
- Protocol can enforce decryption share publication
- Failed publication → reduced staking rewards
- Potential slashing for repeated failures

### Benefit 4: Native Integration

**Block-level precision:**
- Auction deadline = block height or timestamp
- Validators check at each block: "should I publish shares?"
- No external round number mapping
- Deterministic timing based on blockchain state

**Move contract integration:**
```move
module atomica::auction {
    public fun execute_auction_if_ready(auction_id: u64) {
        let current_time = timestamp::now_seconds();
        let auction = borrow_auction(auction_id);

        if (current_time >= auction.end_time) {
            let shares = get_decryption_shares(auction_id);
            if (shares.len() >= threshold) {
                let key = combine_shares(shares);
                decrypt_and_clear_auction(auction, key);
            }
        }
    }
}
```

### Benefit 5: Leverages Aptos-core Infrastructure

**Aptos-core software provides:**
- BLS12-381 key pairs for each validator
- Threshold signature implementation (for consensus)
- Validator set management and rotation
- Public key distribution mechanism

**Atomica implementation:**
- Minimal customizations to Aptos-core validator logic
- Repurpose BLS keys for Identity-Based Encryption
- Add decryption share generation to block production
- **Leverage battle-tested Aptos-core infrastructure**

---

## Technical Approach

### BLS Threshold Signatures → Timelock Encryption

**Identity-Based Encryption (IBE):**
- Encrypt to "identity" = (auction_id, end_time)
- Master public key = validator threshold public key
- Decryption requires t-of-n validator signatures on identity

**Construction** (simplified):
```
Encryption:
  1. H = hash(auction_id || end_time)  // Map identity to curve point
  2. ciphertext = (U, V)
     U = r·G  (ephemeral public key)
     V = M ⊕ H(e(r·Q_pub, H))  (encrypted message)

Decryption (threshold):
  1. Each validator i generates share: σᵢ = sᵢ·H
  2. Combine t shares: σ = Σ σᵢ  (threshold signature on H)
  3. Decrypt: M = V ⊕ H(e(U, σ))
```

Where:
- `G` = generator of BLS12-381 G1
- `Q_pub` = validator threshold public key (G2)
- `sᵢ` = validator i's secret key share
- `e` = pairing function

### Validator Workflow

**At block production:**
```rust
fn produce_block(validator: &Validator, height: u64) {
    // Existing consensus logic
    let block = create_block(height);

    // New: Check for expired auctions
    let expired = query_expired_auctions(height);
    for auction in expired {
        let share = generate_decryption_share(
            validator.secret_key,
            auction.id,
            auction.end_time
        );
        include_decryption_share_in_block(block, share);
    }

    broadcast_block(block);
}
```

**Decryption share format:**
```rust
struct DecryptionShare {
    auction_id: u64,
    end_time: u64,
    validator_index: u64,
    signature: BLS12381Signature,  // σᵢ = sᵢ·H
    proof: Option<ProofOfCorrectness>,
}
```

### Liveness Guarantees

**Threshold requirement:** t = 2n/3 + 1 (BFT threshold)

**Scenarios:**
1. **All validators online:** Decryption immediate (at auction end block)
2. **2/3+ validators online:** Decryption succeeds within few blocks
3. **<2/3 validators online:** Atomica consensus also halted

**Property:** Timelock liveness ≤ Atomica liveness (acceptable)

---

## Security Analysis

### Threat Model

**Attacker goals:**
1. Decrypt bids before auction ends (early decryption)
2. Prevent bids from being decrypted (griefing)
3. Selectively decrypt specific bids (targeted attack)

### Defense 1: Early Decryption Requires Collusion

**Security parameter:** t = 2n/3 + 1

**Attack requirement:** Attacker must compromise t validators

**Analysis:**
- Same as attacking Aptos consensus
- Requires >2/3 validator collusion
- Standard BFT security assumption

**Cost:**
- Stake required: >2/3 of total validator stake
- Economic penalty: Slashing on discovery
- Reputation damage: Loss of delegator trust

### Defense 2: Griefing Requires Consensus Failure

**Attack:** Prevent decryption shares from being published

**Defense:**
- t-1 validators can withhold, but t-th validator publication suffices
- Economically penalized (reduced rewards)
- If <t validators online, Atomica consensus also halted

**Property:** Griefing auction ≈ halting Atomica (both require >1/3 Byzantine validators)

### Defense 3: Selective Decryption Impossible

**IBE property:** Decryption key derived from public identity (auction_id, end_time)

**Implication:**
- Once t shares published, key is public
- Cannot decrypt some bids but not others
- All-or-nothing decryption

### Comparison to drand

| Threat | drand | Aptos Validator tlock |
|--------|-------|----------------------|
| **Early decryption** | Compromise League of Entropy | Compromise >2/3 Atomica validators |
| **Griefing** | drand network down | >1/3 Atomica validators Byzantine |
| **Selective decryption** | Impossible (IBE) | Impossible (IBE) |
| **Economic attack cost** | No direct cost (reputational) | >2/3 validator stake + slashing |

**Assessment:** Aptos tlock ≥ drand security, with stronger economic guarantees

---

## Implementation Challenges

### Challenge 1: BLS Threshold Setup

**Question:** Does Aptos use threshold BLS or aggregate BLS?

**Threshold BLS:** Each validator has key share, t shares combine to sign
**Aggregate BLS:** Each validator signs independently, signatures aggregated

**Investigation needed:**
- Review Aptos consensus implementation
- Check if Distributed Key Generation (DKG) already implemented
- If aggregate-only, implement threshold variant

**Mitigation:** Can use aggregate signatures with polynomial interpolation (Lagrange)

### Challenge 2: Validator Set Rotation

**Problem:** Validators change between auction start and end

**Scenarios:**
1. Auction starts in epoch N, ends in epoch N+1
2. Validator set rotated between start and end
3. New validators lack key shares for old epoch

**Solution:**
- Encrypt to "epoch" + "end_time" (not just end_time)
- Maintain historical validator keys for pending auctions
- Or: Ensure auctions complete within single epoch

### Challenge 3: Decryption Share Coordination

**Question:** Where are shares aggregated?

**Options:**
1. **On-chain:** Validators include shares in blocks, Move contract combines
2. **Off-chain:** Indexer collects shares, user submits combined key

**Trade-offs:**
- On-chain: Higher gas cost, automatic execution
- Off-chain: Lower cost, requires user action

**Decision:** Hybrid approach (shares on-chain for availability, aggregation flexible)

### Challenge 4: Fallback for Missing Shares

**Problem:** What if <t validators publish shares?

**Scenarios:**
- Validators offline/faulty
- Network partition during critical period
- Byzantine validators withholding shares

**Solutions:**
1. **Timeout + refund:** Cancel auction after X blocks
2. **Social recovery:** Governance vote to decrypt (emergency)
3. **Slashing:** Penalize non-publishing validators

---

## Alternatives Considered

### Alternative 1: Use drand (Rejected)

**Pros:**
- Battle-tested (Ethereum uses for randomness)
- No implementation work needed
- Separate trust assumption (could be more conservative)

**Cons:**
- External dependency
- Separate liveness assumption
- No economic alignment
- Integration complexity

**Decision:** Rejected due to external dependency risk

### Alternative 2: Commit-Reveal Scheme (Rejected)

**Approach:** Users commit hash, reveal later

**Pros:**
- Simple cryptography
- No threshold signatures needed

**Cons:**
- Griefing: Users can commit without revealing
- Two-phase interaction (bad UX)
- Refund complexity on non-reveal

**Decision:** Rejected due to griefing vulnerability

### Alternative 3: Trusted Hardware (SGX/TEE) (Rejected)

**Approach:** Encrypt to SGX enclave, scheduled release

**Pros:**
- Hardware-enforced timelocks
- No threshold coordination

**Cons:**
- Trusted hardware assumption
- Centralization risk (who runs enclave?)
- Remote attestation complexity
- Side-channel vulnerabilities

**Decision:** Rejected due to centralization and trust assumptions

### Alternative 4: Verifiable Delay Functions (VDF) (Rejected)

**Approach:** Encrypt with function that takes T time to compute

**Pros:**
- Deterministic delay
- No trusted parties

**Cons:**
- Assumes attacker can't parallelize (ASICs could break)
- T must be long enough to prevent early decryption
- No way to accelerate if needed (auction cancellation)

**Decision:** Rejected due to ASIC risk and inflexibility

---

## Consequences

### Positive

1. **Self-contained system**: No external dependencies
2. **Unified security model**: Same validators, same threshold
3. **Economic alignment**: Validators benefit from auction success
4. **Native integration**: Block-level timing, Move contracts
5. **Proven cryptography**: BLS IBE well-studied (Boneh-Franklin)

### Negative

1. **Implementation complexity**: Must build threshold IBE on Aptos
2. **Validator burden**: Additional responsibility beyond consensus
3. **Epoch transition handling**: Complex edge cases
4. **Research required**: See 8 research topics in architecture plan

### Mitigations

**For complexity:**
- Leverage existing Aptos BLS infrastructure
- Extensive testing on testnet before mainnet
- Security audit focused on timelock implementation

**For validator burden:**
- Minimal computational overhead (BLS signature generation)
- Economic incentive (auction fees)
- Optional: auto-enable for all validators by default

**For epoch transitions:**
- Restrict auctions to single-epoch duration
- Or: Maintain multi-epoch key material
- Governance parameter: max auction duration

---

## Implementation Plan

**Phase 1: Research & Feasibility** (2-3 weeks)
- Investigate Aptos BLS threshold capabilities
- Design IBE construction on BLS12-381
- Prototype decryption share generation

**Phase 2: Core Implementation** (4-6 weeks)
- Implement BLS-based IBE library
- Integrate decryption share generation into validators
- Move contracts for encrypted bid storage

**Phase 3: Testing & Auditing** (4-6 weeks)
- Testnet deployment
- Security audit (cryptographic + implementation)
- Load testing (1000+ auctions, validator rotation)

**Phase 4: Mainnet Launch** (2-3 weeks)
- Phased rollout
- Monitoring and incident response
- Documentation and developer guides

**Total:** 12-18 weeks

---

## Related Decisions

- [Unified Away Chain Architecture](./unified-away-chain-architecture.md) - All chains use same verification
- [Bid Validity Simplification](./bid-validity-simplification.md) - Post-decryption validation

---

## References

- Boneh-Franklin Identity Based Encryption: https://crypto.stanford.edu/~dabo/pubs/papers/bfibe.pdf
- drand Design: https://drand.love/docs/specification/
- Aptos BLS Implementation: `crates/aptos-crypto/src/bls12381/`
- Architecture Plan Research Topics: `docs/technical/architecture-plan.md#research-topics-for-aptos`
