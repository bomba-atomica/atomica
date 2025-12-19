# Atomica Web Demo

This is the web interface for the Atomica project, demonstrating auction functionality on the OL blockchain.

## Quick Start

### 1. Prerequisites

Before running the demo, you need to compile the Aptos release binary.

> [!WARNING]
> This step can take a significant amount of time (20+ minutes) as it compiles the entire Aptos node from source with testing features enabled.

Navigate tfrom the root to source/zapatos and run:

```bash
cd ../zapatos
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

## Troubleshooting

- **Compilation Issues**: Ensure you have the latest Rust toolchain installed.
- **Port Conflicts**: The local testnet uses ports 8080, 8081, and 6180. Ensure these are free.
