# Zapatos Docker Testnet

A local multi-validator testnet for developing and testing features in **zapatos** (Atomica's fork of Aptos). This setup provides a production-like environment using binaries built directly from your local source code.

---

## 🚀 Local Developer Quick Start

Focus on getting your first image built and running tests with zero manual Docker management.

### 1. Build from Source (First Time)
This script uses a **multi-stage Docker build** to compile the `aptos-node` and `aptos-faucet-service` binaries.

**Why Docker?** Since you are likely on a Mac or Windows, you cannot simply copy a host-native binary into a Linux container. This script compiles the source code *inside* a Linux container first, ensuring the final binary is compatible with the `debian:bullseye-slim` runtime.

```bash
cd docker-testnet
./build.sh
```

*   **⏱ First build:** ~10-20 minutes (initial cargo compilation inside Docker)
*   **⏱ Incremental:** ~1-3 minutes (uses Docker BuildKit cache mounts)
*   **⏱ Re-tagging:** < 1 second (if no source changes detected)

### 2. Run Integration Tests
The Rust test suite handles the entire Docker lifecycle automatically. It will spin up 4 validators, run the assertions, and tear everything down.

```bash
cd tests
cargo test testnet_basic -- --test-threads=1 --nocapture
```

> [!IMPORTANT]
> Tests must run with `--test-threads=1` to avoid port conflicts on the host machine (mapping 8080-8083).

---

## 🛠 Building the Images

The `build.sh` script is the primary entry point for local developers. It ensures that your image is built in a consistent Linux environment.

### The Build Process
1.  **Context:** The script sets the repository root as the build context so Docker can access `source/zapatos`.
2.  **Caching:** It leverages **Docker BuildKit cache mounts** (`--mount=type=cache`). This means that your `target` directory and cargo registry are persisted across Docker builds, making incremental changes nearly as fast as a local `cargo build`.
3.  **Cross-Platform:** Because the build happens inside a container, a developer on an Apple Silicon Mac will produce the correct Linux ELF binaries automatically.

### Build Options
*   `./build.sh --ref <branch/tag/commit>`: Build from a specific git reference instead of the current state.
*   `PROFILE=debug ./build.sh`: Build debug binaries (useful for profiling, but produces heavy images).

---

## 🏗 CI/CD Integration

The `.github/workflows/build-docker-images.yml` workflow uses a "Binary-First" optimization. Since GitHub Actions runners are already Linux-based:
1.  They compile the binaries directly on the runner host (which is slightly faster than Docker-in-Docker).
2.  They package those pre-built binaries into the final image.

*Note: As a local developer on macOS, you should always stick to the `build.sh` path which handles the OS difference for you.*

---

## 🕹 Manual Testnet Management

If you want to manually explore the testnet or debug a specific node, use the provided `Makefile`:

| Command | Description |
|---------|-------------|
| `make start` | Start the 4-validator testnet in the background. |
| `make status` | Check which containers are running and healthy. |
| `make logs` | Stream logs from all nodes (or `make logs-0` for just the first node). |
| `make restart` | Quickly restart all validator services. |
| `make clean` | **Destructive:** Stop testnet and wipe all volumes/data. |

---

## ❓ Troubleshooting

*   **"Image not found":** Ensure you ran `./build.sh` at least once locally.
*   **Port 8080 already in use:** You may have a zombie testnet running. Run `make clean` to force a reset.
*   **"exec format error":** This occurs if you tried to manually copy a Mac binary into the container. Always use `./build.sh` to ensure Linux-compatible binaries.

---

## Related Links
*   [Test Harness Source](../tests/docker_harness/mod.rs) - See how the Rust code manages Docker.
*   [Timelock Implementation Plan](../docs/development/timelock-implementation-plan.md) - Rationale for this testnet.
