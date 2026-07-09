// teamsDesktop.js
// Detects calls in the standalone Microsoft Teams desktop app via Teams'
// built-in local "third-party app API" — a WebSocket on localhost:8124 that
// streams meeting state (the same API used by Stream Deck / MuteDeck).
//
// Requirements (one-time, per user):
//   1. New Teams client (v2), signed in.
//   2. Teams → Settings → Privacy → "Third-party app API" → Manage API → enable.
//   3. First connection while IN a meeting shows an "allow" prompt in Teams;
//      approving it sends us a token which we persist and reuse forever.
//
// Uses Node's global WebSocket (Node >= 22). Zero dependencies.

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');

const STATE_FILE = path.join(os.homedir(), '.teams-slack-sync.state.json');
const RECONNECT_MS = 10000;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function loadToken() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).teamsApiToken || '';
  } catch (_) {
    return '';
  }
}

function saveToken(token) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ teamsApiToken: token }), { mode: 0o600 });
  } catch (e) {
    log('⚠️ Could not persist Teams API token:', e.message);
  }
}

// onState(inMeeting: boolean) is called on every state change AND as a
// keepalive echo, mirroring how the extension heartbeats the web source.
function start(onState) {
  if (!config.teamsDesktopEnabled) {
    log('ℹ️ Teams desktop detection disabled (TEAMS_DESKTOP_ENABLED=false)');
    return;
  }
  if (typeof WebSocket !== 'function') {
    log('⚠️ Node >= 22 required for Teams desktop detection (no global WebSocket). ' +
        'Web detection still works.');
    return;
  }

  let ws = null;
  let closed = false;       // becomes true only via stop()
  let warnedOnce = false;

  function connect() {
    const params = new URLSearchParams({
      'protocol-version': '2.0.0',
      manufacturer: 'TeamsSlackSync',
      device: 'TeamsSlackSync',
      app: 'TeamsSlackSync',
      'app-version': '1.2.0',
    });
    const token = loadToken();
    if (token) params.set('token', token);

    try {
      ws = new WebSocket(`ws://localhost:${config.teamsApiPort}?${params}`);
    } catch (e) {
      return scheduleReconnect();
    }

    ws.onopen = () => {
      warnedOnce = false;
      log(`🖥️  Connected to Teams desktop app (local API on port ${config.teamsApiPort})` +
          (token ? '' : ' — waiting for pairing approval (prompt appears in Teams during a meeting)'));
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      if (msg.tokenRefresh) {
        saveToken(msg.tokenRefresh);
        log('🔑 Teams desktop pairing approved — token saved');
      }
      const state = msg.meetingUpdate && msg.meetingUpdate.meetingState;
      if (state && typeof state.isInMeeting === 'boolean') {
        onState(state.isInMeeting);
      }
    };

    ws.onclose = () => {
      // Teams quit, API disabled, or pairing rejected. Desktop source off.
      onState(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      if (!warnedOnce) {
        warnedOnce = true;
        log(`ℹ️ Teams desktop app not reachable on port ${config.teamsApiPort} — will keep retrying. ` +
            '(Is Teams running with Settings → Privacy → Third-party app API enabled?)');
      }
      // onclose fires after onerror and handles reconnection.
    };
  }

  function scheduleReconnect() {
    if (closed) return;
    setTimeout(connect, RECONNECT_MS);
  }

  connect();

  return function stop() {
    closed = true;
    try { ws && ws.close(); } catch (_) {}
  };
}

module.exports = { start };
