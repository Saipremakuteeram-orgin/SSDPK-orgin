const { createClient } = require('@supabase/supabase-js');
const { cors } = require('./_lib.js');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await readBody(req);
  const { subscription_id, email, name, phone } = parseJson(body);
  if (!subscription_id || !email) {
    return res.status(400).json({ error: 'subscription_id and email are required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const sb = createClient(supabaseUrl, serviceKey);
    const { error } = await sb.from('subscribers').upsert(
      {
        subscription_id,
        donor_email: email,
        donor_name: name || null,
        donor_phone: phone || null,
        status: 'active'
      },
      { onConflict: 'subscription_id' }
    );
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
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
