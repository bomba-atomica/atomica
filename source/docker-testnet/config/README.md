# Docker Testnet

4-validator Docker testnet for Atomica development and testing.

This testnet uses pre-built validator images published by the [atomica-aptos](https://github.com/bomba-atomica/atomica-aptos) repository. Docker images are automatically built and published via GitHub Actions when changes are pushed to atomica-aptos.

### First Time Setup

```bash
# 1. Configure credentials
cd source/atomica-web
cp .env.example .env
# Edit .env: Add your GitHub username and Personal Access Token

# 2. Run tests
npm run test:docker
```

**First run**: ~1-2 minutes (image download + startup)
**Subsequent runs**: ~30 seconds

### Accessing the Testnet

Once running, validators are available at:
- Validator 0: http://localhost:8080
- Validator 1: http://localhost:8081
- Validator 2: http://localhost:8082
- Validator 3: http://localhost:8083

Example queries:
```bash
# Get ledger info
curl http://localhost:8080/v1 | jq

# Get specific block
curl http://localhost:8080/v1/blocks/by_height/100 | jq
```

### Creating GitHub Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Select scope: `read:packages`
4. Copy token to `source/atomica-web/.env` as `GHCR_TOKEN`

**Note**: Must use "classic" tokens - fine-grained tokens don't support packages.

## Configuration

**Primary config**: `source/atomica-web/.env` (gitignored)

<!-- SCOUT(#228) DOC: the image settings below are stale: docker-compose.yaml reads IMAGE_NAME and defaults to a pinned digest, and VALIDATOR_IMAGE_REPO with IMAGE_TAG is only a late fallback in genesis.ts; an implementer who moves the pin needs the real steps. -->

### Validator Image (Default)

`docker-compose.yaml` runs every validator from `${IMAGE_NAME:-<pinned digest>}`:
an `ghcr.io/bomba-atomica/atomica-aptos/validator@sha256:...` image built from
one `dev-atomica` revision of the fork. `genesis.ts` runs `generate-genesis.sh`
in the same image. It takes, in order, `IMAGE_NAME_GENESIS`, `IMAGE_NAME`, the
compose default, then `VALIDATOR_IMAGE_REPO`, then its own fallback digest.
Leave `IMAGE_NAME` unset to use the pinned digest.

### Moving the Fork Pin

Every product pin names one fork revision. Move them all in one pull request:

1. Merge the fork change on `dev-atomica`. A Rust change cuts a
   `binary-<hash>` release through `build-aptos-binary.yml`.
2. Dispatch `build-validator-image.yml` on the fork for that revision (the
   release event starts no workflow). Read the pushed image digest from the run.
3. Replace the digest in the compose header and its four services here, in the
   fallback of `aptos-testnet/src/genesis.ts` and in the comment of
   `aptos-testnet/test/docker-testnet.test.ts`.
4. Move the `AptosFramework` rev in `source/atomica-move-contracts/Move.toml`,
   `APTOS_VERSION` and every `binary-<hash>` tag in `.github/workflows`
   (including `APTOS_PROOF_RELEASE` and the full `APTOS_PROOF_COMMIT`).
   `.github/scripts/check-fork-pin.sh` checks all of them except the digest,
   which cannot be compared with a tag without a registry read.

### Custom Images

If you need to test custom validator changes, you'll need to:
1. Fork or clone the [atomica-aptos](https://github.com/bomba-atomica/atomica-aptos) repository
2. Build images locally in that repository using `atomica/docker/Dockerfile`
3. Tag and publish them to your own registry
4. Update the `VALIDATOR_IMAGE_REPO` and `IMAGE_TAG` in your `.env` file

## Running Tests

```bash
cd source/atomica-web
npm run test:docker
```

The test harness automatically:
- Authenticates with GHCR (local) or uses GITHUB_TOKEN (CI)
- Starts 4 validators on ports 8080-8083
- Waits for blockchain to be healthy
- Runs tests
- Cleans up containers

## Manual Docker Compose Usage

For manual operation (test harness does this automatically):

```bash
cd docker-testnet

# Start
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f validator-0

# Stop
docker compose down -v
```

**Note**: Environment variables from `source/atomica-web/.env` are automatically loaded.

## Architecture

- **4 validators**: Multi-validator consensus testing
- **Ports**: 8080-8083 (REST API), 9101-9104 (metrics)
- **Network**: Isolated Docker network (172.19.0.0/16)
- **Epochs**: 30 seconds (fast testing)
- **Chain ID**: 4 (local testnet)

### Production-Like Account Funding

The testnet includes a **production-like faucet** that avoids magic accounts:

- Validators receive unlocked funds at bootstrap (simulating staking rewards)
- New accounts funded via validator transfers (not minting)
- No reliance on Core Resources (0xA550C18) during runtime
- Test code behaves identically to production mainnet

See `DockerTestnet.faucet()` in **[aptos-testnet/src/index.ts](../aptos-testnet/src/index.ts)** for the implementation.

## Troubleshooting

**Authentication failed**:
- Verify token has `read:packages` scope
- Use classic token (not fine-grained)
- Check credentials in `source/atomica-web/.env`

**Image not found**:
- For GHCR: Check authentication
- For local: Run `./build-local-image.sh`

**Port conflicts**:
- Stop other services using ports 8080-8083
- Run `docker compose down -v` to remove old containers

## Files

- `docker-compose.yaml` - 4-validator testnet configuration
- `generate-genesis.sh` - Genesis and validator config generation

## Building Custom Images

Docker images are built and published by the [atomica-aptos](https://github.com/bomba-atomica/atomica-aptos) repository:

- **Dockerfile**: `atomica/docker/Dockerfile` (in atomica-aptos repo)
- **GitHub Workflow**: `.github/workflows/build-validator-image.yml` (in atomica-aptos repo)
- **Published to**: `ghcr.io/bomba-atomica/atomica-aptos/validator`

<!-- SCOUT(#228) DOC: the trigger list below is stale: the fork cuts a binary-<sha> release on a push to dev-atomica that changes Rust or Cargo files (about 73 minutes), and the validator image is then built by a manual dispatch of build-validator-image.yml. -->

Images are automatically built on:
- Push to `main` or `dev-atomica` branches
- Pull requests
- Manual workflow dispatch

## CI/CD Example

See `.github/workflows/docker-testnet-example.yml` for GitHub Actions workflow.
