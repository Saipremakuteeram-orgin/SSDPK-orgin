const { createClient } = require('@supabase/supabase-js');
const { verifySignature, mapWebhookToDonation } = require('./helpers.cjs');
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
    if (row.method === 'auto' && !row.donor_email && row.subscription_id) {
      const { data: sub, error: subErr } = await sb
        .from('subscribers')
        .select('donor_email, donor_name, donor_phone')
        .eq('subscription_id', row.subscription_id)
        .maybeSingle();
      if (!subErr && sub && sub.donor_email) {
        row.donor_email = sub.donor_email;
        row.donor_name = row.donor_name || sub.donor_name || null;
        row.donor_phone = row.donor_phone || sub.donor_phone || null;
      }
    }
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