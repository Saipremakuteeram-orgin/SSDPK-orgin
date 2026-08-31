// api/send-welcome.js
// Sends a welcome email to a newly registered member.
// Called from signup/login/dashboard: POST /api/send-welcome { email, name }

const { buildWelcomeEmail } = require('../js/mail-helpers.js');
const { cors, readBody, sendBatch, isValidEmail, fromEmail } = require('./_mail.js');

// ── Mirror a website signup to the Trust CRM as a contact (upsert by email).
// Best-effort — never blocks the welcome email. Reads CRM_WEBHOOK_URL /
// CRM_WEBHOOK_SECRET from the server environment (Vercel). The website signup
// is explicit consent, so we pass consent:true. ──
async function pushContactToCrm(contact) {
  const url = process.env.CRM_WEBHOOK_URL;
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!url || !secret) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const base = url.replace(/\/$/, '');
    await fetch(base + '/api/webhooks/website-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trust-Webhook-Key': secret },
      body: JSON.stringify({ contact: Object.assign({ consent: true }, contact) }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch (err) {
    console.error('[send-welcome] CRM contact push failed (non-fatal):', err.message);
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

  const email = body.email || '';
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  const name = body.name || '';
  const welcome = buildWelcomeEmail(name, fromEmail());

  const result = await sendBatch([Object.assign({ to: email }, welcome)]);
  if (!result.ok && result.error) {
    return res.status(500).json({ error: result.error });
  }

  // Fire-and-forget: save this member as a CRM contact.
  pushContactToCrm({ name, email, phone: body.phone || '' }).catch(() => {});

  return res.status(200).json({ sent: result.sent, failed: result.failed });
};
