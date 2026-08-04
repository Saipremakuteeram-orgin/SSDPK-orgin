// js/mail-helpers.js
// Pure helpers for building Resend email content and chunking recipients.
// Kept dependency-free so they are unit-testable in isolation.

export function chunkArray(items, size) {
  if (!Array.isArray(items) || size <= 0) return [];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function cleanDescription(description) {
  if (!description) return '';
  // The events table may store "desc ||| brochureUrl ||| brochurePath".
  return description.split('|||')[0].trim();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 0 || m > 11 || d < 1 || d > 31) return dateStr;
  return MONTH_NAMES[m] + ' ' + d + ', ' + y;
}

export function buildEventEmail(event, baseUrl) {
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
  const detailsUrl = evt.id ? base + '/events.html?id=' + encodeURIComponent(evt.id) : (base || 'https://sathyasaipremakuterram.org') + '/events.html';

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
    'Sathya Sai Prema Kuteeram'
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
        '<div style="background:#faf6f0;padding:16px 24px;font-size:12px;color:#8a6d57;">' +
          'Love All, Serve All &mdash; Sathya Sai Prema Kuteeram' +
        '</div>' +
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

export function buildWelcomeEmail(name) {
  const firstName = (name || '').split(' ')[0] || 'Devotee';

  const text = [
    'Sai Ram, ' + firstName + '!',
    '',
    'Welcome to Sathya Sai Prema Kuteeram.',
    'Your membership has been registered successfully. Stay tuned for upcoming bhajans, seva, and celebrations.',
    '',
    'With love and service,',
    'Sathya Sai Prema Kuteeram'
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
        '<div style="background:#faf6f0;padding:16px 24px;font-size:12px;color:#8a6d57;">' +
          'Love All, Serve All &mdash; Sathya Sai Prema Kuteeram' +
        '</div>' +
      '</div>' +
    '</div>';

  return {
    subject: 'Welcome to Sathya Sai Prema Kuteeram, ' + firstName + '!',
    text: text,
    html: html
  };
}
