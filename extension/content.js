// content.js
// Runs inside the Teams web page (and its iframes — meetings render inside
// an iframe, which is why manifest.json sets all_frames: true).
//
// Detects (a) whether a call is active and (b) the name of one other
// participant, and reports both to the background worker. Detection is
// event-driven via MutationObserver, with a slow interval as heartbeat.

const HEARTBEAT_INTERVAL_MS = 5000;
const DEBOUNCE_MS = 250;

const MEETING_SELECTORS = [
  '#hangup-button',
  '[data-tid="hangup-main-btn"]',
  '[data-tid="hangup-button"]',
  '[data-tid="call-duration"]',
  '[data-tid="calling-screen"]',
  'button[aria-label*="Leave"]',
  'button[title*="Leave"]',
  'button[aria-label*="Hang up"]',
];

// Places where participant names tend to live. Ordered by reliability.
const NAME_SELECTORS = [
  '[data-tid="participant-tile-name"]',
  '[data-tid="roster-participant-name"]',
  '[data-tid="display-name"]',
  '[data-cid="calling-participant-stream"][aria-label]',
  '[data-tid*="participant"][aria-label]',
  '[data-tid*="video-tile"][aria-label]',
];

let lastReported = null;      // last inMeeting boolean reported
let lastReportedName = null;  // last participant name reported
let debounceTimer = null;

function isInMeeting() {
  for (const sel of MEETING_SELECTORS) {
    try {
      if (document.querySelector(sel)) return true;
    } catch (_) {}
  }
  return false;
}

// Reject junk: our own tile ("(You)"), UI words, absurd lengths.
function cleanName(raw) {
  if (!raw) return null;
  let name = String(raw)
    .replace(/\(.*?\)/g, ' ')            // "(You)", "(Guest)", "(Unverified)"
    .replace(/\b(muted|unmuted|camera|video|is presenting|pinned|spotlighted)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || name.length > 50) return null;
  if (!/[a-z]/i.test(name)) return null;
  if (/\b(you|microsoft|teams|meeting|call|chat|calendar|leave|mute|share|participants?|people)\b/i.test(name)) return null;
  return name;
}

function getParticipantName() {
  // 1) Known name-ish elements in the calling UI
  for (const sel of NAME_SELECTORS) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        const name = cleanName(el.getAttribute('aria-label') || el.textContent);
        if (name) return name;
      }
    } catch (_) {}
  }

  // 2) Tab/frame title, e.g. "Chat | mahesh vaishnav | Microsoft Teams"
  //    or "mahesh vaishnav | Microsoft Teams" during a 1:1 call.
  try {
    const parts = document.title.split('|').map((p) => p.trim());
    for (const p of parts) {
      const name = cleanName(p);
      if (name) return name;
    }
  } catch (_) {}

  return null;
}

function send(inMeeting, participant, urgent) {
  try {
    chrome.runtime.sendMessage({
      type: 'meeting-state',
      inMeeting,
      participant: participant || null,
      urgent: !!urgent,
    });
  } catch (_) {
    // Extension context may be invalidated on reload; ignore.
  }
}

function checkAndReport() {
  let inMeeting = false;
  let participant = null;
  try {
    inMeeting = isInMeeting();
    if (inMeeting) participant = getParticipantName();
  } catch (_) {}

  const changed = inMeeting !== lastReported || participant !== lastReportedName;
  lastReported = inMeeting;
  lastReportedName = participant;
  send(inMeeting, participant, changed);
}

function scheduleCheck() {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    checkAndReport();
  }, DEBOUNCE_MS);
}

const observer = new MutationObserver(scheduleCheck);

function startObserver() {
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
}

startObserver();
setInterval(checkAndReport, HEARTBEAT_INTERVAL_MS);
checkAndReport();
