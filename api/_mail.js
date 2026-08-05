// api/_mail.js
// Shared Resend caller for Vercel serverless functions (notify-event, send-welcome).
// Uses Resend's batch endpoint: https://resend.com/docs/api-reference/emails/send-batch-emails

const RESEND_BATCH_URL = 'https://api.resend.com/batch';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { reject(new Error('Invalid JSON body')); } });
    req.on('error', reject);
  });
}

function getApiKey() {
  return process.env.RESEND_API_KEY;
}

function fromAddress() {
  const name = process.env.RESEND_FROM_NAME || 'Sathya Sai Prema Kuteeram';
  const email = process.env.RESEND_FROM_EMAIL || '';
  return email ? name + ' <' + email + '>' : name;
}

function fromEmail() {
  return process.env.RESEND_FROM_EMAIL || '';
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Sends an array of { to, subject, text, html } messages via Resend batch.
// Returns { ok, sent, failed, results }.
async function sendBatch(messages) {
  if (!getApiKey()) {
    return { ok: false, sent: 0, failed: messages.length, error: 'RESEND_API_KEY not configured on server' };
  }

  const from = fromAddress();
  const normalized = (messages || [])
    .map(function (m) { return {
      from: from,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html
    }; })
    .filter(function (m) { return isValidEmail(m.to); });

  let sent = 0;
  let failed = 0;
  const results = [];

  for (let i = 0; i < normalized.length; i += 100) {
    const chunk = normalized.slice(i, i + 100);
    try {
      const res = await fetch(RESEND_BATCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + getApiKey()
        },
        body: JSON.stringify(chunk)
      });
      if (res.ok) {
        sent += chunk.length;
        results.push({ chunk: i / 100, ok: true });
      } else {
        failed += chunk.length;
        results.push({ chunk: i / 100, ok: false, status: res.status });
      }
    } catch (e) {
      failed += chunk.length;
      results.push({ chunk: i / 100, ok: false, error: e.message });
    }
  }

  return { ok: failed === 0, sent: sent, failed: failed, results: results };
}

module.exports = { cors, readBody, getApiKey, fromAddress, fromEmail, isValidEmail, sendBatch };