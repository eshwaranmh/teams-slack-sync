# Teams → Slack Status Sync

Automatically sets your Slack status to **"In a Teams call"** :telephone_receiver:
while you're in a Microsoft Teams meeting — in the **desktop app** or in
**Teams web** (Chrome, Edge, Brave, Firefox, Safari) — and clears it when you
leave.

```text
Teams DESKTOP app ──── local WebSocket API (port 8124) ────┐
                                                           │
Teams WEB tab ── content script detects call UI ──┐        │
        Browser extension (background worker)     │        │
                POST heartbeats ──────────────────┴──► Local Node.js Server
                                                        (auto-starts on login)
                                                           │  users.profile.set
                                                           ▼
                                                        Slack API
```

- Zero npm dependencies (Node 22+ built-ins only)
- Server binds to `127.0.0.1` — nothing exposed on the network
- Each user runs it locally with **their own** Slack token; no shared secrets
- Self-healing: Slack `status_expiration` + heartbeat stale-timeout mean a
  crashed browser/app/server can't leave you stuck "in a call"
- Works on **macOS** and **Windows**

---

## Versions

Two versions are available for download on the
[Releases page](https://github.com/eshwaranmh/teams-slack-sync/releases) —
pick one, download its source zip, and run the installer:

| | **Version 1** ([v1.1.0](https://github.com/eshwaranmh/teams-slack-sync/releases/tag/v1.1.0)) | **Version 2** ([v2.0.0](https://github.com/eshwaranmh/teams-slack-sync/releases/tag/v2.0.0), latest) |
|---|---|---|
| Teams **web** (browser) | Chrome, Edge | Chrome, Edge, Brave, Firefox, Safari |
| Teams **desktop app** | — | ✅ via Teams' local third-party app API |
| Operating systems | macOS | macOS + Windows |
| Installer | `./setup.sh` | Interactive `./setup.sh` (macOS) / `setup.ps1` (Windows) — asks where you use Teams and which browser(s) |
| Node.js required | 18+ | 22+ |
| npm dependencies | none | none |

Version 2 is a superset of Version 1 — everything v1 did still works the same
way. Choose v1 only if you want the smallest possible footprint (web-only,
Chrome/Edge, macOS) or can't upgrade Node past 18.

**This README documents Version 2.** For v1's docs, see the README inside the
v1.1.0 source download.

---

## Versions

Two versions are available for download on the
[Releases page](https://github.com/eshwaranmh/teams-slack-sync/releases) —
pick one, download its source zip, and run the installer:

| | **Version 1** ([v1.1.0](https://github.com/eshwaranmh/teams-slack-sync/releases/tag/v1.1.0)) | **Version 2** ([v2.0.0](https://github.com/eshwaranmh/teams-slack-sync/releases/tag/v2.0.0), latest) |
|---|---|---|
| Teams **web** (browser) | Chrome, Edge | Chrome, Edge, Brave, Firefox, Safari |
| Teams **desktop app** | — | ✅ via Teams' local third-party app API |
| Operating systems | macOS | macOS + Windows |
| Installer | `./setup.sh` | Interactive `./setup.sh` (macOS) / `setup.ps1` (Windows) — asks where you use Teams and which browser(s) |
| Node.js required | 18+ | 22+ |
| npm dependencies | none | none |

Version 2 is a superset of Version 1 — everything v1 did still works the same
way. Choose v1 only if you want the smallest possible footprint (web-only,
Chrome/Edge, macOS) or can't upgrade Node past 18.

**This README documents Version 1.** For v2's docs, see the README inside the
v2.0.0 source download (or the Enhancement branch / PR #1).

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
> the installer stores it in a chmod-600 / owner-only file in your home
> directory and it is never committed — `.gitignore` blocks env files. Don't
> paste it into chats, tickets, or screenshots.
>
> If workspace admins restrict app installs, the button reads
> **Request to Install** — an admin approves it once per person.

### 2. Clone & install

**macOS**

```bash
git clone <REPO_URL>
cd teams-slack-sync
chmod +x setup.sh
./setup.sh
```

**Windows** (PowerShell)

```powershell
git clone <REPO_URL>
cd teams-slack-sync
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

The installer walks you through everything interactively:

1. **Slack token** — prompted with hidden input and validated live against Slack
2. **Where you use Teams** — desktop app, browser, or both (configures the server accordingly)
3. **Which browser(s)** — Chrome, Edge, Brave, Firefox, Safari (macOS) — and then
   shows only the steps for what you picked (and builds the Firefox zip /
   Safari project for you where possible)

It then installs a background service (launchd on macOS, Scheduled Task on
Windows) and starts the server. **The server starts automatically on every
login/reboot and restarts itself if it crashes.** Re-run the installer anytime
to change your choices; your saved token and settings are kept.

The sections below double as the full per-client reference.

### 3a. Teams DESKTOP app

One-time, inside Teams (new Teams client):

1. Teams → **Settings** → **Privacy** → **Third-party app API** →
   **Manage API** → enable the API
2. Join any meeting (Calendar → **Meet now**, alone is fine)
3. Teams shows a prompt that **TeamsSlackSync** wants to connect → **Allow**
   (the pairing prompt only appears while you're in a meeting)

That's it — the server remembers the pairing and reconnects automatically,
including after reboots and Teams restarts.

> If your org's Teams admin has disabled the third-party app API, desktop
> detection won't work (the server logs a hint) — browser detection below
> still does.

### 3b. Teams in the BROWSER

**Chrome / Edge / Brave** (load unpacked, ~1 minute)

1. `chrome://extensions` (or `edge://extensions`, `brave://extensions`)
2. Enable **Developer mode** (top-right)
3. **Load unpacked** → select the `extension/` folder from your clone
4. Reload your Teams tab (`https://teams.cloud.microsoft/`)

**Firefox** (signed install — survives restarts)

Firefox only permanently installs *signed* extensions, and Mozilla signs them
for free in minutes:

1. Run `./package-firefox.sh` → creates `dist/teams-slack-sync-firefox.zip`
2. Go to https://addons.mozilla.org/developers/ (free account) →
   **Submit a New Add-on** → choose **On your own** (unlisted) → upload the zip
3. Download the signed `.xpi` (ready after ~1–5 min) and drag it into a
   Firefox window → **Add**
4. `about:addons` → the extension → **Permissions** → enable access to
   `localhost` (Firefox treats host permissions as opt-in)
5. Reload your Teams tab

> Quick test without signing: `about:debugging` → **This Firefox** →
> **Load Temporary Add-on** → pick `extension/manifest.json`. Works fully,
> but is removed every time Firefox restarts.

**Safari** (macOS, needs Xcode once)

1. Run `./package-safari.sh` → generates an Xcode project in `dist/safari/`
2. Open it in Xcode → **Run** (⌘R) once to install the wrapper app
3. Safari → **Settings** → **Advanced** → enable *Show features for web developers*
4. Safari → **Develop** → **Developer Settings** → **Allow unsigned extensions**
   (⚠️ resets on every Safari launch unless you sign with a developer cert)
5. Safari → **Settings** → **Extensions** → enable **Teams → Slack Status Sync**
   and grant access to the Teams sites

### 4. Test

Join a meeting (Calendar → **Meet now** → Join, alone is fine) — in the
desktop app or a browser tab. Slack status should show **In a Teams call**
within ~20s and clear when you leave. Watch it live:

```bash
tail -f /tmp/teams-slack-sync.log                                  # macOS
Get-Content -Wait $env:LOCALAPPDATA\teams-slack-sync\server.log    # Windows
```

```text
🖥️  Teams desktop app: call started
✅ Slack status SET: In a Teams call
🧹 Slack status CLEARED (call ended on all sources)
```

---

## Customizing

Set these in `~/.teams-slack-sync.env` (then restart the service):

```bash
export SLACK_STATUS_TEXT="On a Teams call"
export SLACK_STATUS_EMOJI=":headphones:"
export PORT=3838
export INCLUDE_PARTICIPANT=false     # don't append "with <name>" (web only)
export TEAMS_DESKTOP_ENABLED=false   # disable desktop-app detection
export TEAMS_API_PORT=8124           # Teams local API port
```

(Windows: same file at `%USERPROFILE%\.teams-slack-sync.env`, written as
plain `KEY=value` lines — both formats are accepted.)

## Managing the background service

**macOS**

```bash
launchctl unload ~/Library/LaunchAgents/com.teams-slack-sync.plist  # stop
launchctl load   ~/Library/LaunchAgents/com.teams-slack-sync.plist  # start
tail -f /tmp/teams-slack-sync.log                                   # logs
curl -s http://localhost:3838/health                                # status
./uninstall.sh                                                      # remove all
```

**Windows** (PowerShell)

```powershell
Stop-ScheduledTask  -TaskName TeamsSlackSync                        # stop
Start-ScheduledTask -TaskName TeamsSlackSync                        # start
Get-Content -Wait $env:LOCALAPPDATA\teams-slack-sync\server.log     # logs
Invoke-RestMethod http://localhost:3838/health                      # status
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1            # remove all
```

`/health` shows the live per-source state (`web` = browser extension,
`desktop` = Teams app), which makes it easy to see which side isn't reporting.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Status never sets (browser) | Reload the extension **and then hard-reload the Teams tab** (Cmd+Shift+R) — an extension reload kills content scripts in open tabs |
| Status never sets (desktop app) | Check Teams Settings → Privacy → Third-party app API is enabled; join a meeting to trigger the one-time pairing prompt; check logs for "Teams desktop app not reachable" |
| Desktop pairing prompt never appears | It only shows **while you're in a meeting**; also confirm you're on the *new* Teams client |
| `invalid_auth` in logs | Token wrong/revoked — rerun the installer and paste a fresh token |
| `missing_scope` in logs | Scope added under Bot instead of **User** Token Scopes — fix and reinstall the Slack app |
| Server not running after reboot | macOS: `cat /tmp/teams-slack-sync.err`; Windows: check `%LOCALAPPDATA%\teams-slack-sync\server.err`; commonly Node moved/upgraded (rerun the installer) |
| Repo folder moved/renamed | The service points at the old path — rerun the installer |
| Status stuck "in a call" | Self-clears within 2 min via Slack expiration; check the server log |
| Firefox: no heartbeats | `about:addons` → extension → Permissions → grant localhost access (opt-in on Firefox) |
| Safari: extension greyed out after relaunch | Re-enable Develop → Developer Settings → Allow unsigned extensions (Safari resets it per launch) |

### Meeting not detected in the browser? (selector drift)

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

- Browser side: reads only the DOM state of your own Teams tab; no meeting
  content is captured, stored, or transmitted anywhere except a boolean to
  `localhost`.
- Desktop side: uses Microsoft's official local third-party app API, which
  exposes meeting *state* (in a meeting or not) — not content or participants.
  Desktop-detected calls therefore show the generic status text without a
  participant name.
- Writes only your own Slack status via your own token.
- Tokens live per-user in your home directory, never in the repo.

## Repo layout

```text
teams-slack-sync/
├── extension/            # Browser extension (MV3: Chrome/Edge/Brave/Firefox/Safari)
│   ├── manifest.json
│   ├── content.js        # detects meeting UI in the Teams tab
│   └── background.js     # aggregates frames, heartbeats localhost
├── server/               # zero-dependency Node server (Node 22+)
│   ├── server.js         # multi-source state machine + HTTP endpoint
│   ├── teamsDesktop.js   # Teams desktop app watcher (local WebSocket API)
│   ├── slack.js          # users.profile.set wrapper
│   ├── config.js         # env-driven config
│   └── package.json
├── setup.sh              # macOS installer (token + launchd + verify)
├── uninstall.sh
├── setup.ps1             # Windows installer (token + Scheduled Task + verify)
├── start-server.ps1      # Windows service entrypoint (keepalive loop)
├── uninstall.ps1
├── package-firefox.sh    # builds the zip for Mozilla's free signing
├── package-safari.sh     # generates the Safari wrapper app (Xcode)
└── README.md
```
