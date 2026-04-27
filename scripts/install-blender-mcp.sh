#!/usr/bin/env bash
# install-blender-mcp.sh — Phase 0 helper. Verifies that:
#   1. Blender is installed and on PATH at the version pinned in .blender-version (ADR-0002)
#   2. The blender-mcp addon is reachable (optional path; subprocess always works)
#
# Honors $BLENDER_BIN as an override (e.g. /Applications/Blender.app/Contents/MacOS/Blender).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN_FILE="$REPO_ROOT/.blender-version"
[[ -f "$PIN_FILE" ]] || { echo "missing .blender-version (see ADR-0002)" ; exit 1; }
PINNED="$(cat "$PIN_FILE" | tr -d '[:space:]')"

BLENDER_BIN="${BLENDER_BIN:-blender}"
if ! command -v "$BLENDER_BIN" >/dev/null 2>&1; then
  cat <<EOF
✗ blender not on PATH (\$BLENDER_BIN=$BLENDER_BIN)

Install:
  macOS:  brew install --cask blender
  Or download Blender $PINNED from https://www.blender.org/download/lts/

If Blender.app is installed but not on PATH, export:
  export BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender"
EOF
  exit 1
fi

VERSION="$("$BLENDER_BIN" --version 2>/dev/null | head -1 | awk '{print $2}')"
echo "Detected Blender: $VERSION (pinned: $PINNED)"

if [[ "$VERSION" != "$PINNED" ]]; then
  echo "✗ version mismatch — install Blender $PINNED or bump .blender-version (ADR-0002 supersede)"
  exit 1
fi

# Check the blender-mcp addon (optional path). Don't fail Phase 0 if it's missing —
# the subprocess path in src/blender/mcp-bridge.ts works without it.
ADDON_DIR="${BLENDER_USER_RESOURCES:-$HOME/Library/Application Support/Blender/${PINNED%.*}/scripts/addons}"
if [[ -d "$ADDON_DIR/blender_mcp" ]] || [[ -f "$ADDON_DIR/blender_mcp.py" ]]; then
  echo "✓ blender-mcp addon detected at $ADDON_DIR"
else
  cat <<EOF
ℹ blender-mcp addon not found at $ADDON_DIR
   Phase 0 will use the subprocess path (works fine, slightly slower).
   To install the MCP path:
     git clone https://github.com/ahujasid/blender-mcp /tmp/blender-mcp
     cp -R /tmp/blender-mcp/addon "$ADDON_DIR/blender_mcp"
   Then enable "Blender MCP" in Edit → Preferences → Add-ons.
EOF
fi

echo "✓ ready"
