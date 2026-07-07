# Teams Web → Slack Status Sync

Automatically sets your Slack status to **"In a Teams call"** :telephone_receiver:
while you're in a Microsoft Teams (web) meeting in Chrome, and clears it when
you leave.

```text
Teams Web (Chrome tab / meeting iframe)
        │  content script detects "Leave / Hang up" UI
Chrome Extension (background worker)
        │  POST heartbeats → http://localhost:3838/status
Local Node.js Server (launchd, auto-starts on login)
        │  users.profile.set
Slack API
```

- Zero npm dependencies (Node 18+ built-ins only)
- Server binds to `127.0.0.1` — nothing exposed on the network
- Each user runs it locally with **their own** Slack token; no shared secrets
- Self-healing: Slack `status_expiration` + heartbeat stale-timeout mean a
  crashed Chrome/server can't leave you stuck "in a call"

---

## Setup (≈5 minutes per person)

### 1. Get a Slack user token

1. Go to https://api.slack.com/apps → **Create New App** → *From scratch*
2. Name: `Teams Status Sync`, pick the workspace → **Create App**
3. Left sidebar → **OAuth & Permissions** → scroll to **Scopes** →
   under **User Token Scopes** (NOT Bot) add: `users.profile:write`
4. Scroll up → **Install to Workspace** → **Allow**
5. Copy the **User OAuth Token** (starts with `xoxp-`)

> 🔐 This token can edit *your* profile/status. Treat it like a password:
> the installer stores it in `~/.teams-slack-sync.env` (chmod 600) and it is
> never committed — `.gitignore` blocks env files. Don't paste it into chats,
> tickets, or screenshots.
>
> If workspace admins restrict app installs, the button reads
> **Request to Install** — an admin approves it once per person.

### 2. Clone & install

```bash
git clone <REPO_URL>
cd teams-slack-sync
chmod +x setup.sh
./setup.sh
```

The installer prompts for your token (hidden input, validated against Slack),
installs a launchd agent, and starts the server. **The server now starts
automatically on every login/reboot and restarts itself if it crashes.**

### 3. Load the Chrome extension

1. `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. **Load unpacked** → select the `extension/` folder from your clone
4. Reload your Teams tab (`https://teams.cloud.microsoft/`)

### 4. Test

Join a meeting (Calendar → **Meet now** → Join, alone is fine).
Slack status should show **In a Teams call** within ~20s and clear when you
leave. Watch it live:

```bash
tail -f /tmp/teams-slack-sync.log
```

```text
✅ Slack status SET: In a Teams call
🧹 Slack status CLEARED (meeting ended)
```

---

## Customizing

Set these in `~/.teams-slack-sync.env` (then `launchctl unload` + `load` the
plist, or just reboot):

```bash
export SLACK_STATUS_TEXT="On a Teams call"
export SLACK_STATUS_EMOJI=":headphones:"
export PORT=3838
```

## Managing the background service

```bash
launchctl unload ~/Library/LaunchAgents/com.teams-slack-sync.plist  # stop
launchctl load   ~/Library/LaunchAgents/com.teams-slack-sync.plist  # start
tail -f /tmp/teams-slack-sync.log                                   # logs
curl -s http://localhost:3838/health                                # status
./uninstall.sh                                                      # remove all
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Status never sets | Reload the extension **and then hard-reload the Teams tab** (Cmd+Shift+R) — an extension reload kills content scripts in open tabs |
| `invalid_auth` in logs | Token wrong/revoked — rerun `./setup.sh` and paste a fresh token |
| `missing_scope` in logs | Scope added under Bot instead of **User** Token Scopes — fix and reinstall the Slack app |
| Server not running after reboot | `cat /tmp/teams-slack-sync.err`; commonly Node moved (rerun `./setup.sh`) |
| Repo folder moved/renamed | launchd points at the old path — rerun `./setup.sh` |
| Status stuck "in a call" | Self-clears within 2 min via Slack expiration; check `tail /tmp/teams-slack-sync.log` |

### Meeting not detected? (selector drift)

Teams changes its DOM often. While **in a call**, open DevTools on the Teams
tab → Console (check each frame in the dropdown) and run:

```javascript
[
  '#hangup-button',
  '[data-tid="hangup-main-btn"]',
  '[data-tid="hangup-button"]',
  '[data-tid="call-duration"]',
  '[data-tid="calling-screen"]',
  'button[aria-label*="Leave"]',
  'button[title*="Leave"]',
  'button[aria-label*="Hang up"]',
].map(s => [s, !!document.querySelector(s)])
```

At least one should be `true` during a call. If not, find your tenant's
leave/hangup element and add its selector to `MEETING_SELECTORS` in
`extension/content.js`, then reload the extension + Teams tab. Please also
open a PR/issue so everyone gets the fix.

## Privacy & security notes

- Reads only the DOM state of your own Teams tab; no meeting content is
  captured, stored, or transmitted anywhere except a boolean to `localhost`.
- Writes only your own Slack status via your own token.
- Tokens live per-user in `~/.teams-slack-sync.env`, never in the repo.

## Repo layout

```text
teams-slack-sync/
├── extension/          # Chrome extension (MV3)
│   ├── manifest.json
│   ├── content.js      # detects meeting UI in the Teams tab
│   └── background.js   # aggregates frames, heartbeats localhost
├── server/             # zero-dependency Node server
│   ├── server.js       # state machine + HTTP endpoint
│   ├── slack.js        # users.profile.set wrapper
│   ├── config.js       # env-driven config
│   └── package.json
├── setup.sh            # installer (token + launchd + verify)
├── uninstall.sh
└── README.md
```
