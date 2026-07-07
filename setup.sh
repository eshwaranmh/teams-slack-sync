#!/bin/zsh
# setup.sh — one-command installer for teams-slack-sync (macOS)
#
# What it does:
#   1. Checks Node.js >= 18
#   2. Asks for your Slack user token (input hidden, validated live)
#   3. Saves it to ~/.teams-slack-sync.env (chmod 600)
#   4. Installs a launchd agent so the server starts on every login/reboot
#      and restarts automatically if it crashes
#   5. Verifies the server is up
#
# Usage:  cd teams-slack-sync && ./setup.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_JS="$REPO_DIR/server/server.js"
ENV_FILE="$HOME/.teams-slack-sync.env"
PLIST="$HOME/Library/LaunchAgents/com.teams-slack-sync.plist"
LABEL="com.teams-slack-sync"
PORT="${PORT:-3838}"

bold() { print -P "%B$1%b"; }
ok()   { print -P "%F{green}✅ $1%f"; }
warn() { print -P "%F{yellow}⚠️  $1%f"; }
fail() { print -P "%F{red}❌ $1%f"; exit 1; }

bold "\n=== Teams → Slack Status Sync — Setup ===\n"

# --- 1. Node check -----------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js not found. Install it first:  brew install node"
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if (( NODE_MAJOR < 18 )); then
  fail "Node.js >= 18 required (you have $(node -v))."
fi
ok "Node $(node -v) found"

if [[ ! -f "$SERVER_JS" ]]; then
  fail "server/server.js not found next to this script. Run setup.sh from the repo root."
fi

# --- 2. Slack token ----------------------------------------------------------
if [[ -f "$ENV_FILE" ]] && grep -q 'xoxp-' "$ENV_FILE" 2>/dev/null; then
  warn "Existing token found at $ENV_FILE"
  read "REUSE?Keep the existing token? [Y/n] "
  if [[ "$REUSE" == [nN]* ]]; then
    NEED_TOKEN=1
  else
    NEED_TOKEN=0
  fi
else
  NEED_TOKEN=1
fi

if (( NEED_TOKEN )); then
  print ""
  print "You need a Slack USER token (starts with xoxp-)."
  print "How to get one (≈3 minutes):"
  print "  1. https://api.slack.com/apps → Create New App → From scratch"
  print "  2. OAuth & Permissions → User Token Scopes → add: users.profile:write"
  print "  3. Install to Workspace → Allow → copy the xoxp- token"
  print ""
  # -s hides the input so the token never shows on screen or in history
  read -s "TOKEN?Paste your xoxp- token (input hidden): "
  print ""
  [[ "$TOKEN" == xoxp-* ]] || fail "That doesn't look like a user token (must start with xoxp-)."

  print -n "Validating with Slack... "
  AUTH_OK=$(curl -s -X POST https://slack.com/api/auth.test \
    -H "Authorization: Bearer $TOKEN" | node -p 'JSON.parse(require("fs").readFileSync(0)).ok' 2>/dev/null || echo false)
  [[ "$AUTH_OK" == "true" ]] || fail "Slack rejected the token (auth.test failed). Re-copy it and try again."
  ok "Token valid"

  umask 177
  print "export SLACK_USER_TOKEN=\"$TOKEN\"" > "$ENV_FILE"
  umask 022
  chmod 600 "$ENV_FILE"
  ok "Token saved to $ENV_FILE (owner-read-only)"
fi

# --- 3. launchd agent (auto-start on login/reboot) ---------------------------
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>source "$ENV_FILE" &amp;&amp; exec node "$SERVER_JS"</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/teams-slack-sync.log</string>
  <key>StandardErrorPath</key><string>/tmp/teams-slack-sync.err</string>
</dict>
</plist>
PLIST_EOF

# Reload cleanly whether or not it was already loaded
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
ok "launchd agent installed — server now starts on every login/reboot"

# --- 4. Verify ----------------------------------------------------------------
print -n "Waiting for server..."
for i in {1..10}; do
  sleep 1
  HEALTH=$(curl -s "http://localhost:$PORT/health" 2>/dev/null || true)
  if [[ "$HEALTH" == *'"ok":true'* ]]; then
    print ""
    ok "Server is up: http://localhost:$PORT  (logs: /tmp/teams-slack-sync.log)"
    break
  fi
  print -n "."
  if (( i == 10 )); then
    print ""
    fail "Server didn't come up. Check /tmp/teams-slack-sync.err"
  fi
done

# --- 5. Next steps -------------------------------------------------------------
bold "\n=== Almost done — load the Chrome extension ===\n"
print "  1. Open chrome://extensions"
print "  2. Enable Developer mode (top-right)"
print "  3. Load unpacked → select:  $REPO_DIR/extension"
print "  4. Reload your Teams tab (https://teams.cloud.microsoft/)"
print ""
print "Test: join a 'Meet now' meeting — your Slack status should flip to"
print "'In a Teams call' within ~20s, and clear when you leave."
print ""
print "Manage the background service:"
print "  launchctl unload $PLIST   # stop"
print "  launchctl load $PLIST     # start"
print "  tail -f /tmp/teams-slack-sync.log         # watch logs"
print ""
