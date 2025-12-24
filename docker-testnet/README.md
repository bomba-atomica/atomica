# Docker Testnet

4-validator Docker testnet for atomica development and testing.

## Quick Start

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

### Option 1: GHCR (Default - Recommended)

Pull pre-built images from GitHub Container Registry.

**Local development**:
```bash
# In source/atomica-web/.env:
VALIDATOR_IMAGE_REPO=ghcr.io/0o-de-lally/atomica/zapatos-bin
IMAGE_TAG=5df0e6d1
GHCR_USERNAME=your_github_username
GHCR_TOKEN=ghp_YourPersonalAccessToken
```

**CI/CD**:
```bash
# In source/atomica-web/.env (no credentials needed):
VALIDATOR_IMAGE_REPO=ghcr.io/0o-de-lally/atomica/zapatos-bin
IMAGE_TAG=5df0e6d1
# GITHUB_TOKEN is automatic in GitHub Actions
```

### Option 2: Local Build (For Build Debugging Only)

Build from source when debugging the build process itself.

```bash
# 1. Build image (10-20 min)
cd docker-testnet
./build-local-image.sh

# 2. Update source/atomica-web/.env:
VALIDATOR_IMAGE_REPO=zapatos-testnet/validator
IMAGE_TAG=latest
```

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

- `build-local-image.sh` - Build Docker image from local zapatos source
- `docker-compose.yaml` - 4-validator testnet configuration
- `validator-config.yaml` - Node configuration overrides

## CI/CD Example

See `.github/workflows/docker-testnet-example.yml` for GitHub Actions workflow.
