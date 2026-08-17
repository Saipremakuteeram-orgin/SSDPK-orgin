'use strict';

// Combined weekly-messages endpoint.
// Serves three paths (see vercel.json rewrites) to stay within the Vercel
// Hobby limit of 12 serverless functions per deployment:
//   /api/weekly-messages   -> link-first POST / PATCH / DELETE
//   /api/telegram-upload   -> POST: send text or media to Telegram, then store
//   /api/weekly-media      -> GET: public media proxy from Telegram file_id

const busboy = require('busboy');
const { createClient } = require('@supabase/supabase-js');
const {
  cors,
  validateWeeklyPayload,
  validateFile,
  parseTelegramLink,
  validateThumbnail,
  buildEmbedUrl,
  validateStoragePayload,
  sniffMediaContentType,
  validateEventReport,
  reportContentType,
  reportDisposition
} = require('./shared/weekly-common.cjs');
const { authenticateAdmin } = require('./shared/admin-auth.cjs');
const {
  sendMediaToTelegram,
  sendDocumentToTelegram,
  sendTextToTelegram,
  sendPhotoToTelegram,
  getChannelId,
  getTelegramFileStream
} = require('./shared/telegram-bot.cjs');

const OPTIONAL_FIELDS = ['description', 'category', 'language', 'duration', 'thumbnail_url'];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }
  const sb = createClient(supabaseUrl, serviceKey);

  if (req.method === 'GET' && (req.url || '').indexOf('/weekly-media') !== -1) {
    return handleMediaProxy(req, res, sb);
  }

  if ((req.url || '').indexOf('/event-report') !== -1) {
    if (req.method === 'GET') return handleEventReportDownload(req, res, sb);
    if (req.method === 'POST') {
      const admin = await authenticateAdmin(sb, req.headers.authorization);
      if (!admin) return res.status(401).json({ error: 'Not authorized' });
      return handleEventReportUpload(req, res);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await authenticateAdmin(sb, req.headers.authorization);
  if (!admin) return res.status(401).json({ error: 'Not authorized' });

  const isTelegramUpload = (req.url || '').indexOf('/telegram-upload') !== -1;

  if (isTelegramUpload) {
    return handleTelegramUpload(req, res, sb, admin);
  }
  return handleMessages(req, res, sb, admin);
};

// ── POST /api/telegram-upload ───────────────────────────────────────────────
// application/json  -> text mode (post discourse text to channel, store row)
// multipart/form-data -> media mode (send audio/video to channel, store row)
async function handleTelegramUpload(req, res, sb, admin) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const contentType = req.headers['content-type'] || '';

  if (contentType.startsWith('application/json')) {
    const body = parseJson(await readBody(req));
    const v = validateWeeklyPayload(body);
    if (!v.ok) return res.status(400).json({ errors: v.errors });

    if (v.value.media_type === 'text') {
      const sent = await sendTextToTelegram({ text: v.value.description });
if (!sent.ok) {
      const errMsg = sent.error || 'Telegram API error';
      // If the error mentions "bot is not a participant" or "chat not found", it's an auth/channel issue
      // If the error mentions "FILE_SIZE", it's a size issue
      // Otherwise, surface the original error
      return res.status(502).json({ error: errMsg });
    }

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

    const sv = validateStoragePayload(body);
    if (!sv.ok) return res.status(400).json({ errors: sv.errors });

    const { data: mediaObj, error: mediaErr } = await sb.storage
      .from('weekly-messages')
      .download(sv.value.storagePath);
    if (mediaErr) {
      // Specific diagnosis for the most common 502 causes:
      if (mediaErr.message && mediaErr.message.includes('Bucket not found')) {
        return res.status(502).json({ 
          error: 'Storage bucket `weekly-messages` not found. Run the SQL migration in supabase_donations.sql (lines 98-115).' 
        });
      }
      if (mediaErr.message && mediaErr.message.includes('PGRST301')) {
        return res.status(502).json({ 
          error: 'Storage access denied — ensure the bucket `weekly-messages` has RLS policy `Authenticated upload to weekly-messages` and the user is signed in as admin.' 
        });
      }
      return res.status(502).json({ error: 'Storage download failed: ' + mediaErr.message });
    }
    if (!mediaObj) {
      return res.status(502).json({ error: 'Uploaded file not found in storage bucket' });
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
      mime: sv.value.fileMime || (v.value.media_type === 'video' ? 'video/mp4' : 'audio/mpeg'),
      caption: v.value.title
    });
if (!sent.ok) {
      // Differentiate the 502 cause so you can fix it precisely:
      const tgError = sent.error || 'Telegram API error';
      // If Telegram rejected the format, the sendDocument fallback should handle it.
      // If both sendAudio/sendVideo AND sendDocument failed, this is a channel/auth/size issue.
      return res.status(502).json({ 
        error: tgError,
        // Include these diagnostic hints:
        hints: {
          channel: 'Verify TELEGRAM_CHANNEL_ID = -1003621082703 and bot is admin',
          size: 'File must be < 50MB (Telegram cap) and < 48MB (your cap)',
          format: '.sendDocument fallback handles .mpeg/.exotic formats; ensure caption is present'
        }
      });
    }

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

  const tv = validateThumbnail(parts.thumbnail);
  if (!tv.ok) return res.status(400).json({ errors: tv.errors });

  const sent = await sendMediaToTelegram({
    mediaType: v.value.media_type,
    buffer: file.buffer,
    filename: file.filename,
    mime: file.mime,
    caption: v.value.title
  });
  if (!sent.ok) return res.status(502).json({ error: sent.error });

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

  const row = {
    ...v.value,
    telegram_channel: normalizeChannel(getChannelId()),
    telegram_message_id: sent.messageId,
    telegram_file_id: sent.fileId || null,
    created_by: admin.id
  };
  if (thumbnailUrl) row.thumbnail_url = thumbnailUrl;
  const { data, error } = await sb.from('weekly_messages').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({
    id: data.id,
    telegram_channel: data.telegram_channel,
    telegram_message_id: data.telegram_message_id
  });
}

// ── GET /api/weekly-media (public) ──────────────────────────────────────────
// Serves media/thumbnail bytes back from Telegram by stored file_id.
// Supports HTTP Range requests (so <audio>/<video> can seek) and sniffs the
// real container so browsers pick the right decoder (e.g. .mpeg files that are
// actually M4A/AAC are served as audio/mp4, not audio/mpeg).
// Runs before admin auth — intentionally public so <audio>/<video> embeds work.
const mediaCache = new Map();
let mediaCacheBytes = 0;
const MEDIA_CACHE_MAX_BYTES = 64 * 1024 * 1024;

function cacheMedia(key, entry) {
  mediaCache.set(key, entry);
  mediaCacheBytes += entry.buffer.length;
  while (mediaCacheBytes > MEDIA_CACHE_MAX_BYTES && mediaCache.size > 0) {
    const k = mediaCache.keys().next().value;
    mediaCacheBytes -= mediaCache.get(k).buffer.length;
    mediaCache.delete(k);
  }
}

function parseRangeHeader(rangeHeader, total) {
  const raw = String(rangeHeader || '').trim();
  if (!raw || raw.indexOf('bytes=') !== 0) return null;
  const m = raw.slice(6).trim().match(/^(\d*)-(\d*)$/);
  if (!m) return null;
  const s = m[1] === '' ? -1 : Number(m[1]);
  const e = m[2] === '' ? -1 : Number(m[2]);
  if (s === -1 && e === -1) return null;
  if (s === -1) {
    const len = Number(e);
    if (!(len > 0)) return null;
    return { start: Math.max(0, total - len), end: total - 1 };
  }
  if (s >= total) return { unsatisfiable: true };
  const start = s;
  const end = e === -1 ? total - 1 : Math.min(e, total - 1);
  if (start > end) return { unsatisfiable: true };
  return { start, end };
}

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

  const cacheKey = kind + ':' + id;
  let entry = mediaCache.get(cacheKey);
  if (!entry) {
    const got = await getTelegramFileStream(data[column]);
    if (!got.ok) return res.status(502).json({ error: got.error });
    const stream = got.stream;
    if (!stream || !stream.body) return res.status(502).json({ error: 'Telegram returned no body' });
    const buffer = Buffer.from(await stream.arrayBuffer());
    const upstreamType = stream.headers ? stream.headers.get('content-type') : '';
    entry = {
      buffer,
      contentType: sniffMediaContentType(kind, data.media_type, buffer, upstreamType)
    };
    cacheMedia(cacheKey, entry);
  }
  const total = entry.buffer.length;
  const range = parseRangeHeader(req.headers.range, total);

  res.setHeader('Content-Type', entry.contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  if (!range) {
    res.setHeader('Content-Length', String(total));
    res.flushHeaders();
    return res.end(entry.buffer);
  }
  if (range.unsatisfiable) {
    res.setHeader('Content-Range', 'bytes */' + total);
    return res.status(416).end();
  }
  res.status(206);
  res.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + total);
  res.setHeader('Content-Length', String(range.end - range.start + 1));
  res.flushHeaders();
  res.end(entry.buffer.subarray(range.start, range.end + 1));
}

// ── /api/event-report ────────────────────────────────────────────────────────
// POST   admin uploads an event report to the Telegram channel (sendDocument),
//        responds with the Telegram file_id + original name (no DB write).
// GET    public download proxy: serves the report bytes with Content-Disposition
//        attachment so the browser auto-downloads. Runs before admin auth.
async function handleEventReportUpload(req, res) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
  }
  const parts = await parseMultipart(req);
  const file = parts.file;
  if (!file) return res.status(400).json({ error: 'file is required' });

  const fv = validateEventReport({ filename: file.filename, bytes: file.buffer.length });
  if (!fv.ok) return res.status(400).json({ errors: fv.errors });

  const sent = await sendDocumentToTelegram({
    buffer: file.buffer,
    filename: file.filename,
    mime: file.mime || reportContentType(file.filename, file.buffer),
    caption: typeof parts.fields.title === 'string' ? parts.fields.title : undefined
  });
  if (!sent.ok) return res.status(502).json({ error: sent.error });

  return res.status(201).json({ file_id: sent.fileId, name: fv.value.filename });
}

async function handleEventReportDownload(req, res, sb) {
  const url = new URL(req.url, 'https://example.invalid');
  const id = String(url.searchParams.get('id') || '').trim();
  if (!id) return res.status(400).json({ error: 'id is required' });

  const { data, error } = await sb.from('events')
    .select('title, report_file_id, report_name')
    .eq('id', id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !data.report_file_id) return res.status(404).json({ error: 'Report not found' });

  const cacheKey = 'report:' + id;
  let entry = mediaCache.get(cacheKey);
  if (!entry) {
    const got = await getTelegramFileStream(data.report_file_id);
    if (!got.ok) return res.status(502).json({ error: got.error });
    const stream = got.stream;
    if (!stream || !stream.body) return res.status(502).json({ error: 'Telegram returned no body' });
    const buffer = Buffer.from(await stream.arrayBuffer());
    const upstreamType = stream.headers ? stream.headers.get('content-type') : '';
    const name = String(data.report_name || 'report');
    entry = { buffer, name, contentType: reportContentType(name, buffer, upstreamType) };
    cacheMedia(cacheKey, entry);
  }

  res.setHeader('Content-Type', entry.contentType);
  res.setHeader('Content-Length', String(entry.buffer.length));
  res.setHeader('Content-Disposition', reportDisposition(entry.name));
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.flushHeaders();
  res.end(entry.buffer);
}

// ── /api/weekly-messages (link-first) ───────────────────────────────────────
// POST   create from an existing t.me message link
// PATCH  update optional fields
// DELETE remove
async function handleMessages(req, res, sb, admin) {
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contentType = req.headers['content-type'] || '';
  const isMultipart = contentType.startsWith('multipart/form-data');
  const parts = isMultipart ? await parseMultipart(req) : null;
  const body = parts ? parts.fields : parseJson(await readBody(req));

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

  const { data, error } = await sb.from('weekly_messages').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, id: data.id });
}

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
