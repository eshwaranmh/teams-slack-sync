// server.js
// Zero-dependency local server (Node 18+). Run with:
//   source ~/.teams-slack-sync.env && node server.js
//
// The Chrome extension POSTs { inMeeting, participant } heartbeats to /status.
// State machine:
//   - false -> true            : set Slack status ("... with <name>" if known)
//   - name appears/changes     : update the status text immediately
//   - heartbeats while true    : refresh Slack status expiration
//   - true -> false            : clear Slack status
//   - no heartbeat for a while : clear Slack status (safety net)

const http = require('http');
const config = require('./config');
const slack = require('./slack');

if (!config.slackToken) {
  console.error('ERROR: SLACK_USER_TOKEN env var is not set. Aborting.');
  process.exit(1);
}

let statusIsSet = false;
let currentText = null;       // status text we last set
let lastHeartbeatTs = 0;
let lastRefreshTs = 0;

const REFRESH_EVERY_MS = 45000;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function sanitizeParticipant(p) {
  if (!p || typeof p !== 'string') return null;
  const name = p.replace(/\s+/g, ' ').trim().slice(0, 50);
  return name.length >= 2 ? name : null;
}

async function handleState(inMeeting, participant) {
  const now = Date.now();
  participant = sanitizeParticipant(participant);

  if (inMeeting) {
    lastHeartbeatTs = now;
    const desiredText = slack.buildStatusText(participant);

    if (!statusIsSet) {
      await slack.setInCallStatus(participant);
      statusIsSet = true;
      currentText = desiredText;
      lastRefreshTs = now;
      log(`✅ Slack status SET: ${desiredText}`);
    } else if (desiredText !== currentText && participant) {
      // Name appeared or changed mid-call — update the text right away.
      // (Only upgrade when we HAVE a name; a transiently missing name should
      // not downgrade "with X" back to the generic text.)
      await slack.setInCallStatus(participant);
      currentText = desiredText;
      lastRefreshTs = now;
      log(`✏️  Slack status UPDATED: ${desiredText}`);
    } else if (now - lastRefreshTs > REFRESH_EVERY_MS) {
      await slack.setInCallStatus(participant);
      lastRefreshTs = now;
      log('🔄 Slack status expiration refreshed');
    }
  } else if (statusIsSet) {
    await slack.clearStatus();
    statusIsSet = false;
    currentText = null;
    log('🧹 Slack status CLEARED (meeting ended)');
  }
}

// Safety net: extension went silent while a status was set.
setInterval(async () => {
  if (statusIsSet && Date.now() - lastHeartbeatTs > config.staleAfterMs) {
    try {
      await slack.clearStatus();
      statusIsSet = false;
      currentText = null;
      log('🧹 Slack status CLEARED (heartbeats went stale)');
    } catch (e) {
      log('⚠️ Failed to clear stale status:', e.message);
    }
  }
}, 10000);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, statusIsSet, currentText, lastHeartbeatTs }));
  }

  if (req.method === 'POST' && req.url === '/status') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const { inMeeting, participant } = JSON.parse(body || '{}');
        await handleState(!!inMeeting, participant);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        log('⚠️ Error handling /status:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(config.port, '127.0.0.1', () => {
  log(`🚀 teams-slack-sync server listening on http://localhost:${config.port}`);
  log(`   Status text: "${config.status.text}" ${config.status.emoji}` +
      (config.includeParticipant ? ' (+ participant name when detected)' : ''));
});
