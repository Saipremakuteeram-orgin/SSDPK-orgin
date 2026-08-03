const { createClient } = require('@supabase/supabase-js');
const { verifySignature, mapWebhookToDonation } = require('../../js/razorpay-helpers.js');
const { cors } = require('./_lib.js');
const sendTelegramAlert = require('./telegram.js');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = await readBody(req);
  const signature = req.headers['x-razorpay-signature'] || '';
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!verifySignature(secret, rawBody, signature)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = parseJson(rawBody);
  const row = mapWebhookToDonation(event);
  if (!row) return res.status(200).json({ received: true, ignored: true });

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env');
      return res.status(500).json({ error: 'Server not configured' });
    }
    const sb = createClient(supabaseUrl, serviceKey);
    const { error } = await sb.from('donations').upsert(
      { ...row, webhook_raw: event },
      { onConflict: 'payment_id' }
    );
    if (error) {
      console.error('donations upsert error:', error.message);
      return res.status(500).json({ error: 'DB insert failed' });
    }
    await sendTelegramAlert('Seva received: Rs ' + row.amount + ' (' + row.purpose + ') via ' + row.method);
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('webhook processing error:', e.message);
    return res.status(500).json({ error: 'Processing failed' });
  }
};

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => resolve(d));
  });
}

function parseJson(body) {
  try { return JSON.parse(body || '{}'); } catch (e) { return {}; }
}