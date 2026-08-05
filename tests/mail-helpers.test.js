// tests/mail-helpers.test.js
import { describe, it, expect } from 'vitest';
import {
  chunkArray,
  cleanDescription,
  formatEventDate,
  buildEventEmail,
  buildWelcomeEmail,
  buildEmailFooter,
  LOGO_BASE64
} from '../js/mail-helpers.js';

describe('mail helpers', () => {
  describe('chunkArray', () => {
    it('chunks into groups of given size', () => {
      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
    it('returns single chunk when smaller than size', () => {
      expect(chunkArray(['a', 'b'], 100)).toEqual([['a', 'b']]);
    });
    it('handles empty input', () => {
      expect(chunkArray([], 100)).toEqual([]);
      expect(chunkArray(null, 100)).toEqual([]);
    });
    it('respects Resend 100-recipient batch limit', () => {
      const items = Array.from({ length: 250 }, (_, i) => 'u' + i + '@x.com');
      const chunks = chunkArray(items, 100);
      expect(chunks.length).toBe(3);
      expect(chunks[0].length).toBe(100);
      expect(chunks[2].length).toBe(50);
    });
  });

  describe('cleanDescription', () => {
    it('strips brochure ||| parts from description', () => {
      expect(cleanDescription('Grand bhajan ||| https://img ||| event-brochures/x.jpg')).toBe('Grand bhajan');
    });
    it('returns empty string for no description', () => {
      expect(cleanDescription('')).toBe('');
      expect(cleanDescription(null)).toBe('');
    });
  });

  describe('formatEventDate', () => {
    it('formats YYYY-MM-DD into a readable date', () => {
      expect(formatEventDate('2026-05-21')).toMatch(/May 21, 2026/);
    });
    it('returns input unchanged for malformed dates', () => {
      expect(formatEventDate('not-a-date')).toBe('not-a-date');
      expect(formatEventDate('')).toBe('');
    });
  });

  describe('buildEventEmail', () => {
    const event = {
      id: 42,
      title: 'Guru Purnima Bhajan',
      category: 'bhajan',
      date: '2026-07-29',
      time: '6:00 PM',
      venue: 'SSPK Mandir',
      coordinator: 'Ravi Kumar',
      contact: '+91-9876543210',
      description: 'Evening bhajans ||| https://img.example.com/brochure.jpg ||| event-brochures/b.jpg'
    };

    it('includes event fields in subject and text', () => {
      const { subject, text } = buildEventEmail(event, 'https://example.org');
      expect(subject).toContain('Guru Purnima Bhajan');
      expect(text).toContain('Guru Purnima Bhajan');
      expect(text).toContain('6:00 PM');
      expect(text).toContain('SSPK Mandir');
      expect(text).toContain('Ravi Kumar');
      expect(text).toContain('+91-9876543210');
      expect(text).toContain('Evening bhajans');
    });

    it('uses clean description (no ||| brochure parts)', () => {
      const { text } = buildEventEmail(event, 'https://example.org');
      expect(text).toContain('Evening bhajans');
      expect(text).not.toContain('brochure.jpg');
    });

    it('links to events.html?id when event id present', () => {
      const { html } = buildEventEmail(event, 'https://example.org');
      expect(html).toContain('https://example.org/events.html?id=42');
    });

    it('embeds the logo inline in the footer (not as an attachment)', () => {
      const { html, text } = buildEventEmail(event, 'https://example.org');
      expect(html).toContain('data:image/jpeg;base64,' + LOGO_BASE64);
      expect(html).toContain('Love All, Serve All');
      expect(text).not.toContain('attachment');
    });

    it('shows the from email in the footer when provided', () => {
      const { html, text } = buildEventEmail(event, 'https://example.org', 'noreply@example.org');
      expect(html).toContain('From: noreply@example.org');
      expect(text).toContain('From: noreply@example.org');
    });

    it('builds a details link even without an id', () => {
      const { html } = buildEventEmail({ title: 'Seva Day', date: '2026-08-01' }, 'https://example.org');
      expect(html).toContain('https://example.org/events.html');
    });
  });

  describe('buildWelcomeEmail', () => {
    it('greets by first name', () => {
      const { subject, text } = buildWelcomeEmail('Sathya Sai');
      expect(subject).toContain('Sathya');
      expect(text).toContain('Sai Ram, Sathya');
    });
    it('falls back to Devotee when name is empty', () => {
      const { text } = buildWelcomeEmail('');
      expect(text).toContain('Sai Ram, Devotee');
    });
    it('embeds the logo inline in the footer', () => {
      const { html } = buildWelcomeEmail('Ravi');
      expect(html).toContain('data:image/jpeg;base64,' + LOGO_BASE64);
    });
    it('shows the from email in the footer when provided', () => {
      const { html, text } = buildWelcomeEmail('Ravi', 'no-reply@sathyasaipremakuterram.org');
      expect(html).toContain('From: no-reply@sathyasaipremakuterram.org');
      expect(text).toContain('From: no-reply@sathyasaipremakuterram.org');
    });
    it('falls back to the default from email when none provided', () => {
      const { html } = buildWelcomeEmail('Ravi');
      expect(html).toContain('From: info@sathyasaipremakuterram.org');
    });
  });

  describe('buildEmailFooter', () => {
    it('contains an inline base64 logo and no cid/attachment reference', () => {
      const footer = buildEmailFooter('test@example.org');
      expect(footer).toContain('data:image/jpeg;base64,');
      expect(footer).not.toContain('cid:');
      expect(footer).not.toContain('attachment');
      expect(footer).toContain('From: test@example.org');
    });
  });
});
