const { validateAmount, buildOrderPayload } = require('./helpers.cjs');
const { razorpayHeaders, parseJson, cors } = require('./_lib.js');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await readBody(req);
  const { amount, purpose, donor } = parseJson(body);
  const rupees = validateAmount(amount);
  if (rupees === null) return res.status(400).json({ error: 'Invalid amount' });

  const payload = buildOrderPayload(rupees, purpose, donor);
  payload.amount = rupees * 100; // paise at API boundary

  try {
    const rp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: razorpayHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await rp.json();
    if (!rp.ok) return res.status(502).json({ error: data.error && data.error.description || 'Razorpay order failed' });
    return res.status(200).json({ order_id: data.id, key_id: process.env.RAZORPAY_KEY_ID, amount: rupees, currency: 'INR' });
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