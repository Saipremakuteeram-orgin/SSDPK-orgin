# Weekly Media Storage-Upload + Native Telegram Playback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload audio/video (up to 48MB) + optional thumbnail through the dashboard via direct-to-Supabase-Storage, push to the Telegram channel, delete only from Storage, and play back through a native player served by a server-side Telegram proxy (`/api/weekly-media?id=<uuid>`).

**Architecture:** Browser uploads big files directly to a private Supabase Storage bucket (bypassing Vercel's 4.5MB body limit). The server then downloads from Storage, sends to Telegram via `sendAudio`/`sendVideo`/`sendPhoto`, captures each message's `file_id`, deletes the Storage objects, and stores the row. The public page renders `<audio>`/`<video>` whose `src` points at `/api/weekly-media`, which proxies Telegram's `getFile` stream — no `t.me` URL exposed, bot token stays server-side. The proxy is folded into the existing `api/weekly-messages.js` via a rewrite (stays within the Hobby 12-function limit).

**Tech Stack:** Node.js CommonJS serverless (Vercel), `@supabase/supabase-js` (service role on server, anon+auth in browser), `busboy`, Telegram Bot API, Vitest.

## Global Constraints

- Vercel serverless request body cap is 4.5MB → never route big files through `/api/*`; always browser→Storage→server→Telegram.
- Telegram Bot API caps `sendAudio`/`sendVideo` at 50MB → `TELEGRAM_UPLOAD_MAX_BYTES = 48 * 1024 * 1024` (media). Thumbnails keep a 4MB cap (`THUMBNAIL_MAX_BYTES = 4 * 1024 * 1024`).
- Bot token (`TELEGRAM_BOT_TOKEN`) and channel id (`TELEGRAM_CHANNEL_ID`) must NEVER be exposed to the browser; only the server proxy touches Telegram.
- Media rows must store the media `file_id` (`telegram_file_id`) and optional thumbnail `file_id` (`thumbnail_file_id`) so playback can work without re-uploading.
- Files are deleted from **Supabase Storage only**; Telegram keeps the permanent copy. Never call `deleteMessage` on Telegram.
- The media proxy route (`GET /api/weekly-media`) is **public** — it must be handled BEFORE admin auth in `api/weekly-messages.js`.
- Stays within Vercel Hobby 12-function limit — no new function files; reuse `api/weekly-messages.js` via rewrites.
- Cache-busters: `js/main.js` → `?v=1.4.1`, `js/dashboard-app.js` → `?v=1.3.0` (already current), `js/discourse.js` → bump `?v=1.0.0` to `?v=1.1.0` and `css/discourse.css` → bump `?v=1.0.0` to `?v=1.1.0`, both in `discourse.html` (see Task 6).
- Tests: `npm test` (Vitest). Fetch is mocked; no live network in tests.
- Migration SQL lives in `supabase_donations.sql` (append; idempotent `alter table ... add column if not exists`, `insert ... on conflict do nothing`).

---

### Task 1: Raise shared helpers to 48MB + add Storage-path validation helpers

**Files:**
- Modify: `api/shared/weekly-common.cjs`
- Test: `tests/weekly-messages-api.test.js`

**Interfaces:**
- Consumes: existing `cors`, `validateWeeklyPayload`, `validateThumbnail`.
- Produces:
  - `TELEGRAM_UPLOAD_MAX_BYTES` (now `48 * 1024 * 1024`)
  - `validateStoragePayload({ storagePath, thumbnailStoragePath })` → `{ ok, errors, value: { storagePath, thumbnailStoragePath? } }` (non-empty path required; thumbnail optional)
  - `buildMediaUrl(id, kind)` → `'/api/weekly-media?id=<uuid>'` or `'/api/weekly-media?id=<uuid>&kind=thumb'`

- [ ] **Step 1: Write the failing tests**

Add to `tests/weekly-messages-api.test.js` (inside a new `describe('weekly storage upload', ...)`):

```js
import {
  buildMediaUrl,
  validateStoragePayload,
  TELEGRAM_UPLOAD_MAX_BYTES as UPLOAD_MAX
} from '../api/shared/weekly-common.cjs';

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

  it('buildMediaUrl builds media and thumb urls', () => {
    expect(buildMediaUrl('abc-123', 'media')).toBe('/api/weekly-media?id=abc-123');
    expect(buildMediaUrl('abc-123', 'thumb')).toBe('/api/weekly-media?id=abc-123&kind=thumb');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/weekly-messages-api.test.js`
Expected: FAIL — import errors (`buildMediaUrl` etc. not exported), and `TELEGRAM_UPLOAD_MAX_BYTES` assert fails (still 4MB).

- [ ] **Step 3: Implement in `api/shared/weekly-common.cjs`**

Change the media cap (leave thumbnail cap at 4MB):

```js
const TELEGRAM_UPLOAD_MAX_BYTES = 48 * 1024 * 1024; // Telegram Bot API caps media at 50MB; stay under
```

Update the oversized-file error message in `validateFile`:

```js
if (bytes > TELEGRAM_UPLOAD_MAX_BYTES) {
  errors.push('file is too large (max 48MB)');
}
```

Add the new functions at the bottom (before `module.exports`):

```js
function validateStoragePayload(payload) {
  const p = payload || {};
  const errors = [];
  const value = {};
  const storagePath = typeof p.storagePath === 'string' ? p.storagePath.trim() : '';
  const thumbPath = typeof p.thumbnailStoragePath === 'string' ? p.thumbnailStoragePath.trim() : '';
  if (!storagePath) errors.push('storagePath is required');
  if (thumbPath) value.thumbnailStoragePath = thumbPath;
  value.storagePath = storagePath;
  return { ok: errors.length === 0, errors, value };
}

function buildMediaUrl(id, kind) {
  const base = '/api/weekly-media?id=' + encodeURIComponent(String(id || ''));
  return kind === 'thumb' ? base + '&kind=thumb' : base;
}
```

Add to `module.exports`:

```js
  validateStoragePayload,
  buildMediaUrl,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/weekly-messages-api.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/shared/weekly-common.cjs tests/weekly-messages-api.test.js
git commit -m "feat: 48MB media cap + storage path/media url helpers"
```

---

### Task 2: telegram-bot helpers return file_id and support getFile streaming

**Files:**
- Modify: `api/shared/telegram-bot.cjs`
- Test: `tests/weekly-messages-api.test.js`

**Interfaces:**
- Consumes: existing `callTelegramApi`, `getBotToken`, `getChannelId`.
- Produces:
  - `sendMediaToTelegram(...)` returns `{ ok, messageId, fileId }` (fileId from `result.audio.file_id` or `result.video.file_id`)
  - `sendPhotoToTelegram(...)` returns `{ ok, messageId, fileId }` (fileId from the largest `result.photo[...].file_id`)
  - `sendTextToTelegram(...)` unchanged (`{ ok, messageId }`)
  - `getTelegramFileStream(fileId)` → returns `{ ok, stream }` where `stream` is the raw `fetch` Response of `https://api.telegram.org/file/bot<TOKEN>/<file_path>` after calling `getFile`; on any failure returns `{ ok: false, error }`
  - `getFileId(result)` helper → `''` fallback

- [ ] **Step 1: Write the failing tests**

Add to `tests/weekly-messages-api.test.js` (inside the existing `describe('telegram-bot', ...)` block or a new one):

```js
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
    expect(r).toEqual({ ok: true, messageId: 1, fileId: 'AUDIO123' });
  });

  it('sendMediaToTelegram returns fileId for video', async () => {
    const { sendMediaToTelegram } = await import('../api/shared/telegram-bot.cjs');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 2, video: { file_id: 'VIDEO456' } } })
    }));
    const r = await sendMediaToTelegram({ mediaType: 'video', buffer: Buffer.from('x'), filename: 'v.mp4', mime: 'video/mp4' });
    expect(r).toEqual({ ok: true, messageId: 2, fileId: 'VIDEO456' });
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
    const fakeStream = { body: 'STREAM' };
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
    expect(getFileId({ photo: [{ file_id: 'Z' }] })).toBe('Z');
    expect(getFileId({})).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/weekly-messages-api.test.js`
Expected: FAIL — `getFileId`/`getTelegramFileStream` not exported, `fileId` missing on send results.

- [ ] **Step 3: Implement in `api/shared/telegram-bot.cjs`**

Add `getFileId` helper and update the three send helpers to return `fileId`. For `sendMediaToTelegram`, read `result.audio.file_id || result.video.file_id`. For `sendPhotoToTelegram`, pick the largest `result.photo` entry by `file_size`.

```js
function getFileId(result) {
  const r = result || {};
  if (r.audio && r.audio.file_id) return r.audio.file_id;
  if (r.video && r.video.file_id) return r.video.file_id;
  if (Array.isArray(r.photo) && r.photo.length) {
    let best = r.photo[0];
    r.photo.forEach((p) => { if (Number(p.file_size) > Number(best.file_size)) best = p; });
    return best.file_id || '';
  }
  return '';
}
```

Update `sendMediaToTelegram` return:

```js
return { ok: true, messageId: Number(result.data.message_id), fileId: getFileId(result.data) };
```

Update `sendPhotoToTelegram` return:

```js
return { ok: true, messageId: Number(result.data.message_id), fileId: getFileId(result.data) };
```

Add `getTelegramFileStream` (streams, does not buffer):

```js
async function getTelegramFileStream(fileId) {
  const token = getBotToken();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' };
  if (!fileId) return { ok: false, error: 'file_id is missing' };
  const info = await callTelegramApi('getFile', makeJsonForm({ file_id: fileId }));
  if (!info.ok) return info;
  const filePath = info.data && info.data.file_path;
  if (!filePath) return { ok: false, error: 'Telegram returned no file_path' };
  const url = 'https://api.telegram.org/file/bot' + token + '/' + filePath;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return { ok: false, error: 'Telegram file download failed (' + res.status + ')' };
  return { ok: true, stream: res };
}
```

`getFile` requires a form body (`multipart/form-data` is fine, or a URL-encoded JSON form). Use this tiny helper (keeps `callTelegramApi` unchanged since it just forwards a FormData body):

```js
function makeJsonForm(obj) {
  const form = new FormData();
  Object.keys(obj).forEach((k) => form.append(k, String(obj[k])));
  return form;
}
```

Update `module.exports`:

```js
module.exports = { getBotToken, getChannelId, callTelegramApi, sendMediaToTelegram, sendTextToTelegram, sendPhotoToTelegram, getTelegramFileStream, getFileId };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/weekly-messages-api.test.js`
Expected: PASS (all new + existing telegram-bot tests).

- [ ] **Step 5: Commit**

```bash
git add api/shared/telegram-bot.cjs tests/weekly-messages-api.test.js
git commit -m "feat: telegram-bot returns file_id and streams getFile"
```

---

### Task 3: SQL migration — columns, Storage bucket, RLS policy

**Files:**
- Modify: `supabase_donations.sql`

**Interfaces:**
- Produces (idempotent DDL the user runs once in the Supabase SQL editor):
  - `weekly_messages.telegram_file_id text`
  - `weekly_messages.thumbnail_file_id text`
  - Storage bucket `weekly-messages` (private)
  - `storage.objects` insert policy for `authenticated` role scoped to that bucket

- [ ] **Step 1: Append the migration block to `supabase_donations.sql`**

```sql
-- ── Weekly media: Storage bucket + file_id columns ──────────────────────────
-- Run this block in the Supabase SQL editor (idempotent; safe to re-run).
alter table public.weekly_messages add column if not exists telegram_file_id text;
alter table public.weekly_messages add column if not exists thumbnail_file_id text;

-- Private bucket: files land here from the dashboard, are pushed to Telegram,
-- then deleted from Storage (Telegram keeps the permanent copy).
insert into storage.buckets (id, name, public)
values ('weekly-messages', 'weekly-messages', false)
on conflict (id) do nothing;

-- Allow authenticated admins (server uses service role, which bypasses RLS)
-- to insert objects into this bucket. Read/delete stay service-role only.
drop policy if exists "Authenticated upload to weekly-messages" on storage.objects;
create policy "Authenticated upload to weekly-messages"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'weekly-messages');
```

- [ ] **Step 2: Verify the file parses (no execution against live DB)**

Run: `git --no-pager diff supabase_donations.sql`
Expected: only the appended block; SQL is syntactically well-formed (parentheses balanced, statements end with `;`).

- [ ] **Step 3: Commit**

```bash
git add supabase_donations.sql
git commit -m "feat: weekly-media storage bucket, RLS insert policy, file_id columns"
```

---

### Task 4: Server — storage-backed upload + public media proxy in weekly-messages.js

**Files:**
- Modify: `api/weekly-messages.js`
- Modify: `vercel.json`
- Test: `tests/weekly-messages-api.test.js` (proxy URL building already covered in Task 1; handler logic stays behind mocked network — see notes)

**Interfaces:**
- Consumes: `validateStoragePayload`, `buildMediaUrl`, `getMediaKind` (Task 1); `getTelegramFileStream`, `sendPhotoToTelegram`, `sendMediaToTelegram`, `getFileId` (Task 2); supabase service client `sb` (already created in the handler).
- Produces:
  - `POST /api/telegram-upload` JSON branch now accepts `storagePath` (media) + `thumbnailStoragePath`; stores `telegram_file_id` + `thumbnail_file_id`.
  - `GET /api/weekly-media` (public) — streams via `getTelegramFileStream`, sets `Content-Type` and `Content-Length` when available.
  - `vercel.json` rewrite `/api/weekly-media -> /api/weekly-messages`.

- [ ] **Step 1: Add the rewrite to `vercel.json`**

Append to the `rewrites` array:

```json
{ "source": "/api/weekly-media", "destination": "/api/weekly-messages" }
```

- [ ] **Step 2: Implement the public proxy branch in `api/weekly-messages.js`**

Inside `module.exports` handler, BEFORE the admin auth block and BEFORE the `isTelegramUpload` check, add:

```js
  if (req.method === 'GET' && (req.url || '').indexOf('/weekly-media') !== -1) {
    return handleMediaProxy(req, res, sb);
  }
```

Add the proxy function (and its dependency `getTelegramFileStream` import). Import at the top:

```js
const {
  sendMediaToTelegram,
  sendTextToTelegram,
  sendPhotoToTelegram,
  getChannelId,
  getTelegramFileStream
} = require('./shared/telegram-bot.cjs');
```

Add `handleMediaProxy` after `handleTelegramUpload`:

```js
async function handleMediaProxy(req, res, sb) {
  const url = new URL(req.url, 'https://example.invalid');
  const id = String(url.searchParams.get('id') || '').trim();
  const kind = url.searchParams.get('kind') === 'thumb' ? 'thumb' : 'media';
  if (!id) return res.status(400).json({ error: 'id is required' });

  const column = kind === 'thumb' ? 'thumbnail_file_id' : 'telegram_file_id';
  const { data, error } = await sb.from('weekly_messages')
    .select('title, media_type, ' + column)
    .eq('id', id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !data[column]) return res.status(404).json({ error: 'Media not found' });

  const got = await getTelegramFileStream(data[column]);
  if (!got.ok) return res.status(502).json({ error: got.error });

  const contentType = kind === 'thumb'
    ? (data.media_type === 'video' ? 'image/jpeg' : 'image/jpeg')
    : (data.media_type === 'video' ? 'video/mp4' : 'audio/mpeg');
  res.setHeader('Content-Type', contentType);
  const len = got.stream.headers && got.stream.headers.get('content-length');
  if (len) res.setHeader('Content-Length', len);
  const body = got.stream.body;
  if (!body) return res.status(502).json({ error: 'Telegram returned no body' });
  const reader = body.getReader();
  res.on('close', () => { try { reader.cancel(); } catch (e) {} });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}
```

- [ ] **Step 3: Rewrite `handleTelegramUpload` JSON media branch to use Storage paths**

Replace the JSON text branch (`application/json`) handler so it routes by payload:
- if `body.text` present and `media_type === 'text'` → existing text path (unchanged).
- else if `body.storagePath` → media path (new).
- else → 400.

Import `validateStoragePayload` in the require of `weekly-common.cjs`:

```js
const {
  cors,
  validateWeeklyPayload,
  validateFile,
  parseTelegramLink,
  validateThumbnail,
  buildEmbedUrl,
  validateStoragePayload
} = require('./shared/weekly-common.cjs');
```

New media-from-storage branch inside `handleTelegramUpload` (JSON case), after the text branch:

```js
    if (contentType.startsWith('application/json')) {
      const body = parseJson(await readBody(req));
      const v = validateWeeklyPayload(body);
      if (!v.ok) return res.status(400).json({ errors: v.errors });

      if (v.value.media_type === 'text') {
        // existing text path unchanged (sendTextToTelegram + insert)
        ...
      }

      const sv = validateStoragePayload(body);
      if (!sv.ok) return res.status(400).json({ errors: sv.errors });

      const { data: mediaObj, error: mediaErr } = await sb.storage
        .from('weekly-messages')
        .download(sv.value.storagePath);
      if (mediaErr || !mediaObj) {
        return res.status(502).json({ error: 'Could not read uploaded file from storage' });
      }
      const mediaBuffer = Buffer.from(await mediaObj.arrayBuffer());

      const fv = validateFile({
        mediaType: v.value.media_type,
        filename: sv.value.storagePath.split('/').pop(),
        bytes: mediaBuffer.length
      });
      if (!fv.ok) return res.status(400).json({ errors: fv.errors });

      const sent = await sendMediaToTelegram({
        mediaType: v.value.media_type,
        buffer: mediaBuffer,
        filename: fv.value.filename,
        mime: v.value.media_type === 'video' ? 'video/mp4' : 'audio/mpeg',
        caption: v.value.title
      });
      if (!sent.ok) return res.status(502).json({ error: sent.error });

      let thumbnailUrl = v.value.thumbnail_url;
      let thumbFileId = null;
      if (sv.value.thumbnailStoragePath) {
        const { data: thumbObj, error: thumbErr } = await sb.storage
          .from('weekly-messages')
          .download(sv.value.thumbnailStoragePath);
        if (thumbErr || !thumbObj) {
          return res.status(502).json({ error: 'Could not read uploaded thumbnail from storage' });
        }
        const thumbBuffer = Buffer.from(await thumbObj.arrayBuffer());
        const tv = validateThumbnail({ mime: 'image/jpeg', buffer: thumbBuffer });
        if (!tv.ok) return res.status(400).json({ errors: tv.errors });
        const sentThumb = await sendPhotoToTelegram({
          buffer: thumbBuffer,
          mime: 'image/jpeg',
          filename: sv.value.thumbnailStoragePath.split('/').pop(),
          caption: v.value.title
        });
        if (!sentThumb.ok) return res.status(502).json({ error: sentThumb.error });
        thumbFileId = sentThumb.fileId || null;
        thumbnailUrl = buildEmbedUrl(normalizeChannel(getChannelId()), sentThumb.messageId);
      }

      const row = {
        ...v.value,
        telegram_channel: normalizeChannel(getChannelId()),
        telegram_message_id: sent.messageId,
        telegram_file_id: sent.fileId || null,
        thumbnail_file_id: thumbFileId,
        created_by: admin.id
      };
      if (thumbnailUrl) row.thumbnail_url = thumbnailUrl;
      const { data: rowData, error: rowErr } = await sb.from('weekly_messages').insert(row).select().single();
      if (rowErr) return res.status(500).json({ error: rowErr.message });

      await sb.storage.from('weekly-messages').remove([sv.value.storagePath]);
      if (sv.value.thumbnailStoragePath) {
        await sb.storage.from('weekly-messages').remove([sv.value.thumbnailStoragePath]);
      }

      return res.status(201).json({
        id: rowData.id,
        telegram_channel: rowData.telegram_channel,
        telegram_message_id: rowData.telegram_message_id
      });
    }
```

Also update the existing `handleTelegramUpload` multipart media branch so it stores `telegram_file_id` (for compatibility with link-first/thumbnail-only multipart usage it keeps working):

```js
  const sent = await sendMediaToTelegram({ ... });
  if (!sent.ok) return res.status(502).json({ error: sent.error });
  ...
  const row = {
    ...v.value,
    telegram_channel: normalizeChannel(getChannelId()),
    telegram_message_id: sent.messageId,
    telegram_file_id: sent.fileId || null,
    created_by: admin.id
  };
```

- [ ] **Step 4: Syntax check**

Run: `node --check api/weekly-messages.js`
Expected: no output (syntax OK).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 145+ PASS (new tests from Tasks 1-2 plus unchanged existing).

- [ ] **Step 6: Commit**

```bash
git add api/weekly-messages.js vercel.json
git commit -m "feat: storage-backed upload + public media proxy"
```

---

### Task 5: Dashboard — upload to Storage first, then JSON POST

**Files:**
- Modify: `js/dashboard-app.js`
- (Cache-buster bump handled in Task 6 for all page JS.)

**Interfaces:**
- Consumes: existing `supabase` client (`supabase.storage.from('weekly-messages')`), `getToken()`.
- Produces: new client-side behavior — media + thumbnail upload directly to Storage; JSON POST to `/api/telegram-upload` with `storagePath`/`thumbnailStoragePath`.

- [ ] **Step 1: Raise the client-side cap to 48MB**

In `js/dashboard-app.js` line ~1635 change:

```js
const WEEKLY_UPLOAD_MAX_BYTES = 48 * 1024 * 1024; // Telegram Bot API caps media at 50MB
```

Update the two guard messages (lines ~1869 and ~1873) and the 413 fallback message (line ~1891) from "4MB" to "48MB".

- [ ] **Step 2: Add a storage-upload helper inside `initWeeklyMessagesAdmin`**

```js
  async function uploadToStorage(blob, name) {
    const token = await getToken();
    if (!token) throw new Error('Not signed in. Please sign in again.');
    const path = 'discourse/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '/' + name;
    const { error } = await supabase.storage.from('weekly-messages').upload(path, blob, { upsert: false });
    if (error) throw new Error('Storage upload failed: ' + error.message);
    return path;
  }
```

- [ ] **Step 3: Replace the media-file submit path with storage-first upload**

In the form submit handler (`form.addEventListener('submit', ...)`), replace the `else if (file)` branch (lines ~1867-1894) so it uploads to Storage then POSTs JSON:

```js
      } else if (file) {
        if (file.size > WEEKLY_UPLOAD_MAX_BYTES) {
          setStatus('File is larger than 48MB. Post it to the channel directly and use the message-link option instead.', true);
          return;
        }
        if (thumbFile && (file.size + thumbFile.size) > WEEKLY_UPLOAD_MAX_BYTES) {
          setStatus('File plus thumbnail must stay under 48MB. Post large files to the channel and use the message-link option instead.', true);
          return;
        }
        setStatus('Uploading to storage…');
        const storagePath = await uploadToStorage(file, file.name);
        let thumbnailStoragePath = null;
        if (thumbFile) {
          thumbnailStoragePath = await uploadToStorage(thumbFile, 'thumb-' + thumbFile.name);
        }
        setStatus('Publishing…');
        await api('/api/telegram-upload', 'POST', {
          ...base,
          storagePath,
          thumbnailStoragePath: thumbnailStoragePath || undefined
        });
      }
```

`thumbnailStoragePath` may be `undefined`; JSON.stringify drops undefined keys, so the server sees no `thumbnailStoragePath`. Ensure `base` no longer contains a stray `thumbnail_url` file artifact — it already sends `thumbnail_url: ''` which the payload validator ignores.

- [ ] **Step 4: Keep the edit/thumbnail PATCH path working**

The edit path already sends thumbnails via multipart to `/api/weekly-messages` (PATCH). Leave it unchanged — it still works for the ≤4MB thumbnail case, and `sendPhotoToTelegram` now stores the thumbnail via the link-first flow (thumbnail_url). No file_id column needed there (public playback uses `thumbnail_url` as a fallback image; Task 6 handles rendering).

- [ ] **Step 5: Syntax check**

Run: `node --check js/dashboard-app.js`
Expected: no output (syntax OK).

- [ ] **Step 6: Run the suite (regression)**

Run: `npm test`
Expected: all PASS (no dashboard-app unit tests exist; ensure nothing else regressed).

- [ ] **Step 7: Commit**

```bash
git add js/dashboard-app.js
git commit -m "feat: dashboard uploads media to storage then posts json"
```

---

### Task 6: Public page — native player via /api/weekly-media

**Files:**
- Modify: `js/discourse.js`
- Modify: `discourse.html` (cache-buster for `js/discourse.js`)

**Interfaces:**
- Consumes: `media_type`, `telegram_file_id`, `thumbnail_file_id` columns; `buildMediaUrl(id, kind)` (Task 1).
- Produces: public `window.SSPKD.buildMediaUrl`, `renderCard` with native `<audio>`/`<video>` (no t.me iframe for storage-uploaded rows), thumbnail via proxy or fallback `<img>`.

- [ ] **Step 1: Rewrite `buildEmbedUrl` usage in `renderCard`**

Replace the media block (lines ~88-98) so that when a row has `telegram_file_id` it renders a native player; otherwise fall back to the existing embed (message-link rows):

```js
    var media;
    if (m.telegram_file_id) {
      var src = buildMediaUrl(m.id, 'media');
      var thumb = m.thumbnail_file_id
        ? buildMediaUrl(m.id, 'thumb')
        : (m.thumbnail_url && !isTelegramEmbedUrl(m.thumbnail_url) ? m.thumbnail_url : DEFAULT_THUMB);
      var player = m.media_type === 'video'
        ? '<video class="discourse-video" controls preload="metadata" poster="' + escapeHtml(thumb) + '" src="' + escapeHtml(src) + '"></video>'
        : '<audio class="discourse-audio" controls preload="metadata" src="' + escapeHtml(src) + '"></audio>';
      media =
        '<div class="discourse-card-media">' +
          '<div class="discourse-player">' +
            player +
            '<a class="discourse-fallback-link" href="' + escapeHtml(fallbackUrl(m)) + '" target="_blank" rel="noopener noreferrer">' + actionText + ' in Telegram</a>' +
          '</div>' +
        '</div>';
    } else {
      media =
        '<div class="discourse-card-media">' +
          '<div class="discourse-player">' +
            renderThumbnail(m) +
            '<iframe class="discourse-player-frame" src="' + escapeHtml(buildEmbedUrl(m)) + '" title="' + title + '" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
            '<a class="discourse-fallback-link" href="' + escapeHtml(fallbackUrl(m)) + '" target="_blank" rel="noopener noreferrer">' + actionText + '</a>' +
          '</div>' +
        '</div>';
    }
```

Add `buildMediaUrl` (mirror of server helper, ID-encoded):

```js
  function buildMediaUrl(id, kind) {
    var base = '/api/weekly-media?id=' + encodeURIComponent(String(id == null ? '' : id));
    return kind === 'thumb' ? base + '&kind=thumb' : base;
  }
```

Export it on `window.SSPKD` (next to `buildEmbedUrl`).

- [ ] **Step 2: Add minimal styling hooks to `css/discourse.css`**

The discourse page loads `css/discourse.css?v=1.0.0` (`discourse.html:10`). Add (near the existing `.discourse-player` rules around line 49):

```css
.discourse-video, .discourse-audio { width: 100%; border-radius: 8px; display: block; }
```

Also bump the stylesheet cache-buster in `discourse.html:10` from `css/discourse.css?v=1.0.0` to `css/discourse.css?v=1.1.0`.

- [ ] **Step 3: Bump the `js/discourse.js` cache-buster in `discourse.html`**

Find the `<script src="js/discourse.js?v=1.0.0"></script>` reference at `discourse.html:102`. Bump to `v=1.1.0`. (`main.js` is already `v=1.4.1` and `dashboard-app.js` is already `v=1.3.0` — do not touch those.)

- [ ] **Step 4: Syntax check**

Run: `node --check js/discourse.js`
Expected: no output.

- [ ] **Step 5: Run the suite (regression)**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add js/discourse.js css/discourse.css discourse.html
git commit -m "feat: native player via media proxy on discourse page"
```

---

### Task 7: Deploy, migrate DB, and verify end-to-end (manual, user-assisted)

**Files:**
- No code changes.

**Interfaces:**
- Consumes: everything from Tasks 1-6.

- [ ] **Step 1: Run the SQL migration in Supabase**

User runs the `supabase_donations.sql` appended block (Task 3) in the Supabase SQL editor. Verify:
- `weekly_messages` has `telegram_file_id` + `thumbnail_file_id` columns.
- Bucket `weekly-messages` exists (private) under Storage → Buckets.
- Policy exists under Storage → Policies.

- [ ] **Step 2: Add bot as admin to the Telegram channel**

User ensures the bot is an admin (Post Messages) of channel id `-3621082703`.

- [ ] **Step 3: Deploy**

Run: `$env:VERCEL_TOKEN = (Get-Content "C:\Users\Sathya\AppData\Roaming\xdg.data\com.vercel.cli\auth.json" | ConvertFrom-Json).token; vercel --prod --yes`

- [ ] **Step 4: Verify proxy routing live**

Run:
```bash
curl -i "https://ssdpk-orgin-gamma.vercel.app/api/weekly-media?id=00000000-0000-0000-0000-000000000000"
```
Expected: `400 {"error":"id is required"}` for missing id; `404 {"error":"Media not found"}` for unknown id.

- [ ] **Step 5: Verify a real admin upload**

User uploads a small audio file (<48MB) via the dashboard. Expected:
- File appears in the Telegram channel with title caption.
- `weekly_messages` row has `telegram_message_id` + `telegram_file_id` (and `thumbnail_file_id` if a thumbnail was attached).
- Storage bucket `weekly-messages` is empty after success (objects deleted).

- [ ] **Step 6: Verify native playback**

Open the public discourse page. Expected: native `<audio>`/`<video>` control loads and plays from `/api/weekly-media?id=...` (no t.me iframe). Confirm the bot token never appears in the network tab.

- [ ] **Step 7: Verify failure keeps Storage objects**

Simulate a failure (e.g., temporarily wrong channel id) and confirm Storage objects remain, then restore.

- [ ] **Step 8: Push to origin**

```bash
git push origin main
```

---

## Self-Review

### Spec coverage
- 48MB cap + Storage-first upload → Tasks 1, 5.
- Delete from Storage only, Telegram keeps copy → Task 4 (remove Storage objects, no Telegram delete) + Task 7 Step 5 verification.
- Native player via `/api/weekly-media`, no t.me visible → Tasks 1 (helpers), 4 (proxy), 6 (renderer).
- Thumbnails streamed via `&kind=thumb` → Tasks 1, 4, 6.
- Message-link rows keep fallback → Task 6 (else branch keeps iframe + fallback link).
- Within 12-function limit (rewrite, no new function file) → Task 4 Step 1.
- `telegram_file_id`/`thumbnail_file_id` columns + bucket + RLS → Task 3.
- Tests (48MB cap, fileId capture, storage validation, proxy URL building) → Tasks 1-2.

### Placeholder scan
- No TBD/TODO. Task 7 Step 1 and Step 5 are user-assisted manual steps with concrete verification criteria, not placeholders.

### Type consistency
- `validateStoragePayload` returns `{ ok, errors, value: { storagePath, thumbnailStoragePath? } }`; used in Task 4.
- `buildMediaUrl(id, kind)` used identically in Tasks 1 and 6.
- Task 4 parses `kind` from the query string directly (`url.searchParams.get('kind')`); no shared helper needed.
