#!/usr/bin/env bash
# download-metamask.sh — Download and unpack the MetaMask Chrome extension for
# use with Playwright's --load-extension flag.
#
# Usage:
#   ./download-metamask.sh [version]
#
# The unpacked extension is placed at:
#   source/atomica-web-ui/tests/browser-extension/metamask-extension/
#
# If no version is specified the script fetches the latest release from the
# MetaMask GitHub releases API.
#
# The script is idempotent: if the extension directory already exists and the
# version matches, no download occurs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$SCRIPT_DIR/metamask-extension"
VERSION_FILE="$SCRIPT_DIR/.metamask-version"

# ---------------------------------------------------------------------------
# Resolve version
# ---------------------------------------------------------------------------

if [[ $# -ge 1 ]]; then
  REQUESTED="$1"
else
  echo "[download-metamask] Fetching latest MetaMask release version..."
  REQUESTED="$(curl -sSf \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/MetaMask/metamask-extension/releases/latest" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tag_name'].lstrip('v'))")"
  echo "[download-metamask] Latest version: $REQUESTED"
fi

# ---------------------------------------------------------------------------
# Check if already downloaded
# ---------------------------------------------------------------------------

if [[ -d "$TARGET_DIR" ]] && [[ -f "$VERSION_FILE" ]]; then
  INSTALLED="$(cat "$VERSION_FILE")"
  if [[ "$INSTALLED" == "$REQUESTED" ]]; then
    echo "[download-metamask] MetaMask $REQUESTED already present at $TARGET_DIR — skipping."
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

ZIP_URL="https://github.com/MetaMask/metamask-extension/releases/download/v${REQUESTED}/metamask-chrome-${REQUESTED}.zip"
TMP_ZIP="$(mktemp /tmp/metamask-XXXXXX.zip)"

echo "[download-metamask] Downloading $ZIP_URL ..."
if ! curl -sSfL "$ZIP_URL" -o "$TMP_ZIP"; then
  echo "[download-metamask] ERROR: download failed. Check that version $REQUESTED exists." >&2
  rm -f "$TMP_ZIP"
  exit 1
fi

# ---------------------------------------------------------------------------
# Unpack
# ---------------------------------------------------------------------------

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

echo "[download-metamask] Unpacking..."
unzip -q "$TMP_ZIP" -d "$TARGET_DIR"
rm -f "$TMP_ZIP"

echo "$REQUESTED" > "$VERSION_FILE"
echo "[download-metamask] MetaMask $REQUESTED unpacked to $TARGET_DIR"
