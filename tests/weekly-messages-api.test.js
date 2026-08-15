// tests/weekly-messages-api.test.js
// The Vercel serverless functions run as CommonJS and must require() CommonJS
// helpers (api/shared/*.cjs). These tests guard the shared helpers behind the
// weekly discourse feature. No live Telegram/Supabase/network calls — fetch is mocked.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cors,
  telegramMethodFor,
  buildEmbedUrl,
  parseTelegramLink,
  validateWeeklyPayload,
  validateFile,
  escapeHtml,
  TELEGRAM_UPLOAD_MAX_BYTES,
  THUMBNAIL_MAX_BYTES,
  validateThumbnail,
  isTelegramEmbedUrl
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

describe('thumbnail helpers', () => {
  it('validateThumbnail treats missing/empty thumbnail as optional', () => {
    expect(validateThumbnail(null)).toEqual({ ok: true, errors: [], value: null });
    expect(validateThumbnail(undefined).ok).toBe(true);
  });

  it('validateThumbnail accepts jpeg and png under 5MB', () => {
    expect(validateThumbnail({ mime: 'image/jpeg', buffer: Buffer.alloc(10) }).ok).toBe(true);
    expect(validateThumbnail({ mime: 'image/png', buffer: Buffer.alloc(10) }).ok).toBe(true);
  });

  it('validateThumbnail rejects non-image mime and oversized files', () => {
    const bad = validateThumbnail({ mime: 'text/plain', buffer: Buffer.alloc(10) });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/JPEG or PNG/);
    const empty = validateThumbnail({ mime: 'image/jpeg', buffer: Buffer.alloc(0) });
    expect(empty.ok).toBe(false);
    expect(empty.errors).toContain('thumbnail file is empty');
    const big = validateThumbnail({ mime: 'image/jpeg', buffer: Buffer.alloc(THUMBNAIL_MAX_BYTES + 1) });
    expect(big.ok).toBe(false);
    expect(big.errors[0]).toMatch(/5MB/);
  });

  it('isTelegramEmbedUrl matches embed URLs only', () => {
    expect(isTelegramEmbedUrl('https://t.me/sspk_discourse/123?embed=1')).toBe(true);
    expect(isTelegramEmbedUrl('https://t.me/sspk_discourse/123')).toBe(false);
    expect(isTelegramEmbedUrl('https://example.com/photo.jpg')).toBe(false);
    expect(isTelegramEmbedUrl('t.me/sspk_discourse/1?embed=1')).toBe(false);
    expect(isTelegramEmbedUrl('')).toBe(false);
  });
});

describe('admin-auth', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'sk143sathya@gmail.com, Second@Example.com';
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it('isAdminEmail is case-insensitive against env list', async () => {
    const { isAdminEmail } = await import('../api/shared/admin-auth.cjs');
    expect(isAdminEmail('SK143Sathya@Gmail.com')).toBe(true);
    expect(isAdminEmail('second@example.com')).toBe(true);
    expect(isAdminEmail('other@example.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });

  it('authenticateAdmin returns null without a Bearer token', async () => {
    const { authenticateAdmin } = await import('../api/shared/admin-auth.cjs');
    const sb = { auth: { getUser: async () => ({ data: { user: { email: 'x@y.z' } }, error: null }) } };
    expect(await authenticateAdmin(sb, undefined)).toBeNull();
    expect(await authenticateAdmin(sb, 'token-no-bearer')).toBeNull();
  });

  it('authenticateAdmin returns user for a valid token', async () => {
    const { authenticateAdmin } = await import('../api/shared/admin-auth.cjs');
    const sb = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'sk143sathya@gmail.com' } }, error: null }) }
    };
    expect(await authenticateAdmin(sb, 'Bearer abc')).toEqual({ id: 'u1', email: 'sk143sathya@gmail.com' });
  });

  it('authenticateAdmin returns null on auth error', async () => {
    const { authenticateAdmin } = await import('../api/shared/admin-auth.cjs');
    const sb = { auth: { getUser: async () => ({ data: null, error: { message: 'expired' } }) } };
    expect(await authenticateAdmin(sb, 'Bearer abc')).toBeNull();
  });
});

describe('telegram-bot', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'bot:test-token';
    process.env.TELEGRAM_CHANNEL_ID = '@sspk_discourse';
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHANNEL_ID;
  });

  it('callTelegramApi returns error when token missing', async () => {
    const { callTelegramApi } = await import('../api/shared/telegram-bot.cjs');
    delete process.env.TELEGRAM_BOT_TOKEN;
    const r = await callTelegramApi('sendMessage', new FormData());
    expect(r).toEqual({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' });
  });

  it('sendTextToTelegram posts sendMessage and returns message_id', async () => {
    const { sendTextToTelegram } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 77 } })
    }));
    const r = await sendTextToTelegram({ text: 'Sai Ram' });
    expect(r).toEqual({ ok: true, messageId: 77 });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url.startsWith('https://api.telegram.org/bot')).toBe(true);
    expect(url.endsWith('/sendMessage')).toBe(true);
    expect(opts.method).toBe('POST');
  });

  it('sendMediaToTelegram posts sendAudio for audio with chat_id', async () => {
    const { sendMediaToTelegram } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 12 } })
    }));
    const r = await sendMediaToTelegram({
      mediaType: 'audio', buffer: Buffer.from('data'), filename: 'talk.mp3', mime: 'audio/mpeg', caption: 'T'
    });
    expect(r).toEqual({ ok: true, messageId: 12 });
    expect(global.fetch.mock.calls[0][0].endsWith('/sendAudio')).toBe(true);
  });

  it('propagates Telegram error description', async () => {
    const { callTelegramApi } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, description: 'chat not found' })
    }));
    const r = await callTelegramApi('sendMessage', new FormData());
    expect(r).toEqual({ ok: false, error: 'chat not found' });
  });

  it('sendPhotoToTelegram posts sendPhoto and returns message_id', async () => {
    const { sendPhotoToTelegram } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 99 } })
    }));
    const r = await sendPhotoToTelegram({ buffer: Buffer.from('img'), mime: 'image/jpeg', filename: 'thumb.jpg', caption: 'T' });
    expect(r).toEqual({ ok: true, messageId: 99 });
    expect(global.fetch.mock.calls[0][0].endsWith('/sendPhoto')).toBe(true);
  });

  it('sendPhotoToTelegram errors when channel missing', async () => {
    const { sendPhotoToTelegram } = await import('../api/shared/telegram-bot.cjs');
    delete process.env.TELEGRAM_CHANNEL_ID;
    const r = await sendPhotoToTelegram({ buffer: Buffer.from('img'), mime: 'image/jpeg', filename: 'thumb.jpg' });
    expect(r).toEqual({ ok: false, error: 'TELEGRAM_CHANNEL_ID is not configured' });
  });
});
