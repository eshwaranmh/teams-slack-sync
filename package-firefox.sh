#!/bin/zsh
# package-firefox.sh — builds dist/teams-slack-sync-firefox.zip for upload to
# addons.mozilla.org (free "unlisted" self-distribution signing).
#
# Full flow (one-time Mozilla account needed):
#   1. ./package-firefox.sh
#   2. https://addons.mozilla.org/developers/ → Submit a New Add-on
#      → "On your own" (unlisted) → upload dist/teams-slack-sync-firefox.zip
#   3. Wait ~1–5 min for automatic signing → download the signed .xpi
#   4. In Firefox: drag the .xpi into a window (or File → Open) → Add
#   5. about:addons → the extension → Permissions → allow access to localhost

set -e
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$REPO_DIR/dist"
ZIP="$DIST/teams-slack-sync-firefox.zip"

mkdir -p "$DIST"
rm -f "$ZIP"
# AMO wants the manifest at the zip ROOT, so zip the folder contents.
(cd "$REPO_DIR/extension" && zip -q -r "$ZIP" . -x '.*')
echo "✅ Built $ZIP"
echo "Upload it at https://addons.mozilla.org/developers/ (channel: On your own)"
