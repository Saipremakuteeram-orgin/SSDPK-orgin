// api/razorpay/helpers.cjs
// CommonJS mirror of js/razorpay-helpers.js for Vercel serverless functions,
// which must require() CommonJS. KEEP IN SYNC with js/razorpay-helpers.js (ESM).

function validateAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > 1000000) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

function buildOrderPayload(amount, purpose, donor = {}) {
  return {
    amount,
    currency: 'INR',
    receipt: 'seva_' + Date.now(),
    notes: {
      purpose: purpose || '',
      donor_name: donor.name || '',
      donor_email: donor.email || '',
      donor_phone: donor.phone || ''
    }
  };
}

function buildPaymentLinkPayload(amount, purpose, donor = {}) {
  return {
    amount,
    currency: 'INR',
    description: purpose || '',
    notes: {
      purpose: purpose || '',
      donor_name: donor.name || '',
      donor_email: donor.email || '',
      donor_phone: donor.phone || ''
    },
    callback_url: (process.env.BASE_URL || '') + '/dashboard.html',
    callback_method: 'get'
  };
}

function buildSubscriptionPayload(amount, interval, donor = {}) {
  const period = interval === 'yearly' ? 'yearly' : 'monthly';
  return {
    plan: {
      period,
      interval: 1,
      item: {
        name: 'Seva ' + amount,
        amount: amount * 100,
        currency: 'INR'
      },
      notes: {
        purpose: 'Monthly Seva',
        donor_name: donor.name || '',
        donor_email: donor.email || '',
        donor_phone: donor.phone || ''
      }
    },
    customer_notify: 1
  };
}

function verifySignature(secret, body, signature) {
  if (!secret || !body || !signature) return false;
  const crypto = require('crypto');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(signature);
  return expectedBuf.length === givenBuf.length && crypto.timingSafeEqual(expectedBuf, givenBuf);
}

function mapWebhookToDonation(event) {
  if (event.event === 'payment.captured') {
    const p = event.payload.payment.entity;
    return {
      payment_id: p.id,
      order_id: p.order_id || null,
      subscription_id: null,
      amount: Math.round(p.amount / 100),
      currency: p.currency,
      purpose: (p.notes && p.notes.purpose) || '',
      method: 'once',
      donor_name: (p.notes && p.notes.donor_name) || null,
      donor_email: (p.notes && p.notes.donor_email) || null,
      donor_phone: (p.notes && p.notes.donor_phone) || null,
      status: 'captured'
    };
  }
  if (event.event === 'subscription.charged') {
    const p = event.payload.payment.entity;
    const sub = event.payload.subscription && event.payload.subscription.entity;
    return {
      payment_id: p.id,
      order_id: null,
      subscription_id: sub ? sub.id : null,
      amount: Math.round(p.amount / 100),
      currency: p.currency,
      purpose: (p.notes && p.notes.purpose) || 'Monthly Seva',
      method: 'auto',
      donor_name: (p.notes && p.notes.donor_name) || null,
      donor_email: (p.notes && p.notes.donor_email) || null,
      donor_phone: (p.notes && p.notes.donor_phone) || null,
      status: 'captured'
    };
  }
  return null;
}

module.exports = {
  validateAmount,
  buildOrderPayload,
  buildPaymentLinkPayload,
  buildSubscriptionPayload,
  verifySignature,
  mapWebhookToDonation
};
