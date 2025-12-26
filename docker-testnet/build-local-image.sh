#!/bin/bash
# Build zapatos validator docker image
#
# This script:
# 1. Builds aptos-node binary from zapatos source using cargo
# 2. Copies the binary into docker-testnet/bin/
# 3. Builds a minimal Docker image with the pre-built binary
#
# Usage:
#   ./build.sh                    # Build from local source
#   ./build.sh --push             # Build and push to GitHub Container Registry
#   ./build.sh --ref main         # Build specific git ref
#
# Environment variables:
#   PROFILE: Build profile (release or debug, default: release)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATOMICA_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ZAPATOS_ROOT="$ATOMICA_ROOT/source/atomica-aptos"

# Parse arguments
PUSH_IMAGE=false
ZAPATOS_REF=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH_IMAGE=true
            shift
            ;;
        --ref)
            ZAPATOS_REF="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--push] [--ref <git-ref>]"
            exit 1
            ;;
    esac
done

echo "============================================"
echo "Building Zapatos Validator Docker Image"
echo "============================================"
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check zapatos source exists (for local builds)
if [ ! -d "$ZAPATOS_ROOT" ]; then
    echo "Error: Zapatos source not found at $ZAPATOS_ROOT"
    exit 1
fi

cd "$ZAPATOS_ROOT"

# Get git commit
if [ -n "$ZAPATOS_REF" ]; then
    GIT_SHA=$(git rev-parse --short "$ZAPATOS_REF" 2>/dev/null || echo "unknown")
    echo "Building git ref: $ZAPATOS_REF (commit: $GIT_SHA)"
else
    GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    echo "Building current commit: $GIT_SHA"
fi

# Check if image already exists
IMAGE_TAG="zapatos-testnet/validator:$GIT_SHA"
if docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
    echo ""
    echo "✓ Image already exists: $IMAGE_TAG"
    echo "  Skipping build (no changes detected)"
    echo ""
    echo "To force rebuild:"
    echo "  docker rmi $IMAGE_TAG"
    echo "  ./build.sh"
    echo ""

    # Update latest tag
    docker tag "$IMAGE_TAG" zapatos-testnet/validator:latest
    echo "Tagged zapatos-testnet/validator:latest -> $GIT_SHA"

    if [ "$PUSH_IMAGE" = true ]; then
        echo ""
        echo "Image already exists, skipping push"
    fi

    exit 0
fi

echo ""
echo "Step 1: Building aptos-node binary from zapatos source..."
echo "  Profile: ${PROFILE:-release}"
echo ""

# Build the Docker image (using repository root as context)
cd "$ATOMICA_ROOT"

# Enable Docker BuildKit for cache mounts
export DOCKER_BUILDKIT=1

echo "Step 1: Building Docker image..."
echo "  This will compile zapatos from source inside a Linux environment."
echo "  Image tag: $IMAGE_TAG"
echo ""

docker build \
    --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --build-arg GIT_SHA="$GIT_SHA" \
    --build-arg PROFILE="${PROFILE:-release}" \
    --tag "$IMAGE_TAG" \
    --tag zapatos-testnet/validator:latest \
    --file docker-testnet/Dockerfile \
    .

echo ""
echo "============================================"
echo "Build Complete!"
echo "============================================"
echo ""
echo "Docker images:"
echo "  zapatos-testnet/validator:$GIT_SHA"
echo "  zapatos-testnet/validator:latest"
echo ""

# Verify the image
echo "Verifying image..."
docker run --rm "$IMAGE_TAG" --version

echo ""
echo "✓ Image verified successfully"
echo ""

# Push to registry if requested
if [ "$PUSH_IMAGE" = true ]; then
    echo "Pushing to GitHub Container Registry..."

    # Tag for GitHub Container Registry
    GHCR_IMAGE="ghcr.io/OWNER/zapatos-bin:$GIT_SHA"

    docker tag "$IMAGE_TAG" "$GHCR_IMAGE"
    docker tag "$IMAGE_TAG" "ghcr.io/OWNER/zapatos-bin:latest"

    echo "Pushing $GHCR_IMAGE..."
    docker push "$GHCR_IMAGE"
    docker push "ghcr.io/OWNER/zapatos-bin:latest"

    echo ""
    echo "✓ Images pushed to GitHub Container Registry"
    echo ""
fi

echo "To start the testnet:"
echo "  docker compose up -d"
echo ""
echo "Or run tests (Docker handled automatically):"
echo "  cd ../tests && cargo test -- --test-threads=1"
echo ""
