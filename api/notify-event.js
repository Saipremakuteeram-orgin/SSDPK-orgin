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
  if (!url || !secret) return 'disabled:url=' + (!!url) + ',secret=' + (!!secret);
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45000);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Trust-Webhook-Key': secret },
        body: JSON.stringify({ event }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const txt = await resp.text();
      if (resp.status === 200) return 'status=200 body=' + txt.slice(0, 200);
      last = 'status=' + resp.status + ' body=' + txt.slice(0, 200);
      if (resp.status === 401) return last; // auth wrong, no point retrying
    } catch (err) {
      last = 'attempt' + attempt + '-fetch-error: ' + err.message;
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
  }
  return 'failed-after-retries: ' + last;
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

  // Email is best-effort and MUST NOT block the CRM sync below.
  let result = { sent: 0, failed: 0, total: 0, results: [] };
  const messages = [];
  if (emails.length > 0) {
    const baseUrl = 'https://' + (req.headers.host || 'sathyasaipremakuterram.org');
    const email = buildEventEmail(event, baseUrl, fromEmail());
    const chunks = chunkArray(emails, 100);
    chunks.forEach(function (chunk) {
      chunk.forEach(function (to) {
        messages.push(Object.assign({ to: to }, email));
      });
    });

    result = await sendBatch(messages);
  }

  // ALWAYS create / sync the budget Function in the CRM for this event,
  // independent of whether emails were sent. Best-effort, never throws.
  // [DIAGNOSTIC] surface the CRM push result for debugging.
  let crmDiag = 'skipped';
  try {
    crmDiag = await pushEventToCrm(event);
  } catch (e) {
    crmDiag = 'error: ' + e.message;
  }

  if (!result.ok && result.error) {
    return res.status(500).json({ error: result.error, crmSynced: true });
  }

  return res.status(200).json({
    sent: result.sent,
    failed: result.failed,
    total: messages.length,
    results: result.results,
    crmSynced: true,
    crmDiag: crmDiag
  });
};
