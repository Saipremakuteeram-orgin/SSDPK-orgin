# Weekly Swami Discourse Module Design

**Date:** 2026-08-14
**Status:** Approved
**Goal:** Add a public "Discourse" page (`discourse.html`) where visitors can browse and play the trust's weekly Swami messages (audio/video/text). Media is hosted on a dedicated Telegram channel (used as an invisible CDN); content is managed exclusively by admins from the dashboard admin panel.

## Branding

- The feature is called **Discourse** (`discourse.html`), presented as a curated collection of weekly spiritual discourses from Swami.
- The site must NOT surface Telegram branding, channel links, or the word "Telegram" to visitors. Telegram is invisible backend infrastructure.
- Cards are "rich and minimal": visually rich (sacred saffron theme, thumbnail, typography) but content-light (title, date, excerpt, player, badges).

## Current State (verified)

- Static site on Vercel with serverless functions (`api/*`, rewritten in `vercel.json`). Supabase (free tier) for auth + data, Razorpay for seva, Telegram bot (`TELEGRAM_BOT_TOKEN`) already used for admin alerts to a chat group.
- Admin panel lives in `dashboard.html` / `js/dashboard-app.js` (1638 lines) with sections: Events, Gallery, Members. Admin gated by `session.role === 'admin'` (admin emails list in `dashboard-app.js`).
- Media today: Supabase Storage bucket `gallery-images` for gallery photos/videos; single local `audio/melody.mp3`.
- Supabase client: `js/supabase-client.js` (anon key + async `/api/config` re-init). RLS used per-table.
- i18n: 6 languages (`i18n/{en,ta,hi,te,kn,ml}.json`), `js/i18n.js`.
- CSS: `css/theme.css` (509 lines), `css/divine.css` (332 lines), OKLCH saffron palette via custom properties.

## Architecture

### Telegram setup (one-time, by the user)

- Create a dedicated public Telegram channel, e.g. `@sspk_discourse`.
- Add the existing bot (from `TELEGRAM_BOT_TOKEN`) as channel **admin** (it needs post permission to send media via Bot API).
- Set new env var `TELEGRAM_CHANNEL_ID` (e.g. `@sspk_discourse`) on Vercel + `.env.example`.

### Data flow

1. Admin (dashboard, role=admin) fills the "Weekly Messages" form: title, date, description, media type, file upload, optional fields.
2. Frontend POSTs file + metadata to `api/telegram-upload.js` (FormData).
3. Function validates admin JWT, file type/size; sends the media to the Telegram channel via Bot API (`sendAudio` / `sendVideo` / `sendDocument`). For **text-only** messages, the admin pastes the discourse text in the form and the bot posts it with `sendMessage`, so every message (media or text) has a real `message_id` and the channel is a complete archive.
4. Function writes a `weekly_messages` row (metadata + `telegram_channel` + `telegram_message_id`) via Supabase service role. For text messages, `description` holds the discourse text; the website renders it directly (no embed).
5. Public `discourse.html` fetches `weekly_messages` (RLS public SELECT) and renders cards.
6. Each media card embeds `https://t.me/{channel}/{message_id}?embed=1` inside a styled iframe wrapper (custom player chrome around the embed). Text messages render the description directly with no embed.

### Supabase `weekly_messages` table (new)

```
id                    uuid pk default gen_random_uuid()
title                 text not null
date                  date not null
description           text                      -- excerpt shown on card
media_type            text not null check (media_type in ('audio','video','text'))
telegram_channel      text not null             -- e.g. 'sspk_discourse'
telegram_message_id   bigint not null           -- from Bot API response
category              text                      -- optional tag (e.g. 'Bhagavad Gita', 'Seva')
language              text                      -- optional ('Tamil','English',...)
duration              text                      -- optional ('12:34')
thumbnail_url         text                      -- optional; fallback = default Swami image
created_at            timestamptz default now()
created_by            uuid                      -- admin who created it
```

RLS:
- `SELECT` — to anon + authenticated (public read).
- `INSERT/UPDATE/DELETE` — to authenticated with `role = 'admin'` using a security definer function (matching existing admin check) OR enforced server-side via service role (admin JWT validated in the API). Server-side enforcement is primary; RLS admin policy is defense in depth.

### Vercel serverless functions (new)

1. **`api/telegram-upload.js`** — `POST` FormData. Validates admin session (Supabase JWT, role=admin), validates file (type: audio/video/document; size ≤ 100MB audio, ≤ 500MB video — within Telegram's 2GB bot limit), forwards to Telegram Bot API `sendAudio`/`sendVideo`/`sendDocument`, then inserts the `weekly_messages` row via service role. Returns `{ id, telegram_channel, telegram_message_id }`.
2. **`api/weekly-messages.js`** — `GET` (public): list messages, newest first, optional filters (category, language). `POST`/`PATCH`/`DELETE`: admin-only via service role + JWT role check. Used by the dashboard admin panel.

### Frontend

- **`discourse.html`** (new, public) + **`js/discourse.js`** (new) + **`css/discourse.css`** (new):
  - Hero header ("Weekly Discourses") with sacred styling.
  - Feed of discourse cards, newest first.
  - Card: thumbnail (default `images/sathya_sai_baba.png` if none), title, date, excerpt, language/category badges, embedded player iframe for audio/video, download affordance (the Telegram embed's native download or a download link), fallback "Listen/View" link if embed fails.
  - Filters: category, language, year. Client-side filtering over the fetched list.
  - Mobile-first responsive; i18n-ready (keys added later, English first).
- **`dashboard.html` + `js/dashboard-app.js`**: new admin "Weekly Messages" panel section:
  - List all messages with edit/delete.
  - Add form: title, date, description, media type select, file upload (audio/video), optional fields (category, language, duration, thumbnail).
  - Edit: same form pre-filled. Delete: removes DB row (Telegram copy remains as archive).
  - Client-side upload size/type guard before POST.
- **`vercel.json`**: rewrites for `/api/telegram-upload` and `/api/weekly-messages`.
- **`.env.example`**: add `TELEGRAM_CHANNEL_ID`.

### Error handling

- Embed failure: iframe `onerror`/load timeout → show styled fallback link to the Telegram message.
- API failures: surfaced to admin with clear messages (file too big, wrong type, not admin, Telegram down).
- No network (paused Supabase): public page shows graceful empty/error state, no crashes.

### Testing

- Vitest + jsdom, no live Telegram/Supabase calls.
- `tests/discourse.test.js`: render logic (cards from mock list, filters, embed URL builder, text-vs-media handling).
- `tests/weekly-messages-api.test.js`: validation helpers (auth check, file type/size guard, payload validation) with mocked fetch.
- Existing suite must stay green.

## Files

| File | Change |
|------|--------|
| `supabase_donations.sql` | add `weekly_messages` table + RLS |
| `discourse.html` | new |
| `js/discourse.js` | new |
| `css/discourse.css` | new |
| `api/telegram-upload.js` | new |
| `api/weekly-messages.js` | new |
| `dashboard.html` | add admin panel section |
| `js/dashboard-app.js` | add weekly-messages CRUD + upload |
| `vercel.json` | add 2 rewrites |
| `.env.example` | add `TELEGRAM_CHANNEL_ID` |
| `tests/discourse.test.js` | new |
| `tests/weekly-messages-api.test.js` | new |
