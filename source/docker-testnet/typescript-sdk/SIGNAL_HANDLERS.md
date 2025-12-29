# Signal Handler Implementation for Guaranteed Cleanup

## Problem Statement

**Original Issue**: The test suite only cleaned up Docker containers when:
- ✅ Tests completed successfully
- ✅ Tests failed with an exception
- ❌ **User pressed Ctrl+C (SIGINT)**
- ❌ **Process received SIGTERM**
- ❌ **Uncaught exceptions**

This could leave orphaned containers running, consuming resources and blocking ports.

## Solution: Process Signal Handlers

We now intercept all termination signals and ensure cleanup runs.

### Implementation

**File**: `test/verification.test.ts`

```typescript
// Global reference accessible from signal handlers
let globalTestnet: DockerTestnet | undefined;
let cleanupInProgress = false;

// Shared cleanup function
async function performCleanup(reason: string): Promise<void> {
    if (cleanupInProgress) return; // Prevent duplicate cleanup
    
    cleanupInProgress = true;
    console.log(`\n\n🛑 ${reason}`);
    
    if (globalTestnet) {
        await globalTestnet.teardown(); // docker compose down -v
    } else {
        // Manual docker compose down if testnet never initialized
    }
    
    cleanupInProgress = false;
}

// Install handlers BEFORE tests run
process.on("SIGINT", async () => {
    await performCleanup("Received SIGINT (Ctrl+C)");
    process.exit(130);
});

process.on("SIGTERM", async () => {
    await performCleanup("Received SIGTERM");
    process.exit(143);
});

process.on("uncaughtException", async (error) => {
    console.error("Uncaught exception:", error);
    await performCleanup("Uncaught exception occurred");
    process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
    console.error("Unhandled rejection:", reason);
    await performCleanup("Unhandled promise rejection");
    process.exit(1);
});
```

## Cleanup Scenarios - COMPLETE COVERAGE

| Scenario | Handled? | How |
|----------|----------|-----|
| **Normal completion** | ✅ YES | `afterAll` hook |
| **Test assertion fails** | ✅ YES | `afterAll` hook |
| **Setup fails** | ✅ YES | `afterAll` hook with manual cleanup |
| **Test timeout** | ✅ YES | `afterAll` hook |
| **Ctrl+C (SIGINT)** | ✅ **NOW YES** | Signal handler |
| **SIGTERM** | ✅ **NOW YES** | Signal handler |
| **Uncaught exception** | ✅ **NOW YES** | Signal handler |
| **Unhandled promise** | ✅ **NOW YES** | Signal handler |
| **kill -9 (SIGKILL)** | ❌ NO | Cannot be caught (OS limitation) |

## Testing the Signal Handlers

### Test 1: Normal Ctrl+C
```bash
npm test
# Press Ctrl+C during test run
# Should see: "🛑 Received SIGINT (Ctrl+C)"
# Should see: "✓ Testnet torn down successfully"
docker ps | grep atomica  # Should show NO containers
```

### Test 2: SIGTERM
```bash
npm test &
PID=$!
sleep 5
kill -TERM $PID
# Should see cleanup happen
docker ps | grep atomica  # Should show NO containers
```

### Test 3: Uncaught Exception
```typescript
// Temporarily add to beforeAll:
throw new Error("Simulated crash");
```
```bash
npm test
# Should see: "🛑 Uncaught exception occurred"
# Should see cleanup
docker ps | grep atomica  # Should show NO containers
```

## Exit Codes

Following Unix conventions:
- **0**: Success
- **1**: General error / uncaught exception
- **130**: SIGINT (Ctrl+C) - Standard for 128 + 2
- **143**: SIGTERM - Standard for 128 + 15

## Key Implementation Details

### 1. Global State
```typescript
let globalTestnet: DockerTestnet | undefined;
```
- Must be global so signal handlers can access it
- Updated in `beforeAll` after testnet creation
- Cleared in `afterAll` after cleanup

### 2. Duplicate Cleanup Prevention
```typescript
let cleanupInProgress = false;
```
- Prevents multiple signal handlers from running cleanup simultaneously
- Example: User presses Ctrl+C multiple times
- Prevents: "docker compose down" running twice in parallel

### 3. Cleanup Timeout
```typescript
setTimeout(() => {
    proc.kill();
    resolve();
}, 30000); // 30 second max
```
- Prevents cleanup from hanging forever
- If Docker is unresponsive, we timeout and exit
- User can manually clean up later

### 4. Non-Blocking Errors
```typescript
catch (error) {
    console.warn("⚠ Cleanup failed:", error);
    resolve(); // Don't throw
}
```
- Cleanup errors are warnings, not failures
- We still exit even if cleanup fails
- Provides manual cleanup instructions

## What Happens on Ctrl+C

```
User presses Ctrl+C
    ↓
SIGINT signal sent to process
    ↓
Our handler intercepts it
    ↓
Calls performCleanup("Received SIGINT (Ctrl+C)")
    ↓
Runs: globalTestnet.teardown()
    ↓
Runs: docker compose down -v
    ↓
Waits up to 30 seconds
    ↓
Exits with code 130
    ↓
✅ No orphaned containers!
```

## Limitations

### Cannot Handle:
1. **SIGKILL (kill -9)**: Cannot be caught by any program
2. **System crash**: If OS crashes, no cleanup
3. **Docker daemon crash**: Containers may be orphaned
4. **Power loss**: Obviously no cleanup

### Mitigation:
Always provide manual cleanup command in error messages:
```
Run manually: cd ../config && docker compose down -v
```

## Manual Cleanup (Last Resort)

If cleanup fails or process is killed with SIGKILL:

```bash
# From typescript-sdk directory
cd ../config
docker compose down -v --remove-orphans

# Or force remove everything
docker ps -a | grep atomica | awk '{print $1}' | xargs docker rm -f
docker volume ls | grep atomica | awk '{print $2}' | xargs docker volume rm
```

## Verification

To verify signal handlers are working:

```bash
# 1. Start test
npm test &
PID=$!

# 2. Wait for testnet to start (about 30 seconds)
sleep 30

# 3. Send SIGTERM
kill -TERM $PID

# 4. Verify cleanup happened
docker ps | grep atomica  # Should be empty
docker volume ls | grep atomica  # Should be empty

# Exit code should be 143
echo $?  # Should print 143
```

## Summary

✅ **The test suite NOW guarantees cleanup in all catchable scenarios**

- Normal completion: `afterAll` hook
- Test failures: `afterAll` hook  
- Setup failures: `afterAll` hook with manual cleanup
- **Ctrl+C**: **Signal handler (NEW)**
- **SIGTERM**: **Signal handler (NEW)**
- **Uncaught exceptions**: **Signal handler (NEW)**
- **Unhandled promises**: **Signal handler (NEW)**

The only scenario we CANNOT handle is `kill -9` (SIGKILL), which is an OS limitation that no program can overcome.
