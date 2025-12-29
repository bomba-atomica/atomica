# Fix: waitForBlocks - Block Height vs Ledger Version

## Bug Report

**Symptom:**
```
Waiting for 5 blocks (from version 44 to 49)
✓ Reached target version 50
Final Height: 25

error: expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 5
Received: 3
```

**Root Cause:** `waitForBlocks()` was waiting for **ledger versions** instead of **block heights**.

## Understanding the Difference

### Ledger Version (Transaction Count)
- Increments by 1 for each transaction
- Can increment multiple times per block
- Example: Block 22 might contain versions 44-47 (4 transactions)

### Block Height (Block Count)  
- Increments by 1 for each block
- One block can contain 0 or more transactions
- Example: Blocks 22-25 = 4 blocks, but could be 10+ versions

## The Bug

**Before (WRONG):**
```typescript
async waitForBlocks(numBlocks: number, ...) {
    const startVersion = parseInt((await this.getLedgerInfo(0)).ledger_version, 10);
    const targetVersion = startVersion + numBlocks; // ❌ Versions, not blocks!
    
    console.log(`Waiting for ${numBlocks} blocks (from version ${startVersion}...`);
    
    while (...) {
        const currentVersion = parseInt((await ...).ledger_version, 10);
        if (currentVersion >= targetVersion) { // ❌ Comparing versions!
            return;
        }
    }
}
```

**What happened:**
- Called `waitForBlocks(5, ...)`
- Waited for 5 ledger **versions** (transactions)
- Versions went from 44 → 50 (6 versions) ✅
- But blocks only went from 22 → 25 (3 blocks) ❌
- Test expected 5 blocks, got 3 → FAIL

## The Fix

**After (CORRECT):**
```typescript
async waitForBlocks(numBlocks: number, ...) {
    const startInfo = await this.getLedgerInfo(0);
    const startHeight = parseInt(startInfo.block_height, 10); // ✅ Block height!
    const targetHeight = startHeight + numBlocks; // ✅ Blocks!
    
    console.log(`Waiting for ${numBlocks} blocks (from height ${startHeight} to ${targetHeight})`);
    
    while (...) {
        const currentInfo = await this.getLedgerInfo(0);
        const currentHeight = parseInt(currentInfo.block_height, 10); // ✅ Block height!
        
        if (currentHeight >= targetHeight) { // ✅ Comparing blocks!
            console.log(`✓ Reached target height ${currentHeight}`);
            return;
        }
    }
}
```

**What happens now:**
- Call `waitForBlocks(5, ...)`
- Waits for 5 **block heights**
- Blocks go from 22 → 27 (5 blocks) ✅
- Test expects 5 blocks, gets 5+ → PASS ✅

## Enhanced Logging

Added debug logging to show progress:
```typescript
debug(`Block progress: ${currentHeight}/${targetHeight}`, {
    current_height: currentHeight,
    target_height: targetHeight,
    current_version: currentInfo.ledger_version,
    epoch: currentInfo.epoch,
});
```

Enable with: `DEBUG_TESTNET=1 npm test`

Output:
```
[DEBUG] Block progress: 23/27 {"current_height":23,"target_height":27,"current_version":47}
[DEBUG] Block progress: 24/27 {"current_height":24,"target_height":27,"current_version":49}
[DEBUG] Block progress: 25/27 {"current_height":25,"target_height":27,"current_version":51}
...
```

## Expected Test Output Now

```
Verifying block production...
Initial Height: 22
Waiting for 5 blocks (from height 22 to 27)
  ✓ Reached target height 27
Final Height: 27
✓ Block production verified!
```

## Relationship Between Versions and Blocks

```
Block Height: 22    23    24    25    26    27
              |     |     |     |     |     |
Versions:     44-46 47-48 49    50-51 52    53-54

Block 22: 3 transactions (versions 44, 45, 46)
Block 23: 2 transactions (versions 47, 48)
Block 24: 1 transaction  (version 49)
Block 25: 2 transactions (versions 50, 51)
Block 26: 1 transaction  (version 52)
Block 27: 2 transactions (versions 53, 54)
```

So when we wait for 5 blocks (22 → 27):
- ✅ Block height increases by 5
- Ledger version might increase by 11 (variable)

## Files Modified

- `src/index.ts:234-262` - Fixed `waitForBlocks()` to use block_height instead of ledger_version

## Testing

```bash
npm run build
npm test

# Should see:
# "Waiting for 5 blocks (from height X to Y)"  ← Shows HEIGHT not VERSION
# "✓ Reached target height Z"
# Test passes ✅
```
