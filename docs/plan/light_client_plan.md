# Light Client Sync Protocol Implementation Plan

## Product Features

Implement trustless Ethereum block header verification using the Light Client Sync Protocol. This enables verification of block headers without trusting the RPC provider, using cryptographic proofs from the beacon chain's sync committee.

### Core Features
1. **Sync Committee Verification**: Verify BLS signatures from the current sync committee to authenticate block headers
2. **Period Tracking**: Track sync committee periods and fetch `next_sync_committee` updates
3. **Light Client Update**: Fetch and verify `LightClientUpdate` objects from the Beacon API
4. **Header Substitution**: Replace trusted RPC block header with light-client verified header in verification pipeline

### Technical Features
- SSZ decoding for beacon chain types (LightClientUpdate, SyncCommittee, etc.)
- BLS signature verification using BLS12-381 curves
- Minimal light client state storage and sync logic
- Integration with existing state proof verification

## Technical Implementation

### Libraries
- **@chainsafe/bls**: BLS signature verification (supports BLS12-381)
- **@chainsafe/ssz**: SSZ encoding/decoding for beacon types
- **viem**: Already in project, has some beacon types

### Beacon API Endpoints
- `GET /eth/v1/beacon/light_client/bootstrap/{block_root}`: Initial sync state
- `GET /eth/v1/beacon/light_client/updates/{period}`: Sync committee updates
- `GET /eth/v1/beacon/light_client/finality_update`: Finality proofs
- `GET /eth/v1/beacon/light_client/optimistic_update`: Optimistic updates

### Public Beacon APIs
- Ethereum Mainnet: `https://mainnet.checkpoint.ssz.ethereum.org` or beaconcha.in API
- Sepolia Testnet: `https://checkpoint-sync.sepolia.beaconcha.in`
- Holesky: `https://checkpoint-sync.holesky.beaconcha.in`

### Architecture

```
src/
  beacon/
    types.ts          # SSZ type definitions (LightClientUpdate, SyncCommittee, etc.)
    fetch.ts          # Fetch light client updates from Beacon API
    sync.ts           # Sync committee verification logic
    state.ts          # Light client state management (current period, trusted header)
  index.ts            # Export new beacon verification functions
test/
  beacon/
    types.test.ts     # SSZ type tests
    fetch.test.ts     # Beacon API fetching tests
    sync.test.ts      # BLS verification tests
    integration.test.ts # Full light client sync test
```

### Light Client State

```typescript
interface LightClientState {
  /** The most recent finalized beacon block root */
  beaconRoot: string;
  /** Current sync committee period */
  period: number;
  /** Current sync committee public keys */
  syncCommittee: string[];
  /** Next sync committee (for lookahead) */
  nextSyncCommittee?: string[];
  /** Block header trusted via sync committee */
  trustedHeader?: {
    slot: number;
    stateRoot: string;
    executionPayload: {
      stateRoot: string;
      transactionsRoot: string;
      receiptsRoot: string;
    };
  };
}

interface LightClientUpdate {
  /** The beacon block root this update is for */
  beaconBlockRoot: string;
  /** Header of the beacon block */
  header: BeaconBlockHeader;
  /** Sync committee period this update is for */
  period: number;
  /** Sync committee contribution bits */
  participationBits: Uint8Array;
 /** BLS aggregate signature */
  signature: string;
 /** Finalized header (if update is final) */
  finalizedHeader?: BeaconBlockHeader;
 /** Next sync committee for the next period */
 nextSyncCommittee?: string[];
}
```

### Verification Flow

1. **Initialize Light Client**:
   - Fetch `LightClientBootstrap` for a known trusted checkpoint
   - Store initial sync committee and trusted header

2. **Sync Process**:
   - Fetch `LightClientUpdate` from Beacon API for current period
   - Verify `nextSyncCommittee` matches our expectations
   - Verify BLS aggregate signature using current sync committee
   - Update trusted header and sync committee

3. **Use in Verification**:
   - Get trusted state root from light client state
   - Pass to existing `verifyAccountProof`, `verifyTransactionProof`, etc.

### Risks and Unknowns

1. **BLS Library Compatibility**: Need to verify `@chainsafe/bls` works in browser/Node environments
2. **SSZ Versioning**: Beacon chain types evolve - need to handle version mismatches
3. **Update Frequency**: Light client updates happen every epoch (~6.4min)
4. **Memory Usage**: Storing full sync committee (~512 pubkeys) is acceptable

## Prioritization (Risk-First)

1. **SSZ Types Stubbing**: Define types first, no external dependencies
2. **BLS Verification**: Critical path - use established library
3. **Beacon API Fetching**: Standard HTTP, low risk
4. **State Management**: Simple store, can iterate
5. **Integration**: Replace RPC header last

## Prioritized Task List

### Step 1: Type Definitions (1 day)
- [ ] Create SSZ type definitions for beacon types
- [ ] Define LightClientUpdate, SyncCommittee, BeaconBlockHeader interfaces
- [ ] Create stub tests for type correctness

### Step 2: BLS Verification (2 days)
- [ ] Integrate BLS library
- [ ] Implement aggregate signature verification
- [ ] Test with known vectors

### Step 3: Beacon API Client (1 day)
- [ ] Implement fetch functions for beacon endpoints
- [ ] Handle both mainnet and testnet beacon chains
- [ ] Cache updates to reduce API calls

### Step 4: Light Client State (1 day)
- [ ] Implement state machine for sync
- [ ] Handle period transitions
- [ ] Store/load state from disk (optional)

### Step 5: Integration (2 days)
- [ ] Replace RPC block header in verifyTransferCommand
- [ ] Full integration test with public beacon API
- [ ] Performance testing

**Total Estimated Time**: 7 days

## Dependencies

### NPM Packages (to add)
- `@chainsafe/bls`: ^12.0.0
- `@chainsafe/ssz`: ^0.14.0

### External Services
- Beacon Chain API: `beaconcha.in` or Ethereum Foundation checkpoint endpoints
- Fallback: Multiple public endpoints available

## Success Criteria

1. **Cryptographic Trustlessness**: No RPC trust required after initial bootstrap
2. **Update Latency**: < 15 minutes to sync with beacon chain
3. **Compatibility**: Works with existing Phase 1-3 verification
4. **Test Coverage**: > 80% unit test coverage
5. **Performance**: < 100ms verification time

## Reference Documentation
- [Ethereum Light Client Sync Protocol](https://github.com/ethereum/consensus-specs/blob/master/specs/altair/light-client/sync-protocol.md)
- [BLS12-381 Signature Spec](https://github.com/ethereum/consensus-specs/blob/master/specs/phase0/beacon-chain.md#bls-signature)
- [SSZ Spec](https://github.com/ethereum/consensus-specs/blob/master/specs/phase0/simple-serialize.md)
