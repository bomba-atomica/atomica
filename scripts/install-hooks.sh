#!/bin/bash
# Install git hooks for the repository

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)

echo "Setting up git hooks..."
git config core.hooksPath .githooks

echo "Git hooks installed successfully!"
