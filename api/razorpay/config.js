const { razorpayHeaders, cors } = require('./_lib.js');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const paymentLinkId = process.env.RAZORPAY_PAYMENT_LINK_ID || '';
  const subscriptionId = process.env.RAZORPAY_SUBSCRIPTION_ID || '';
  let paymentLinkShortUrl = null;

  if (paymentLinkId) {
    try {
      const rp = await fetch('https://api.razorpay.com/v1/payment_links/' + paymentLinkId, {
        headers: razorpayHeaders()
      });
      const data = await rp.json();
      if (rp.ok && data.short_url) paymentLinkShortUrl = data.short_url;
    } catch (e) {
      // Ignore; frontend falls back to creating a link via the API
    }
  }

  return res.status(200).json({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    payment_link_id: paymentLinkId || null,
    payment_link_short_url: paymentLinkShortUrl,
    subscription_id: subscriptionId || null
  });
};
