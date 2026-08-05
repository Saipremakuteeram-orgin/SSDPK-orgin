// api/send-welcome.js
// Sends a welcome email to a newly registered member.
// Called from signup/login/dashboard: POST /api/send-welcome { email, name }

const { buildWelcomeEmail } = require('../js/mail-helpers.js');
const { cors, readBody, sendBatch, isValidEmail, fromEmail } = require('./_mail.js');

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
  return res.status(200).json({ sent: result.sent, failed: result.failed });
};
