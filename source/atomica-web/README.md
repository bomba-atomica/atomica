# Atomica Web Demo

This is the web interface for the Atomica project, demonstrating auction functionality on the OL blockchain.

## Quick Start

### 1. Prerequisites

Before running the demo, you need to compile the Aptos release binary.

> [!WARNING]
> This step can take a significant amount of time (20+ minutes) as it compiles the entire Aptos node from source with testing features enabled.

Navigate from the root to source/atomica-aptos and run:

```bash
cd ../atomica-aptos
cargo b -p aptos --features testing
```

You will also need a browser wallet installed:

- **MetaMask** (or any other Ethereum wallet that supports SIWE - Sign-In with Ethereum)

### 2. Run the Demo

Once the binary is compiled, you can start the demo environment. This command will:

1. Validates prerequisites (node binary, ports)
2. Compiles backend contracts
3. Starts a local Aptos testnet
4. Deploys contracts
5. Starts the web frontend

```bash
npm install && npm run demo
```

The web application will be available at `http://localhost:4173/`.

## Environment Variables

### Naming Convention

All Atomica-specific environment variables **must** be prefixed with `ATOMICA_`:

- ✅ `ATOMICA_DEBUG=1`
- ✅ `ATOMICA_LOG_LEVEL=verbose`
- ✅ `ATOMICA_NUM_VALIDATORS=4`
- ❌ `DEBUG=1` (too generic)
- ❌ `NUM_VALIDATORS=4` (missing prefix)

**Rationale**: This prevents naming conflicts with third-party libraries and system variables, making it clear which variables belong to Atomica.

### Available Variables

Currently used environment variables:

- `NUM_VALIDATORS` - Number of validators for Docker testnet (default: 2)
  - **Note**: This should be renamed to `ATOMICA_NUM_VALIDATORS` in a future update

Third-party library variables (not controlled by Atomica):

- `DEBUG_TESTNET` - Enable verbose logging in docker-testnet SDK (values: `1`, `true`)

## Troubleshooting

- **Compilation Issues**: Ensure you have the latest Rust toolchain installed.
- **Port Conflicts**: The local testnet uses ports 8080, 8081, and 6180. Ensure these are free.
