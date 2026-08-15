# Weekly Discourse Thumbnail Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload a thumbnail image for a weekly discourse message; the thumbnail is posted to the Telegram archive channel as a photo and displayed on the public Discourse page as a Telegram photo embed.

**Architecture:** The uploaded image is sent to the existing Telegram channel via Bot API `sendPhoto`; the resulting photo message id is stored in `weekly_messages.thumbnail_url` as `https://t.me/<channel>/<photoMessageId>?embed=1`. The public card renders a `t.me`-style thumbnail_url as a photo-embed iframe (reusing the existing `.discourse-thumb` full-bleed class) and any other URL as the existing `<img>`. No new serverless function (12-function Vercel Hobby limit), no new storage bucket, no new env vars.

**Tech Stack:** Node.js CommonJS serverless (`api/*`), `busboy` multipart parsing, Supabase JS client, Vitest + jsdom (no live Telegram/Supabase calls), vanilla JS browser code.

## Global Constraints

- **Vercel Hobby limit:** max 12 serverless functions per deployment. No new `api/*.js` file may be created. All changes stay inside existing `api/weekly-messages.js` + `api/shared/*.cjs` helpers.
- **No new dependencies.** Only existing deps (`busboy`, `@supabase/supabase-js`) and dev deps (`vitest`, `jsdom`).
- **Shared server helpers must be CommonJS** (`.cjs`) — they are `require()`d by Vercel functions.
- **Thumbnail file:** must be `image/jpeg` or `image/png`, max **5 MB** (5 * 1024 * 1024 bytes).
- **Git on this machine is shadowed.** Every git command MUST use the full path: `& "C:\Program Files\Git\cmd\git.exe" ...`. Never commit `package-lock.json`.
- **Tests:** `npm test` runs Vitest. Single file: `npm test -- --run tests/<file>.test.js`. The existing 137 tests must stay green.
- **No comments in code** unless required for clarity; match the existing style (this repo does use concise section headers).
- Commit style follows the repo: `feat(weekly-discourse): <summary>`.

---

### Task 1: Add thumbnail validation + embed detection to `api/shared/weekly-common.cjs`

**Files:**
- Modify: `api/shared/weekly-common.cjs`
- Test: `tests/weekly-messages-api.test.js`

**Interfaces:**
- Consumes: nothing new (file has no deps).
- Produces (used by Tasks 2-4):
  - `const THUMBNAIL_MAX_BYTES` (= 5 * 1024 * 1024), exported.
  - `function validateThumbnail(thumb)` -> `{ ok, errors, value }`. `thumb` is `null` (no thumbnail) or `{ mime: string, buffer: Buffer }`. On ok: `value = { mime, bytes }`; when `thumb` is null: `{ ok: true, errors: [], value: null }`.
  - `function isTelegramEmbedUrl(url)` -> boolean. Matches `https://t.me/<channel>/<id>?embed=1` exactly.

- [ ] **Step 1: Write the failing tests** — append a new `describe('thumbnail helpers')` block to `tests/weekly-messages-api.test.js` and add the two new names to the import statement.

```js
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
```

Append:

```js
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
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- --run tests/weekly-messages-api.test.js`
Expected: FAIL — `THUMBNAIL_MAX_BYTES` is not exported, `validateThumbnail`/`isTelegramEmbedUrl` are not exported.

- [ ] **Step 3: Implement the helpers** in `api/shared/weekly-common.cjs`. Add the constant near the top (after `TELEGRAM_UPLOAD_MAX_BYTES`):

```js
const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const THUMBNAIL_MIMES = new Set(['image/jpeg', 'image/png']);
```

Add the two functions after `validateFile`:

```js
function validateThumbnail(thumb) {
  if (thumb == null) return { ok: true, errors: [], value: null };
  const mime = String(thumb.mime || '');
  const bytes = (thumb.buffer && thumb.buffer.length) || 0;
  const errors = [];
  if (!THUMBNAIL_MIMES.has(mime)) errors.push('thumbnail must be a JPEG or PNG image');
  if (!(bytes > 0)) errors.push('thumbnail file is empty');
  if (bytes > THUMBNAIL_MAX_BYTES) errors.push('thumbnail is too large (max 5MB)');
  return { ok: errors.length === 0, errors, value: errors.length === 0 ? { mime, bytes } : {} };
}

function isTelegramEmbedUrl(url) {
  return /^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+\?embed=1$/.test(String(url || ''));
}
```

Add to `module.exports`:

```js
  THUMBNAIL_MAX_BYTES,
  validateThumbnail,
  isTelegramEmbedUrl
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run tests/weekly-messages-api.test.js`
Expected: PASS — all tests green including the new `thumbnail helpers` describe block.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: all green.

```bash
git add api/shared/weekly-common.cjs tests/weekly-messages-api.test.js
git commit -m "feat(weekly-discourse): add thumbnail validation and embed URL helpers"
```

---

### Task 2: Add `sendPhotoToTelegram` to `api/shared/telegram-bot.cjs`

**Files:**
- Modify: `api/shared/telegram-bot.cjs`
- Test: `tests/weekly-messages-api.test.js`

**Interfaces:**
- Consumes: existing `getChannelId()`, `callTelegramApi(method, form)` from the same file.
- Produces (used by Task 3):
  - `async function sendPhotoToTelegram({ buffer, mime, filename, caption })` -> `{ ok: true, messageId: number }` on success, `{ ok: false, error: string }` on failure (matches `sendMediaToTelegram`).

- [ ] **Step 1: Write the failing test** — append to the `describe('telegram-bot')` block in `tests/weekly-messages-api.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/weekly-messages-api.test.js`
Expected: FAIL — `sendPhotoToTelegram` is not exported.

- [ ] **Step 3: Implement `sendPhotoToTelegram`** in `api/shared/telegram-bot.cjs`, after `sendTextToTelegram`:

```js
async function sendPhotoToTelegram({ buffer, mime, filename, caption }) {
  const channel = getChannelId();
  if (!channel) return { ok: false, error: 'TELEGRAM_CHANNEL_ID is not configured' };

  const form = new FormData();
  form.append('chat_id', channel);
  if (caption) form.append('caption', caption);
  form.append('photo', new Blob([buffer], { type: mime || 'image/jpeg' }), filename || 'thumb.jpg');

  const result = await callTelegramApi('sendPhoto', form);
  if (!result.ok) return result;
  return { ok: true, messageId: Number(result.data.message_id) };
}
```

Update `module.exports`:

```js
module.exports = { getBotToken, getChannelId, callTelegramApi, sendMediaToTelegram, sendTextToTelegram, sendPhotoToTelegram };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run tests/weekly-messages-api.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: all green.

```bash
git add api/shared/telegram-bot.cjs tests/weekly-messages-api.test.js
git commit -m "feat(weekly-discourse): add sendPhotoToTelegram bot helper"
```

---

### Task 3: Accept optional thumbnail in `api/weekly-messages.js`

**Files:**
- Modify: `api/weekly-messages.js`

**Interfaces:**
- Consumes: `validateThumbnail`, `buildEmbedUrl` from `./shared/weekly-common.cjs`; `sendPhotoToTelegram` from `./shared/telegram-bot.cjs` (Tasks 1-2).
- Produces (used by Task 5): endpoint behavior —
  - Multipart requests may include an optional second file part named `thumbnail`.
  - Create flows (media upload and link-first POST) send the thumbnail photo to the channel and store `thumbnail_url = https://t.me/<channel>/<photoMessageId>?embed=1`.
  - PATCH accepts multipart (with `thumbnail` part) or JSON (with `thumbnail_url: null` to clear).
  - Existing text/JSON/media behaviors unchanged.

- [ ] **Step 1: Update imports and `parseMultipart`**

In `api/weekly-messages.js`, change the imports to:

```js
const {
  cors,
  validateWeeklyPayload,
  validateFile,
  parseTelegramLink,
  validateThumbnail,
  buildEmbedUrl
} = require('./shared/weekly-common.cjs');
const { authenticateAdmin } = require('./shared/admin-auth.cjs');
const {
  sendMediaToTelegram,
  sendTextToTelegram,
  sendPhotoToTelegram,
  getChannelId
} = require('./shared/telegram-bot.cjs');
```

Replace `parseMultipart` (currently collects only one `file`) so it collects files by field name and returns both `file` and `thumbnail`:

```js
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers });
    const fields = {};
    const files = {};

    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        files[name] = { filename: info.filename, mime: info.mimeType, buffer: Buffer.concat(chunks) };
      });
    });
    bb.on('close', () => resolve({ fields, file: files.file, thumbnail: files.thumbnail }));
    bb.on('error', (e) => reject(e));
    req.pipe(bb);
  });
}
```

- [ ] **Step 2: Update the media-upload branch in `handleTelegramUpload`**

In the `multipart/form-data` branch (after the existing `validateFile` check and before `sendMediaToTelegram`), validate the optional thumbnail:

```js
  const tv = validateThumbnail(parts.thumbnail);
  if (!tv.ok) return res.status(400).json({ errors: tv.errors });
```

After the `sent` check and before building `row`, send the photo (if provided) and compute the embed URL:

```js
  let thumbnailUrl = v.value.thumbnail_url;
  if (parts.thumbnail) {
    const sentThumb = await sendPhotoToTelegram({
      buffer: parts.thumbnail.buffer,
      mime: parts.thumbnail.mime,
      filename: parts.thumbnail.filename,
      caption: v.value.title
    });
    if (!sentThumb.ok) return res.status(502).json({ error: sentThumb.error });
    thumbnailUrl = buildEmbedUrl(normalizeChannel(getChannelId()), sentThumb.messageId);
  }
```

Change the `row` object to set `thumbnail_url` only when a value exists:

```js
  const row = {
    ...v.value,
    telegram_channel: normalizeChannel(getChannelId()),
    telegram_message_id: sent.messageId,
    created_by: admin.id
  };
  if (thumbnailUrl) row.thumbnail_url = thumbnailUrl;
```

- [ ] **Step 3: Make `handleMessages` multipart-aware**

At the top of `handleMessages`, replace the unconditional JSON parse with a content-type check:

```js
  const contentType = req.headers['content-type'] || '';
  const isMultipart = contentType.startsWith('multipart/form-data');
  const parts = isMultipart ? await parseMultipart(req) : null;
  const body = parts ? parts.fields : parseJson(await readBody(req));
```

In the `POST` (link-first) branch, after `v.ok`, the `link` check, and the `row` object construction, add thumbnail handling before the `sb.from('weekly_messages').insert(row)` call:

```js
    if (parts && parts.thumbnail) {
      const tv = validateThumbnail(parts.thumbnail);
      if (!tv.ok) return res.status(400).json({ errors: tv.errors });
      const sentThumb = await sendPhotoToTelegram({
        buffer: parts.thumbnail.buffer,
        mime: parts.thumbnail.mime,
        filename: parts.thumbnail.filename,
        caption: v.value.title
      });
      if (!sentThumb.ok) return res.status(502).json({ error: sentThumb.error });
      row.thumbnail_url = buildEmbedUrl(normalizeChannel(getChannelId()), sentThumb.messageId);
    }
```

In the `PATCH` branch, after the existing `OPTIONAL_FIELDS` loop and before the update call, add:

```js
  if (parts && parts.thumbnail) {
    const tv = validateThumbnail(parts.thumbnail);
    if (!tv.ok) return res.status(400).json({ errors: tv.errors });
    const sentThumb = await sendPhotoToTelegram({
      buffer: parts.thumbnail.buffer,
      mime: parts.thumbnail.mime,
      filename: parts.thumbnail.filename,
      caption: updates.title || undefined
    });
    if (!sentThumb.ok) return res.status(502).json({ error: sentThumb.error });
    updates.thumbnail_url = buildEmbedUrl(normalizeChannel(getChannelId()), sentThumb.messageId);
  }
```

`DELETE` stays JSON-only (the frontend already sends `application/json`).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all 137+ tests green. The endpoint itself is not unit-tested (matching the existing convention); Task 1's `validateThumbnail` and Task 2's `sendPhotoToTelegram` cover the new logic.

- [ ] **Step 5: Commit**

```bash
git add api/weekly-messages.js
git commit -m "feat(weekly-discourse): accept optional thumbnail in weekly-messages endpoint"
```

---

### Task 4: Render photo-embed thumbnails in `js/discourse.js`

**Files:**
- Modify: `js/discourse.js`
- Test: `tests/discourse.test.js`

**Interfaces:**
- Consumes: `thumbnail_url` on message rows (set by Task 3).
- Produces: `function renderThumbnail(message)` exposed on `window.SSPKD` for testing; `renderCard` renders an `<iframe class="discourse-thumb">` for `t.me` embed URLs and the existing `<img class="discourse-thumb">` otherwise.

- [ ] **Step 1: Write the failing tests** — append to `tests/discourse.test.js` inside the existing `describe('js/discourse.js')`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/discourse.test.js`
Expected: FAIL — current `renderCard` always emits the `<img>` for any `thumbnail_url`, so the iframe test fails.

- [ ] **Step 3: Implement `renderThumbnail` and update `renderCard`**

In `js/discourse.js`, add a helper after `fallbackUrl`:

```js
  function isTelegramEmbedUrl(url) {
    return /^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+\?embed=1$/.test(String(url || ''));
  }

  function renderThumbnail(message) {
    var url = String((message && message.thumbnail_url) || '').trim();
    if (isTelegramEmbedUrl(url)) {
      return '<iframe class="discourse-thumb" src="' + escapeHtml(url) + '" title="' + escapeHtml(message.title || '') + '" loading="lazy" allowfullscreen></iframe>';
    }
    return '<img class="discourse-thumb" src="' + escapeHtml(url || DEFAULT_THUMB) + '" alt="" loading="lazy">';
  }
```

Replace the thumb line inside `renderCard`'s `media` string:

```js
          renderThumbnail(m) +
```

so the media block becomes:

```js
    var media =
      '<div class="discourse-card-media">' +
        '<div class="discourse-player">' +
          renderThumbnail(m) +
          '<iframe class="discourse-player-frame" src="' + escapeHtml(buildEmbedUrl(m)) + '" title="' + title + '" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
          '<a class="discourse-fallback-link" href="' + escapeHtml(fallbackUrl(m)) + '" target="_blank" rel="noopener noreferrer">' + actionText + '</a>' +
        '</div>' +
      '</div>';
```

Expose `renderThumbnail` on the public API object:

```js
  window.SSPKD = {
    escapeHtml: escapeHtml,
    buildEmbedUrl: buildEmbedUrl,
    fallbackUrl: fallbackUrl,
    filterMessages: filterMessages,
    renderCard: renderCard,
    renderThumbnail: renderThumbnail,
    fetchMessages: fetchMessages,
    init: init
  };
```

No CSS change: `.discourse-thumb` already sets `position:absolute; inset:0; width:100%; height:100%`, which is exactly the full-bleed treatment the iframe needs.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run tests/discourse.test.js`
Expected: PASS (all 6 existing + 2 new).

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: all green.

```bash
git add js/discourse.js tests/discourse.test.js
git commit -m "feat(weekly-discourse): render t.me thumbnail_url as photo embed"
```

---

### Task 5: Admin panel thumbnail upload UI in `dashboard.html` + `js/dashboard-app.js`

**Files:**
- Modify: `dashboard.html` (Weekly Messages form section)
- Modify: `js/dashboard-app.js` (`initWeeklyMessagesAdmin`)

**Interfaces:**
- Consumes: Task 3 endpoint behavior (`/api/telegram-upload` and `/api/weekly-messages` accept an optional `thumbnail` file part).
- Produces: admin can pick/remove a thumbnail image; client-side guards (JPEG/PNG, ≤ 5MB); the thumbnail is included in media/link/edit multipart requests; a remove action sends `thumbnail_url: null` via JSON PATCH.

- [ ] **Step 1: Add the thumbnail file input + preview to the form** in `dashboard.html`

Replace the existing thumbnail row (the `<div style="display:grid; grid-template-columns: 1fr 1fr;">` containing `wmDuration` and `wmThumbnail`, currently lines ~635-638) with:

```html
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
            <input type="text" id="wmDuration" placeholder="Duration (e.g. 45:00)" class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
            <input type="text" id="wmThumbnail" placeholder="Thumbnail URL (advanced)" class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
          </div>
          <div style="margin-bottom:12px;">
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Thumbnail image (JPEG/PNG, max 5MB)</label>
            <input type="file" id="wmThumbnailFile" accept="image/jpeg,image/png" class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
          </div>
          <div id="wmThumbnailPreviewWrap" style="display:none; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <img id="wmThumbnailPreview" alt="Thumbnail preview" style="width:80px; height:45px; object-fit:cover; border-radius:6px; border:1px solid var(--border);">
              <button type="button" id="wmThumbnailRemove" class="btn btn-outline" style="padding:4px 12px; font-size:12px;">Remove thumbnail</button>
            </div>
          </div>
```

- [ ] **Step 2: Add thumbnail state + element refs** in `js/dashboard-app.js`

Near the top of `initWeeklyMessagesAdmin` (after the existing refs, e.g. after `const linkWrap = ...`), add:

```js
  const thumbFileEl = document.getElementById('wmThumbnailFile');
  const thumbPreviewEl = document.getElementById('wmThumbnailPreview');
  const thumbPreviewWrap = document.getElementById('wmThumbnailPreviewWrap');
  const thumbRemoveBtn = document.getElementById('wmThumbnailRemove');
  const thumbUrlEl = document.getElementById('wmThumbnail');
  let thumbPreviewUrl = null;
  let thumbRemoveRequested = false;
```

Also add the thumbnail size guard constant near `WEEKLY_UPLOAD_MAX_BYTES` (top of the section):

```js
const WEEKLY_THUMB_MAX_BYTES = 5 * 1024 * 1024;
```

- [ ] **Step 3: Add thumbnail helpers + event wiring** inside `initWeeklyMessagesAdmin`

Add these helper functions after `setStatus`:

```js
  function resetThumbUpload() {
    if (thumbFileEl) thumbFileEl.value = '';
    if (thumbPreviewUrl) { URL.revokeObjectURL(thumbPreviewUrl); thumbPreviewUrl = null; }
    if (thumbPreviewEl) thumbPreviewEl.src = '';
    if (thumbPreviewWrap) thumbPreviewWrap.style.display = 'none';
    thumbRemoveRequested = false;
  }

  function showThumbPreview() {
    const f = thumbFileEl && thumbFileEl.files && thumbFileEl.files[0];
    if (!f) return;
    if (f.type !== 'image/jpeg' && f.type !== 'image/png') {
      setStatus('Thumbnail must be a JPEG or PNG image.', true);
      resetThumbUpload();
      return;
    }
    if (f.size > WEEKLY_THUMB_MAX_BYTES) {
      setStatus('Thumbnail is larger than 5MB.', true);
      resetThumbUpload();
      return;
    }
    if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
    thumbPreviewUrl = URL.createObjectURL(f);
    if (thumbPreviewEl) thumbPreviewEl.src = thumbPreviewUrl;
    if (thumbPreviewWrap) thumbPreviewWrap.style.display = 'flex';
    thumbRemoveRequested = false;
  }
```

Add event wiring after the existing `mediaTypeEl` change listener near the bottom of the function:

```js
  if (thumbFileEl) thumbFileEl.addEventListener('change', showThumbPreview);
  if (thumbRemoveBtn) thumbRemoveBtn.addEventListener('click', function() {
    resetThumbUpload();
    thumbRemoveRequested = true;
    if (thumbUrlEl) thumbUrlEl.value = '';
  });
  if (thumbUrlEl) thumbUrlEl.addEventListener('input', function() {
    if (thumbUrlEl.value.trim() !== '') thumbRemoveRequested = false;
  });
```

- [ ] **Step 4: Reset thumbnail state in `editMessage` and `closeForm`**

In `editMessage`, after `document.getElementById('wmTelegramLink').value = '';` and before `openForm()`, add:

```js
    resetThumbUpload();
```

In `closeForm`, after `form.reset();` and before `editingId = null;`, add:

```js
    resetThumbUpload();
```

(`form.reset()` already clears the file input; `resetThumbUpload()` cleans the preview and flags.)

- [ ] **Step 5: Include the thumbnail in submit paths**

Add this near the top of the submit handler (after the `base` object is built and the title/date check):

```js
    const thumbFile = thumbFileEl && thumbFileEl.files && thumbFileEl.files[0];
```

Then restructure the submit handler branches:

For **edit mode** (`if (editingId) {` block), replace the body with:

```js
      if (editingId) {
        if (thumbFile) {
          setStatus('Saving…');
          const fd = new FormData();
          Object.keys(base).forEach((k) => fd.append(k, base[k]));
          fd.append('id', editingId);
          fd.append('thumbnail', thumbFile, thumbFile.name);
          const token = await getToken();
          if (!token) throw new Error('Not signed in. Please sign in again.');
          const res = await fetch('/api/weekly-messages', {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = data.error || (data.errors && data.errors.join(', ')) || ('Save failed (' + res.status + ')');
            throw new Error(msg);
          }
        } else if (thumbRemoveRequested) {
          setStatus('Saving…');
          await api('/api/weekly-messages', 'PATCH', { id: editingId, thumbnail_url: null });
        } else {
          setStatus('Saving…');
          await api('/api/weekly-messages', 'PATCH', { id: editingId, ...base });
        }
        setStatus('Saved.');
        closeForm();
        await loadMessages();
        return;
      }
```

For **media mode** (`else if (file) {` branch), after `fd.append('file', file, file.name);` add:

```js
        if (thumbFile) fd.append('thumbnail', thumbFile, thumbFile.name);
```

For **link mode** (`else if (telegramLink) {` branch), replace the body with:

```js
      } else if (telegramLink) {
        if (thumbFile) {
          setStatus('Creating from link…');
          const fd = new FormData();
          Object.keys(base).forEach((k) => fd.append(k, base[k]));
          fd.append('telegram_link', telegramLink);
          fd.append('thumbnail', thumbFile, thumbFile.name);
          const token = await getToken();
          if (!token) throw new Error('Not signed in. Please sign in again.');
          const res = await fetch('/api/weekly-messages', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = data.error || (data.errors && data.errors.join(', ')) || ('Create failed (' + res.status + ')');
            throw new Error(msg);
          }
        } else {
          setStatus('Creating from link…');
          await api('/api/weekly-messages', 'POST', { ...base, telegram_link: telegramLink });
        }
      } else {
```

Text mode is unchanged (text cards show no thumbnail).

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`
Expected: all green (dashboard code is not unit-tested; verification is the suite staying green plus a manual smoke test in the browser: pick a thumbnail in media/link/edit modes, verify it is posted to the channel and the card shows the photo embed).

```bash
git add dashboard.html js/dashboard-app.js
git commit -m "feat(weekly-discourse): add thumbnail upload to admin panel"
```
