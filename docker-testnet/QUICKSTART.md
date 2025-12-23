# Quick Start

**TL;DR:** Build image, run tests. Tests handle Docker automatically.

## Setup (Once)

```bash
cd docker-testnet
./build.sh
```

⏱ First build: ~10-20 minutes | Incremental: ~1-3 minutes | Same commit: < 1 second

## Run Tests (Every time)

```bash
cd tests
cargo test testnet_basic -- --test-threads=1 --nocapture
```

Docker testnet starts → tests run → Docker testnet stops (automatic)

## That's it!

For detailed documentation, architecture, troubleshooting, and manual testnet usage, see [README.md](README.md).
