# Zapatos Testnet - Quick Start

Get a local 4-validator testnet running with binaries built from your zapatos source.

## Prerequisites

- Docker Desktop running
- 8GB RAM minimum
- 20GB disk space
- Zapatos source at `source/zapatos`

## One-Time Setup

### 1. Build Docker Images from Zapatos Source

```bash
cd docker-testnet
./build.sh
```

**Smart Caching:**
- Checks if an image already exists for your current zapatos commit
- If yes: Instant (just updates 'latest' tag)
- If no: Builds from source (10-20 minutes first time)

**Build times:**
- First build: 10-20 minutes
- Rebuild same commit: < 1 second (cached)
- New commit: 10-20 minutes

The images are tagged with your zapatos git commit, ensuring binaries always match your code.

## Every Time: Start Testnet

```bash
make start
```

⏱ Takes ~30 seconds to start all validators.

### 3. Verify

```bash
make test-api
```

You should see successful responses from all 4 validators.

### 4. Use It

REST APIs are now available:
- Validator 0: http://localhost:8080
- Validator 1: http://localhost:8081
- Validator 2: http://localhost:8082
- Validator 3: http://localhost:8083

Example:
```bash
# Get current ledger info
curl http://localhost:8080/v1 | jq

# Get specific block
curl http://localhost:8080/v1/blocks/by_height/100 | jq
```

### 5. Run Tests

```bash
cd ../tests
cargo test -- --test-threads=1 --nocapture
```

### 6. Stop

```bash
cd ../docker-testnet
make stop    # Stop (keeps data)
make clean   # Stop and remove all data
```

## Verify Image Matches Zapatos

```bash
# Check what commit the image was built from
docker images zapatos-testnet/validator

# You should see two tags:
# - <git-commit>  (matches your zapatos commit)
# - latest        (always points to most recent build)
```

## What's Next?

- Read the [full README](README.md) for detailed usage
- Check out the [test harness docs](../tests/docker_harness/mod.rs)
- Review the [timelock implementation plan](../docs/development/timelock-implementation-plan.md)

## Troubleshooting

**Images not found?**
→ Run `./build.sh` first to build from zapatos source

**Build fails?**
→ Check zapatos compiles: `cd ../source/zapatos && cargo check`

**Validators won't start?**
→ Check Docker has 8GB+ RAM: Docker → Settings → Resources

**Port conflicts?**
→ Stop other services using ports 8080-8083

**Still stuck?**
→ Check logs: `make logs`
