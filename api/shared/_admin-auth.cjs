'use strict';

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  if (typeof email !== 'string') return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}

async function checkSiteAdmin(sb, email) {
  if (!email) return false;
  try {
    const { data, error } = await sb.from('site_admins').select('email').eq('email', email).maybeSingle();
    return !error && !!data;
  } catch (e) {
    return false;
  }
}

async function authenticateAdmin(sb, authorization) {
  if (!authorization || !String(authorization).startsWith('Bearer ')) return null;
  const token = String(authorization).slice(7).trim();
  if (!token) return null;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data || !data.user || !data.user.email) return null;
    const email = data.user.email.trim().toLowerCase();
    const isAdmin = isAdminEmail(email) || (await checkSiteAdmin(sb, email));
    if (!isAdmin) return null;
    return { id: data.user.id, email };
  } catch (e) {
    return null;
  }
}

module.exports = { getAdminEmails, isAdminEmail, checkSiteAdmin, authenticateAdmin };
