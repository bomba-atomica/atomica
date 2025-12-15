# Building Aptos Dependencies from Source

This guide explains how to build the `aptos` CLI and related dependencies from the local `zapatos` source tree. This is required when working with modifications to the Move framework (e.g., `aptos-framework`, `aptos-stdlib`) that have not yet been released in a bundled binary.

## Why Build from Source?

The standard `aptos` CLI binary comes with a pre-compiled Move framework bundle (Release Bundle) embedded within it. When we modify the Move framework source files in `source/zapatos/aptos-move/framework`, the standard binary will not be aware of these changes.

To test changes to the framework locally (e.g., verifying signature schemes in `ethereum_derivable_account.move`), we must rebuild the `aptos` executable. This rebuild triggers the generation of a new "Head" release bundle (`head.mrb`) from the local source files and embeds it into the new binary.

## How it Works

1.  **Release Target**: The build configuration uses `ReleaseTarget::Head` (defined in `aptos.rs`).
2.  **Source Inclusion**: This target is configured to read from the local file system paths:
    *   `aptos-move/framework/aptos-framework`
    *   `aptos-move/framework/aptos-stdlib`
    *   `aptos-move/framework/move-stdlib`
3.  **Embedding**: The `build.rs` script in `aptos-cached-packages` compiles these sources into a `.mrb` file and includes it in the final Rust binary using `include_bytes!`.

## Build Instructions

To build the `aptos` CLI with the latest local framework changes:

1.  Navigate to the `source` directory of the project.
2.  Run the following command:

```bash
cargo build -p aptos
```

### Build Artifacts

*   The built binary will be located at:
    `source/target/debug/aptos` (or `release/aptos` if built with `--release`)

### Verifying the Build

You can verify that the binary/testnet is using the correct framework by checking the directory integrity or simply relying on the fact that `cargo build` recompiles `aptos-cached-packages` when the underlying Move source files change.

## Using the Custom Binary

When running the local testnet or other tools, point them to this specific binary path.

**Example (Node.js/TypeScript):**

```typescript
// In your test or script setup
const APTOS_BIN_PATH = path.resolve(__dirname, "../../../target/debug/aptos");

spawn(APTOS_BIN_PATH, ['node', 'run-local-testnet', ...]);
```

**Example (Shell):**

```bash
./target/debug/aptos node run-local-testnet --force-restart
```
