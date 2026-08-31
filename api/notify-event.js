// api/notify-event.js
// Sends an email to all registered members when a new event is added.
// Called by the admin dashboard: POST /api/notify-event { event, emails }

const { chunkArray, buildEventEmail } = require('../js/mail-helpers.js');
const { cors, readBody, sendBatch, fromEmail } = require('./_mail.js');

// ── Optional: mirror the new event to the Trust CRM so a budget Function is
// auto-created. Best-effort — never blocks the email send. Reads CRM_WEBHOOK_URL
// and CRM_WEBHOOK_SECRET from the server environment (set in Vercel). ──
async function pushEventToCrm(event) {
  const url = process.env.CRM_WEBHOOK_URL;
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!url || !secret) return; // bridge disabled — nothing to do
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trust-Webhook-Key': secret },
      body: JSON.stringify({ event }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch (err) {
    console.error('[notify-event] CRM push failed (non-fatal):', err.message);
  }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const event = body.event;
  const emails = Array.isArray(body.emails) ? body.emails : [];

  if (!event || !event.title) {
    return res.status(400).json({ error: 'event with a title is required' });
  }
  if (emails.length === 0) {
    return res.status(200).json({ sent: 0, failed: 0, total: 0, skipped: 'no recipient emails' });
  }

  const baseUrl = 'https://' + (req.headers.host || 'sathyasaipremakuterram.org');
  const email = buildEventEmail(event, baseUrl, fromEmail());
  const chunks = chunkArray(emails, 100);
  const messages = [];
  chunks.forEach(function (chunk) {
    chunk.forEach(function (to) {
      messages.push(Object.assign({ to: to }, email));
    });
  });

  const result = await sendBatch(messages);
  if (!result.ok && result.error) {
    return res.status(500).json({ error: result.error });
  }

  // Fire-and-forget: create a budget Function in the CRM for this event.
  pushEventToCrm(event).catch(() => {});

  return res.status(200).json({
    sent: result.sent,
    failed: result.failed,
    total: messages.length,
    results: result.results
  });
};
