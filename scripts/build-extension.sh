#!/bin/bash
# Build the GetMention Chrome extension zip and publish it to the
# authenticated download endpoint.
#
# Usage: ./scripts/build-extension.sh
#
# What it does:
#   1. Zips /var/www/ai-bot/bot-serp/extension/ → /tmp/extension.zip
#   2. Copies that zip to extension-builds/getmention-latest.zip
#      (the path /api/download serves from)
#   3. Prints the current manifest version so you can confirm it matches
#      what you expect.
#
# Run this every time you bump extension/manifest.json version.

set -e

ROOT="/var/www/ai-bot/bot-serp"
EXT_DIR="$ROOT/extension"
BUILDS_DIR="$ROOT/extension-builds"
STABLE_ZIP="$BUILDS_DIR/getmention-latest.zip"
TMP_ZIP="/tmp/extension.zip"

if [ ! -f "$EXT_DIR/manifest.json" ]; then
  echo "ERROR: $EXT_DIR/manifest.json not found"
  exit 1
fi

VERSION=$(grep -o '"version"[^,]*' "$EXT_DIR/manifest.json" | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')

echo "[build-extension] Packaging v$VERSION…"

mkdir -p "$BUILDS_DIR"
rm -f "$TMP_ZIP"

cd "$EXT_DIR"
# Exclude dev/debug files from the CWS-ready build
zip -rq "$TMP_ZIP" . \
  -x "*.DS_Store" "*.map" ".git*" \
     "debug/*" "debug" \
     "*.bak" "*.orig"

cp "$TMP_ZIP" "$STABLE_ZIP"

SIZE=$(stat -c '%s' "$STABLE_ZIP")
echo "[build-extension] Done."
echo "  Version:    v$VERSION"
echo "  Size:       $SIZE bytes"
echo "  Tmp zip:    $TMP_ZIP"
echo "  Stable:     $STABLE_ZIP"
echo "  Download:   http://88.222.214.19:3005/api/download (auth required)"
