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

module.exports = { getBotToken, getChannelId, callTelegramApi, sendMediaToTelegram, sendTextToTelegram, sendPhotoToTelegram };
