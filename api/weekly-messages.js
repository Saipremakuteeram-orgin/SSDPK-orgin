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
