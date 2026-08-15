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
