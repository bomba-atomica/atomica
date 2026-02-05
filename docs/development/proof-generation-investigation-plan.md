# Proof Generation Investigation Plan

## Executive Summary

**Problem:** Cross-chain proof-generation test hangs/times out locally. Recent commits show escalating timeout increases (30s → 120s → 300s), suggesting an underlying error being masked rather than genuine slow performance.

**Goal:** Identify and fix the root cause preventing proof generation from completing, resulting in a passing proof-generation test suite.

**Approach:** Systematically test each step in isolation to identify where the failure occurs.

---

## Current State Analysis

### Test Files
1. **`tests/meta/ethereum/proof-generation.test.ts`** - 7 tests (4 timeout-sensitive)
2. **`tests/meta/cross-chain/lock-receipt-e2e.test.ts`** - 7 tests (cross-chain flow)

### Recent Timeout Evolution
- Initial: 30,000ms (30s)
- Commit `41b61a5`: 120,000ms (120s) - "increase timeout for proof generation waiting for block mining"
- Commit `4af5343`: 300,000ms (300s) - "increase proof generation timeout to 300s and add block logging"

**Red Flag:** Escalating timeouts suggest masking an error, not accommodating slow performance.

### Critical Dependencies
- **`pollUntil()`** - Helper in `tests/meta/helpers/transaction-utils.ts`
- **`generateLockedBalanceProof()`** - Core function in `src/lib/ethereum/proofs/generator.ts`
- **`@atomica/state-proof-verifier`** - Package providing `eth_getProof` access

---

## Investigation Strategy

### Phase 1: Isolate Each Step in the Proof Generation Flow

Test each step individually with granular error reporting and timeouts.

#### Step 1.1: Token Locking (Ethereum Transaction)
**Location:** `tests/meta/ethereum/proof-generation.test.ts` - setup and lock tests

**What to verify:**
- [ ] Transaction submitted successfully
- [ ] Transaction mined within reasonable time (< 30s)
- [ ] Transaction receipt received with blockNumber
- [ ] Transaction status is 1 (success)
- [ ] Token balance updated in contract

**Test isolation:**
```typescript
describe("Step 1: Token Locking", () => {
  it("should lock tokens and get block number within 30s", async () => {
    const startTime = Date.now();

    // Mint tokens
    const mintTx = await fakeETH.mint(user.address, parseEther("100"));
    await mintTx.wait();
    console.log(`[${Date.now() - startTime}ms] Minted tokens`);

    // Approve LockBox
    const approveTx = await fakeETH.approve(lockBoxAddress, parseEther("50"));
    await approveTx.wait();
    console.log(`[${Date.now() - startTime}ms] Approved LockBox`);

    // Lock tokens
    const lockTx = await lockBox.lock(fakeETHAddress, parseEther("50"));
    const receipt = await lockTx.wait();
    console.log(`[${Date.now() - startTime}ms] Lock tx mined at block ${receipt.blockNumber}`);

    expect(receipt.status).toBe(1);
    expect(receipt.blockNumber).toBeGreaterThan(0);
    expect(Date.now() - startTime).toBeLessThan(30000); // Should complete in < 30s
  }, 45000);
});
```

**Expected outcome:** Lock completes in < 30s. If this fails, issue is with Ethereum testnet setup.

---

#### Step 1.2: Block Production & State Indexing
**Critical step:** Wait for `blockNumber + 1` to be mined

**What to verify:**
- [ ] Current block progresses beyond lock block
- [ ] Block production is consistent (not stalled)
- [ ] Target block (`lockBlock + 1`) is reached
- [ ] Block production time is reasonable (< 15s per block)

**Test isolation:**
```typescript
describe("Step 2: Block Production", () => {
  it("should mine target block within 60s of lock", async () => {
    const startTime = Date.now();

    // Lock tokens first
    const lockTx = await lockBox.lock(fakeETHAddress, parseEther("50"));
    const receipt = await lockTx.wait();
    const lockBlock = receipt.blockNumber;
    const targetBlock = lockBlock + 1;

    console.log(`Lock mined at block ${lockBlock}, waiting for block ${targetBlock}`);

    // Poll for target block
    const result = await pollUntil(
      async () => {
        const currentBlock = await provider.getBlockNumber();
        const elapsed = Date.now() - startTime;
        console.log(`[${elapsed}ms] Current block: ${currentBlock}, Target: ${targetBlock}`);
        return { currentBlock, targetBlock };
      },
      (result) => result.currentBlock >= result.targetBlock,
      {
        description: `block ${targetBlock} to be mined`,
        interval: 1000, // Check every second
        timeout: 60000, // Should happen in < 60s
      }
    );

    const elapsed = Date.now() - startTime;
    console.log(`Target block reached in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(60000);
  }, 90000);
});
```

**Expected outcome:** Target block reached in < 60s. If this fails, Ethereum testnet block production is stalled or misconfigured.

---

#### Step 1.3: Storage Key Calculation
**Function:** `calculateLockedBalanceStorageKey()`

**What to verify:**
- [ ] Storage key calculated correctly
- [ ] Matches on-chain contract calculation
- [ ] No errors in keccak256 hashing
- [ ] Handles address padding correctly

**Test isolation:**
```typescript
describe("Step 3: Storage Key Calculation", () => {
  it("should calculate storage key correctly", async () => {
    const storageKey = calculateLockedBalanceStorageKey(
      userAddress,
      tokenAddress
    );

    console.log(`Calculated storage key: ${storageKey}`);

    // Verify against on-chain calculation
    const onChainKey = await lockBox.getStorageKey(userAddress, tokenAddress);

    expect(storageKey).toBe(onChainKey);
    expect(storageKey).toMatch(/^0x[0-9a-f]{64}$/i); // Valid hex string
  });
});
```

**Expected outcome:** Off-chain calculation matches on-chain. If this fails, storage key algorithm is broken.

---

#### Step 1.4: eth_getProof RPC Call
**Critical:** This is likely where the hang occurs

**What to verify:**
- [ ] RPC endpoint is accessible
- [ ] Request parameters are valid
- [ ] Response received within reasonable time (< 10s)
- [ ] Response contains required fields
- [ ] No network errors or timeouts

**Test isolation:**
```typescript
describe("Step 4: eth_getProof RPC", () => {
  it("should fetch proof via eth_getProof within 10s", async () => {
    const startTime = Date.now();

    // Setup: Lock tokens and wait for target block
    const lockTx = await lockBox.lock(fakeETHAddress, parseEther("50"));
    const receipt = await lockTx.wait();
    const targetBlock = receipt.blockNumber + 1;

    // Wait for target block
    await pollUntil(
      async () => provider.getBlockNumber(),
      (current) => current >= targetBlock,
      { timeout: 60000 }
    );

    console.log(`Fetching proof at block ${targetBlock}`);

    // Calculate storage key
    const storageKey = calculateLockedBalanceStorageKey(userAddress, fakeETHAddress);

    // Direct eth_getProof call with timeout
    const proofPromise = provider.send("eth_getProof", [
      lockBoxAddress,
      [storageKey],
      `0x${targetBlock.toString(16)}`, // Block number in hex
    ]);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("eth_getProof timeout after 10s")), 10000)
    );

    const proof = await Promise.race([proofPromise, timeoutPromise]);
    const elapsed = Date.now() - startTime;

    console.log(`eth_getProof completed in ${elapsed}ms`);
    console.log(`Proof structure:`, {
      accountProofLength: proof.accountProof?.length,
      storageProofLength: proof.storageProof?.[0]?.proof?.length,
      storageValue: proof.storageProof?.[0]?.value,
    });

    expect(proof).toBeDefined();
    expect(proof.accountProof).toBeDefined();
    expect(proof.storageProof).toBeDefined();
    expect(elapsed).toBeLessThan(10000);
  }, 90000);
});
```

**Expected outcome:** Proof returned in < 10s. If this hangs, issue is with:
- Ethereum node RPC endpoint not supporting `eth_getProof`
- Network connectivity to node
- Node state indexing issues
- Invalid request parameters

---

#### Step 1.5: Proof Validation
**Function:** `validateProof()`

**What to verify:**
- [ ] Proof structure is complete
- [ ] blockHash is not zero
- [ ] stateRoot is not zero
- [ ] accountProof is non-empty array
- [ ] storageProof is non-empty array
- [ ] storageValue matches expected amount

**Test isolation:**
```typescript
describe("Step 5: Proof Validation", () => {
  it("should validate proof structure", async () => {
    // Generate proof first (assumes Step 4 works)
    const proof = await generateLockedBalanceProof(
      provider,
      lockBoxAddress,
      userAddress,
      fakeETHAddress,
      targetBlock
    );

    console.log("Proof structure:", {
      blockHash: proof.blockHash,
      stateRoot: proof.stateRoot,
      accountProofNodes: proof.accountProof.length,
      storageProofNodes: proof.storageProof.length,
      storageValue: proof.storageValue.toString(),
    });

    // Validate
    const validation = validateProof(proof);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(proof.blockHash).not.toBe("0x0000000000000000000000000000000000000000000000000000000000000000");
    expect(proof.stateRoot).not.toBe("0x0000000000000000000000000000000000000000000000000000000000000000");
    expect(proof.accountProof.length).toBeGreaterThan(0);
    expect(proof.storageProof.length).toBeGreaterThan(0);
  });
});
```

**Expected outcome:** Proof passes validation. If this fails, proof generation returned incomplete data.

---

#### Step 1.6: Aptos Serialization
**Function:** `serializeProofForAptos()`

**What to verify:**
- [ ] Hex prefixes removed correctly
- [ ] Nested arrays formatted correctly
- [ ] storageValue converted to u256
- [ ] No data corruption

**Test isolation:**
```typescript
describe("Step 6: Aptos Serialization", () => {
  it("should serialize proof for Aptos submission", async () => {
    const proof = await generateLockedBalanceProof(
      provider,
      lockBoxAddress,
      userAddress,
      fakeETHAddress,
      targetBlock
    );

    const serialized = serializeProofForAptos(proof);

    console.log("Serialized proof:", serialized);

    // Verify format
    expect(serialized.block_hash).not.toMatch(/^0x/); // No 0x prefix
    expect(serialized.state_root).not.toMatch(/^0x/);
    expect(serialized.account_proof).toBeInstanceOf(Array);
    expect(serialized.storage_proof).toBeInstanceOf(Array);
    expect(typeof serialized.storage_value).toBe("string"); // u256 as string
  });
});
```

**Expected outcome:** Serialization succeeds without errors.

---

#### Step 1.7: Aptos Submission (E2E Only)
**Function:** `register_ethereum_lock()` on Aptos

**What to verify:**
- [ ] Aptos node is running
- [ ] Contract deployed correctly
- [ ] Transaction submitted successfully
- [ ] Proof verification passes on-chain
- [ ] Lock receipt created

**Test isolation:**
```typescript
describe("Step 7: Aptos Submission", () => {
  it("should submit proof to Aptos and create receipt", async () => {
    // Generate and serialize proof (assumes Steps 4-6 work)
    const proof = await generateLockedBalanceProof(...);
    const serialized = serializeProofForAptos(proof);

    const startTime = Date.now();

    // Submit to Aptos
    const txResponse = await aptosClient.submitTransaction(
      user,
      {
        function: `${moduleAddress}::lock_receipt::register_ethereum_lock`,
        type_arguments: [`${moduleAddress}::fake_eth::FakeETH`],
        arguments: [
          serialized.block_hash,
          serialized.state_root,
          serialized.contract_address,
          serialized.storage_key,
          serialized.storage_value,
          serialized.account_proof,
          serialized.storage_proof,
        ],
      }
    );

    await aptosClient.waitForTransaction(txResponse.hash);
    const elapsed = Date.now() - startTime;

    console.log(`Aptos submission completed in ${elapsed}ms`);

    // Verify receipt created
    const receipt = await aptosClient.view({
      function: `${moduleAddress}::lock_receipt::get_receipt`,
      type_arguments: [`${moduleAddress}::fake_eth::FakeETH`],
      arguments: [user.address],
    });

    expect(receipt).toBeDefined();
    expect(elapsed).toBeLessThan(30000);
  }, 60000);
});
```

**Expected outcome:** Submission succeeds in < 30s. If this fails, issue is with Aptos node or contract.

---

### Phase 2: Diagnose `pollUntil()` Behavior

The `pollUntil()` function is critical. It may be:
- Not throwing errors properly
- Swallowing exceptions
- Never reaching success condition
- Timing out without informative errors

**Enhanced logging version:**

```typescript
export async function pollUntil<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  options: {
    interval?: number;
    timeout?: number;
    description?: string;
  } = {}
): Promise<T> {
  const interval = options.interval ?? 500;
  const timeout = options.timeout ?? 30000;
  const description = options.description ?? "condition";
  const startTime = Date.now();

  let attemptCount = 0;
  let lastError: Error | null = null;
  let lastResult: T | null = null;

  while (Date.now() - startTime < timeout) {
    attemptCount++;
    const elapsed = Date.now() - startTime;

    try {
      console.log(`[pollUntil] Attempt ${attemptCount} at ${elapsed}ms for ${description}`);

      const result = await fn();
      lastResult = result;
      lastError = null;

      console.log(`[pollUntil] Function succeeded, checking condition...`);

      if (condition(result)) {
        console.log(`[pollUntil] ✓ Condition met after ${attemptCount} attempts (${elapsed}ms)`);
        return result;
      }

      console.log(`[pollUntil] Condition not yet met, waiting ${interval}ms...`);
    } catch (error) {
      lastError = error as Error;
      console.log(`[pollUntil] Attempt failed: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // Timeout reached
  const elapsed = Date.now() - startTime;
  const errorMsg = [
    `Timeout waiting for ${description} after ${attemptCount} attempts (${elapsed}ms)`,
    lastError ? `Last error: ${lastError.message}` : null,
    lastResult ? `Last result: ${JSON.stringify(lastResult)}` : null,
  ].filter(Boolean).join("\n");

  throw new Error(errorMsg);
}
```

**Test with enhanced logging:**
```typescript
describe("pollUntil Diagnostics", () => {
  it("should log detailed attempt information", async () => {
    const lockTx = await lockBox.lock(fakeETHAddress, parseEther("50"));
    const receipt = await lockTx.wait();
    const targetBlock = receipt.blockNumber + 1;

    try {
      await pollUntil(
        async () => {
          const currentBlock = await provider.getBlockNumber();
          console.log(`Current: ${currentBlock}, Target: ${targetBlock}`);

          if (currentBlock < targetBlock) {
            throw new Error(`Block ${targetBlock} not yet mined (current: ${currentBlock})`);
          }

          return generateLockedBalanceProof(
            provider,
            lockBoxAddress,
            userAddress,
            fakeETHAddress,
            targetBlock
          );
        },
        (proof) => {
          const matches = proof.storageValue === parseEther("50");
          console.log(`Storage value: ${proof.storageValue}, Expected: ${parseEther("50")}, Match: ${matches}`);
          return matches;
        },
        {
          description: "proof with correct balance",
          interval: 2000, // 2s for more readable logs
          timeout: 60000, // 1 min
        }
      );
    } catch (error) {
      console.error("Full error:", error);
      throw error;
    }
  }, 90000);
});
```

---

### Phase 3: Network & Infrastructure Checks

#### 3.1: Ethereum Node Health
```typescript
describe("Ethereum Node Health", () => {
  it("should verify node is synced and responsive", async () => {
    const startTime = Date.now();

    // Check basic connectivity
    const blockNumber = await provider.getBlockNumber();
    console.log(`Current block: ${blockNumber}`);

    // Check if node is syncing
    const syncing = await provider.send("eth_syncing", []);
    console.log(`Syncing status:`, syncing);
    expect(syncing).toBe(false); // Should not be syncing

    // Check block production (wait for 2 blocks)
    const block1 = await provider.getBlockNumber();
    await new Promise((resolve) => setTimeout(resolve, 15000)); // Wait 15s
    const block2 = await provider.getBlockNumber();

    console.log(`Blocks produced in 15s: ${block2 - block1}`);
    expect(block2).toBeGreaterThan(block1); // Should produce at least 1 block

    // Check eth_getProof support
    try {
      await provider.send("eth_getProof", [
        "0x0000000000000000000000000000000000000000",
        [],
        "latest",
      ]);
      console.log("✓ eth_getProof supported");
    } catch (error) {
      console.error("✗ eth_getProof not supported:", error.message);
      throw new Error("Node does not support eth_getProof");
    }
  }, 30000);
});
```

#### 3.2: Aptos Node Health (for E2E tests)
```typescript
describe("Aptos Node Health", () => {
  it("should verify Aptos node is healthy", async () => {
    // Check connectivity
    const ledgerInfo = await aptosClient.getLedgerInfo();
    console.log(`Aptos ledger version: ${ledgerInfo.ledger_version}`);

    // Check account exists
    const account = await aptosClient.getAccount(user.address);
    console.log(`User account sequence: ${account.sequence_number}`);

    // Check module deployed
    const moduleExists = await aptosClient.getAccountModule(
      moduleAddress,
      "lock_receipt"
    );
    expect(moduleExists).toBeDefined();
    console.log("✓ lock_receipt module deployed");
  });
});
```

---

### Phase 4: Root Cause Hypothesis Testing

Based on investigation, test specific hypotheses:

#### Hypothesis 1: `eth_getProof` Not Supported
**Test:** Call `eth_getProof` directly on node
**Fix:** Use different Ethereum client (Geth, Erigon) or enable archive mode

#### Hypothesis 2: State Not Indexed at Target Block
**Test:** Query storage at "latest" vs specific block
**Fix:** Wait longer or query at "latest" block

#### Hypothesis 3: Storage Key Calculation Error
**Test:** Compare off-chain vs on-chain calculation
**Fix:** Fix `calculateLockedBalanceStorageKey()` algorithm

#### Hypothesis 4: Network Timeout/Firewall
**Test:** Check network connectivity, increase RPC timeout
**Fix:** Configure firewall, use different network

#### Hypothesis 5: Race Condition in `pollUntil()`
**Test:** Add mutex/locking to `pollUntil()`
**Fix:** Ensure sequential execution

#### Hypothesis 6: Ethereum Testnet Misconfiguration
**Test:** Check genesis config, validator setup
**Fix:** Recreate testnet with correct config

---

## Implementation Checklist

### Week 1: Isolation Testing
- [ ] Create new test file: `tests/meta/ethereum/proof-generation-isolated.test.ts`
- [ ] Implement Step 1.1: Token Locking test
- [ ] Implement Step 1.2: Block Production test
- [ ] Implement Step 1.3: Storage Key test
- [ ] Implement Step 1.4: eth_getProof test (CRITICAL)
- [ ] Run tests and collect logs

### Week 2: Diagnosis & Fix
- [ ] Analyze logs from isolated tests
- [ ] Identify failing step
- [ ] Test root cause hypotheses
- [ ] Implement fix
- [ ] Verify fix with isolated tests

### Week 3: Integration & Validation
- [ ] Re-enable full proof-generation tests
- [ ] Run E2E cross-chain tests
- [ ] Reduce timeout back to reasonable value (60s)
- [ ] Update documentation
- [ ] Clean up debug logging

---

## Success Criteria

1. **All isolated step tests pass** with < 30s timeout each
2. **`eth_getProof` call completes** in < 10s consistently
3. **Full proof generation completes** in < 60s (not 300s)
4. **E2E cross-chain tests pass** without timeouts
5. **Zero hangs** on local development machines
6. **Clear error messages** when failures occur (not silent timeouts)

---

## Monitoring & Metrics

Track these metrics during investigation:

| Metric | Target | Current |
|--------|--------|---------|
| Token lock time | < 5s | ? |
| Block production time | < 12s per block | ? |
| Storage key calculation | < 100ms | ? |
| eth_getProof response time | < 5s | ? |
| Proof validation time | < 1s | ? |
| Total proof generation | < 60s | 300s (timeout) |

---

## Rollback Plan

If investigation stalls:
1. Document findings in this file
2. Revert to 300s timeout temporarily
3. Add comprehensive logging to production tests
4. Collect logs from CI environment
5. Compare CI vs local behavior

---

## Next Steps

1. **Start with Phase 1, Step 1.4** (eth_getProof isolation) - most likely culprit
2. Run test locally and capture full logs
3. If eth_getProof hangs, check Ethereum node configuration
4. If eth_getProof succeeds, move to Step 1.2 (block production)
5. Document all findings in this file

---

## References

- Test files:
  - `tests/meta/ethereum/proof-generation.test.ts`
  - `tests/meta/cross-chain/lock-receipt-e2e.test.ts`
- Implementation:
  - `src/lib/ethereum/proofs/generator.ts`
  - `src/lib/ethereum/proofs/storage-key.ts`
- Helpers:
  - `tests/meta/helpers/transaction-utils.ts` (pollUntil)
- Recent commits:
  - `4af5343` - 300s timeout increase
  - `41b61a5` - 120s timeout increase
  - `676989b` - pollUntil implementation
