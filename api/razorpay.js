// api/razorpay.js — single dispatcher for all razorpay actions to stay within Vercel Hobby 12-function limit
// Replaces 8 separate files: order, payment-link, subscription, config, history, subscribe, plans, webhook
// Verifiable via vercel.json rewrites: /api/razorpay/:action* -> /api/razorpay?action=:action

const { createClient } = require('@supabase/supabase-js');
const { validateAmount, buildOrderPayload, buildPaymentLinkPayload, buildSubscriptionPayload, verifySignature, mapWebhookToDonation } = require('./razorpay/_helpers.cjs');
const { razorpayHeaders, cors } = require('./razorpay/_lib.js');
const sendTelegramAlert = require('./razorpay/_telegram.js');

const PURPOSES = [
  { id: 'annadana', amount: 101, labelKey: 'seva.purposeAnnadana' },
  { id: 'homam', amount: 1101, labelKey: 'seva.purposeHomam' },
  { id: 'veda', amount: 501, labelKey: 'seva.purposeVeda' },
  { id: 'grocery', amount: 251, labelKey: 'seva.purposeGrocery' }
];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url || '/', 'http://x');
  let action = url.searchParams.get('action') || '';
  if (!action) {
    const last = (url.pathname || '').split('/').pop().split('?')[0];
    action = last || '';
  }
  // Normalize dashes and aliases
  action = String(action).toLowerCase().replace(/_/g, '-');
  // Map aliases
  if (action === 'payment_link' || action === 'paymentlink') action = 'payment-link';
  if (action === 'razorpay' || action === '') action = 'order'; // fallback

  switch (action) {
    case 'order': return handleOrder(req, res);
    case 'payment-link': return handlePaymentLink(req, res);
    case 'subscription': return handleSubscription(req, res);
    case 'config': return handleConfig(req, res);
    case 'history': return handleHistory(req, res);
    case 'subscribe': return handleSubscribe(req, res);
    case 'plans': return handlePlans(req, res);
    case 'webhook': return handleWebhook(req, res);
    default: return res.status(404).json({ error: 'Unknown razorpay action: ' + action });
  }
};

async function handleOrder(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = await readBody(req);
  const { amount, purpose, donor } = parseJson(body);
  const rupees = validateAmount(amount);
  if (rupees === null) return res.status(400).json({ error: 'Invalid amount' });
  const payload = buildOrderPayload(rupees, purpose, donor);
  payload.amount = rupees * 100;
  try {
    const rp = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: razorpayHeaders(), body: JSON.stringify(payload) });
    const data = await rp.json();
    if (!rp.ok) return res.status(502).json({ error: data.error && data.error.description || 'Razorpay order failed' });
    return res.status(200).json({ order_id: data.id, key_id: process.env.RAZORPAY_KEY_ID, amount: rupees, currency: 'INR' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

async function handlePaymentLink(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = await readBody(req);
  const { amount, purpose, donor } = parseJson(body);
  const rupees = validateAmount(amount);
  if (rupees === null) return res.status(400).json({ error: 'Invalid amount' });
  const payload = buildPaymentLinkPayload(rupees, purpose, donor);
  try {
    const rp = await fetch('https://api.razorpay.com/v1/payment_links', { method: 'POST', headers: razorpayHeaders(), body: JSON.stringify(payload) });
    const data = await rp.json();
    if (!rp.ok) return res.status(502).json({ error: data.error && data.error.description || 'Razorpay link failed' });
    return res.status(200).json({ short_url: data.short_url, id: data.id });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

async function handleSubscription(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = await readBody(req);
  const { amount, interval, donor } = parseJson(body);
  const rupees = validateAmount(amount);
  if (rupees === null) return res.status(400).json({ error: 'Invalid amount' });
  const payload = buildSubscriptionPayload(rupees, interval, donor);
  try {
    const rp = await fetch('https://api.razorpay.com/v1/subscriptions', { method: 'POST', headers: razorpayHeaders(), body: JSON.stringify(payload) });
    const data = await rp.json();
    if (!rp.ok) return res.status(502).json({ error: data.error && data.error.description || 'Razorpay subscription failed' });
    return res.status(200).json({ subscription_id: data.id, key_id: process.env.RAZORPAY_KEY_ID, amount: rupees });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

async function handleConfig(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const paymentLinkId = process.env.RAZORPAY_PAYMENT_LINK_ID || '';
  const subscriptionId = process.env.RAZORPAY_SUBSCRIPTION_ID || '';
  let paymentLinkShortUrl = null;
  if (paymentLinkId) {
    try {
      const rp = await fetch('https://api.razorpay.com/v1/payment_links/' + paymentLinkId, { headers: razorpayHeaders() });
      const data = await rp.json();
      if (rp.ok && data.short_url) paymentLinkShortUrl = data.short_url;
    } catch (e) {}
  }
  return res.status(200).json({ key_id: process.env.RAZORPAY_KEY_ID || '', payment_link_id: paymentLinkId || null, payment_link_short_url: paymentLinkShortUrl, subscription_id: subscriptionId || null });
}

async function handleHistory(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = await readBody(req);
  const { email } = parseJson(body);
  if (!email || typeof email !== 'string' || !email.includes('@')) return res.status(400).json({ error: 'email is required' });
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' });
  try {
    const sb = createClient(supabaseUrl, serviceKey);
    const { data, error } = await sb.from('donations').select('payment_id, subscription_id, amount, currency, purpose, method, status, created_at').eq('donor_email', email).order('created_at', { ascending: false }).limit(100);
    if (error) return res.status(500).json({ error: error.message });
    const rows = data || [];
    const autopaySubs = Array.from(new Set(rows.map((r) => r.subscription_id).filter(Boolean)));
    return res.status(200).json({ total: rows.length, payments: rows, autopay: { active: autopaySubs.length > 0, subscription_ids: autopaySubs } });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

async function handleSubscribe(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = await readBody(req);
  const { subscription_id, email, name, phone } = parseJson(body);
  if (!subscription_id || !email) return res.status(400).json({ error: 'subscription_id and email are required' });
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' });
  try {
    const sb = createClient(supabaseUrl, serviceKey);
    const { error } = await sb.from('subscribers').upsert({ subscription_id, donor_email: email, donor_name: name || null, donor_phone: phone || null, status: 'active' }, { onConflict: 'subscription_id' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

async function handlePlans(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json({ purposes: PURPOSES });
}

async function handleWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const rawBody = await readBody(req);
  const signature = req.headers['x-razorpay-signature'] || '';
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!verifySignature(secret, rawBody, signature)) return res.status(400).json({ error: 'Invalid signature' });
  const event = parseJson(rawBody);
  const row = mapWebhookToDonation(event);
  if (!row) return res.status(200).json({ received: true, ignored: true });
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) { console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY'); return res.status(500).json({ error: 'Server not configured' }); }
    const sb = createClient(supabaseUrl, serviceKey);
    if (row.method === 'auto' && !row.donor_email && row.subscription_id) {
      const { data: sub, error: subErr } = await sb.from('subscribers').select('donor_email, donor_name, donor_phone').eq('subscription_id', row.subscription_id).maybeSingle();
      if (!subErr && sub && sub.donor_email) { row.donor_email = sub.donor_email; row.donor_name = row.donor_name || sub.donor_name || null; row.donor_phone = row.donor_phone || sub.donor_phone || null; }
    }
    const { error } = await sb.from('donations').upsert({ ...row, webhook_raw: event }, { onConflict: 'payment_id' });
    if (error) { console.error('donations upsert error:', error.message); return res.status(500).json({ error: 'DB insert failed' }); }
    await sendTelegramAlert('Seva received: Rs ' + row.amount + ' (' + row.purpose + ') via ' + row.method);
    return res.status(200).json({ received: true });
  } catch (e) { console.error('webhook processing error:', e.message); return res.status(500).json({ error: 'Processing failed' }); }
}

function readBody(req) {
  return new Promise((resolve) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => resolve(d)); });
}
function parseJson(body) { try { return JSON.parse(body || '{}'); } catch (e) { return {}; } }
