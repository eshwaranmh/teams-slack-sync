// slack.js
// Thin wrapper over Slack's users.profile.set. Requires Node 18+ (global fetch).

const config = require('./config');

const SLACK_STATUS_MAX = 100; // Slack hard limit on status_text length

async function setProfileStatus(text, emoji, expirationUnixTs) {
  const res = await fetch('https://slack.com/api/users.profile.set', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${config.slackToken}`,
    },
    body: JSON.stringify({
      profile: {
        status_text: text,
        status_emoji: emoji,
        status_expiration: expirationUnixTs || 0,
      },
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error || 'unknown'}`);
  }
  return data;
}

function buildStatusText(participant) {
  let text = config.status.text;
  if (config.includeParticipant && participant) {
    text = `${text} with ${participant}`;
  }
  if (text.length > SLACK_STATUS_MAX) {
    text = text.slice(0, SLACK_STATUS_MAX - 1) + '…';
  }
  return text;
}

async function setInCallStatus(participant) {
  const expiration = Math.floor((Date.now() + config.expirationWindowMs) / 1000);
  return setProfileStatus(buildStatusText(participant), config.status.emoji, expiration);
}

async function clearStatus() {
  return setProfileStatus('', '', 0);
}

module.exports = { setInCallStatus, clearStatus, buildStatusText };
