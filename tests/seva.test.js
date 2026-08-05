// tests/seva.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDonorFromForm,
  hasSession,
  resolveQRSource,
  resolveAutopaySource,
  getSessionEmail
} from '../js/seva.js';

describe('seva donor extraction', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form class="seva-donor">
        <input id="sevaName" value="Sai Ram">
        <input id="sevaEmail" value="dev@sspk.org">
        <input id="sevaPhone" value="9876543210">
      </form>
    `;
  });
  it('extracts donor details from the form', () => {
    const d = createDonorFromForm(document);
    expect(d.name).toBe('Sai Ram');
    expect(d.email).toBe('dev@sspk.org');
    expect(d.phone).toBe('9876543210');
  });
});

describe('seva login gate', () => {
  it('accepts a session with role and identifier', () => {
    expect(hasSession({ role: 'user', identifier: 'dev@sspk.org' })).toBe(true);
  });
  it('rejects missing role, identifier, or no session', () => {
    expect(hasSession(null)).toBe(false);
    expect(hasSession({ role: 'user' })).toBe(false);
    expect(hasSession({ identifier: 'dev@sspk.org' })).toBe(false);
    expect(hasSession({})).toBe(false);
  });
});

describe('seva configured-source resolution', () => {
  it('uses the pre-created payment link when configured', () => {
    const src = resolveQRSource({ payment_link_short_url: 'https://rzp.io/l/abc', payment_link_id: 'plink_x' });
    expect(src.source).toBe('configured');
    expect(src.short_url).toBe('https://rzp.io/l/abc');
  });
  it('falls back to the API when no configured payment link', () => {
    expect(resolveQRSource(null)).toEqual({ source: 'api' });
    expect(resolveQRSource({})).toEqual({ source: 'api' });
  });
  it('uses the pre-created subscription when configured', () => {
    const src = resolveAutopaySource({ subscription_id: 'sub_x', key_id: 'rzp_key' });
    expect(src.source).toBe('configured');
    expect(src.subscription_id).toBe('sub_x');
    expect(src.key_id).toBe('rzp_key');
  });
  it('falls back to the API when no configured subscription', () => {
    expect(resolveAutopaySource(null)).toEqual({ source: 'api' });
    expect(resolveAutopaySource({})).toEqual({ source: 'api' });
  });
});

describe('seva session email', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  it('returns the email identifier when present', () => {
    window.localStorage.setItem('sspk_session', JSON.stringify({ role: 'user', identifier: 'dev@sspk.org' }));
    expect(getSessionEmail()).toBe('dev@sspk.org');
  });
  it('returns null for phone identifiers or missing sessions', () => {
    window.localStorage.setItem('sspk_session', JSON.stringify({ role: 'user', identifier: '9876543210' }));
    expect(getSessionEmail()).toBeNull();
    window.localStorage.clear();
    expect(getSessionEmail()).toBeNull();
    window.localStorage.setItem('sspk_session', 'not-json{{');
    expect(getSessionEmail()).toBeNull();
  });
});