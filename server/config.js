// config.js
// All secrets come from environment variables — never hardcode the token.

module.exports = {
  // Slack USER token (starts with xoxp-) with the `users.profile:write` scope.
  slackToken: process.env.SLACK_USER_TOKEN || '',

  port: parseInt(process.env.PORT || '3838', 10),

  status: {
    text: process.env.SLACK_STATUS_TEXT || 'In a Teams call',
    emoji: process.env.SLACK_STATUS_EMOJI || ':telephone_receiver:',
  },

  // Append "with <participant name>" to the status when a name is detected.
  // Disable by adding to ~/.teams-slack-sync.env:
  //   export INCLUDE_PARTICIPANT=false
  includeParticipant: (process.env.INCLUDE_PARTICIPANT || 'true') !== 'false',

  // Clear status if the extension stops heartbeating for this long.
  staleAfterMs: parseInt(process.env.STALE_AFTER_MS || '60000', 10),

  // Detect calls in the standalone Teams desktop app via its local
  // third-party app API (Teams → Settings → Privacy). Disable with:
  //   export TEAMS_DESKTOP_ENABLED=false
  teamsDesktopEnabled: (process.env.TEAMS_DESKTOP_ENABLED || 'true') !== 'false',

  // Port of the Teams desktop app's local WebSocket API.
  teamsApiPort: parseInt(process.env.TEAMS_API_PORT || '8124', 10),

  // Slack status expiration window, refreshed on heartbeats during a call.
  expirationWindowMs: parseInt(process.env.EXPIRATION_WINDOW_MS || '120000', 10),
};
