// server.js
// Zero-dependency local server (Node 22+). Run with:
//   source ~/.teams-slack-sync.env && node server.js
//
// Two detection sources feed one Slack status:
//   web     — the browser extension POSTs { inMeeting, participant } to /status
//   desktop — the standalone Teams app, via its local WebSocket API (teamsDesktop.js)
//
// State machine on the AGGREGATE (in a call if ANY fresh source says so):
//   - false -> true            : set Slack status ("... with <name>" if known)
//   - name appears/changes     : update the status text immediately
//   - while true               : refresh Slack status expiration periodically
//   - true -> false            : clear Slack status
//   - web heartbeats go stale  : that source stops counting (safety net)

const http = require('http');
const config = require('./config');
const slack = require('./slack');
const teamsDesktop = require('./teamsDesktop');

if (!config.slackToken) {
  console.error('ERROR: SLACK_USER_TOKEN env var is not set. Aborting.');
  process.exit(1);
}

let statusIsSet = false;
let currentText = null;       // status text we last set
let lastRefreshTs = 0;
let evaluating = false;       // skip overlapping evaluations; next tick converges

const REFRESH_EVERY_MS = 45000;
const TICK_MS = 10000;

// Per-source meeting state. Web is heartbeat-driven and goes stale after
// config.staleAfterMs; desktop is event-driven (its WebSocket close resets it).
const sources = {
  web: { inMeeting: false, participant: null, ts: 0 },
  desktop: { inMeeting: false, ts: 0 },
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function sanitizeParticipant(p) {
  if (!p || typeof p !== 'string') return null;
  const name = p.replace(/\s+/g, ' ').trim().slice(0, 50);
  return name.length >= 2 ? name : null;
}

function aggregate() {
  const now = Date.now();
  const webActive = sources.web.inMeeting && now - sources.web.ts <= config.staleAfterMs;
  const inMeeting = webActive || sources.desktop.inMeeting;
  // Only the web source can name a participant (Teams' local API doesn't).
  const participant = webActive ? sources.web.participant : null;
  return { inMeeting, participant };
}

async function evaluate() {
  if (evaluating) return;
  evaluating = true;
  try {
    const now = Date.now();
    const { inMeeting, participant } = aggregate();

    if (inMeeting) {
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
      log('🧹 Slack status CLEARED (call ended on all sources)');
    }
  } catch (e) {
    log('⚠️ Slack update failed:', e.message);
  } finally {
    evaluating = false;
  }
}

// Periodic tick: refreshes expiration during desktop-only calls (no web
// heartbeats then) and clears the status once web heartbeats go stale.
setInterval(evaluate, TICK_MS);

teamsDesktop.start((inMeeting) => {
  const changed = sources.desktop.inMeeting !== inMeeting;
  sources.desktop = { inMeeting, ts: Date.now() };
  if (changed) {
    log(`🖥️  Teams desktop app: ${inMeeting ? 'call started' : 'call ended'}`);
  }
  evaluate();
});

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
    return res.end(JSON.stringify({
      ok: true,
      statusIsSet,
      currentText,
      aggregate: aggregate(),
      sources,
    }));
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
        sources.web = {
          inMeeting: !!inMeeting,
          participant: sanitizeParticipant(participant),
          ts: Date.now(),
        };
        await evaluate();
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
