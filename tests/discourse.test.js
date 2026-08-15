import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupDOM } from './helpers.js';

describe('js/discourse.js', () => {
  let S;

  beforeEach(async () => {
    setupDOM(`<html><body><div id="discourseFeed"></div></body></html>`);
    vi.resetModules();
    await import('../js/discourse.js');
    S = window.SSPKD;
  });

  it('exposes the public API', () => {
    expect(typeof S.escapeHtml).toBe('function');
    expect(typeof S.buildEmbedUrl).toBe('function');
    expect(typeof S.filterMessages).toBe('function');
    expect(typeof S.renderCard).toBe('function');
    expect(typeof S.fetchMessages).toBe('function');
  });

  it('buildEmbedUrl strips @ and appends ?embed=1', () => {
    expect(S.buildEmbedUrl({ telegram_channel: '@sspk_discourse', telegram_message_id: 5 }))
      .toBe('https://t.me/sspk_discourse/5?embed=1');
  });

  it('filterMessages filters by category, language and year', () => {
    const messages = [
      { category: 'Gita', language: 'Tamil', date: '2026-08-14' },
      { category: 'Seva', language: 'English', date: '2026-08-07' },
      { category: 'Gita', language: 'English', date: '2025-12-25' }
    ];
    expect(S.filterMessages(messages, { category: 'gita' }).length).toBe(2);
    expect(S.filterMessages(messages, { language: 'english', year: '2026' }).length).toBe(1);
    expect(S.filterMessages(messages, { category: 'gita', language: 'tamil', year: '2026' })[0].date).toBe('2026-08-14');
    expect(S.filterMessages(messages, { year: '2024' }).length).toBe(0);
  });

  it('renderCard renders text messages with .discourse-text and no iframe', () => {
    const html = S.renderCard({
      title: 'Love All', date: '2026-08-14', media_type: 'text',
      description: 'Sai Ram <b>friends</b>', category: 'Gita'
    });
    expect(html).toContain('discourse-card');
    expect(html).toContain('discourse-text');
    expect(html).toContain('Sai Ram &lt;b&gt;friends&lt;/b&gt;');
    expect(html).not.toContain('discourse-player-frame');
  });

  it('renderCard renders audio cards with embed iframe and Listen fallback', () => {
    const html = S.renderCard({
      title: 'Talk', date: '2026-08-14', media_type: 'audio',
      telegram_channel: 'sspk_discourse', telegram_message_id: 42, duration: '12:34'
    });
    expect(html).toContain('discourse-player-frame');
    expect(html).toContain('https://t.me/sspk_discourse/42?embed=1');
    expect(html).toContain('>Listen</a>');
    expect(html).toContain('12:34');
  });

  it('renderCard renders video cards with Watch fallback and default thumb', () => {
    const html = S.renderCard({
      title: 'V', date: '2026-08-14', media_type: 'video',
      telegram_channel: 'sspk_discourse', telegram_message_id: 7
    });
    expect(html).toContain('>Watch</a>');
    expect(html).toContain('images/sathya_sai_baba.png');
  });

  it('renderCard renders an iframe thumb for a t.me embed thumbnail_url', () => {
    const html = S.renderCard({
      title: 'Talk', date: '2026-08-14', media_type: 'audio',
      telegram_channel: 'sspk_discourse', telegram_message_id: 42,
      thumbnail_url: 'https://t.me/sspk_discourse/50?embed=1'
    });
    expect(html).toContain('<iframe class="discourse-thumb"');
    expect(html).not.toContain('<img class="discourse-thumb"');
  });

  it('renderCard renders an img thumb for a direct image URL', () => {
    const html = S.renderCard({
      title: 'Talk', date: '2026-08-14', media_type: 'video',
      telegram_channel: 'sspk_discourse', telegram_message_id: 7,
      thumbnail_url: 'https://example.com/photo.jpg'
    });
    expect(html).toContain('<img class="discourse-thumb" src="https://example.com/photo.jpg"');
  });
});
