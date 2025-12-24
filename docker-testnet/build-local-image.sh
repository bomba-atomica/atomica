#!/bin/bash
# Build zapatos validator docker image from local source
#
# This script uses zapatos's existing docker buildx infrastructure
# to compile binaries from the local fork and package them into docker images.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATOMICA_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ZAPATOS_ROOT="$ATOMICA_ROOT/source/zapatos"

echo "============================================"
echo "Building Zapatos Testnet Docker Images"
echo "============================================"
echo ""
echo "Atomica root: $ATOMICA_ROOT"
echo "Zapatos root: $ZAPATOS_ROOT"
echo ""

# Check that zapatos directory exists
if [ ! -d "$ZAPATOS_ROOT" ]; then
    echo "Error: Zapatos source not found at $ZAPATOS_ROOT"
    echo "Expected directory structure: atomica/source/zapatos/"
    exit 1
fi

# Check that docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

echo "Step 1: Checking if rebuild is needed..."

cd "$ZAPATOS_ROOT"

# Get the git commit from zapatos source
ZAPATOS_GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "Current zapatos commit: $ZAPATOS_GIT_SHA"

# Check if we already have an image for this commit
if docker image inspect "zapatos-testnet/validator:$ZAPATOS_GIT_SHA" >/dev/null 2>&1; then
    echo ""
    echo "✓ Image already exists for commit $ZAPATOS_GIT_SHA"
    echo "  Skipping build (no changes detected)"
    echo ""
    echo "If you want to force rebuild, run:"
    echo "  docker rmi zapatos-testnet/validator:$ZAPATOS_GIT_SHA"
    echo "  ./build.sh"
    echo ""

    # Update the 'latest' tag to point to this commit
    docker tag "zapatos-testnet/validator:$ZAPATOS_GIT_SHA" zapatos-testnet/validator:latest

    echo "Tagged zapatos-testnet/validator:latest -> $ZAPATOS_GIT_SHA"
    echo ""
    echo "============================================"
    echo "Build Complete (cached)!"
    echo "============================================"
    echo ""
    echo "Docker images built from zapatos commit: $ZAPATOS_GIT_SHA"
    echo ""
    echo "To start the testnet:"
    echo "  docker compose up -d"
    echo ""
    echo "Or use the Makefile:"
    echo "  make start"
    echo ""
    exit 0
fi

echo "  No cached image found for commit $ZAPATOS_GIT_SHA"
echo "  Building from source (10-20 minutes)..."
echo ""

# Build validator image using zapatos's build infrastructure
# The 'validator' target builds both the binary and packages it
export PROFILE="${PROFILE:-release}"
export FEATURES="${FEATURES:-}"

echo "Building with profile: $PROFILE"
if [ -n "$FEATURES" ]; then
    echo "Building with features: $FEATURES"
fi
echo ""

# Use zapatos's docker-bake script to build the validator target
./docker/builder/docker-bake-rust-all.sh validator

echo ""
echo "Step 2: Tagging image with zapatos git commit..."

# ZAPATOS_GIT_SHA already set in Step 1
echo "Zapatos git commit: $ZAPATOS_GIT_SHA"

# Find the image that was just built
# The buildx bake system tags images based on profile and features
if [ "$PROFILE" = "release" ]; then
    profile_prefix=""
else
    profile_prefix="${PROFILE}_"
fi

if [ -n "$FEATURES" ]; then
    NORMALIZED_FEATURES=$(printf "$FEATURES" | sed -e 's/[^a-zA-Z0-9]/_/g')
    image_tag="${profile_prefix}${NORMALIZED_FEATURES}_${GIT_SHA:-latest}"
else
    image_tag="${profile_prefix}${GIT_SHA:-latest}"
fi

# Tag with zapatos git commit for traceability
docker tag "aptos/validator:$image_tag" "zapatos-testnet/validator:$ZAPATOS_GIT_SHA" || {
    echo "Warning: Could not find image with tag $image_tag"
    echo "Trying to find any recent aptos/validator image..."

    # Fallback: tag the most recent aptos/validator image
    latest_image=$(docker images "aptos/validator" --format "{{.Repository}}:{{.Tag}}" | head -1)
    if [ -n "$latest_image" ]; then
        echo "Using image: $latest_image"
        docker tag "$latest_image" "zapatos-testnet/validator:$ZAPATOS_GIT_SHA"
    else
        echo "Error: No aptos/validator images found. Build may have failed."
        exit 1
    fi
}

# Also tag as 'latest' for convenience
docker tag "zapatos-testnet/validator:$ZAPATOS_GIT_SHA" zapatos-testnet/validator:latest

echo ""
echo "Tagged images:"
echo "  zapatos-testnet/validator:$ZAPATOS_GIT_SHA  (matches zapatos commit)"
echo "  zapatos-testnet/validator:latest            (convenience tag)"

echo ""
echo "============================================"
echo "Build Complete!"
echo "============================================"
echo ""
echo "Docker images built from zapatos commit: $ZAPATOS_GIT_SHA"
echo ""
echo "To verify the image:"
echo "  docker images zapatos-testnet/validator"
echo ""
echo "To start the testnet:"
echo "  docker compose up -d"
echo ""
echo "Or use the Makefile:"
echo "  make start"
echo ""
