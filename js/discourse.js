// discourse.js — Weekly Discourses public page (powered by Supabase + Telegram embed)
(function() {
  'use strict';

  var DEFAULT_THUMB = 'images/sathya_sai_baba.png';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanChannel(channel) {
    return String(channel == null ? '' : channel).replace(/^@/, '');
  }

  function buildEmbedUrl(message) {
    var c = cleanChannel(message.telegram_channel);
    var m = Number(message.telegram_message_id);
    return 'https://t.me/' + c + '/' + m + '?embed=1';
  }

  function buildMediaUrl(id, kind) {
    var base = '/api/weekly-media?id=' + encodeURIComponent(String(id == null ? '' : id));
    return kind === 'thumb' ? base + '&kind=thumb' : base;
  }

  function isTelegramEmbedUrl(url) {
    return /^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+\?embed=1$/.test(String(url || ''));
  }

  function renderThumbnail(message) {
    var url = String((message && message.thumbnail_url) || '').trim();
    var thumbWidth = 200;
    var thumbHeight = 200;
    var defaultThumb = 'images/sathya_sai_baba.png';
    if (isTelegramEmbedUrl(url)) {
      return '<iframe class="discourse-thumb" src="' + escapeHtml(url) + '" title="' + escapeHtml(message.title || '') + '" loading="lazy" allowfullscreen width="' + thumbWidth + '" height="' + thumbHeight + '"></iframe>';
    }
    return '<img class="discourse-thumb" src="' + escapeHtml(url || defaultThumb) + '" alt="' + escapeHtml(message.title || '') + '" loading="lazy" width="' + thumbWidth + '" height="' + thumbHeight + '" onerror="this.onerror=null;this.src=\'' + defaultThumb + '\'">';
  }

  function filterMessages(messages, filters) {
    var f = filters || {};
    var category = (f.category || '').trim().toLowerCase();
    var language = (f.language || '').trim().toLowerCase();
    var year = (f.year || '').trim();
    return (messages || []).filter(function(m) {
      if (category && String(m.category || '').trim().toLowerCase() !== category) return false;
      if (language && String(m.language || '').trim().toLowerCase() !== language) return false;
      if (year && String(m.date || '').slice(0, 4) !== year) return false;
      return true;
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderCard(message) {
    var m = message || {};
    var title = escapeHtml(m.title);
    var date = formatDate(m.date);
    var excerpt = escapeHtml(m.description);
    var duration = escapeHtml(m.duration);
    var badges = '';
    if (m.category) badges += '<span class="discourse-badge">' + escapeHtml(m.category) + '</span>';
    if (m.language) badges += '<span class="discourse-badge">' + escapeHtml(m.language) + '</span>';

    var body =
      '<div class="discourse-card-body">' +
        '<span class="discourse-card-date">' + date + '</span>' +
        '<h3 class="discourse-card-title">' + title + '</h3>' +
        (badges ? '<div class="discourse-badges">' + badges + '</div>' : '') +
        (duration ? '<span class="discourse-duration">' + duration + '</span>' : '') +
        (excerpt
          ? (m.media_type === 'text'
              ? '<div class="discourse-text">' + excerpt + '</div>'
              : '<p class="discourse-excerpt">' + excerpt + '</p>')
          : '');

    if (m.media_type === 'text') {
      return '<article class="discourse-card">' + body + '</div></article>';
    }

    var media;
    if (m.telegram_file_id) {
      var src = buildMediaUrl(m.id, 'media');
      var thumb = m.thumbnail_file_id
        ? buildMediaUrl(m.id, 'thumb')
        : (m.thumbnail_url && !isTelegramEmbedUrl(m.thumbnail_url) ? m.thumbnail_url : DEFAULT_THUMB);
      if (m.media_type === 'video') {
        media =
          '<div class="discourse-card-media">' +
            '<div class="discourse-player">' +
              '<video class="discourse-video" controls preload="metadata" poster="' + escapeHtml(thumb) + '" src="' + escapeHtml(src) + '"></video>' +
            '</div>' +
          '</div>';
      } else {
        media =
          '<div class="discourse-card-media discourse-media-audio">' +
            '<img class="discourse-art" src="' + escapeHtml(thumb) + '" alt="' + title + '" loading="lazy">' +
            '<div class="discourse-player">' +
              '<audio class="discourse-audio" controls preload="metadata" src="' + escapeHtml(src) + '"></audio>' +
            '</div>' +
          '</div>';
      }
    } else {
      media =
        '<div class="discourse-card-media">' +
          '<div class="discourse-player">' +
            renderThumbnail(m) +
            '<iframe class="discourse-player-frame" src="' + escapeHtml(buildEmbedUrl(m)) + '" title="' + title + '" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
          '</div>' +
        '</div>';
    }

    return '<article class="discourse-card">' + media + body + '</div></article>';
  }

  async function fetchMessages() {
    var sb = (typeof supabase !== 'undefined') ? supabase : null;
    if (!sb) throw new Error('Supabase client not available');
    var res = await sb.from('weekly_messages').select('*').order('date', { ascending: false });
    if (res.error) throw res.error;
    return res.data || [];
  }

  function uniqueSorted(values) {
    var seen = {};
    return values.filter(function(v) {
      if (v == null || String(v).trim() === '') return false;
      var key = String(v).trim();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort();
  }

  function populateSelect(select, values, allLabel) {
    if (!select) return;
    select.innerHTML = '<option value="">' + allLabel + '</option>' +
      values.map(function(v) {
        return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>';
      }).join('');
  }

  function init() {
    var feed = document.getElementById('discourseFeed');
    if (!feed) return;

    var categoryEl = document.getElementById('discourseCategory');
    var languageEl = document.getElementById('discourseLanguage');
    var yearEl = document.getElementById('discourseYear');
    var all = [];

    function render() {
      var filters = {
        category: categoryEl ? categoryEl.value : '',
        language: languageEl ? languageEl.value : '',
        year: yearEl ? yearEl.value : ''
      };
      var list = filterMessages(all, filters);
      if (list.length === 0) {
        feed.innerHTML = '<div class="discourse-empty">' +
          (all.length ? 'No discourses match your filters.' : 'No discourses yet. Please check back soon.') +
          '</div>';
        return;
      }
      feed.innerHTML = '<div class="discourse-feed">' + list.map(renderCard).join('') + '</div>';
    }

    function onFilterChange() { render(); }

    if (categoryEl) categoryEl.addEventListener('change', onFilterChange);
    if (languageEl) languageEl.addEventListener('change', onFilterChange);
    if (yearEl) yearEl.addEventListener('change', onFilterChange);

    fetchMessages()
      .then(function(messages) {
        all = messages;
        populateSelect(categoryEl, uniqueSorted(messages.map(function(m) { return m.category; })), 'All Categories');
        populateSelect(languageEl, uniqueSorted(messages.map(function(m) { return m.language; })), 'All Languages');
        populateSelect(yearEl, uniqueSorted(messages.map(function(m) { return String(m.date || '').slice(0, 4); })), 'All Years');
        render();
      })
      .catch(function() {
        feed.innerHTML = '<div class="discourse-empty">Unable to load discourses right now. Please try again later.</div>';
      });
  }

  window.SSPKD = {
    escapeHtml: escapeHtml,
    buildEmbedUrl: buildEmbedUrl,
    buildMediaUrl: buildMediaUrl,
    filterMessages: filterMessages,
    renderCard: renderCard,
    renderThumbnail: renderThumbnail,
    fetchMessages: fetchMessages,
    init: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
