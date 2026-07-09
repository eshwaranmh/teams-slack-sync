#!/bin/zsh
# package-safari.sh — converts the extension into a Safari Web Extension app
# using Apple's converter (requires Xcode: xcode-select --install is NOT
# enough, you need full Xcode from the App Store).
#
# After it builds and opens the app once:
#   1. Safari → Settings → Advanced → "Show features for web developers"
#   2. Safari → Develop → Developer Settings → "Allow unsigned extensions"
#      (this resets on every Safari launch unless you sign the app)
#   3. Safari → Settings → Extensions → enable "Teams → Slack Status Sync"
#      and grant it access to teams.microsoft.com / teams.cloud.microsoft

set -e
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$REPO_DIR/dist/safari"

if ! command -v xcrun >/dev/null 2>&1 || ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "❌ safari-web-extension-converter not found — install Xcode from the App Store." >&2
  exit 1
fi

mkdir -p "$REPO_DIR/dist"
rm -rf "$OUT"
xcrun safari-web-extension-converter "$REPO_DIR/extension" \
  --project-location "$OUT" \
  --app-name "Teams Slack Sync" \
  --macos-only \
  --no-open \
  --force

echo ""
echo "✅ Xcode project generated in $OUT"
echo "Open it in Xcode, press Run (⌘R) once to install the wrapper app,"
echo "then follow the Safari steps at the top of this script."
