# Weekly Swami Discourse Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public "Discourse" page (`discourse.html`) where visitors browse and play the trust's weekly Swami messages (audio/video/text), with content managed exclusively by admins from the dashboard admin panel.

**Architecture:** Media is stored on a dedicated Telegram channel used as an invisible CDN (zero Telegram branding on the site). Admins publish from the dashboard via two paths: (a) **upload-first** — a file is sent to `api/telegram-upload.js`, which forwards it to the Telegram Bot API, records the returned `message_id`, then inserts a `weekly_messages` row via the Supabase service role; (b) **link-first** — the admin posts media to the channel directly in the Telegram app, then pastes the `t.me/...` message link into `api/weekly-messages.js`, which stores the row (no bot call). Public `discourse.html` reads rows directly via the anon Supabase client (RLS public SELECT) and renders each media card with an embedded `https://t.me/{channel}/{message_id}?embed=1` iframe. Text messages are stored in `description` and rendered inline (no embed).

**Tech Stack:** Static site on Vercel (Node.js serverless functions, CommonJS), Supabase (anon + service role clients, RLS), Telegram Bot API, `busboy` for multipart parsing, vitest + jsdom for tests. Frontend: vanilla JS IIFE scripts, `js/supabase-client.js` global client, `css/theme.css` / `css/divine.css` OKLCH saffron palette.

## Global Constraints

- **Real git binary:** use `C:\Program Files\Git\cmd\git.exe` (a stray file `C:\Windows\System32\git` shadows the real binary and breaks plain `git` in PowerShell).
- **CommonJS only in `api/`:** Vercel functions and their required helpers are CommonJS. Shared helpers go in `api/shared/*.cjs` (mirrors proven `api/razorpay/helpers.cjs` pattern). Never require ESM from these.
- **Deviation — upload size cap = 50MB:** the design's "≤100MB audio / ≤500MB video within Telegram's 2GB bot limit" is factually wrong for the Bot API, whose upload ceiling is **50MB** (the 2GB figure applies to MTProto/native clients). All uploads are capped at 50MB (`TELEGRAM_UPLOAD_MAX_BYTES = 50 * 1024 * 1024`). Larger media MUST use the link-first path.
- **Deviation — no `sendDocument`/`document` media_type:** the DB `media_type` check is `('audio','video','text')`; documents are not a media_type. PDFs/transcripts are published as text-mode messages or via link-first.
- **Caveat — Vercel Hobby request body limit (~4.5MB):** buffered multipart bodies larger than this may be rejected by Vercel before reaching the function. Uploads that fail this way must fall back to link-first (post to channel in Telegram app, paste the message link). Surface this to the admin in the error copy.
- **No Telegram branding on the site:** no word "Telegram", no channel handle, no `t.me` text visible. The embed iframe and fallback links are styled neutral; fallback link text is "Listen" / "Watch" / "Open".
- **Admin auth server-side:** `Bearer <access_token>` validated via `sb.auth.getUser(token)` (service-role client), email checked against `process.env.ADMIN_EMAILS` OR the `site_admins` table. Returns `null` on any failure. `.env.example` must document `ADMIN_EMAILS` matching the dashboard's hardcoded `['sk143sathya@gmail.com']`.
- **Client auth:** `js/dashboard-app.js` uses `session.role === 'admin'` (hardcoded `ADMIN_EMAILS` at line 25 + `site_admins` table). Keep `sk143sathya@gmail.com` as the canonical admin email everywhere.
- **Supabase table:** `weekly_messages` per design (uuid id, title, date, description, media_type check, telegram_channel, telegram_message_id bigint, optional category/language/duration/thumbnail_url, created_at, created_by). RLS: public SELECT; admin write via `security definer` function (defense in depth — server-side service-role is primary).
- **Page read path:** public page uses the existing anon client (`js/supabase-client.js`) with `supabase.from('weekly_messages').select('*').order('date', { ascending: false })` — the design's "RLS public SELECT" flow. No `GET` API needed (YAGNI); filters are client-side per design.
- **Tests:** vitest + jsdom, **no live Telegram/Supabase/network calls** (mocked `fetch`). Test files: `tests/weekly-messages-api.test.js` (helpers: payload, file guard, admin auth, bot with mocked fetch) and `tests/discourse.test.js` (render/filter/embed logic). Existing suite must stay green (`npm test`).
- **Env vars to add (`.env.example`):** `TELEGRAM_CHANNEL_ID` (e.g. `@sspk_discourse`) and `ADMIN_EMAILS` (e.g. `sk143sathya@gmail.com`).
- **Deploy/apply notes:** SQL is applied manually in the Supabase Dashboard SQL editor (no migration runner); env vars are set in Vercel project settings (and local `.env`); the Telegram channel + bot-as-admin setup is done by the user before smoke-testing.

---

### Task 1: Supabase `weekly_messages` table + RLS

**Files:**
- Modify: `supabase_donations.sql` (append at end of file)
- No automated test (no DB connection in CI). Verification is manual apply + a `psql`-free sanity check described below.

**Interfaces:**
- Produces: `public.weekly_messages` table (columns: `id uuid pk`, `title text not null`, `date date not null`, `description text`, `media_type text not null check ('audio','video','text')`, `telegram_channel text not null`, `telegram_message_id bigint not null`, `category text`, `language text`, `duration text`, `thumbnail_url text`, `created_at timestamptz default now()`, `created_by uuid`), RLS policies (public SELECT; admin write), and `public.is_weekly_admin()` security-definer function used by later tasks' defense-in-depth policy.

- [ ] **Step 1: Append the SQL**

Append this to the end of `supabase_donations.sql`:

```sql
-- ── Weekly Swami Discourse messages ──────────────────────────────────────────
-- Media lives on a dedicated Telegram channel (invisible CDN). This table holds
-- metadata + the channel/message_id so the site can embed the t.me player.
create table if not exists public.weekly_messages (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  date                  date not null,
  description           text,
  media_type            text not null check (media_type in ('audio','video','text')),
  telegram_channel      text not null,
  telegram_message_id   bigint not null,
  category              text,
  language              text,
  duration              text,
  thumbnail_url         text,
  created_at            timestamptz not null default now(),
  created_by            uuid
);

alter table public.weekly_messages enable row level security;

-- Public read (anon + authenticated) — the public page reads via the anon client.
drop policy if exists "Public read weekly messages" on public.weekly_messages;
create policy "Public read weekly messages"
  on public.weekly_messages for select
  to anon, authenticated
  using (true);

-- Admin check: existing site_admins table OR the canonical admin email.
-- Primary enforcement is server-side (service role + JWT email check in the API);
-- this policy is defense in depth so anon/authenticated cannot INSERT/UPDATE/DELETE.
create or replace function public.is_weekly_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (select 1 from public.site_admins where email = auth.jwt() ->> 'email')
    or (auth.jwt() ->> 'email') in ('sk143sathya@gmail.com')
$$;

drop policy if exists "Admins manage weekly messages" on public.weekly_messages;
create policy "Admins manage weekly messages"
  on public.weekly_messages for all
  to authenticated
  using (public.is_weekly_admin())
  with check (public.is_weekly_admin());
```

- [ ] **Step 2: Apply in the Supabase Dashboard**

Open Supabase Dashboard → project `zkzotagctwqthxypczej` → SQL Editor → paste the block above → Run. Confirm: "Success. No rows returned."

- [ ] **Step 3: Sanity-check the table**

Dashboard → Table Editor → `weekly_messages` exists with the expected columns. Confirm `site_admins` exists (it is queried by `js/dashboard-app.js` today; if missing, create it with columns `id` + `email text unique` before the policy can succeed).

- [ ] **Step 4: Commit**

```bash
"C:\Program Files\Git\cmd\git.exe" add supabase_donations.sql
"C:\Program Files\Git\cmd\git.exe" commit -m "feat(weekly-discourse): add weekly_messages table + RLS"
```

---

### Task 2: `api/shared/weekly-common.cjs` — pure validation/embed helpers

**Files:**
- Create: `api/shared/weekly-common.cjs`
- Test: `tests/weekly-messages-api.test.js` (append `describe('weekly-common')` block)

**Interfaces:**
- Consumes: nothing (pure; env-independent).
- Produces:
  - `cors(res)` — sets `Access-Control-Allow-Origin: *`, `Methods: GET, POST, PATCH, DELETE, OPTIONS`, `Headers: Content-Type, Authorization`.
  - `TELEGRAM_UPLOAD_MAX_BYTES = 50 * 1024 * 1024` (number).
  - `telegramMethodFor(mediaType)` → `'sendAudio' | 'sendVideo' | 'sendMessage'` (string; text maps to `sendMessage`, matching `sendTextToTelegram`).
  - `buildEmbedUrl(channel, messageId)` → `https://t.me/{channel}/{messageId}?embed=1` (strips a leading `@` from channel).
  - `parseTelegramLink(link)` → `{ channel, messageId } | null` (regex `t\.me\/([A-Za-z0-9_]+)\/(\d+)`; strips scheme/https).
  - `validateWeeklyPayload(payload)` → `{ ok, errors: string[], value }`. Rules: `title` required; `date` must match `^\d{4}-\d{2}-\d{2}$`; `media_type` ∈ `['audio','video','text']`; when `media_type === 'text'`, `text` is required and becomes `description`. Optional string fields trimmed and included only when non-empty: `description, category, language, duration, thumbnail_url`.
  - `validateFile({ mediaType, filename, bytes })` → `{ ok, errors: string[], value: { filename, extension, bytes } }`. Audio ext set `{mp3,m4a,ogg,oga,opus,flac,wav,aac}`, video ext set `{mp4,m4v,mov,mkv,webm,avi}`; empty file error; size > 50MB error with hint to use link-first.
  - `escapeHtml(str)` — HTML-escapes `& < > " '`.

- [ ] **Step 1: Write the failing tests** (append to `tests/weekly-messages-api.test.js`)

```js
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
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- --run tests/weekly-messages-api.test.js`
Expected: FAIL with `Cannot find module '../api/shared/weekly-common.cjs'`.

- [ ] **Step 3: Implement `api/shared/weekly-common.cjs`**

```js
'use strict';

// Shared pure helpers for the weekly discourse feature.
// CommonJS (.cjs) so Vercel serverless functions can require() them.

const TELEGRAM_UPLOAD_MAX_BYTES = 50 * 1024 * 1024; // Bot API upload ceiling (50MB)

const AUDIO_EXT = new Set(['mp3', 'm4a', 'ogg', 'oga', 'opus', 'flac', 'wav', 'aac']);
const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi']);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function telegramMethodFor(mediaType) {
  if (mediaType === 'audio') return 'sendAudio';
  if (mediaType === 'video') return 'sendVideo';
  return 'sendMessage';
}

function buildEmbedUrl(channel, messageId) {
  const c = String(channel || '').replace(/^@/, '');
  return 'https://t.me/' + c + '/' + Number(messageId) + '?embed=1';
}

function parseTelegramLink(link) {
  if (typeof link !== 'string') return null;
  const m = link.trim().match(/t\.me\/([A-Za-z0-9_]+)\/(\d+)/);
  if (!m) return null;
  return { channel: m[1], messageId: Number(m[2]) };
}

function validateWeeklyPayload(payload) {
  const p = payload || {};
  const errors = [];
  const value = {};

  const title = typeof p.title === 'string' ? p.title.trim() : '';
  const date = typeof p.date === 'string' ? p.date.trim() : '';
  const mediaType = typeof p.media_type === 'string' ? p.media_type.trim() : '';
  const text = typeof p.text === 'string' ? p.text.trim() : '';

  if (!title) errors.push('title is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('date must be a valid YYYY-MM-DD');
  if (!['audio', 'video', 'text'].includes(mediaType)) errors.push('media_type must be audio, video or text');
  if (mediaType === 'text' && !text) errors.push('text is required for text messages');

  if (errors.length) return { ok: false, errors, value: {} };

  value.title = title;
  value.date = date;
  value.media_type = mediaType;
  if (mediaType === 'text') {
    value.description = text;
  } else {
    const description = typeof p.description === 'string' ? p.description.trim() : '';
    if (description) value.description = description;
  }

  ['category', 'language', 'duration', 'thumbnail_url'].forEach((k) => {
    const v = typeof p[k] === 'string' ? p[k].trim() : '';
    if (v) value[k] = v;
  });

  return { ok: true, errors: [], value };
}

function validateFile({ mediaType, filename, bytes }) {
  const errors = [];
  const name = typeof filename === 'string' ? filename : '';
  const ext = name.split('.').pop().toLowerCase();
  const allowed = mediaType === 'audio' ? AUDIO_EXT : mediaType === 'video' ? VIDEO_EXT : null;

  if (!allowed) {
    errors.push('media_type must be audio or video for file uploads');
  } else if (!allowed.has(ext)) {
    errors.push('unsupported file type .' + ext + ' for ' + mediaType);
  }
  if (!(bytes > 0)) errors.push('file is empty');
  if (bytes > TELEGRAM_UPLOAD_MAX_BYTES) {
    errors.push('file is too large (max 50MB). For larger files, post to the channel and use the message-link option.');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { filename: name, extension: ext, bytes: typeof bytes === 'number' ? bytes : 0 }
  };
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  cors,
  TELEGRAM_UPLOAD_MAX_BYTES,
  telegramMethodFor,
  buildEmbedUrl,
  parseTelegramLink,
  validateWeeklyPayload,
  validateFile,
  escapeHtml
};
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm test -- --run tests/weekly-messages-api.test.js`
Expected: PASS (all `weekly-common helpers` cases).

- [ ] **Step 5: Commit**

```bash
"C:\Program Files\Git\cmd\git.exe" add api/shared/weekly-common.cjs tests/weekly-messages-api.test.js
"C:\Program Files\Git\cmd\git.exe" commit -m "feat(weekly-discourse): add shared validation/embed helpers"
```

---

### Task 3: `api/shared/admin-auth.cjs` — server-side admin JWT check

**Files:**
- Create: `api/shared/admin-auth.cjs`
- Test: `tests/weekly-messages-api.test.js` (append `describe('admin-auth')` block)

**Interfaces:**
- Consumes: nothing (env + `sb` object injected).
- Produces:
  - `getAdminEmails()` → `string[]` (from `process.env.ADMIN_EMAILS`, split on `,`, trimmed, lowercased, empties dropped). Reads env lazily so tests can set it.
  - `isAdminEmail(email)` → `boolean` (lowercase compare against `getAdminEmails()`).
  - `checkSiteAdmin(sb, email)` → `Promise<boolean>` (`sb.from('site_admins').select('email').eq('email', email).maybeSingle()`; `!error && !!data`).
  - `authenticateAdmin(sb, authorization)` → `Promise<{ id, email } | null>` — requires `Bearer <token>`; calls `sb.auth.getUser(token)`; on error/no user returns `null`; email must pass `isAdminEmail` OR `checkSiteAdmin`.

- [ ] **Step 1: Write the failing tests** (append to `tests/weekly-messages-api.test.js`)

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { isAdminEmail, authenticateAdmin } from '../api/shared/admin-auth.cjs';

describe('admin-auth', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'sk143sathya@gmail.com, Second@Example.com';
  });

  it('isAdminEmail is case-insensitive against env list', () => {
    expect(isAdminEmail('SK143Sathya@Gmail.com')).toBe(true);
    expect(isAdminEmail('second@example.com')).toBe(true);
    expect(isAdminEmail('other@example.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });

  it('authenticateAdmin returns null without a Bearer token', async () => {
    const sb = { auth: { getUser: async () => ({ data: { user: { email: 'x@y.z' } }, error: null }) } };
    expect(await authenticateAdmin(sb, undefined)).toBeNull();
    expect(await authenticateAdmin(sb, 'token-no-bearer')).toBeNull();
  });

  it('authenticateAdmin returns user for a valid token', async () => {
    const sb = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'sk143sathya@gmail.com' } }, error: null }) }
    };
    expect(await authenticateAdmin(sb, 'Bearer abc')).toEqual({ id: 'u1', email: 'sk143sathya@gmail.com' });
  });

  it('authenticateAdmin returns null on auth error', async () => {
    const sb = { auth: { getUser: async () => ({ data: null, error: { message: 'expired' } }) } };
    expect(await authenticateAdmin(sb, 'Bearer abc')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- --run tests/weekly-messages-api.test.js`
Expected: FAIL with `Cannot find module '../api/shared/admin-auth.cjs'`.

- [ ] **Step 3: Implement `api/shared/admin-auth.cjs`**

```js
'use strict';

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  if (typeof email !== 'string') return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}

async function checkSiteAdmin(sb, email) {
  if (!email) return false;
  try {
    const { data, error } = await sb.from('site_admins').select('email').eq('email', email).maybeSingle();
    return !error && !!data;
  } catch (e) {
    return false;
  }
}

async function authenticateAdmin(sb, authorization) {
  if (!authorization || !String(authorization).startsWith('Bearer ')) return null;
  const token = String(authorization).slice(7).trim();
  if (!token) return null;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data || !data.user || !data.user.email) return null;
    const email = data.user.email.trim().toLowerCase();
    const isAdmin = isAdminEmail(email) || (await checkSiteAdmin(sb, email));
    if (!isAdmin) return null;
    return { id: data.user.id, email };
  } catch (e) {
    return null;
  }
}

module.exports = { getAdminEmails, isAdminEmail, checkSiteAdmin, authenticateAdmin };
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm test -- --run tests/weekly-messages-api.test.js`
Expected: PASS (all `admin-auth` cases).

- [ ] **Step 5: Commit**

```bash
"C:\Program Files\Git\cmd\git.exe" add api/shared/admin-auth.cjs tests/weekly-messages-api.test.js
"C:\Program Files\Git\cmd\git.exe" commit -m "feat(weekly-discourse): add server-side admin JWT auth helper"
```

---

### Task 4: `api/shared/telegram-bot.cjs` — Bot API client

**Files:**
- Create: `api/shared/telegram-bot.cjs`
- Test: `tests/weekly-messages-api.test.js` (append `describe('telegram-bot')` block)

**Interfaces:**
- Consumes: `process.env.TELEGRAM_BOT_TOKEN`, `process.env.TELEGRAM_CHANNEL_ID` (read lazily inside each call, so tests can set/unset).
- Produces:
  - `getBotToken()` → `string`, `getChannelId()` → `string` (both from env).
  - `callTelegramApi(method, form)` → `Promise<{ ok: true, data: result } | { ok: false, error: string }>` — POSTs to `https://api.telegram.org/bot{token}/{method}` via global `fetch`; missing token → `{ ok:false, error:'TELEGRAM_BOT_TOKEN is not configured' }`; non-ok Telegram response → `{ ok:false, error: data.description || 'Telegram API error <status>' }`.
  - `sendMediaToTelegram({ mediaType, buffer, filename, mime, caption })` → `Promise<{ ok:true, messageId:number } | { ok:false, error }>` — `FormData` with `chat_id`, optional `caption`, and the media field (`audio`/`video` blob with filename); uses `sendAudio`/`sendVideo`; maps `result.message_id` to Number.
  - `sendTextToTelegram({ text })` → same shape via `sendMessage` (field `text`).

- [ ] **Step 1: Write the failing tests** (append to `tests/weekly-messages-api.test.js`)

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callTelegramApi, sendMediaToTelegram, sendTextToTelegram } from '../api/shared/telegram-bot.cjs';

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
    delete process.env.TELEGRAM_BOT_TOKEN;
    const r = await callTelegramApi('sendMessage', new FormData());
    expect(r).toEqual({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' });
  });

  it('sendTextToTelegram posts sendMessage and returns message_id', async () => {
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
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, description: 'chat not found' })
    }));
    const r = await callTelegramApi('sendMessage', new FormData());
    expect(r).toEqual({ ok: false, error: 'chat not found' });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- --run tests/weekly-messages-api.test.js`
Expected: FAIL with `Cannot find module '../api/shared/telegram-bot.cjs'`.

- [ ] **Step 3: Implement `api/shared/telegram-bot.cjs`**

```js
'use strict';

const API_BASE = 'https://api.telegram.org';

function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

function getChannelId() {
  return process.env.TELEGRAM_CHANNEL_ID || '';
}

async function callTelegramApi(method, form) {
  const token = getBotToken();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' };
  const res = await fetch(API_BASE + '/bot' + token + '/' + method, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.description || ('Telegram API error ' + res.status) };
  }
  return { ok: true, data: data.result };
}

async function sendMediaToTelegram({ mediaType, buffer, filename, mime, caption }) {
  const channel = getChannelId();
  if (!channel) return { ok: false, error: 'TELEGRAM_CHANNEL_ID is not configured' };
  const isVideo = mediaType === 'video';
  const method = isVideo ? 'sendVideo' : 'sendAudio';
  const field = isVideo ? 'video' : 'audio';

  const form = new FormData();
  form.append('chat_id', channel);
  if (caption) form.append('caption', caption);
  form.append(field, new Blob([buffer], { type: mime || 'application/octet-stream' }), filename);

  const result = await callTelegramApi(method, form);
  if (!result.ok) return result;
  return { ok: true, messageId: Number(result.data.message_id) };
}

async function sendTextToTelegram({ text }) {
  const channel = getChannelId();
  if (!channel) return { ok: false, error: 'TELEGRAM_CHANNEL_ID is not configured' };
  const form = new FormData();
  form.append('chat_id', channel);
  form.append('text', text);
  const result = await callTelegramApi('sendMessage', form);
  if (!result.ok) return result;
  return { ok: true, messageId: Number(result.data.message_id) };
}

module.exports = { getBotToken, getChannelId, callTelegramApi, sendMediaToTelegram, sendTextToTelegram };
```

Note: Node 18+ (Vercel Node runtime) exposes global `fetch`, `FormData`, and `Blob` — no imports needed.

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm test -- --run tests/weekly-messages-api.test.js`
Expected: PASS (all `telegram-bot` cases).

- [ ] **Step 5: Commit**

```bash
"C:\Program Files\Git\cmd\git.exe" add api/shared/telegram-bot.cjs tests/weekly-messages-api.test.js
"C:\Program Files\Git\cmd\git.exe" commit -m "feat(weekly-discourse): add Telegram Bot API client"
```

---

### Task 5: `api/telegram-upload.js` — upload-first endpoint

**Files:**
- Create: `api/telegram-upload.js`
- Modify: `package.json` (add `busboy` dependency), `vercel.json` (rewrite), `.env.example` (document `TELEGRAM_CHANNEL_ID` + `ADMIN_EMAILS`)
- Test: no direct handler test (Vercel `req` stream is hard to simulate without a network/stream harness). Coverage comes from Tasks 2–4 helper tests. The existing suite must stay green.

**Interfaces:**
- Consumes: `cors`, `validateWeeklyPayload`, `validateFile` from `./shared/weekly-common.cjs`; `authenticateAdmin` from `./shared/admin-auth.cjs`; `sendMediaToTelegram`, `sendTextToTelegram` from `./shared/telegram-bot.cjs`; `createClient` from `@supabase/supabase-js`; `busboy`.
- Produces: `POST /api/telegram-upload`
  - `application/json` → text-mode. Body: `{ title, date, media_type:'text', text, description?, category?, language?, duration?, thumbnail_url? }`. Validates, calls `sendTextToTelegram({ text })`, inserts row with `telegram_channel` = normalized `TELEGRAM_CHANNEL_ID` (leading `@` stripped) and `telegram_message_id` = returned id, `created_by` = admin id. Returns `201 { id, telegram_channel, telegram_message_id }`.
  - `multipart/form-data` → media-mode. Fields as above (no `text`) plus a `file`. Validates payload + file, calls `sendMediaToTelegram`, inserts row, returns `201 { id, telegram_channel, telegram_message_id }`.
  - Errors: `401 { error: 'Not authorized' }`, `400 { errors: [...] }` / `{ error }`, `502 { error }` (Telegram failure), `500 { error }` (config/DB).
  - `OPTIONS` → `200`; non-`POST` → `405`.

- [ ] **Step 1: Install `busboy`**

Run: `npm install busboy`
Expected: `package.json` gains `"busboy": "^1.6.0"` (or newer 1.x) under `dependencies`, and a `package-lock.json` diff appears.

- [ ] **Step 2: Create `api/telegram-upload.js`**

```js
'use strict';

const busboy = require('busboy');
const { createClient } = require('@supabase/supabase-js');
const {
  cors,
  validateWeeklyPayload,
  validateFile
} = require('./shared/weekly-common.cjs');
const { authenticateAdmin } = require('./shared/admin-auth.cjs');
const { sendMediaToTelegram, sendTextToTelegram, getChannelId } = require('./shared/telegram-bot.cjs');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }
  const sb = createClient(supabaseUrl, serviceKey);

  const admin = await authenticateAdmin(sb, req.headers.authorization);
  if (!admin) return res.status(401).json({ error: 'Not authorized' });

  const contentType = req.headers['content-type'] || '';

  // ── Text mode: bot posts the discourse text to the channel (archive) ──────
  if (contentType.startsWith('application/json')) {
    const body = parseJson(await readBody(req));
    const v = validateWeeklyPayload(body);
    if (!v.ok) return res.status(400).json({ errors: v.errors });

    const sent = await sendTextToTelegram({ text: v.value.description });
    if (!sent.ok) return res.status(502).json({ error: sent.error });

    const row = {
      ...v.value,
      telegram_channel: normalizeChannel(getChannelId()),
      telegram_message_id: sent.messageId,
      created_by: admin.id
    };
    const { data, error } = await sb.from('weekly_messages').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({
      id: data.id,
      telegram_channel: data.telegram_channel,
      telegram_message_id: data.telegram_message_id
    });
  }

  // ── Media mode: multipart/form-data with a file ──────────────────────────
  if (!contentType.startsWith('multipart/form-data')) {
    return res.status(400).json({ error: 'Content-Type must be application/json or multipart/form-data' });
  }

  const parts = await parseMultipart(req);
  const fields = parts.fields || {};
  const file = parts.file;

  const v = validateWeeklyPayload(fields);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  if (v.value.media_type === 'text') {
    return res.status(400).json({ error: 'Text messages must be sent as application/json' });
  }
  if (!file) return res.status(400).json({ error: 'file is required' });

  const fv = validateFile({
    mediaType: v.value.media_type,
    filename: file.filename,
    bytes: file.buffer.length
  });
  if (!fv.ok) return res.status(400).json({ errors: fv.errors });

  const sent = await sendMediaToTelegram({
    mediaType: v.value.media_type,
    buffer: file.buffer,
    filename: file.filename,
    mime: file.mime,
    caption: v.value.title
  });
  if (!sent.ok) return res.status(502).json({ error: sent.error });

  const row = {
    ...v.value,
    telegram_channel: normalizeChannel(getChannelId()),
    telegram_message_id: sent.messageId,
    created_by: admin.id
  };
  const { data, error } = await sb.from('weekly_messages').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({
    id: data.id,
    telegram_channel: data.telegram_channel,
    telegram_message_id: data.telegram_message_id
  });
};

function normalizeChannel(ch) {
  return String(ch || '').replace(/^@/, '').trim();
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
  });
}

function parseJson(body) {
  try { return JSON.parse(body || '{}'); } catch (e) { return {}; }
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers });
    const fields = {};
    let file = null;

    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        file = { filename: info.filename, mime: info.mimeType, buffer: Buffer.concat(chunks) };
      });
    });
    bb.on('close', () => resolve({ fields, file }));
    bb.on('error', (e) => reject(e));
    req.pipe(bb);
  });
}
```

- [ ] **Step 3: Add the Vercel rewrite** — in `vercel.json`, append to the `rewrites` array:

```json
{ "source": "/api/telegram-upload", "destination": "/api/telegram-upload.js" }
```

- [ ] **Step 4: Document env vars** — in `.env.example`, under the existing "Telegram Bot Config" block add:

```
# Weekly Discourse: dedicated public channel used as an invisible CDN (no Telegram branding on the site).
# The bot from TELEGRAM_BOT_TOKEN must be an ADMIN of this channel (post permission).
# Prefix with @ for public channels, e.g. @sspk_discourse.
TELEGRAM_CHANNEL_ID="@sspk_discourse"
# Comma-separated admin emails allowed to publish weekly messages via the API (server-side check).
ADMIN_EMAILS="sk143sathya@gmail.com"
```

- [ ] **Step 5: Run the full suite — verify still green**

Run: `npm test`
Expected: PASS (existing + Tasks 2–4 tests).

- [ ] **Step 6: Commit**

```bash
"C:\Program Files\Git\cmd\git.exe" add api/telegram-upload.js package.json package-lock.json vercel.json .env.example
"C:\Program Files\Git\cmd\git.exe" commit -m "feat(weekly-discourse): add telegram upload endpoint"
```

---

### Task 6: `api/weekly-messages.js` — link-first POST + PATCH + DELETE

**Files:**
- Create: `api/weekly-messages.js`
- Modify: `vercel.json` (rewrite)

**Interfaces:**
- Consumes: `cors`, `validateWeeklyPayload`, `parseTelegramLink` from `./shared/weekly-common.cjs`; `authenticateAdmin` from `./shared/admin-auth.cjs`; `createClient` from `@supabase/supabase-js`.
- Produces: `POST /api/weekly-messages` (link-first; admin only). Body: `{ title, date, media_type, telegram_link: 'https://t.me/channel/123', description?, category?, language?, duration?, thumbnail_url? }`. Validates payload + parses `telegram_link`; inserts row with parsed channel/messageId; returns `201 { id }`.
  - `PATCH /api/weekly-messages` (admin only): body `{ id, title?, date?, description?, category?, language?, duration?, thumbnail_url? }` — updates only provided non-empty fields (optional fields accept `null` to clear); title/date must remain non-empty; returns `200 { ok:true }`.
  - `DELETE /api/weekly-messages` (admin only): body `{ id }`; returns `200 { ok:true }`.
  - Errors: `401` unauthorized, `400` validation, `500` DB/config.

- [ ] **Step 1: Create `api/weekly-messages.js`**

```js
'use strict';

const { createClient } = require('@supabase/supabase-js');
const {
  cors,
  validateWeeklyPayload,
  parseTelegramLink
} = require('./shared/weekly-common.cjs');
const { authenticateAdmin } = require('./shared/admin-auth.cjs');

const OPTIONAL_FIELDS = ['description', 'category', 'language', 'duration', 'thumbnail_url'];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }
  const sb = createClient(supabaseUrl, serviceKey);

  const admin = await authenticateAdmin(sb, req.headers.authorization);
  if (!admin) return res.status(401).json({ error: 'Not authorized' });

  const body = parseJson(await readBody(req));

  if (req.method === 'POST') {
    const v = validateWeeklyPayload(body);
    if (!v.ok) return res.status(400).json({ errors: v.errors });

    const link = parseTelegramLink(body.telegram_link);
    if (!link) {
      return res.status(400).json({ error: 'telegram_link must be a valid t.me message link' });
    }

    const row = {
      ...v.value,
      telegram_channel: link.channel,
      telegram_message_id: link.messageId,
      created_by: admin.id
    };
    const { data, error } = await sb.from('weekly_messages').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ id: data.id });
  }

  const id = String(body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id is required' });

  if (req.method === 'DELETE') {
    const { error } = await sb.from('weekly_messages').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // PATCH
  const updates = {};
  const title = typeof body.title === 'string' ? body.title.trim() : undefined;
  const date = typeof body.date === 'string' ? body.date.trim() : undefined;
  if (title !== undefined) {
    if (!title) return res.status(400).json({ error: 'title cannot be empty' });
    updates.title = title;
  }
  if (date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD' });
    }
    updates.date = date;
  }
  OPTIONAL_FIELDS.forEach((k) => {
    if (k in body) {
      updates[k] = typeof body[k] === 'string' ? body[k].trim() : (body[k] === null ? null : body[k]);
    }
  });
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  const { data, error } = await sb.from('weekly_messages').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, id: data.id });
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
  });
}

function parseJson(body) {
  try { return JSON.parse(body || '{}'); } catch (e) { return {}; }
}
```

- [ ] **Step 2: Add the Vercel rewrite** — in `vercel.json`, append to `rewrites`:

```json
{ "source": "/api/weekly-messages", "destination": "/api/weekly-messages.js" }
```

- [ ] **Step 3: Run the full suite — verify still green**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
"C:\Program Files\Git\cmd\git.exe" add api/weekly-messages.js vercel.json
"C:\Program Files\Git\cmd\git.exe" commit -m "feat(weekly-discourse): add weekly-messages CRUD endpoint"
```

---

### Task 7: `discourse.html` + `css/discourse.css` — public page skeleton

**Files:**
- Create: `discourse.html`
- Create: `css/discourse.css`

**Interfaces:**
- Produces: page with static nav (Home/Activities/Trustees/Gallery/Events/**Discourses**/Dashboard — main.js will re-render nav with the new link from Task 8), hero section `data-i18n="discourse.pageTitle"` / `discourse.pageSubtitle`, a filter row (`#discourseCategory`, `#discourseLanguage`, `#discourseYear` selects), and the feed container `#discourseFeed`. Includes scripts: supabase-js CDN, `js/supabase-client.js`, `js/main.js`, `js/discourse.js`, `js/chatbot.js`, `js/i18n.js` (mirror `gallery.html` order). No Telegram word/branding anywhere.
- CSS classes consumed by `js/discourse.js` (Task 8): `.discourse-card`, `.discourse-card-media`, `.discourse-player`, `.discourse-player-frame`, `.discourse-fallback-link`, `.discourse-text`, `.discourse-badges`, `.discourse-badge`, `.discourse-empty`, `.discourse-filter`.

- [ ] **Step 1: Create `discourse.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Discourses — Sathya Sai Prema Kuterram</title>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<link rel="stylesheet" href="css/theme.css?v=1.1.0">
<link rel="stylesheet" href="css/divine.css?v=1.0.0">
<link rel="stylesheet" href="css/discourse.css?v=1.0.0">
<link rel="stylesheet" href="css/chatbot.css">
</head>
<body>

<a class="skip-link" href="#main-content">Skip to main content</a>

<nav>
  <div class="container">
    <a href="index.html" class="nav-brand">
      <img src="logo.jpg" alt="SSPK" class="nav-logo-img">
      SSPK
    </a>
    <button class="nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">&#9776;</button>
    <div class="nav-links" id="navLinks">
      <a href="index.html">Home</a>
      <a href="about.html">Activities</a>
      <a href="trustees.html">Trustees</a>
      <a href="gallery.html">Gallery</a>
      <a href="events.html">Events</a>
      <a href="discourse.html" class="active">Discourses</a>
      <a href="dashboard.html" class="donate-btn">Dashboard</a>
    </div>
    <div id="langSwitcher"></div>
  </div>
</nav>

<main id="main-content">

<section class="page-header" data-animate="fade-up">
  <h1 data-i18n="discourse.pageTitle">Weekly Discourses</h1>
  <p data-i18n="discourse.pageSubtitle">The weekly teachings of Swami — listen, watch, or read.</p>
</section>

<section class="section">
  <div class="container">
    <div class="discourse-filter" data-animate="fade-up">
      <select id="discourseCategory" aria-label="Filter by category">
        <option value="">All Categories</option>
      </select>
      <select id="discourseLanguage" aria-label="Filter by language">
        <option value="">All Languages</option>
      </select>
      <select id="discourseYear" aria-label="Filter by year">
        <option value="">All Years</option>
      </select>
    </div>

    <div id="discourseFeed" data-animate="fade-up">
      <div class="discourse-empty">Loading discourses…</div>
    </div>
  </div>
</section>

</main>

<footer data-animate="fade-up">
  <div class="container">
    <div>
      <p class="footer-brand">Sathya Sai Prema Kuterram</p>
      <p>A spiritual trust dedicated to the teachings of Sri Sathya Sai Baba. Love All, Serve All.</p>
    </div>
    <div>
      <h4>Pages</h4>
      <a href="index.html">Home</a><br>
      <a href="about.html">Activities</a><br>
      <a href="trustees.html">Trustees</a><br>
      <a href="gallery.html">Gallery</a><br>
      <a href="events.html">Events</a><br>
      <a href="discourse.html">Discourses</a><br>
      <a href="dashboard.html">Dashboard</a>
    </div>
    <div>
      <h4>Activities</h4>
      <a href="events.html">Bhajans</a><br>
      <a href="events.html">Seva</a><br>
      <a href="events.html">Study Circle</a><br>
      <a href="gallery.html">Gallery</a>
    </div>
    <div>
      <h4>Contact</h4>
      <p>Email: info@sathyasaipremakuterram.org</p>
      <p>Phone: +91-XXXXXXXXXX</p>
    </div>
    <div class="footer-bottom">
      &copy; 2026 Sathya Sai Prema Kuterram. All rights reserved.
    </div>
  </div>
</footer>

<script src="js/supabase-client.js?v=1.1.0"></script>
<script src="js/main.js?v=1.4.0"></script>
<script src="js/discourse.js?v=1.0.0"></script>
<script src="js/chatbot.js?v=1.1.0"></script>
<script src="js/i18n.js" defer></script>
</body>
</html>
```

- [ ] **Step 2: Create `css/discourse.css`**

```css
/* Weekly Discourses page */
.discourse-filter {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 32px;
  flex-wrap: wrap;
}
.discourse-filter select {
  padding: 8px 18px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--fg);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font-body);
}
.discourse-filter select:focus {
  outline: none;
  border-color: var(--accent);
}

.discourse-feed {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}
.discourse-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 16px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.discourse-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}
.discourse-card-media {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #1a1a1a;
}
.discourse-player {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.discourse-player-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
.discourse-thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.discourse-fallback-link {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 24px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: var(--shadow-md);
}
.discourse-fallback-link:hover {
  background: var(--accent-dark);
}
.discourse-card-body {
  padding: 18px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.discourse-card-date {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.discourse-card-title {
  font-family: var(--font-heading);
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-dark);
  line-height: 1.3;
  margin: 0;
}
.discourse-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.discourse-badge {
  display: inline-block;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-radius: 20px;
  background: var(--accent-light);
  color: var(--accent-dark);
  border: 1px solid var(--border);
}
.discourse-duration {
  font-size: 12px;
  color: var(--muted);
}
.discourse-excerpt {
  font-size: 14px;
  color: var(--fg);
  line-height: 1.6;
}
.discourse-text {
  background: var(--accent-light);
  border-left: 4px solid var(--accent);
  border-radius: var(--radius-sm, 8px);
  padding: 16px 18px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--fg);
  white-space: pre-wrap;
}
.discourse-empty {
  text-align: center;
  padding: 80px 20px;
  color: var(--muted);
  font-size: 16px;
}

@media (max-width: 640px) {
  .discourse-feed {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Add i18n keys** (also see Task 8 — add the full set together there; do it now so the page renders without warnings). The existing `nav` object is already present in every language file — do NOT replace it. Add only the `"discourse"` key to the existing `nav` object, and add the new top-level `"discourse"` object:

```json
// inside the existing "nav" object, after "events" (or "dashboard"), add:
"discourse": "Discourses",
```

```json
// new top-level object, sibling of "nav":
"discourse": {
  "pageTitle": "Weekly Discourses",
  "pageSubtitle": "The weekly teachings of Swami — listen, watch, or read."
}
```

(For `ta/hi/te/kn/ml`, translate `discourse` nav label and the two discourse strings; keep keys identical. Exact translations: `ta`: `"discourse": "உரைகள்"`, `"pageTitle": "வாராந்திர உரைகள்"`, `"pageSubtitle": "சுவாமியின் வாராந்திர உபதேசங்கள் — கேளுங்கள், பாருங்கள், அல்லது படியுங்கள்."`; `hi`: `"discourse": "प्रवचन"`, `"pageTitle": "साप्ताहिक प्रवचन"`, `"pageSubtitle": "स्वामी की साप्ताहिक शिक्षाएँ — सुनें, देखें, या पढ़ें।"`; `te`: `"discourse": "ఉపన్యాసాలు"`, `"pageTitle": "వారంవారీ ఉపన్యాసాలు"`, `"pageSubtitle": "స్వామి వారి వారం ఉపన్యాసాలు — వినండి, చూడండి, లేదా చదవండి."`; `kn`: `"discourse": "ಉಪದೇಶಗಳು"`, `"pageTitle": "ಸಾಪ್ತಾಹಿಕ ಉಪದೇಶಗಳು"`, `"pageSubtitle": "ಸ್ವಾಮಿಯವರ ಸಾಪ್ತಾಹಿಕ ಬೋಧನೆಗಳು — ಕೇಳಿ, ನೋಡಿ, ಅಥವಾ ಓದಿ."`; `ml`: `"discourse": "പ്രഭാഷണങ്ങൾ"`, `"pageTitle": "പ്രതിവാര പ്രഭാഷണങ്ങൾ"`, `"pageSubtitle": "സ്വാമിയുടെ പ്രതിവാര പ്രബോധനങ്ങൾ — കേൾക്കൂ, കാണൂ, അല്ലെങ്കിൽ വായിക്കൂ."`)

- [ ] **Step 4: Run the full suite — verify still green**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
"C:\Program Files\Git\cmd\git.exe" add discourse.html css/discourse.css i18n/
"C:\Program Files\Git\cmd\git.exe" commit -m "feat(weekly-discourse): add public discourse page skeleton"
```

---

### Task 8: `js/discourse.js` — public page render logic + nav link + tests

**Files:**
- Create: `js/discourse.js`
- Modify: `js/main.js` (nav link, ~line 46)
- Test: `tests/discourse.test.js`

**Interfaces:**
- Consumes: global `supabase` client (`js/supabase-client.js`), rows from `weekly_messages` (snake_case columns), `images/sathya_sai_baba.png` as default thumbnail.
- Produces (attached to `window.SSPKD`):
  - `escapeHtml(str)`
  - `buildEmbedUrl(message)` → embed URL from `telegram_channel` + `telegram_message_id`.
  - `fallbackUrl(message)` → plain `https://t.me/{channel}/{id}` (used for the neutral "Listen"/"Watch" link; no visible branding).
  - `filterMessages(messages, filters)` → array; `filters` = `{ category, language, year }`; case-insensitive equality on trimmed strings; year matches `message.date.slice(0,4)`.
  - `renderCard(message)` → HTML string (described below).
  - `fetchMessages()` → `supabase.from('weekly_messages').select('*').order('date', { ascending: false })` then `data || []`; throws on error.
  - `init()` — guarded: returns early unless `#discourseFeed` exists. Populates the three filter selects from data (unique values, sorted, prefixed "All …" option), renders on change, shows `discourse-empty` on empty/error.

`renderCard(message)` output contract:
- Always: `<article class="discourse-card">` with `.discourse-card-date` (formatted date), `.discourse-card-title` (escaped), `.discourse-badges` (category + language badges), `.discourse-excerpt` (escaped description).
- `media_type === 'text'`: a `.discourse-text` div containing the escaped `description`.
- else (audio/video): a `.discourse-card-media` block with `.discourse-thumb` img (thumbnail_url or default), `.discourse-player-frame` iframe (`src = buildEmbedUrl`), and a `.discourse-fallback-link` (href `fallbackUrl`, text "Listen" for audio / "Watch" for video, `target="_blank" rel="noopener noreferrer"`).
- Duration shown when present.

- [ ] **Step 1: Write the failing tests — `tests/discourse.test.js`**

```js
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
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- --run tests/discourse.test.js`
Expected: FAIL with `Cannot find module '../js/discourse.js'`.

- [ ] **Step 3: Implement `js/discourse.js`**

```js
// discourse.js — Weekly Discourses public page (powered by Supabase + Telegram embed)
(function() {
  'use strict';

  var DEFAULT_THUMB = 'images/sathya_sai_baba.png';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanChannel(channel) {
    return String(channel == null ? '' : channel).replace(/^@/, '');
  }

  function buildEmbedUrl(message) {
    var c = cleanChannel(message.telegram_channel);
    var m = Number(message.telegram_message_id);
    return 'https://t.me/' + c + '/' + m + '?embed=1';
  }

  function fallbackUrl(message) {
    var c = cleanChannel(message.telegram_channel);
    var m = Number(message.telegram_message_id);
    return 'https://t.me/' + c + '/' + m;
  }

  function filterMessages(messages, filters) {
    var f = filters || {};
    var category = (f.category || '').trim().toLowerCase();
    var language = (f.language || '').trim().toLowerCase();
    var year = (f.year || '').trim();
    return (messages || []).filter(function(m) {
      if (category && String(m.category || '').trim().toLowerCase() !== category) return false;
      if (language && String(m.language || '').trim().toLowerCase() !== language) return false;
      if (year && String(m.date || '').slice(0, 4) !== year) return false;
      return true;
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderCard(message) {
    var m = message || {};
    var title = escapeHtml(m.title);
    var date = formatDate(m.date);
    var excerpt = escapeHtml(m.description);
    var duration = escapeHtml(m.duration);
    var badges = '';
    if (m.category) badges += '<span class="discourse-badge">' + escapeHtml(m.category) + '</span>';
    if (m.language) badges += '<span class="discourse-badge">' + escapeHtml(m.language) + '</span>';

    var body =
      '<div class="discourse-card-body">' +
        '<span class="discourse-card-date">' + date + '</span>' +
        '<h3 class="discourse-card-title">' + title + '</h3>' +
        (badges ? '<div class="discourse-badges">' + badges + '</div>' : '') +
        (duration ? '<span class="discourse-duration">' + duration + '</span>' : '') +
        (m.media_type === 'text'
          ? '<div class="discourse-text">' + excerpt + '</div>'
          : '<p class="discourse-excerpt">' + excerpt + '</p>');

    if (m.media_type === 'text') {
      return '<article class="discourse-card">' + body + '</div></article>';
    }

    var actionText = m.media_type === 'audio' ? 'Listen' : 'Watch';
    var media =
      '<div class="discourse-card-media">' +
        '<div class="discourse-player">' +
          '<img class="discourse-thumb" src="' + escapeHtml(m.thumbnail_url || DEFAULT_THUMB) + '" alt="" loading="lazy">' +
          '<iframe class="discourse-player-frame" src="' + escapeHtml(buildEmbedUrl(m)) + '" title="' + title + '" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
          '<a class="discourse-fallback-link" href="' + escapeHtml(fallbackUrl(m)) + '" target="_blank" rel="noopener noreferrer">' + actionText + '</a>' +
        '</div>' +
      '</div>';

    return '<article class="discourse-card">' + media + body + '</div></article>';
  }

  async function fetchMessages() {
    var sb = (typeof supabase !== 'undefined') ? supabase : null;
    if (!sb) throw new Error('Supabase client not available');
    var res = await sb.from('weekly_messages').select('*').order('date', { ascending: false });
    if (res.error) throw res.error;
    return res.data || [];
  }

  function uniqueSorted(values) {
    var seen = {};
    return values.filter(function(v) {
      if (v == null || String(v).trim() === '') return false;
      var key = String(v).trim();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort();
  }

  function populateSelect(select, values, allLabel) {
    if (!select) return;
    select.innerHTML = '<option value="">' + allLabel + '</option>' +
      values.map(function(v) {
        return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>';
      }).join('');
  }

  function init() {
    var feed = document.getElementById('discourseFeed');
    if (!feed) return;

    var categoryEl = document.getElementById('discourseCategory');
    var languageEl = document.getElementById('discourseLanguage');
    var yearEl = document.getElementById('discourseYear');
    var all = [];

    function render() {
      var filters = {
        category: categoryEl ? categoryEl.value : '',
        language: languageEl ? languageEl.value : '',
        year: yearEl ? yearEl.value : ''
      };
      var list = filterMessages(all, filters);
      if (list.length === 0) {
        feed.innerHTML = '<div class="discourse-empty">' +
          (all.length ? 'No discourses match your filters.' : 'No discourses yet. Please check back soon.') +
          '</div>';
        return;
      }
      feed.innerHTML = '<div class="discourse-feed">' + list.map(renderCard).join('') + '</div>';
    }

    function onFilterChange() { render(); }

    if (categoryEl) categoryEl.addEventListener('change', onFilterChange);
    if (languageEl) languageEl.addEventListener('change', onFilterChange);
    if (yearEl) yearEl.addEventListener('change', onFilterChange);

    fetchMessages()
      .then(function(messages) {
        all = messages;
        populateSelect(categoryEl, uniqueSorted(messages.map(function(m) { return m.category; })), 'All Categories');
        populateSelect(languageEl, uniqueSorted(messages.map(function(m) { return m.language; })), 'All Languages');
        populateSelect(yearEl, uniqueSorted(messages.map(function(m) { return String(m.date || '').slice(0, 4); })), 'All Years');
        render();
      })
      .catch(function() {
        feed.innerHTML = '<div class="discourse-empty">Unable to load discourses right now. Please try again later.</div>';
      });
  }

  window.SSPKD = {
    escapeHtml: escapeHtml,
    buildEmbedUrl: buildEmbedUrl,
    fallbackUrl: fallbackUrl,
    filterMessages: filterMessages,
    renderCard: renderCard,
    fetchMessages: fetchMessages,
    init: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 4: Add the nav link in `js/main.js`**

In `renderDynamicNav`, after the events link line (`linksHtml += '<a href="events.html" data-i18n="nav.events">Events</a>';`, ~line 46), insert:

```js
      linksHtml += '<a href="discourse.html" data-i18n="nav.discourse">Discourses</a>';
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `npm test -- --run tests/discourse.test.js`
Expected: PASS (all cases). Then run `npm test` — full suite green.

- [ ] **Step 6: Commit**

```bash
"C:\Program Files\Git\cmd\git.exe" add js/discourse.js js/main.js tests/discourse.test.js
"C:\Program Files\Git\cmd\git.exe" commit -m "feat(weekly-discourse): add discourse page rendering + nav link"
```

---

### Task 9: Dashboard admin panel — Weekly Messages management

**Files:**
- Modify: `dashboard.html` (insert a new `.admin-panel` inside `#adminView`, after the Gallery Management panel, before the closing `</div>` of `#adminView`)
- Modify: `js/dashboard-app.js` (add `initWeeklyMessagesAdmin()` and call it; mirror existing event/gallery admin patterns)

**Interfaces:**
- Consumes: global `supabase` client; `supabase.auth.getSession()` for the Bearer token; `/api/telegram-upload` and `/api/weekly-messages` endpoints (Tasks 5–6).
- Produces: admin panel with:
  - "Add Weekly Message" button (`#showAddWeeklyBtn`) + form (`#weeklyMessageForm`) + status line (`#weeklyStatus`).
  - Form fields: `#wmId` (hidden), `#wmTitle`, `#wmDate`, `#wmMediaType` (select audio/video/text), `#wmDescription`, `#wmFile` (file input, hidden in text mode), `#wmText` (textarea, only text mode), `#wmCategory`, `#wmLanguage`, `#wmDuration`, `#wmThumbnail`, `#wmTelegramLink` (link-first), Cancel (`#cancelWeeklyBtn`).
  - List container `#weeklyMessageList` with per-row Edit (`#wm-edit-{id}`) / Delete (`#wm-delete-{id}`) buttons.
  - Behaviors: client-side size guard (50MB) before upload; create via upload (file) / text (JSON) / link-first (POST weekly-messages); edit pre-fills form and PATCHes metadata (media_type, channel, message_id immutable on edit); delete confirms then DELETEs. All calls carry `Authorization: Bearer <access_token>`.

- [ ] **Step 1: Insert the HTML panel in `dashboard.html`**

After the closing `</div>` of the "Gallery Management Panel" `.admin-panel` (line ~610) and before the `</div>` that closes `#adminView` (line ~611), insert:

```html
      <!-- Weekly Messages (Discourse) Management Panel -->
      <div class="admin-panel">
        <h3 style="margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:12px;">Weekly Messages (Discourse)</h3>
        <div style="margin-bottom: 20px;">
          <button id="showAddWeeklyBtn" class="btn btn-primary" style="font-size:13px; padding:6px 14px;">+ Add Weekly Message</button>
        </div>

        <form id="weeklyMessageForm" class="hidden" style="background:var(--bg); padding:16px; border-radius:8px; border:1px solid var(--border); margin-bottom: 20px;">
          <h4 style="margin-bottom:12px; font-weight:600;">Add/Edit Weekly Message</h4>
          <input type="hidden" id="wmId">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
            <input type="text" id="wmTitle" placeholder="Title (e.g. Love All, Serve All)" required class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
            <input type="date" id="wmDate" required class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-bottom:12px;">
            <select id="wmMediaType" required class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
              <option value="audio">Audio</option>
              <option value="video">Video</option>
              <option value="text">Text</option>
            </select>
            <input type="text" id="wmCategory" placeholder="Category (e.g. Gita)" class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
            <input type="text" id="wmLanguage" placeholder="Language (e.g. Tamil)" class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
            <input type="text" id="wmDuration" placeholder="Duration (e.g. 45:00)" class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
            <input type="text" id="wmThumbnail" placeholder="Thumbnail URL (optional)" class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
          </div>
          <textarea id="wmDescription" placeholder="Short description / excerpt" rows="2" class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; margin-bottom:12px; background:var(--surface); color:var(--fg);"></textarea>

          <div id="wmFileWrap" style="margin-bottom:12px;">
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Audio / Video file (max 50MB)</label>
            <input type="file" id="wmFile" accept="audio/*,video/*" class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
          </div>

          <div id="wmTextWrap" class="hidden" style="margin-bottom:12px;">
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Discourse text</label>
            <textarea id="wmText" rows="6" placeholder="Paste the discourse text here. It is posted to the archive channel and shown directly on the site." class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);"></textarea>
          </div>

          <div id="wmLinkWrap" style="margin-bottom:12px;">
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Already posted the media to the channel?</label>
            <input type="text" id="wmTelegramLink" placeholder="Paste the message link (t.me/channel/123) instead of uploading" class="input-group input" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
          </div>

          <div style="display:flex; gap:12px;">
            <button type="submit" class="btn btn-primary" style="padding:6px 14px; font-size:13px;">Save Message</button>
            <button type="button" id="cancelWeeklyBtn" class="btn btn-outline" style="padding:6px 14px; font-size:13px;">Cancel</button>
          </div>
          <div id="weeklyStatus" style="margin-top:10px; font-size:13px; color:var(--muted);"></div>
        </form>

        <div id="weeklyMessageList" style="display:flex; flex-direction:column; gap:12px;">
          <!-- Dynamic weekly messages list -->
        </div>
      </div>
```

- [ ] **Step 2: Add `initWeeklyMessagesAdmin()` to `js/dashboard-app.js`**

Add this function after the `initDashboard` function body (near line 1624, before the `document.addEventListener('DOMContentLoaded', initDashboard);` line) and call it in the DOMContentLoaded listener:

```js
  document.addEventListener('DOMContentLoaded', initWeeklyMessagesAdmin);
```

```js
// ══════════════════════════════════════════════════════════════════════════
// WEEKLY MESSAGES (DISCOURSE) ADMIN
// ══════════════════════════════════════════════════════════════════════════
const WEEKLY_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

async function initWeeklyMessagesAdmin() {
  const form = document.getElementById('weeklyMessageForm');
  const listEl = document.getElementById('weeklyMessageList');
  const statusEl = document.getElementById('weeklyStatus');
  const showBtn = document.getElementById('showAddWeeklyBtn');
  const cancelBtn = document.getElementById('cancelWeeklyBtn');
  const mediaTypeEl = document.getElementById('wmMediaType');
  const fileWrap = document.getElementById('wmFileWrap');
  const textWrap = document.getElementById('wmTextWrap');
  const linkWrap = document.getElementById('wmLinkWrap');
  if (!form || !listEl) return;

  let editingId = null;

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#d9534f' : 'var(--accent-dark)';
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session ? data.session.access_token : null;
  }

  async function api(path, method, body) {
    const token = await getToken();
    if (!token) throw new Error('Not signed in. Please sign in again.');
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || (data.errors && data.errors.join(', ')) || ('Request failed (' + res.status + ')');
      throw new Error(msg);
    }
    return data;
  }

  function toggleMode() {
    const t = mediaTypeEl.value;
    if (fileWrap) fileWrap.style.display = (t === 'text') ? 'none' : '';
    if (textWrap) textWrap.classList.toggle('hidden', t !== 'text');
    if (linkWrap) linkWrap.style.display = (t === 'text') ? 'none' : '';
  }

  async function loadMessages() {
    listEl.innerHTML = '<p style="color:var(--muted); font-size:13px;">Loading…</p>';
    try {
      const { data, error } = await supabase
        .from('weekly_messages')
        .select('*')
        .order('date', { ascending: false });
      if (error) throw error;
      const messages = data || [];
      if (messages.length === 0) {
        listEl.innerHTML = '<p style="color:var(--muted); font-size:13px;">No weekly messages yet.</p>';
        return;
      }
      listEl.innerHTML = messages.map((m) =>
        '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px; border:1px solid var(--border); border-radius:6px; background:var(--surface);">' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-weight:600; color:var(--accent-dark);">' + escapeHtml(m.title) + '</div>' +
            '<div style="font-size:12px; color:var(--muted);">' + escapeHtml(m.date) + ' &bull; ' + escapeHtml(m.media_type) +
              (m.category ? ' &bull; ' + escapeHtml(m.category) : '') + '</div>' +
          '</div>' +
          '<div style="display:flex; gap:8px;">' +
            '<button class="btn btn-outline" data-wm-edit="' + m.id + '" style="padding:4px 12px; font-size:12px;">Edit</button>' +
            '<button class="btn" data-wm-delete="' + m.id + '" style="padding:4px 12px; font-size:12px; background:#d9534f; border-color:#d9534f; color:#fff; cursor:pointer;">Delete</button>' +
          '</div>' +
        '</div>'
      ).join('');

      listEl.querySelectorAll('[data-wm-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = messages.find((x) => x.id === btn.getAttribute('data-wm-edit'));
          if (m) editMessage(m);
        });
      });
      listEl.querySelectorAll('[data-wm-delete]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-wm-delete');
          if (window.confirm('Delete this weekly message? The copy in the archive channel remains.')) deleteMessage(id);
        });
      });
    } catch (e) {
      listEl.innerHTML = '<p style="color:#d9534f; font-size:13px;">Failed to load: ' + escapeHtml(e.message) + '</p>';
    }
  }

  function openForm() {
    form.classList.remove('hidden');
    if (showBtn) showBtn.classList.add('hidden');
    toggleMode();
  }

  function closeForm() {
    form.reset();
    editingId = null;
    document.getElementById('wmId').value = '';
    form.classList.add('hidden');
    if (showBtn) showBtn.classList.remove('hidden');
  }

  function editMessage(m) {
    editingId = m.id;
    document.getElementById('wmId').value = m.id;
    document.getElementById('wmTitle').value = m.title || '';
    document.getElementById('wmDate').value = m.date || '';
    document.getElementById('wmMediaType').value = m.media_type || 'audio';
    document.getElementById('wmDescription').value = m.description || '';
    document.getElementById('wmText').value = (m.media_type === 'text') ? (m.description || '') : '';
    document.getElementById('wmCategory').value = m.category || '';
    document.getElementById('wmLanguage').value = m.language || '';
    document.getElementById('wmDuration').value = m.duration || '';
    document.getElementById('wmThumbnail').value = m.thumbnail_url || '';
    document.getElementById('wmTelegramLink').value = '';
    openForm();
    form.scrollIntoView({ behavior: 'smooth' });
  }

  async function deleteMessage(id) {
    setStatus('Deleting…');
    try {
      await api('/api/weekly-messages', 'DELETE', { id });
      setStatus('Deleted.');
      await loadMessages();
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const base = {
      title: document.getElementById('wmTitle').value.trim(),
      date: document.getElementById('wmDate').value,
      media_type: mediaTypeEl.value,
      description: document.getElementById('wmDescription').value.trim(),
      category: document.getElementById('wmCategory').value.trim(),
      language: document.getElementById('wmLanguage').value.trim(),
      duration: document.getElementById('wmDuration').value.trim(),
      thumbnail_url: document.getElementById('wmThumbnail').value.trim()
    };
    if (!base.title || !base.date) { setStatus('Title and date are required.', true); return; }

    try {
      if (editingId) {
        setStatus('Saving…');
        await api('/api/weekly-messages', 'PATCH', { id: editingId, ...base });
        setStatus('Saved.');
        closeForm();
        await loadMessages();
        return;
      }

      const fileInput = document.getElementById('wmFile');
      const file = fileInput && fileInput.files && fileInput.files[0];
      const telegramLink = document.getElementById('wmTelegramLink').value.trim();
      const text = document.getElementById('wmText').value.trim();

      if (base.media_type === 'text') {
        if (!text) { setStatus('Discourse text is required for text messages.', true); return; }
        setStatus('Publishing text…');
        await api('/api/telegram-upload', 'POST', { ...base, text });
      } else if (file) {
        if (file.size > WEEKLY_UPLOAD_MAX_BYTES) {
          setStatus('File is larger than 50MB. Post it to the channel directly and use the message-link option instead.', true);
          return;
        }
        setStatus('Uploading…');
        const fd = new FormData();
        Object.keys(base).forEach((k) => fd.append(k, base[k]));
        fd.append('file', file, file.name);
        const token = await getToken();
        if (!token) throw new Error('Not signed in. Please sign in again.');
        const res = await fetch('/api/telegram-upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: fd
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data.error || (data.errors && data.errors.join(', ')) || ('Upload failed (' + res.status + ')');
          throw new Error(msg);
        }
      } else if (telegramLink) {
        setStatus('Creating from link…');
        await api('/api/weekly-messages', 'POST', { ...base, telegram_link: telegramLink });
      } else {
        setStatus('Add a file, paste discourse text (text mode), or paste a channel message link.', true);
        return;
      }

      setStatus('Created.');
      closeForm();
      await loadMessages();
    } catch (err) {
      setStatus(err.message || 'Failed.', true);
    }
  });

  if (showBtn) showBtn.addEventListener('click', openForm);
  if (cancelBtn) cancelBtn.addEventListener('click', closeForm);
  if (mediaTypeEl) mediaTypeEl.addEventListener('change', toggleMode);

  await loadMessages();
}
```

- [ ] **Step 3: Verify `escapeHtml` is available in `dashboard-app.js`**

If `dashboard-app.js` has no global `escapeHtml` helper, add one at the top of the file (after the `window._sspkReinit = null;` line):

```js
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 4: Run the full suite — verify still green**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Manual smoke test**

With the site running locally (or after deploy) and an admin session (`sk143sathya@gmail.com`):
1. Dashboard → Weekly Messages panel visible.
2. Add an audio message via file upload → success; row appears in list; verify the message appears in the channel.
3. Add a text message → renders as text on `discourse.html`.
4. Add a link-first message using an existing channel message link → row created.
5. Edit the title → PATCH updates; Delete → row removed.
6. Confirm `discourse.html` shows all rows, filters work, and no "Telegram" text is visible.

- [ ] **Step 6: Commit**

```bash
"C:\Program Files\Git\cmd\git.exe" add dashboard.html js/dashboard-app.js
"C:\Program Files\Git\cmd\git.exe" commit -m "feat(weekly-discourse): add dashboard admin panel for weekly messages"
```

---

### Task 10: Final verification, env setup, and deploy

**Files:**
- None to modify (unless smoke test finds issues).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL PASS (existing + new).

- [ ] **Step 2: Set the Vercel environment variables**

In Vercel project settings (and local `.env`): add
```
TELEGRAM_CHANNEL_ID="@sspk_discourse"
ADMIN_EMAILS="sk143sathya@gmail.com"
```
(Ensure `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_EMAILS` are all present. The bot token is already used today for alerts.)

- [ ] **Step 3: User one-time setup (cannot be automated)**

1. Create a public Telegram channel named e.g. `@sspk_discourse`.
2. Add the existing bot (`TELEGRAM_BOT_TOKEN`) as an **admin** with post permission.
3. Confirm `TELEGRAM_CHANNEL_ID` matches the channel.

- [ ] **Step 4: Deploy**

Push to `main` (Vercel auto-deploys). Smoke test per Task 9 Step 5 against the live site, plus verify the public page loads gracefully when Supabase is paused (empty/error state, no crash).

- [ ] **Step 5: Security follow-up (inform user, no code change)**

Remind the user to revoke the leaked PATs noted in the session summary (`ghp_LSfT...` in the tracked `.git-credentials`, and `ghp_cEv8K...` previously in `.git/config`), and consider `git rm --cached .git-credentials` + `.gitignore` + rotating the token. Offer to do this in a follow-up task.

---

## Self-Review

**Spec coverage:**
- Weekly messages table + RLS + admin policy → Task 1 ✓
- Upload-first flow (`api/telegram-upload.js`, sendAudio/sendVideo, message_id stored) → Task 5 ✓
- Text mode (sendMessage, description holds text) → Task 5 ✓
- Link-first flow (`api/weekly-messages.js` POST) → Task 6 ✓
- Admin CRUD (PATCH/DELETE) → Task 6 ✓
- Public page (`discourse.html`, `js/discourse.js`, `css/discourse.css`) with hero, cards, filters, embed iframe, fallback link, default thumb → Tasks 7–8 ✓
- No Telegram branding → Tasks 7–8 (fallback text "Listen"/"Watch", no handle shown) ✓
- Dashboard admin panel → Task 9 ✓
- vercel.json rewrites → Tasks 5–6 ✓
- `.env.example` `TELEGRAM_CHANNEL_ID` (+ `ADMIN_EMAILS`) → Task 5 ✓
- Tests (`tests/discourse.test.js`, `tests/weekly-messages-api.test.js`), no live calls → Tasks 2–4, 8 ✓
- i18n keys → Task 7 ✓
- Error handling (embed fail fallback, API errors surfaced, no-network empty state) → Tasks 5–6 (API), 8 (page), 9 (admin) ✓

**Documented deviations (flagged, not silent):**
1. Upload cap 50MB (Bot API real limit) instead of the design's 100MB/500MB; larger media via link-first.
2. No `document` media_type (DB check is `audio/video/text`); PDFs via text-mode or link-first.
3. No `GET` on `api/weekly-messages.js` — public page reads via RLS anon SELECT (the design's own data-flow step 5); filters are client-side per the design's frontend section.
4. Vercel Hobby body-size caveat documented; link-first is the reliable path for large uploads.
