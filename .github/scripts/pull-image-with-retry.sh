#!/usr/bin/env bash
# Pulls one Docker image. If the pull fails, waits PULL_RETRY_DELAY_SECONDS
# (default 15) and tries exactly once more. The exit status is the last pull's.
# A registry blip (ghcr.io or its blob host) then fails only after two tries.
set -uo pipefail

image=${1:?usage: pull-image-with-retry.sh IMAGE}
delay=${PULL_RETRY_DELAY_SECONDS:-15}

if docker pull "$image"; then
  exit 0
fi
echo "::warning::docker pull ${image} failed. Retrying once in ${delay}s."
sleep "$delay"
docker pull "$image"
