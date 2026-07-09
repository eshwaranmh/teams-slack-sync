#!/bin/zsh
# uninstall.sh — removes the background service and stored token.
# (Remember to also remove the extension from chrome://extensions and
#  revoke the token at https://api.slack.com/apps if you're done with it.)

PLIST="$HOME/Library/LaunchAgents/com.teams-slack-sync.plist"
ENV_FILE="$HOME/.teams-slack-sync.env"
STATE_FILE="$HOME/.teams-slack-sync.state.json"

launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST" && echo "✅ launchd agent removed"
rm -f "$ENV_FILE" && echo "✅ token file removed"
rm -f "$STATE_FILE" && echo "✅ Teams pairing state removed"
echo "Done. Also remove the extension in chrome://extensions."
