# Cross-Chain Test Suite

This document describes the structure, responsibilities, and usage patterns of the Ethereum ↔ Aptos cross-chain test suite in `source/atomica-web/tests/meta/cross-chain/`.

This is intentionally a **descriptive engineering reference**, not a live pass/fail dashboard.

---

## Scope

The suite validates the lock-receipt bridge pipeline end-to-end:

- Minting FakeETH/FakeUSD on Ethereum
- Locking assets in LockBox
- Generating Ethereum state proofs
- Submitting proofs to Aptos `lock_receipt`
- Verifying replay protection
- Verifying type isolation across asset registries

---

## Layout

```text
tests/meta/cross-chain/
├── e2e-01-mint-tokens.test.ts
├── e2e-02-lock-fake-eth.test.ts
├── e2e-03-generate-proof.test.ts
├── e2e-04-submit-proof.test.ts
├── e2e-05-replay-protection.test.ts
├── e2e-06-type-isolation.test.ts
├── helpers/
│   ├── dual-chain-fixture.ts
│   └── aptos-view-utils.ts
└── lock-receipt-e2e.test.ts.old
```

### Legacy File

- `lock-receipt-e2e.test.ts.old` is the former monolithic test file retained for historical reference.

---

## Test Intent by File

### `e2e-01-mint-tokens.test.ts`

Purpose:

- Validate ERC20 mint flow on Ethereum for FakeETH and FakeUSD

Typical assertions:

- Mint transactions succeed
- Balance changes are reflected on-chain

### `e2e-02-lock-fake-eth.test.ts`

Purpose:

- Validate LockBox lock flow and storage key/value behavior

Typical assertions:

- Approval + lock succeed
- Locked balance matches expected amount
- Direct storage reads match the lock amount

### `e2e-03-generate-proof.test.ts`

Purpose:

- Validate proof generation inputs and `eth_getProof` compatibility

Typical assertions:

- Finalization wait completes
- On-chain/off-chain storage keys match
- Proof payload has account/storage proof nodes
- Storage value in proof matches expected lock value

### `e2e-04-submit-proof.test.ts`

Purpose:

- Validate Aptos-side proof submission and lock receipt creation

Typical assertions:

- `lock_receipt::register_ethereum_lock<...>()` transaction succeeds
- Receipt fields (user, amount, block, status) are correct
- Claimed/replay registry state updates as expected

### `e2e-05-replay-protection.test.ts`

Purpose:

- Validate duplicate-proof rejection

Typical assertions:

- Re-submitting the same lock proof fails
- Error surface indicates replay/already-claimed behavior

### `e2e-06-type-isolation.test.ts`

Purpose:

- Validate phantom-type registry isolation (`FakeETH` vs `FakeUSD`)

Typical assertions:

- Receipt counts and lock state remain isolated by asset type

---

## Shared Test Infrastructure

### `helpers/dual-chain-fixture.ts`

Central dual-chain setup/teardown utility used by E2E tests.

Responsibilities:

- Start Ethereum and Aptos testnets
- Deploy Ethereum contracts: FakeETH, FakeUSD, LockBox
- Deploy Aptos contracts/modules used by cross-chain tests
- Wait for module indexing and basic callability
- Provide typed handles to providers, signers, and deployed addresses
- Teardown both environments at the end of each test file

### `helpers/aptos-view-utils.ts`

Small wrapper utilities for repeated Aptos view patterns used in assertions.

---

## Supporting Utilities Outside This Folder

### `tests/meta/aptos/helpers/module-indexing-utils.ts`

Used by the shared fixture for robust module-index wait logic.

### `tests/meta/ethereum/solidity-compiler.ts`

Compiles and loads Foundry artifacts used by the fixture and orchestration scripts.

### `tests/meta/helpers/transaction-utils.ts`

Shared transaction helper layer used by related meta tests.

---

## Execution Model

Each file is self-contained and follows this pattern:

1. `beforeAll`: setup fixture and prerequisite chain state
2. test body: execute scenario-specific operation
3. assertions: verify chain state and contract-level invariants
4. `afterAll`: teardown fixture

Design goals:

- Scenario-level isolation
- Deterministic setup within each file
- Fresh proof generation (no hardcoded stale fixtures)

---

## Running the Suite

From `source/atomica-web`:

```bash
# Entire cross-chain suite
bun test tests/meta/cross-chain/

# Individual files
bun test tests/meta/cross-chain/e2e-01-mint-tokens.test.ts
bun test tests/meta/cross-chain/e2e-02-lock-fake-eth.test.ts
bun test tests/meta/cross-chain/e2e-03-generate-proof.test.ts
bun test tests/meta/cross-chain/e2e-04-submit-proof.test.ts
bun test tests/meta/cross-chain/e2e-05-replay-protection.test.ts
bun test tests/meta/cross-chain/e2e-06-type-isolation.test.ts
```

Optional timeout override for heavier scenarios:

```bash
bun test tests/meta/cross-chain/e2e-04-submit-proof.test.ts --timeout 600000
```

---

## Preconditions

Expected local prerequisites:

- Docker available and healthy
- Bun dependencies installed
- Local testnet SDK dependencies prepared (`prepare:all` for full orchestration paths)
- Foundry available for Solidity artifact build paths

---

## Failure Modes to Watch

This section captures common classes of failures, not current status.

### Module indexing delays

Symptom:

- Aptos module not visible/callable immediately after deployment

Mitigation:

- Use `module-indexing-utils` backoff helpers via fixture

### `eth_getProof` storage mismatches

Symptom:

- Proof contains unexpected zero values or key mismatches

Mitigation:

- Ensure lock key calculation matches the current LockBox storage model
- See `docs/development/ethereum-storage-proof-quirks.md`

### Transaction sequencing and nonce collisions

Symptom:

- Replacement/nonce errors under rapid transaction dispatch

Mitigation:

- Serialize dependent transactions and await receipts
- Use explicit nonce handling where needed in tests/helpers

### Insufficient finality wait

Symptom:

- Proof generated from a not-yet-finalized block causes inconsistent downstream checks

Mitigation:

- Wait for configured confirmation blocks before proof generation

---

## Extending the Suite

When adding new cross-chain scenarios:

1. Keep one behavior focus per test file
2. Reuse `dual-chain-fixture.ts` and avoid ad-hoc setup duplication
3. Generate fresh lock/proof data in `beforeAll`
4. Assert both success path and key invariants
5. Add replay/security checks if the new flow introduces mutable registration state
6. Prefer deterministic amounts and explicit block/finality waits

---

## Related Docs

- `docs/plans/implementation-plan.md`
- `docs/technical/cross-chain-lock-receipt-e2e-test-plan.md`
- `docs/development/ethereum-storage-proof-quirks.md`
- `docs/development/refactor-summary.md`

---

## Notes

- This document avoids pass/fail and completion claims by design.
- Use CI logs and test outputs for current runtime status.
