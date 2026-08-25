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
  if (result.ok) {
    return { ok: true, messageId: Number(result.data.message_id), fileId: getFileId(result.data), kind: isVideo ? 'video' : 'audio' };
  }

  // Exotic/unrecognized media types (e.g. WhatsApp .mpeg audio) can be rejected
  // by sendAudio/sendVideo — retry as a generic document so any file still uploads.
  const docForm = new FormData();
  docForm.append('chat_id', channel);
  if (caption) docForm.append('caption', caption);
  docForm.append('document', new Blob([buffer], { type: mime || 'application/octet-stream' }), filename);

  const docResult = await callTelegramApi('sendDocument', docForm);
  if (!docResult.ok) return result;
  return { ok: true, messageId: Number(docResult.data.message_id), fileId: getFileId(docResult.data), kind: 'document' };
}

async function sendDocumentToTelegram({ buffer, filename, mime, caption }) {
  const channel = getChannelId();
  if (!channel) return { ok: false, error: 'TELEGRAM_CHANNEL_ID is not configured' };

  const form = new FormData();
  form.append('chat_id', channel);
  if (caption) form.append('caption', caption);
  form.append('document', new Blob([buffer], { type: mime || 'application/octet-stream' }), filename || 'report');

  const result = await callTelegramApi('sendDocument', form);
  if (!result.ok) return result;
  return { ok: true, messageId: Number(result.data.message_id), fileId: getFileId(result.data) };
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

async function sendPhotoToTelegram({ buffer, mime, filename, caption }) {
  const channel = getChannelId();
  if (!channel) return { ok: false, error: 'TELEGRAM_CHANNEL_ID is not configured' };

  const form = new FormData();
  form.append('chat_id', channel);
  if (caption) form.append('caption', caption);
  form.append('photo', new Blob([buffer], { type: mime || 'image/jpeg' }), filename || 'thumb.jpg');

  const result = await callTelegramApi('sendPhoto', form);
  if (!result.ok) return result;
  return { ok: true, messageId: Number(result.data.message_id), fileId: getFileId(result.data) };
}

function getFileId(result) {
  const r = result || {};
  if (r.audio && r.audio.file_id) return r.audio.file_id;
  if (r.video && r.video.file_id) return r.video.file_id;
  if (r.document && r.document.file_id) return r.document.file_id;
  if (Array.isArray(r.photo) && r.photo.length) {
    let best = r.photo[0];
    r.photo.forEach((p) => { if (Number(p.file_size) > Number(best.file_size)) best = p; });
    return best.file_id || '';
  }
  return '';
}

function makeJsonForm(obj) {
  const form = new FormData();
  Object.keys(obj).forEach((k) => form.append(k, String(obj[k])));
  return form;
}

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

module.exports = { getBotToken, getChannelId, callTelegramApi, sendMediaToTelegram, sendDocumentToTelegram, sendTextToTelegram, sendPhotoToTelegram, getTelegramFileStream, getFileId };
