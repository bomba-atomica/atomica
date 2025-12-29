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

### Published Images (Default - Recommended)

Pull pre-built validator images from GitHub Container Registry. Images are automatically published by the atomica-aptos repository.

**Local development**:
```bash
# In source/atomica-web/.env:
VALIDATOR_IMAGE_REPO=ghcr.io/bomba-atomica/atomica-aptos/validator
IMAGE_TAG=latest  # or specific commit hash like abc1234
GHCR_USERNAME=your_github_username
GHCR_TOKEN=ghp_YourPersonalAccessToken
```

**CI/CD**:
```bash
# In source/atomica-web/.env (no credentials needed):
VALIDATOR_IMAGE_REPO=ghcr.io/bomba-atomica/atomica-aptos/validator
IMAGE_TAG=latest
# GITHUB_TOKEN is automatic in GitHub Actions
```

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

See **[typescript-sdk/FAUCET.md](../typescript-sdk/FAUCET.md)** for complete documentation.

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
- `validator-config.yaml` - Node configuration overrides

## Building Custom Images

Docker images are built and published by the [atomica-aptos](https://github.com/bomba-atomica/atomica-aptos) repository:

- **Dockerfile**: `atomica/docker/Dockerfile` (in atomica-aptos repo)
- **GitHub Workflow**: `.github/workflows/build-validator-image.yml` (in atomica-aptos repo)
- **Published to**: `ghcr.io/bomba-atomica/atomica-aptos/validator`

Images are automatically built on:
- Push to `main` or `dev-atomica` branches
- Pull requests
- Manual workflow dispatch

## CI/CD Example

See `.github/workflows/docker-testnet-example.yml` for GitHub Actions workflow.
