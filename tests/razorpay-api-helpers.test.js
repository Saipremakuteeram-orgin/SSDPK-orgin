// tests/razorpay-api-helpers.test.js
// The Vercel serverless functions run as CommonJS and must require() a
// CommonJS helpers module (api/razorpay/helpers.cjs). This guards the
// Defect-A fix: previously they required() an ESM file, which crashes.
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  validateAmount,
  buildOrderPayload,
  buildPaymentLinkPayload,
  buildSubscriptionPayload,
  verifySignature,
  mapWebhookToDonation
} from '../api/razorpay/helpers.cjs';

describe('api/razorpay/helpers.cjs (CommonJS, used by Vercel functions)', () => {
  it('is requireable as CommonJS and exposes validateAmount', () => {
    expect(validateAmount('500')).toBe(500);
    expect(validateAmount('abc')).toBeNull();
  });
  it('buildOrderPayload builds INR order body in rupees', () => {
    const p = buildOrderPayload(500, 'Anna Danam', { name: 'A', email: 'a@b.c', phone: '123' });
    expect(p.amount).toBe(500);
    expect(p.currency).toBe('INR');
    expect(p.notes.purpose).toBe('Anna Danam');
  });
  it('buildPaymentLinkPayload builds payment link body', () => {
    const p = buildPaymentLinkPayload(1101, 'Sponsor a Homam', { name: 'A' });
    expect(p.amount).toBe(1101);
    expect(p.description).toBe('Sponsor a Homam');
  });
  it('buildSubscriptionPayload multiplies to paise', () => {
    const p = buildSubscriptionPayload(101, 'monthly', { name: 'A' });
    expect(p.plan.period).toBe('monthly');
    expect(p.plan.interval).toBe(1);
    expect(p.plan.item.amount).toBe(10100);
  });
  it('verifySignature returns true for matching HMAC', () => {
    const body = '{"hello":"world"}';
    const secret = 'sk_test_abc';
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifySignature(secret, body, sig)).toBe(true);
    expect(verifySignature(secret, body, 'deadbeef')).toBe(false);
  });
  it('mapWebhookToDonation maps payment.captured', () => {
    const evt = {
      event: 'payment.captured',
      payload: { payment: { entity: {
        id: 'pay_1', order_id: 'ord_1', amount: 50000, currency: 'INR',
        notes: { purpose: 'Anna Danam', donor_name: 'A', donor_email: 'a@b.c', donor_phone: '123' }
      } } }
    };
    const row = mapWebhookToDonation(evt);
    expect(row.payment_id).toBe('pay_1');
    expect(row.order_id).toBe('ord_1');
    expect(row.amount).toBe(500);
    expect(row.method).toBe('once');
  });
  it('mapWebhookToDonation maps subscription.charged', () => {
    const evt = {
      event: 'subscription.charged',
      payload: { subscription: { entity: { id: 'sub_1' } }, payment: { entity: {
        id: 'pay_2', amount: 10100, currency: 'INR', notes: { purpose: 'Monthly Seva' }
      } } }
    };
    const row = mapWebhookToDonation(evt);
    expect(row.subscription_id).toBe('sub_1');
    expect(row.payment_id).toBe('pay_2');
    expect(row.amount).toBe(101);
    expect(row.method).toBe('auto');
  });
});
