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
  isTelegramEmbedUrl,
  buildMediaUrl,
  validateStoragePayload,
  mediaContentType,
  TELEGRAM_UPLOAD_MAX_BYTES as UPLOAD_MAX
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

  it('validateFile accepts all formats for audio/video and rejects empty/oversized/wrong-type', () => {
    expect(TELEGRAM_UPLOAD_MAX_BYTES).toBe(48 * 1024 * 1024);
    expect(validateFile({ mediaType: 'audio', filename: 'talk.mp3', bytes: 10 }).ok).toBe(true);
    expect(validateFile({ mediaType: 'audio', filename: 'WhatsApp Audio 2026-08-13 at 11.16.20 AM.mpeg', bytes: 10 }).ok).toBe(true);
    expect(validateFile({ mediaType: 'audio', filename: 'talk.mp4', bytes: 10 }).ok).toBe(true);
    expect(validateFile({ mediaType: 'video', filename: 'talk.avi', bytes: 10 }).ok).toBe(true);
    expect(validateFile({ mediaType: 'video', filename: 'talk.mp4', bytes: 0 }).ok).toBe(false);
    expect(validateFile({ mediaType: 'text', filename: 'a.mp3', bytes: 10 }).ok).toBe(false);
    const big = validateFile({ mediaType: 'audio', filename: 'talk.mp3', bytes: TELEGRAM_UPLOAD_MAX_BYTES + 1 });
    expect(big.ok).toBe(false);
    expect(big.errors[0]).toMatch(/48MB/);
  });

  it('escapeHtml escapes special chars', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('mediaContentType passes through real audio mime and falls back safely', () => {
    expect(mediaContentType('media', 'audio', 'audio/ogg')).toBe('audio/ogg');
    expect(mediaContentType('media', 'audio', 'audio/ogg; charset=binary')).toBe('audio/ogg');
    expect(mediaContentType('media', 'audio', 'application/octet-stream')).toBe('audio/mpeg');
    expect(mediaContentType('media', 'audio', '')).toBe('audio/mpeg');
    expect(mediaContentType('media', 'video', 'video/webm')).toBe('video/mp4');
    expect(mediaContentType('thumb', 'video', 'video/webm')).toBe('image/jpeg');
    expect(mediaContentType('thumb', 'audio', 'audio/ogg')).toBe('image/jpeg');
  });
});

describe('weekly storage upload', () => {
  it('TELEGRAM_UPLOAD_MAX_BYTES is 48MB', () => {
    expect(UPLOAD_MAX).toBe(48 * 1024 * 1024);
  });

  it('validateStoragePayload requires a non-empty storagePath', () => {
    expect(validateStoragePayload({}).ok).toBe(false);
    expect(validateStoragePayload({ storagePath: ' ' }).ok).toBe(false);
    expect(validateStoragePayload({ storagePath: 'discourse/x.mp3' }).ok).toBe(true);
  });

  it('validateStoragePayload trims and returns value', () => {
    const r = validateStoragePayload({ storagePath: '  a/b.mp3  ', thumbnailStoragePath: '  a/t.jpg  ' });
    expect(r.ok).toBe(true);
    expect(r.value.storagePath).toBe('a/b.mp3');
    expect(r.value.thumbnailStoragePath).toBe('a/t.jpg');
  });

  it('validateStoragePayload accepts missing thumbnail', () => {
    const r = validateStoragePayload({ storagePath: 'a/b.mp3' });
    expect(r.ok).toBe(true);
    expect(r.value.thumbnailStoragePath).toBeUndefined();
  });

  it('validateStoragePayload captures optional fileMime', () => {
    const r = validateStoragePayload({ storagePath: 'a/b.mpeg', fileMime: 'audio/mpeg' });
    expect(r.ok).toBe(true);
    expect(r.value.fileMime).toBe('audio/mpeg');
    expect(validateStoragePayload({ storagePath: 'a/b.mpeg' }).value.fileMime).toBeUndefined();
  });

  it('buildMediaUrl builds media and thumb urls', () => {
    expect(buildMediaUrl('abc-123', 'media')).toBe('/api/weekly-media?id=abc-123');
    expect(buildMediaUrl('abc-123', 'thumb')).toBe('/api/weekly-media?id=abc-123&kind=thumb');
  });
});

describe('thumbnail helpers', () => {
  it('validateThumbnail treats missing/empty thumbnail as optional', () => {
    expect(validateThumbnail(null)).toEqual({ ok: true, errors: [], value: null });
    expect(validateThumbnail(undefined).ok).toBe(true);
  });

  it('validateThumbnail accepts jpeg and png under 4MB', () => {
    expect(THUMBNAIL_MAX_BYTES).toBe(4 * 1024 * 1024);
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
    expect(big.errors[0]).toMatch(/4MB/);
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
    expect(r).toEqual({ ok: true, messageId: 12, fileId: '', kind: 'audio' });
    expect(global.fetch.mock.calls[0][0].endsWith('/sendAudio')).toBe(true);
  });

  it('sendMediaToTelegram falls back to sendDocument when sendAudio fails', async () => {
    const { sendMediaToTelegram } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, description: 'can not be played' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { message_id: 55, document: { file_id: 'DOC123' } } }) });
    const r = await sendMediaToTelegram({
      mediaType: 'audio', buffer: Buffer.from('x'), filename: 'WhatsApp Audio.mpeg', mime: 'audio/mpeg'
    });
    expect(r).toEqual({ ok: true, messageId: 55, fileId: 'DOC123', kind: 'document' });
    const urls = global.fetch.mock.calls.map((c) => c[0]);
    expect(urls[0].endsWith('/sendAudio')).toBe(true);
    expect(urls[1].endsWith('/sendDocument')).toBe(true);
  });

  it('sendMediaToTelegram falls back to sendDocument for video too', async () => {
    const { sendMediaToTelegram } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, description: 'bad format' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { message_id: 66, document: { file_id: 'DOC66' } } }) });
    const r = await sendMediaToTelegram({
      mediaType: 'video', buffer: Buffer.from('x'), filename: 'v.mpeg', mime: 'video/mpeg'
    });
    expect(r).toEqual({ ok: true, messageId: 66, fileId: 'DOC66', kind: 'document' });
    expect(global.fetch.mock.calls[0][0].endsWith('/sendVideo')).toBe(true);
    expect(global.fetch.mock.calls[1][0].endsWith('/sendDocument')).toBe(true);
  });

  it('sendMediaToTelegram propagates error when document fallback also fails', async () => {
    const { sendMediaToTelegram } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, description: 'chat not found' }) }));
    const r = await sendMediaToTelegram({ mediaType: 'audio', buffer: Buffer.from('x'), filename: 'a.mp3', mime: 'audio/mpeg' });
    expect(r).toEqual({ ok: false, error: 'chat not found' });
    expect(global.fetch.mock.calls).toHaveLength(2);
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
    expect(r).toEqual({ ok: true, messageId: 99, fileId: '' });
    expect(global.fetch.mock.calls[0][0].endsWith('/sendPhoto')).toBe(true);
  });

  it('sendPhotoToTelegram errors when channel missing', async () => {
    const { sendPhotoToTelegram } = await import('../api/shared/telegram-bot.cjs');
    delete process.env.TELEGRAM_CHANNEL_ID;
    const r = await sendPhotoToTelegram({ buffer: Buffer.from('img'), mime: 'image/jpeg', filename: 'thumb.jpg' });
    expect(r).toEqual({ ok: false, error: 'TELEGRAM_CHANNEL_ID is not configured' });
  });
});

describe('telegram-bot file_id + getFile', () => {
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

  it('sendMediaToTelegram returns fileId for audio', async () => {
    const { sendMediaToTelegram } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1, audio: { file_id: 'AUDIO123' } } })
    }));
    const r = await sendMediaToTelegram({ mediaType: 'audio', buffer: Buffer.from('x'), filename: 'a.mp3', mime: 'audio/mpeg' });
    expect(r).toEqual({ ok: true, messageId: 1, fileId: 'AUDIO123', kind: 'audio' });
  });

  it('sendMediaToTelegram returns fileId for video', async () => {
    const { sendMediaToTelegram } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 2, video: { file_id: 'VIDEO456' } } })
    }));
    const r = await sendMediaToTelegram({ mediaType: 'video', buffer: Buffer.from('x'), filename: 'v.mp4', mime: 'video/mp4' });
    expect(r).toEqual({ ok: true, messageId: 2, fileId: 'VIDEO456', kind: 'video' });
  });

  it('sendPhotoToTelegram returns fileId from the largest photo size', async () => {
    const { sendPhotoToTelegram } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 3, photo: [{ file_id: 'small', file_size: 10 }, { file_id: 'big', file_size: 100 }] } })
    }));
    const r = await sendPhotoToTelegram({ buffer: Buffer.from('i'), mime: 'image/jpeg', filename: 't.jpg' });
    expect(r).toEqual({ ok: true, messageId: 3, fileId: 'big' });
  });

  it('getTelegramFileStream calls getFile then streams the file url', async () => {
    const { getTelegramFileStream } = await import('../api/shared/telegram-bot.cjs');
    const fakeStream = { ok: true, body: 'STREAM' };
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { file_path: 'docs/file_1.mp3' } }) })
      .mockResolvedValueOnce(fakeStream);
    const r = await getTelegramFileStream('AUDIO123');
    expect(r).toEqual({ ok: true, stream: fakeStream });
    const urls = global.fetch.mock.calls.map((c) => c[0]);
    expect(urls[0]).toContain('/botbot:test-token/getFile');
    expect(urls[1]).toBe('https://api.telegram.org/file/botbot:test-token/docs/file_1.mp3');
  });

  it('getTelegramFileStream returns error when getFile fails', async () => {
    const { getTelegramFileStream } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, description: 'bad file_id' }) }));
    const r = await getTelegramFileStream('NOPE');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('bad file_id');
  });

  it('sendMediaToTelegram fileId falls back to empty string', async () => {
    const { getFileId } = await import('../api/shared/telegram-bot.cjs');
    expect(getFileId({ audio: { file_id: 'X' } })).toBe('X');
    expect(getFileId({ video: { file_id: 'Y' } })).toBe('Y');
    expect(getFileId({ document: { file_id: 'D' } })).toBe('D');
    expect(getFileId({ photo: [{ file_id: 'Z' }] })).toBe('Z');
    expect(getFileId({})).toBe('');
  });
});
