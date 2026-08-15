# Weekly Media: Direct Storage Upload + Native Telegram Playback

Date: 2026-08-15
Status: Approved (design), pending implementation plan

## Problem

Two hard blockers prevent admins from uploading weekly discourse audio/video through
the dashboard:

1. **Vercel 4.5MB body limit.** Vercel serverless functions reject request bodies
   over ~4.5MB (HTTP 413) regardless of any code or configuration. The current flow
   sends the media file through `/api/telegram-upload` as multipart, so anything over
   4MB is unusable. Real discourse files (5-50MB) cannot be uploaded this way.
2. **Public playback leaks `t.me` URLs.** The public page embeds
   `https://t.me/<channel>/<message_id>?embed=1` iframes. The user explicitly wants a
   **native player** with no `t.me` URL visible — media should stream through the
   Telegram API via a server-side proxy, keeping the bot token server-side.

## Goals

- Admins upload audio (or video) + optional thumbnail through the dashboard, up to
  **48MB** (just under Telegram's 50MB Bot API cap).
- File is stored temporarily in Supabase Storage, pushed to the Telegram channel,
  then **deleted from Supabase Storage only** — Telegram keeps the permanent copy.
- Public site plays media in a **native `<audio>`/`<video>` player** served from a
  clean site route (`/api/weekly-media?id=<uuid>`), no `t.me` URL exposed, bot token
  never shipped to the browser.
- Thumbnails stream the same way via `...&kind=thumb`.
- Stays within the Vercel Hobby 12-serverless-function limit (no new function files;
  proxy is folded into the existing `api/weekly-messages.js` via a rewrite).

## Architecture

### Upload flow (admin panel)

1. Admin picks audio/video + optional thumbnail in the dashboard form.
2. Browser uploads both files **directly to a private Supabase Storage bucket**
   `weekly-messages` using the existing `supabase` client (authenticated). Vercel
   never sees the large payload.
3. Browser POSTs a small JSON body to `/api/telegram-upload` with the metadata
   (title, date, media_type, description, category, language, duration) plus the
   Storage object paths (`storage_path`, `thumbnail_storage_path`).
4. Server (service role, bypasses RLS):
   - Downloads the media + thumbnail from Storage.
   - Validates size/type.
   - Calls Telegram `sendAudio`/`sendVideo` (captures `file_id` + `message_id`).
   - Calls Telegram `sendPhoto` for the thumbnail (captures `file_id` + `message_id`).
   - Deletes both objects from Storage.
   - Inserts the row in `weekly_messages` with `telegram_file_id` (media file_id) and
     `thumbnail_file_id` (thumbnail file_id), plus existing `telegram_channel` and
     `telegram_message_id`.

### Playback flow (public page)

- Each `weekly_messages` row has a media `telegram_file_id`.
- The public page renders a native player with `src="/api/weekly-media?id=<uuid>"`
  for audio, and `<video poster="/api/weekly-media?id=<uuid>&kind=thumb">` for video.
- `GET /api/weekly-media` (served by `api/weekly-messages.js` via rewrite):
  - Looks up the row by `id` (public read, no admin auth).
  - Calls Telegram Bot API `getFile` with the stored `file_id` to obtain `file_path`.
  - Streams `https://api.telegram.org/file/bot<TOKEN>/<file_path>` to the client.
  - `&kind=thumb` uses `thumbnail_file_id` instead of `telegram_file_id`.
- Cards created via the "message-link" option have no `file_id`; those keep the
  existing fallback link (opening the t.me message). This is the only case a t.me
  link remains, and it is user-authored.

### Error handling

- Storage download/send failure -> 502 with a readable error; Storage objects NOT
  deleted so the request can be retried.
- Telegram send failure -> 502; Storage objects NOT deleted.
- Success -> Storage objects deleted; Telegram keeps the file permanently.
- 404 when the row id is unknown or no file_id exists.
- The proxy route (`GET /api/weekly-media`) is public and must run BEFORE admin
  auth in the shared handler; only the upload/management routes require auth.

## Data model changes (Supabase migration)

Add columns to `public.weekly_messages`:
- `telegram_file_id text`
- `thumbnail_file_id text`

Create Storage bucket `weekly-messages` (private, not public) and RLS policy
allowing `authenticated` role to insert objects (the admin upload path); the server
uses the service role key which bypasses RLS for download/delete.

## Files to change

- `vercel.json` — add rewrite `/api/weekly-media -> /api/weekly-messages`.
- `api/weekly-messages.js` — storage-backed upload handling + GET media proxy.
- `api/shared/telegram-bot.cjs` — return `fileId` from send helpers; add
  `getTelegramFile()`/stream helper.
- `api/shared/weekly-common.cjs` — raise `TELEGRAM_UPLOAD_MAX_BYTES` to 48MB,
  update messages, add storage-path validation.
- `js/dashboard-app.js` — upload to Storage first, then JSON POST; bump client cap
  to 48MB.
- `js/discourse.js` — native player via `/api/weekly-media`, thumbnails via proxy,
  fallback only for message-link rows.
- `supabase_donations.sql` — migration for columns + bucket + policy.
- Tests: `tests/weekly-messages-api.test.js` (constants, new helpers) + any new
  helper tests.

## Constraints / trade-offs

- Vercel Hobby function runtime is capped (~10s default). Proxying works well for
  typical discourse audio (up to ~15-25MB on normal connections). A 48MB file on a
  slow connection could exceed the window. Mitigation: deploy, test with a real
  file; if it fails, options are a Vercel plan upgrade (Pro allows up to 300s) or
  serving from a Storage CDN copy.
- The bot token stays server-side (required for `getFile`); the proxy is the only
  way to avoid exposing it.

## Testing strategy

- Unit tests for updated shared helpers (48MB cap, fileId capture, storage path
  validation, proxy URL building) with mocked fetch.
- Manual end-to-end: real admin upload (small + large file) to a live channel,
  verify playback, verify Storage objects are deleted after success and preserved
  after failure.
