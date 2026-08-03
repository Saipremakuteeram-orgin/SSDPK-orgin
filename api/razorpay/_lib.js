// Shared helpers for razorpay serverless functions.
module.exports = {
  razorpayHeaders() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    return {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64')
    };
  },
  parseJson(body) {
    try { return JSON.parse(body || '{}'); } catch (e) { return {}; }
  },
  cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Razorpay-Signature');
  }
};