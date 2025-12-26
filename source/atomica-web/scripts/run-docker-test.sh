#!/bin/bash
# Run Docker Testnet Test
#
# This script:
# 1. Pulls the zapatos Docker image (if not cached)
# 2. Runs the meta test that verifies blockchain progress
#
# Usage: ./scripts/run-docker-test.sh

set -e

echo "=== Docker Testnet Test Setup ==="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop and try again."
  exit 1
fi

echo "✓ Docker is running"
echo ""

# Pull the image if not present
IMAGE="ghcr.io/bomba-atomica/atomica/zapatos-bin:5df0e6d1"

if docker image inspect "$IMAGE" > /dev/null 2>&1; then
  echo "✓ Image already cached: $IMAGE"
else
  echo "📥 Pulling image (this may take 1-2 minutes on first run)..."
  echo "   Image: $IMAGE"
  docker pull "$IMAGE"
  echo "✓ Image pulled successfully"
fi

echo ""
echo "=== Running Docker Testnet Test ==="
echo ""

# Run the test
npm run test:docker

echo ""
echo "=== Test Complete ==="
