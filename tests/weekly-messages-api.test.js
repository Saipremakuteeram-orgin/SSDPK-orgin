// tests/weekly-messages-api.test.js
// The Vercel serverless functions run as CommonJS and must require() CommonJS
// helpers (api/shared/*.cjs). These tests guard the shared helpers behind the
// weekly discourse feature. No live Telegram/Supabase/network calls — fetch is mocked.
import { describe, it, expect } from 'vitest';
import {
  cors,
  telegramMethodFor,
  buildEmbedUrl,
  parseTelegramLink,
  validateWeeklyPayload,
  validateFile,
  escapeHtml,
  TELEGRAM_UPLOAD_MAX_BYTES
} from '../api/shared/weekly-common.cjs';

describe('weekly-common helpers', () => {
  it('telegramMethodFor maps media types', () => {
    expect(telegramMethodFor('audio')).toBe('sendAudio');
    expect(telegramMethodFor('video')).toBe('sendVideo');
    expect(telegramMethodFor('text')).toBe('sendMessage');
  });

  it('buildEmbedUrl strips leading @ and appends ?embed=1', () => {
    expect(buildEmbedUrl('@sspk_discourse', 123)).toBe('https://t.me/sspk_discourse/123?embed=1');
  });

  it('parseTelegramLink parses full and bare t.me links', () => {
    expect(parseTelegramLink('https://t.me/sspk_discourse/123')).toEqual({ channel: 'sspk_discourse', messageId: 123 });
    expect(parseTelegramLink('t.me/sspk_discourse/999')).toEqual({ channel: 'sspk_discourse', messageId: 999 });
    expect(parseTelegramLink('not a link')).toBeNull();
  });

  it('validateWeeklyPayload requires title/date/media_type and text for text', () => {
    const bad = validateWeeklyPayload({});
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain('title is required');

    const textMsg = validateWeeklyPayload({ title: 'X', date: '2026-08-14', media_type: 'text' });
    expect(textMsg.ok).toBe(false);
    expect(textMsg.errors).toContain('text is required for text messages');

    const ok = validateWeeklyPayload({ title: 'X', date: '2026-08-14', media_type: 'text', text: 'Sai Ram' });
    expect(ok.ok).toBe(true);
    expect(ok.value.description).toBe('Sai Ram');
  });

  it('validateWeeklyPayload trims and drops empty optional fields', () => {
    const ok = validateWeeklyPayload({
      title: '  X  ', date: '2026-08-14', media_type: 'audio',
      description: '  ',
      category: 'Bhagavad Gita', language: 'Tamil'
    });
    expect(ok.ok).toBe(true);
    expect(ok.value.title).toBe('X');
    expect(ok.value.description).toBeUndefined();
    expect(ok.value.category).toBe('Bhagavad Gita');
  });

  it('validateFile accepts valid audio and rejects wrong/empty/oversized', () => {
    expect(validateFile({ mediaType: 'audio', filename: 'talk.mp3', bytes: 10 }).ok).toBe(true);
    expect(validateFile({ mediaType: 'audio', filename: 'talk.mp4', bytes: 10 }).ok).toBe(false);
    expect(validateFile({ mediaType: 'video', filename: 'talk.mp4', bytes: 0 }).ok).toBe(false);
    const big = validateFile({ mediaType: 'audio', filename: 'talk.mp3', bytes: TELEGRAM_UPLOAD_MAX_BYTES + 1 });
    expect(big.ok).toBe(false);
    expect(big.errors[0]).toMatch(/50MB/);
  });

  it('escapeHtml escapes special chars', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});
