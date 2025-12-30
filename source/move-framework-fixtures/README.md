# Move Framework Fixtures

This directory contains Move framework release bundles (.mrb files) used across all Atomica projects for testing and development.

## How It Works

The framework bundles use **content-based versioning** with automatic caching:

- Each `.mrb` file is named `head-{hash}.mrb` where `{hash}` is computed from all `.move` source files
- When you run tests, the system automatically checks if the current framework version exists
- If a matching bundle exists, it's reused (instant)
- If not, the framework is built automatically (takes a few minutes)
- The `head.mrb` file always points to the latest built version

This means you **never need to manually rebuild** the framework - just run your tests and it will rebuild only when needed!

## Quick Start

### Automatic (Recommended)

Just run your tests - the framework will be built automatically if needed:

```bash
# From atomica-web
npx vitest run SimpleTransfer
```

The first time (or after changing .move files), it will build the framework. Subsequent runs with the same framework code will be instant.

### Manual Build

If you want to prebuild the framework:

```bash
# From the source root directory (./source)
./build-framework.sh
```

This will:
1. Compute a hash of all Move source files
2. Check if `head-{hash}.mrb` already exists (if so, done!)
3. If not, compile all framework packages (move-stdlib, aptos-stdlib, aptos-framework, etc.)
4. Generate `head-{hash}.mrb` and copy to `head.mrb`

## Caching & Performance

The hash-based caching system means:

- **First build**: Takes ~2-3 minutes to compile the framework
- **Cached builds**: Instant - reuses existing `head-{hash}.mrb`
- **After changing .move files**: Automatically rebuilds (detects hash change)
- **Git branch switching**: Automatically uses the correct cached version for each branch

You can have multiple versions cached simultaneously (e.g., `head-abc123.mrb`, `head-def456.mrb`, etc.). This is useful when switching between branches or working on different features.

## Multiple Environment Support

You can create different `.mrb` files for different environments:

```bash
# Example: Create different framework bundles
./build-framework.sh  # Outputs head.mrb (default)

# You can manually copy/rename for different environments:
cd move-framework-fixtures
cp head.mrb testnet.mrb
cp head.mrb preview.mrb
cp head.mrb mainnet.mrb
cp head.mrb proposal-12.mrb
```

Then modify your project's localnet setup to select which framework to use:

```typescript
// In atomica-web/tests/setup/localnet.ts, change:
const GENESIS_FRAMEWORK_PATH = resolve("../move-framework-fixtures/testnet.mrb");
```

## Workflow

### When modifying genesis.move or other framework code:

1. Clone the atomica-aptos repo: `git clone https://github.com/bomba-atomica/atomica-aptos.git`
2. Edit the Move code in `atomica-aptos/aptos-move/framework/aptos-framework/sources/`
3. Run `./build-framework.sh` from the source root (fast - only rebuilds framework)
4. Run tests from any project: `cd atomica-web && npx vitest run SimpleTransfer`
5. Iterate quickly without waiting for full Rust compilation

### When modifying Rust code (authenticator.rs, etc.):

1. Clone the atomica-aptos repo (if not already cloned): `git clone https://github.com/bomba-atomica/atomica-aptos.git`
2. Edit the Rust code
3. Rebuild aptos: `cd atomica-aptos && cargo build --bin aptos --features testing`
4. The framework is already in the `.mrb` file, so no need to rebuild it
5. Run tests from any project

## Technical Details

The `.mrb` (Move Release Bundle) format is a BCS-serialized bundle containing:
- Compiled Move bytecode for all framework modules
- Package metadata
- Source file paths (optional)

This format allows the `aptos node run-local-testnet` command to initialize genesis with a specific version of the framework without having it compiled into the binary.
