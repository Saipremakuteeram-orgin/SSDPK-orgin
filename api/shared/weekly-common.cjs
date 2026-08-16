'use strict';

// Shared pure helpers for the weekly discourse feature.
// CommonJS (.cjs) so Vercel serverless functions can require() them.

const TELEGRAM_UPLOAD_MAX_BYTES = 48 * 1024 * 1024; // Telegram Bot API caps media at 50MB; stay under
const THUMBNAIL_MAX_BYTES = 4 * 1024 * 1024; // keep under the 4.5MB Vercel body cap
const THUMBNAIL_MIMES = new Set(['image/jpeg', 'image/png']);



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

  if (!['audio', 'video'].includes(mediaType)) {
    errors.push('media_type must be audio or video for file uploads');
  }
  if (!name) errors.push('filename is required');
  if (!(bytes > 0)) errors.push('file is empty');
  if (bytes > TELEGRAM_UPLOAD_MAX_BYTES) {
    errors.push('file is too large (max 48MB)');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { filename: name, extension: ext, bytes: typeof bytes === 'number' ? bytes : 0 }
  };
}

function validateThumbnail(thumb) {
  if (thumb == null) return { ok: true, errors: [], value: null };
  const mime = String(thumb.mime || '');
  const bytes = (thumb.buffer && thumb.buffer.length) || 0;
  const errors = [];
  if (!THUMBNAIL_MIMES.has(mime)) errors.push('thumbnail must be a JPEG or PNG image');
  if (!(bytes > 0)) errors.push('thumbnail file is empty');
  if (bytes > THUMBNAIL_MAX_BYTES) errors.push('thumbnail is too large (max 4MB)');
  return { ok: errors.length === 0, errors, value: errors.length === 0 ? { mime, bytes } : {} };
}

function isTelegramEmbedUrl(url) {
  return /^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+\?embed=1$/.test(String(url || ''));
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validateStoragePayload(payload) {
  const p = payload || {};
  const errors = [];
  const value = {};
  const storagePath = typeof p.storagePath === 'string' ? p.storagePath.trim() : '';
  const thumbPath = typeof p.thumbnailStoragePath === 'string' ? p.thumbnailStoragePath.trim() : '';
  const fileMime = typeof p.fileMime === 'string' ? p.fileMime.trim() : '';
  if (!storagePath) errors.push('storagePath is required');
  if (fileMime) value.fileMime = fileMime;
  if (thumbPath) value.thumbnailStoragePath = thumbPath;
  value.storagePath = storagePath;
  return { ok: errors.length === 0, errors, value };
}

function buildMediaUrl(id, kind) {
  const base = '/api/weekly-media?id=' + encodeURIComponent(String(id || ''));
  return kind === 'thumb' ? base + '&kind=thumb' : base;
}

function mediaContentType(kind, mediaType, upstreamType) {
  const up = String(upstreamType || '').split(';')[0].trim().toLowerCase();
  if (kind === 'thumb') return 'image/jpeg';
  if (mediaType === 'video') return 'video/mp4';
  if (up && up.indexOf('audio/') === 0) return up;
  return 'audio/mpeg';
}

module.exports = {
  cors,
  TELEGRAM_UPLOAD_MAX_BYTES,
  THUMBNAIL_MAX_BYTES,
  telegramMethodFor,
  buildEmbedUrl,
  parseTelegramLink,
  validateWeeklyPayload,
  validateFile,
  validateThumbnail,
  isTelegramEmbedUrl,
  escapeHtml,
  validateStoragePayload,
  buildMediaUrl,
  mediaContentType
};
