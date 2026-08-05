const { createClient } = require('@supabase/supabase-js');
const { cors } = require('./_lib.js');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await readBody(req);
  const { email } = parseJson(body);
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'email is required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const sb = createClient(supabaseUrl, serviceKey);
    const { data, error } = await sb
      .from('donations')
      .select('payment_id, subscription_id, amount, currency, purpose, method, status, created_at')
      .eq('donor_email', email)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ error: error.message });

    const rows = data || [];
    const autopaySubs = Array.from(new Set(rows.map((r) => r.subscription_id).filter(Boolean)));
    return res.status(200).json({
      total: rows.length,
      payments: rows,
      autopay: { active: autopaySubs.length > 0, subscription_ids: autopaySubs }
    });
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
