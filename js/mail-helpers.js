// js/mail-helpers.js
// Pure helpers for building Resend email content and chunking recipients.
// Kept dependency-free so they are unit-testable in isolation.
// CommonJS on purpose: consumed via require() by api/*.js handlers.

const LOGO_BASE64 = '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';

const DEFAULT_FROM_EMAIL = 'info@sathyasaipremakuterram.org';

// Shared email footer: logo embedded inline (base64 data URI, NOT an
// attachment) plus the trust tagline and the sender's email address.
function buildEmailFooter(fromEmail) {
  const sender = fromEmail || DEFAULT_FROM_EMAIL;
  return '<div style="background:#faf6f0;padding:24px;text-align:center;">' +
    '<img src="data:image/jpeg;base64,' + LOGO_BASE64 + '" alt="Sathya Sai Prema Kuteeram" width="80" height="80" style="display:block;margin:0 auto 10px;width:80px;height:80px;border-radius:50%;object-fit:cover;" />' +
    '<div style="font-size:12px;color:#8a6d57;line-height:1.6;">Love All, Serve All &mdash; Sathya Sai Prema Kuteeram</div>' +
    '<div style="font-size:11px;color:#a08b74;margin-top:6px;">From: ' + sender + '</div>' +
  '</div>';
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || size <= 0) return [];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function cleanDescription(description) {
  if (!description) return '';
  // The events table may store "desc ||| brochureUrl ||| brochurePath".
  return description.split('|||')[0].trim();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 0 || m > 11 || d < 1 || d > 31) return dateStr;
  return MONTH_NAMES[m] + ' ' + d + ', ' + y;
}

function buildEventEmail(event, baseUrl, fromEmail) {
  const evt = event || {};
  const title = evt.title || 'Upcoming Event';
  const description = cleanDescription(evt.description);
  const date = formatEventDate(evt.date);
  const time = evt.time || '';
  const venue = evt.venue || '';
  const coordinator = evt.coordinator || '';
  const contact = evt.contact || '';

  const category = evt.category || 'event';
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  const base = (baseUrl || '').replace(/\/+$/, '');
  const detailsUrl = evt.id ? base + '/pages/events.html?id=' + encodeURIComponent(evt.id) : (base || 'https://sathyasaipremakuterram.org') + '/pages/events.html';

  const lines = [
    'Sai Ram!',
    '',
    'A new event has been added to Sathya Sai Prema Kuteeram:',
    '',
    '  ' + title,
    '  Category: ' + categoryLabel,
    '  Date: ' + date,
    '  Time: ' + time,
    '  Venue: ' + venue,
    description ? '' : null,
    description || null,
    coordinator ? '' : null,
    coordinator ? 'Coordinator: ' + coordinator : null,
    contact ? 'Contact: ' + contact : null,
    '',
    'View event details: ' + detailsUrl,
    '',
    'With love and service,',
    'Sathya Sai Prema Kuteeram',
    '',
    'From: ' + (fromEmail || DEFAULT_FROM_EMAIL)
  ].filter(function(l) { return l !== null; });

  const metaHtml = [
    date ? metaItem('📅', 'Date', date) : '',
    time ? metaItem('🕒', 'Time', time) : '',
    venue ? metaItem('📍', 'Venue', venue) : ''
  ].join('');

  const coordHtml = (coordinator || contact)
    ? '<div style="background:#fdf2e9;border:1px solid #f0dcc4;border-radius:8px;padding:14px 16px;margin:20px 0;">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#c46a1a;letter-spacing:0.05em;margin-bottom:6px;">Event Coordinator</div>' +
        '<div style="font-weight:600;color:#2b2118;">' + (coordinator || '') + '</div>' +
        (contact ? '<div style="color:#8a6d57;margin-top:4px;">📞 ' + contact + '</div>' : '') +
      '</div>'
    : '';

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#faf6f0;padding:24px;color:#2b2118;">' +
      '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #f0dcc4;">' +
        '<div style="background:#c46a1a;padding:18px 24px;">' +
          '<h1 style="margin:0;color:#ffffff;font-size:20px;">Sathya Sai Prema Kuteeram</h1>' +
        '</div>' +
        '<div style="padding:24px;">' +
          '<p style="margin:0 0 16px;">Sai Ram!</p>' +
          '<p style="margin:0 0 20px;">A new event has been added:</p>' +
          '<div style="border-left:4px solid #c46a1a;padding:4px 0 4px 16px;margin-bottom:16px;">' +
            '<h2 style="margin:0 0 4px;color:#2b2118;font-size:18px;">' + title + '</h2>' +
            '<div style="font-size:12px;color:#c46a1a;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">' + categoryLabel + '</div>' +
          '</div>' +
          metaHtml +
          (description ? '<p style="line-height:1.7;color:#3d3428;">' + description + '</p>' : '') +
          coordHtml +
          '<a href="' + detailsUrl + '" style="display:inline-block;background:#c46a1a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">View Event Details</a>' +
        '</div>' +
        buildEmailFooter(fromEmail) +
      '</div>' +
    '</div>';

  return {
    subject: 'New Event: ' + title + (date ? ' — ' + date : ''),
    text: lines.filter(Boolean).join('\n'),
    html: html
  };
}

function metaItem(icon, label, value) {
  return '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;">' +
    '<div style="font-size:16px;width:24px;">' + icon + '</div>' +
    '<div>' +
      '<div style="font-size:10px;color:#8a6d57;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;">' + label + '</div>' +
      '<div style="color:#2b2118;">' + value + '</div>' +
    '</div>' +
  '</div>';
}

function buildWelcomeEmail(name, fromEmail) {
  const firstName = (name || '').split(' ')[0] || 'Devotee';

  const text = [
    'Sai Ram, ' + firstName + '!',
    '',
    'Welcome to Sathya Sai Prema Kuteeram.',
    'Your membership has been registered successfully. Stay tuned for upcoming bhajans, seva, and celebrations.',
    '',
    'With love and service,',
    'Sathya Sai Prema Kuteeram',
    '',
    'From: ' + (fromEmail || DEFAULT_FROM_EMAIL)
  ].join('\n');

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#faf6f0;padding:24px;color:#2b2118;">' +
      '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #f0dcc4;">' +
        '<div style="background:#c46a1a;padding:18px 24px;">' +
          '<h1 style="margin:0;color:#ffffff;font-size:20px;">Sathya Sai Prema Kuteeram</h1>' +
        '</div>' +
        '<div style="padding:24px;">' +
          '<h2 style="margin:0 0 12px;color:#2b2118;">Sai Ram, ' + firstName + '!</h2>' +
          '<p style="line-height:1.7;margin:0 0 12px;color:#3d3428;">Welcome to Sathya Sai Prema Kuteeram. Your membership has been registered successfully.</p>' +
          '<p style="line-height:1.7;margin:0 0 20px;color:#3d3428;">Stay tuned for upcoming bhajans, seva, and celebrations.</p>' +
          '<a href="https://sathyasaipremakuterram.org/events.html" style="display:inline-block;background:#c46a1a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">View Upcoming Events</a>' +
        '</div>' +
        buildEmailFooter(fromEmail) +
      '</div>' +
    '</div>';

  return {
    subject: 'Welcome to Sathya Sai Prema Kuteeram, ' + firstName + '!',
    text: text,
    html: html
  };
}

module.exports = {
  LOGO_BASE64,
  buildEmailFooter,
  chunkArray,
  cleanDescription,
  formatEventDate,
  buildEventEmail,
  buildWelcomeEmail
};
