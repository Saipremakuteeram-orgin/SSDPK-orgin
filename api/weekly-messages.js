'use strict';

// Combined weekly-messages endpoint.
// Serves two paths (see vercel.json rewrites) to stay within the Vercel
// Hobby limit of 12 serverless functions per deployment:
//   /api/weekly-messages   -> link-first POST / PATCH / DELETE
//   /api/telegram-upload   -> POST: send text or media to Telegram, then store

const busboy = require('busboy');
const { createClient } = require('@supabase/supabase-js');
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
