// background.js (MV3 service worker)
//
// Aggregates per-frame reports (meeting state + participant name) and pushes
// to the local server: instantly on state/name changes, periodically as a
// heartbeat so the server can refresh the Slack status expiration.

const SERVER_URL = 'http://localhost:3838/status';
const HEARTBEAT_MS = 10000;
const FRAME_TTL_MS = 20000;

// key: `${tabId}:${frameId}` -> { inMeeting, participant, ts }
const frameStates = new Map();
let lastPushedKey = null; // `${inMeeting}|${participant}` of last successful push

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'meeting-state') return;
  const tabId = sender.tab ? sender.tab.id : 'unknown';
  const frameId = sender.frameId != null ? sender.frameId : 'unknown';
  frameStates.set(`${tabId}:${frameId}`, {
    inMeeting: !!msg.inMeeting,
    participant: msg.participant || null,
    ts: Date.now(),
  });

  if (msg.urgent && aggregateKey() !== lastPushedKey) {
    pushState();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  let removed = false;
  for (const key of frameStates.keys()) {
    if (key.startsWith(`${tabId}:`)) {
      frameStates.delete(key);
      removed = true;
    }
  }
  if (removed && aggregateKey() !== lastPushedKey) {
    pushState();
  }
});

function aggregate() {
  const now = Date.now();
  let inMeeting = false;
  let participant = null;
  let newestNameTs = 0;
  for (const [key, s] of frameStates) {
    if (now - s.ts > FRAME_TTL_MS) {
      frameStates.delete(key);
      continue;
    }
    if (s.inMeeting) {
      inMeeting = true;
      // Prefer the most recently reported non-empty name from a meeting frame.
      if (s.participant && s.ts > newestNameTs) {
        participant = s.participant;
        newestNameTs = s.ts;
      }
    }
  }
  return { inMeeting, participant };
}

function aggregateKey() {
  const { inMeeting, participant } = aggregate();
  return `${inMeeting}|${participant || ''}`;
}

async function pushState() {
  const { inMeeting, participant } = aggregate();
  try {
    await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inMeeting, participant, ts: Date.now() }),
    });
    lastPushedKey = `${inMeeting}|${participant || ''}`;
  } catch (_) {
    // Server not running — it will catch up when started.
  }
}

chrome.alarms.create('heartbeat', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'heartbeat') pushState();
});

setInterval(pushState, HEARTBEAT_MS);
pushState();
