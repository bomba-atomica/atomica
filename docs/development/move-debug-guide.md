# Getting Debug Output from Move Contracts

## TL;DR

To enable full debugging capabilities (both `debug::print()` output and MoveVM instruction tracing), you must build `aptos` with specific features:

```bash
cd zapatos
cargo build -p aptos --features "move-vm-runtime/debugging testing"
```

Then run the local testnet with the `MOVE_VM_TRACE` environment variable:

```bash
MOVE_VM_TRACE=trace.log ./target/debug/aptos node run-local-testnet --with-faucet
```

**Key Points:**
*   `debug::print()` requires the `testing` feature.
*   Instruction tracing requires the `move-vm-runtime/debugging` feature.

### Instruction Tracing (Advanced)
For deep debugging of the Move VM execution (opcode by opcode), you can enable instruction tracing. This requires the `move-vm-runtime/debugging` feature.

This allows you to see the exact execution flow, including stack values and instructions as they are executed.


```rust
if cfg!(feature = "testing") {
    println!("[debug] {}", output);
}
```

This means:
- ❌ Regular `aptos node run-local-testnet` → No debug output
- ❌ `RUST_LOG=debug aptos node ...` → No debug output
- ✅ `cargo run --features testing --bin aptos -- node ...` → Debug output works!

## How Debug Output Works

### 1. Move Contract Side

```move
use aptos_std::debug;

fun my_function() {
    debug::print(&b"Hello from Move!");
    debug::print(&some_variable);
}
```

### 2. Rust Native Implementation

Located in: `zapatos/aptos-move/framework/src/natives/debug.rs`

```rust
pub fn native_print(
    _context: &mut SafeNativeContext,
    _ty_args: Vec<Type>,
    mut args: VecDeque<Value>,
) -> SafeNativeResult<SmallVec<[Value; 1]>> {
    let val = pop_arg!(args, StructRef);

    // THIS IS THE KEY LINE - only prints if "testing" feature enabled
    if cfg!(feature = "testing") {
        let output = debug_display(&val.read_ref()?)?;
        println!("[debug] {}", output);  // Goes to stdout
    }

    Ok(smallvec![])
}
```

### 3. Output Format

When enabled, you'll see in the testnet stdout:

```
[debug] b"=== ETHEREUM DERIVABLE ACCOUNT DEBUG ==="
[debug] b"Entry function name:"
[debug] [48, 120, 49, 58, 58, 97, 112, 116, 111, 115, 95, 97, 99, 99, 111, 117, 110, 116, 58, 58, 116, 114, 97, 110, 115, 102, 101, 114]
[debug] b"Ethereum address:"
[debug] [48, 120, 55, 55, 101, 99, 53, 55, ...]
```

## Running Testnet with Debug Output

### Method 1: Use the Script (Recommended)

```bash
cd /Users/lucas/code/rust/atomica/source/atomica-web
./scripts/run-testnet-with-debug.sh 2>&1 | tee logs/testnet-debug.log
```

This script:
- Builds with `--features testing`
- Sets appropriate RUST_LOG levels
- Captures output to a log file

### Method 2: Manual Command

```bash
cd /Users/lucas/code/rust/atomica/source/atomica-aptos

# Set Rust logging
export RUST_LOG=aptos_vm=debug,move_vm_runtime=debug

# Run with testing features
cargo run --features testing --bin aptos -- node run-local-testnet --with-faucet
```

### Method 3: Build Once, Run Multiple Times

```bash
cd /Users/lucas/code/rust/atomica/source/atomica-aptos

# Build with testing features
cargo build --release --features testing --bin aptos

# Run the built binary
RUST_LOG=aptos_vm=debug ./target/release/aptos node run-local-testnet --with-faucet
```

## What Debug Output You'll See

From our added debug logging in `ethereum_derivable_account.move`:

```
[debug] b"=== ETHEREUM DERIVABLE ACCOUNT DEBUG ==="
[debug] b"Entry function name:"
[debug] [48, 120, 49, 58, 58, ...]  # This is "0x1::aptos_account::transfer" in bytes

[debug] b"Ethereum address:"
[debug] [48, 120, 55, 55, ...]      # This is "0x77ec57..." in bytes

[debug] b"Domain:"
[debug] [108, 111, 99, 97, ...]     # This is "localhost:4173" in bytes

[debug] b"Digest (hex string):"
[debug] [48, 120, 102, 55, ...]     # This is "0xf790..." in bytes

[debug] b"Constructed SIWE message:"
[debug] [108, 111, 99, 97, ...]     # Full SIWE message bytes

[debug] b"Message length:"
[debug] 441

[debug] b"Recovered Ethereum address (bytes):"
[debug] [119, 236, 87, ...]

[debug] b"Expected Ethereum address (bytes):"
[debug] [119, 236, 87, ...]

[debug] b"Addresses match:"
[debug] true

[debug] b"=== SIGNATURE VERIFICATION PASSED ==="
```

## MoveVM Instruction Tracing (Advanced)

If `debug::print` is not enough and you need to see exactly what the VM is doing (stack operations, instructions), you can enable full instruction tracing.

### 1. Build with Debugging Features

You must rebuild `aptos` with both `move-vm-runtime/debugging` (for tracing) and `testing` (for `debug::print`):

```bash
cd /Users/lucas/code/rust/atomica/source/atomica-aptos
cargo build -p aptos --features "move-vm-runtime/debugging testing"
# Binary will be at: target/debug/aptos
```

### 2. Run with Tracing Environment Variable

Set `MOVE_VM_TRACE` to the desired log file path when running the node:

```bash
# Ensure you use the binary you just built
export PATH="/Users/lucas/code/rust/atomica/source/atomica-aptos/target/debug:$PATH"

# Run localnet with tracing enabled
MOVE_VM_TRACE=./logs/vm-trace.log aptos node run-local-testnet --with-faucet --force-restart
```

### 3. Analyze the Trace

The trace file will contain a detailed log of every instruction executed:

```
0x1::aptos_account::transfer, 0
    [0] LdU8(123)
    [1] Call(0)
    ...
```


## Converting Byte Arrays to Strings

The debug output shows byte arrays. To convert them:

### JavaScript/Browser Console
```javascript
const bytes = [48, 120, 49, 58, 58, 97, 112, 116, 111, 115];
const str = String.fromCharCode(...bytes);
console.log(str);  // "0x1::aptos"
```

### Python
```python
bytes_arr = [48, 120, 49, 58, 58, 97, 112, 116, 111, 115]
string = ''.join(chr(b) for b in bytes_arr)
print(string)  # "0x1::aptos"
```

### Bash/Command Line
```bash
echo -e "$(echo '[48,120,49,58,58,97,112,116,111,115]' | \
  sed 's/\[//;s/\]//;s/,/\\x/g;s/^/\\x/')"
```

## Analyzing the Output

### What to Look For

1. **Entry Function Name**
   - Should be: `0x1::aptos_account::transfer`
   - Bytes: `[48, 120, 49, 58, 58, 97, 112, 116, 111, 115, 95, 97, 99, 99, 111, 117, 110, 116, 58, 58, 116, 114, 97, 110, 115, 102, 101, 114]`
   - If different → **This is the bug!**

2. **SIWE Message**
   - Compare the full message bytes with what TypeScript signed
   - Any difference means signature will fail

3. **Address Match**
   - Should show `true`
   - If `false` → Signature doesn't verify

### Filtering the Log

```bash
# Get just the debug output
grep "\[debug\]" logs/testnet-debug.log

# Get debug output for a specific transaction
grep "\[debug\]" logs/testnet-debug.log | tail -n 50

# Extract entry function name
grep "Entry function name" logs/testnet-debug.log -A 1
```

## Troubleshooting

### "No debug output appearing"

1. **Check you built with testing features:**
   ```bash
   cargo run --features testing --bin aptos -- node run-local-testnet --with-faucet
   ```

2. **Check the transaction reached the Move contract:**
   - Look for any error before the debug output
   - Transaction might be failing in earlier validation

3. **Verify the framework is rebuilt:**
   ```bash
   cd /Users/lucas/code/rust/atomica/source/atomica-aptos
   cargo clean
   cargo build --features testing --bin aptos
   ```

### "Too much log output"

Pipe to a file and grep:
```bash
./scripts/run-testnet-with-debug.sh 2>&1 | tee logs/full.log
grep "\[debug\]" logs/full.log > logs/debug-only.log
```

### "Want to remove debug logging"

```bash
cd /Users/lucas/code/rust/atomica/source/atomica-aptos
git checkout aptos-move/framework/aptos-framework/sources/account/common_account_abstractions/ethereum_derivable_account.move
cargo build --release --bin aptos
```

## Files Modified

- `zapatos/aptos-move/framework/aptos-framework/sources/account/common_account_abstractions/ethereum_derivable_account.move`
  - Added `use aptos_std::debug;`
  - Added debug::print() statements throughout `authenticate_auth_data()`

## Important Notes

- **Debug output only in testing builds** - Not available in production
- **Performance impact** - Testing features add overhead
- **Security** - Don't deploy contracts with debug statements to production
- **RUST_LOG** - Controls Rust-level logging, separate from Move debug output
