# Weekly Discourse Thumbnail Upload Design

**Date:** 2026-08-15
**Status:** Approved
**Goal:** Let admins upload a thumbnail image for a weekly discourse message from the dashboard admin panel. The uploaded thumbnail is stored in the Telegram archive channel (as a photo message) and rendered on the public Discourse page as a Telegram photo embed. No new storage and no new serverless function.

## Current State (verified)

- Weekly messages flow: admin form in `dashboard.html` -> `js/dashboard-app.js` (`initWeeklyMessagesAdmin`) -> `api/weekly-messages.js`.
- The merged endpoint `api/weekly-messages.js` serves two paths via `vercel.json` rewrites (kept under Vercel Hobby's 12-function limit):
  - `/api/telegram-upload` — POST `application/json` (text mode) or `multipart/form-data` (media mode, single `file` part) -> sends to channel -> inserts `weekly_messages` row.
  - `/api/weekly-messages` — POST (link-first from a pasted `t.me` link), PATCH (update optional fields), DELETE.
- `thumbnail_url` today is a plain text field in the form; the admin pastes any image URL. The card renders it as `<img class="discourse-thumb" src=thumbnail_url>`.
- Telegram exposes no stable public image URL for a channel photo, only a `t.me/<channel>/<id>` page/embed link. So a channel-stored thumbnail must be shown via the `?embed=1` iframe, exactly like the audio/video player.
- Shared helpers live in `api/shared/weekly-common.cjs` (validation, embed URL builder) and `api/shared/telegram-bot.cjs` (`sendMediaToTelegram`, `sendTextToTelegram`). Tests: `tests/weekly-messages-api.test.js`, `tests/discourse.test.js` (Vitest + jsdom, no live Telegram/Supabase).

## Architecture

### Storage

- The thumbnail image is posted to the same Telegram channel as the media, using Bot API `sendPhoto`.
- The resulting photo message id is stored in `weekly_messages.thumbnail_url` as `https://t.me/<channel>/<photoMessageId>?embed=1`.
- No new Supabase Storage bucket; no new env vars; no new serverless function.

### Data flow

1. Admin opens the Add/Edit weekly message form and optionally picks a thumbnail image (`accept="image/*"`, client-side guard ≤ 5MB).
2. Frontend includes the thumbnail in the same request as the existing media/link/text submit paths:
   - Media mode: one `multipart/form-data` with `file` (audio/video) **and** optional `thumbnail` part.
   - Link mode: `multipart/form-data` with `telegram_link` field **and** optional `thumbnail` part.
   - Edit mode: `multipart/form-data` PATCH with `id` and optional `thumbnail`; if no file was picked, the existing JSON PATCH is used. A "remove thumbnail" action clears `thumbnail_url` (JSON PATCH with `thumbnail_url: null`).
3. Server (`api/weekly-messages.js`):
   - Multipart parser is extended to capture a second optional file part named `thumbnail` (image only).
   - `validateThumbnail` (new, in `weekly-common.cjs`): must be present-or-empty; if present, image (mime `image/jpeg` or `image/png`) and ≤ 5MB.
   - For create flows: after the media/text/link message is sent and the row inserted, if a thumbnail was provided, call `sendPhotoToTelegram` (new, in `telegram-bot.cjs`), then `thumbnail_url = https://t.me/<channel>/<photoMessageId>?embed=1`.
   - For PATCH with multipart: update optional fields; if a thumbnail was provided, send the photo and set `thumbnail_url`; if `thumbnail_url` is `null` in the body, clear it.
4. Public `discourse.html` fetches `weekly_messages` and renders cards via `js/discourse.js`.

### Rendering (js/discourse.js)

- Card thumbnail logic: if `thumbnail_url` matches the `t.me/<channel>/<id>` pattern (regex on the embed URL), render a photo-embed iframe (`<iframe class="discourse-thumb-frame" src=thumbnail_url>`); otherwise render the existing `<img class="discourse-thumb" src=thumbnail_url>`.
- Both sit behind the media player iframe / fallback link exactly as today (`discourse.css` unchanged; the photo embed reuses the full-bleed overlay pattern).
- If no thumbnail, keep the existing `DEFAULT_THUMB` image fallback.
- Text messages: no thumbnail rendering (unchanged).

### Validation and error handling

- Client-side: image type + size guard before submit.
- Server-side: `validateThumbnail` rejects non-image mime or > 5MB with a clear message.
- `sendPhotoToTelegram` failure: surfaced to admin as a clear error; for create flows this aborts the request (no partial row), matching the existing media-send failure behavior.

### Testing

- Vitest + jsdom, no live Telegram/Supabase calls.
- `tests/weekly-messages-api.test.js`: `validateThumbnail` (missing/empty ok, bad mime, oversize, good jpeg/png), and that the multipart flow treats `thumbnail` as optional.
- `tests/discourse.test.js`: card render picks iframe for a `t.me`-style thumbnail_url and `<img>` for a direct URL / empty.
- Existing suite must stay green (137 tests).
- No new serverless function: verify function count stays at 12.

## Files

| File | Change |
|------|--------|
| `api/shared/weekly-common.cjs` | add `validateThumbnail`, `isTelegramEmbedUrl` |
| `api/shared/telegram-bot.cjs` | add `sendPhotoToTelegram` |
| `api/weekly-messages.js` | accept optional `thumbnail` multipart part; send photo; set `thumbnail_url`; multipart PATCH support; clear via null |
| `js/dashboard-app.js` | thumbnail file input handling, preview, remove action, include in media/link/edit requests; keep URL text field as advanced fallback |
| `dashboard.html` | thumbnail file input + preview + remove button; keep the URL text field as an advanced fallback |
| `js/discourse.js` | iframe-vs-img thumbnail render branch |
| `tests/weekly-messages-api.test.js` | thumbnail validation + optional part tests |
| `tests/discourse.test.js` | thumbnail render branch tests |

No changes to `vercel.json`, `.env.example`, `supabase_donations.sql`, or the 12-function count.
