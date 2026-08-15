// dashboard-app.js
// Handles Auth flow and Dashboard UI State — powered by Supabase

// Bfcache fix: expose a re-init hook for pageshow event
window._sspkReinit = null;

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initDashboard() {
  // Elements
  const authView = document.getElementById('authView');
  const dashboardView = document.getElementById('dashboardView');
  const adminView = document.getElementById('adminView');

  // Dashboard Card Elements
  const logoutBtn = document.getElementById('logoutBtn');
  const cardName = document.getElementById('cardName');
  const cardId = document.getElementById('cardId');
  const cardJoinedDate = document.getElementById('cardJoinedDate');

  // ══════════════════════════════════════════════════════════════════════════
  // SESSION CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════
  const SESSION_DURATION_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days
  const SESSION_KEY          = 'sspk_session';
  const TRUST_KEY            = 'sspk_trusted_device';
  const ADMIN_EMAILS         = ['sk143sathya@gmail.com'];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function makeSession(role, identifier, mode) {
    // mode: '30days' | 'forever' | 'none'
    const expiresAt = (mode === 'forever' || mode === 'none')
      ? null
      : Date.now() + SESSION_DURATION_MS;
    return { role, identifier, expiresAt, mode: mode || '30days' };
  }

  function isSessionValid(session) {
    if (!session) return false;
    if (!session.expiresAt) return true; // forever
    return Date.now() < session.expiresAt;
  }

  function getTrust(identifier) {
    try {
      const t = JSON.parse(localStorage.getItem(TRUST_KEY));
      if (!t || t.identifier !== identifier) return null;
      if (t.expiresAt && Date.now() >= t.expiresAt) {
        localStorage.removeItem(TRUST_KEY);
        return null;
      }
      return t;
    } catch { return null; }
  }

  function setTrust(identifier, mode) {
    const expiresAt = mode === 'forever' ? null : Date.now() + SESSION_DURATION_MS;
    localStorage.setItem(TRUST_KEY, JSON.stringify({ identifier, mode, expiresAt }));
  }

  function clearAuth() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TRUST_KEY);
    localStorage.removeItem('sspk_member_data');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ASYNC INIT — Zero-latency: show UI from cache instantly, verify async
  // ══════════════════════════════════════════════════════════════════════════

  // STEP 1: Pre-show the correct view from localStorage RIGHT NOW (0ms latency)
  // This makes the dashboard appear instantly while Supabase session is verified
  // in the background. If the session turns out to be invalid, we redirect.
  const _rawSession = localStorage.getItem(SESSION_KEY);
  let _preSession = null;
  try { _preSession = JSON.parse(_rawSession); } catch {}
  if (_preSession && isSessionValid(_preSession)) {
    if (_preSession.role === 'admin') {
      showView(adminView);
    } else {
      showView(dashboardView);
      // Instantly render card from cache — Supabase sync happens after
      renderMembershipCard(_preSession);
      if (window.initQuoteLimits && _preSession.identifier) {
        window.initQuoteLimits(_preSession.identifier);
      }
    }
  }

  // STEP 2: Async Supabase verification (runs in background, corrects state if needed)
  initAuthState();

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION') return; // handled by initAuthState
    if (session && session.user) {
      await resolveAndSaveSession(session);
    } else if (event === 'SIGNED_OUT') {
      clearAuth();
      window.location.href = 'login.html';
    }
  });

  async function initAuthState() {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session && session.user) {
        await resolveAndSaveSession(session);
        return;
      }

      // No live Supabase session — fall back to localStorage
      checkAuthState();
    } catch (err) {
      console.error('initAuthState error:', err);
      checkAuthState();
    }
  }

  // Determines role, auto-creates member profile if needed, saves session
  async function resolveAndSaveSession(session) {
    const email = session.user.email;
    if (!email) { checkAuthState(); return; }

    // Check admin
    let isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    if (!isAdmin) {
      try {
        const { data: ar } = await supabase
          .from('site_admins').select('email')
          .eq('email', email).maybeSingle();
        if (ar) isAdmin = true;
      } catch (e) { console.warn('site_admins check failed:', e); }
    }

    if (isAdmin) {
      saveSession('admin', email);
      checkAuthState();
      return;
    }

    // Auto-create member profile for Google OAuth new users
    const { data: member } = await supabase
      .from('members').select('id').eq('email', email).maybeSingle();

    if (!member) {
      const uniqueId = Math.floor(1000 + Math.random() * 9000).toString();
      const fullName = session.user.user_metadata?.full_name || 'Google User';
      const fname = fullName.split(' ')[0] || 'Google';
      const lname = fullName.split(' ').slice(1).join(' ') || 'User';
      await supabase.from('members').insert([{ fname, lname, email, member_id: uniqueId }]);
      
      // Pre-populate cache so dashboard renders instantly
      localStorage.setItem('sspk_member_data', JSON.stringify({
        fname, lname, member_id: uniqueId, registered_at: new Date().toISOString()
      }));

      fetch('/api/send-welcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: fullName })
      }).catch(() => {});
    }

    saveSession('user', email);
    checkAuthState();
  }

  function saveSession(role, identifier) {
    // Get existing session to preserve mode if already set
    const existing = (() => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } })();
    const trust = getTrust(identifier);
    const mode = trust?.mode || existing?.mode || '30days';
    localStorage.setItem(SESSION_KEY, JSON.stringify(makeSession(role, identifier, mode)));

    // Re-render the header nav. On OAuth redirect the session may be saved
    // AFTER main.js already rendered the nav as signed-out, so refresh it.
    if (window.SSPK && typeof window.SSPK.renderNav === 'function') {
      window.SSPK.renderNav();
    }
  }

  async function loadSevaHistory(session) {
    const panel = document.getElementById('sevaHistoryPanel');
    if (!panel || !session || !session.identifier) return;
    const countEl = document.getElementById('sevaPayCount');
    const statusEl = document.getElementById('sevaAutopayStatus');
    const listEl = document.getElementById('sevaHistoryList');
    if (!session.identifier.includes('@')) {
      if (countEl) countEl.textContent = '0';
      if (statusEl) statusEl.textContent = 'Not set up';
      if (listEl) listEl.textContent = 'Sign in with your email to track Seva contributions here.';
      return;
    }
    try {
      const res = await fetch('/api/razorpay/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session.identifier })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      if (countEl) countEl.textContent = String(data.total || 0);
      if (statusEl) {
        if (data.autopay && data.autopay.active) {
          statusEl.textContent = 'Active';
          statusEl.style.color = '#2e7d32';
        } else {
          statusEl.textContent = 'Not set up';
          statusEl.style.color = 'var(--muted)';
        }
      }
      if (listEl) {
        if (!data.payments || data.payments.length === 0) {
          listEl.textContent = 'No contributions yet. Use the button above to make your first Seva.';
        } else {
          const lines = data.payments.slice(0, 5).map((p) => {
            const amt = 'Rs ' + (p.amount || 0) + ' ' + (p.currency || 'INR');
            const when = p.created_at ? new Date(p.created_at).toLocaleDateString() : '';
            return amt + ' — ' + (p.purpose || 'Seva') + ' (' + (p.method || '') + ') ' + when;
          });
          listEl.innerHTML = lines.join('<br>');
        }
      }
    } catch (e) {
      if (listEl) listEl.textContent = 'Could not load contribution history.';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECK AUTH STATE — validates session expiry, shows correct view
  // ══════════════════════════════════════════════════════════════════════════
  function checkAuthState() {
    const raw = localStorage.getItem(SESSION_KEY);
    let session = null;
    try { session = JSON.parse(raw); } catch {}

    if (session && isSessionValid(session)) {
      if (session.role === 'admin') {
        showView(adminView);
        renderAdminDashboard();
      } else {
        showView(dashboardView);
        renderMembershipCard(session);
        loadSevaHistory(session);
        if (window.initQuoteLimits && session.identifier) {
          window.initQuoteLimits(session.identifier);
        }
        // Show trust modal if device not yet trusted for this user
        const trust = getTrust(session.identifier);
        if (!trust) {
          setTimeout(() => showTrustModal(session.identifier), 600);
        }
      }
    } else {
      // Session expired or missing
      if (session) clearAuth();
      window.location.href = 'login.html';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRUSTED DEVICE MODAL
  // ══════════════════════════════════════════════════════════════════════════
  function showTrustModal(identifier) {
    // Remove any existing modal
    document.getElementById('sspk-trust-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'sspk-trust-modal';
    modal.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.55)', 'backdrop-filter:blur(6px)',
      'animation:sspkFadeIn 0.25s ease'
    ].join(';');

    modal.innerHTML = `
      <style>
        @keyframes sspkFadeIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
        @keyframes sspkSlideUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        #sspk-trust-modal .trust-card {
          background: var(--surface, #1e1e2e);
          border: 1px solid var(--border, rgba(255,255,255,0.1));
          border-radius: 20px;
          padding: 36px 32px;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 24px 64px rgba(0,0,0,0.5);
          animation: sspkSlideUp 0.3s ease;
        }
        #sspk-trust-modal .trust-icon {
          font-size: 40px;
          text-align: center;
          margin-bottom: 12px;
        }
        #sspk-trust-modal h3 {
          font-family: var(--font-heading, Georgia, serif);
          font-size: 20px;
          font-weight: 700;
          text-align: center;
          color: var(--fg, #fff);
          margin: 0 0 6px;
        }
        #sspk-trust-modal .trust-sub {
          text-align: center;
          color: var(--muted, #aaa);
          font-size: 13px;
          margin-bottom: 28px;
        }
        #sspk-trust-modal .trust-opt {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px 16px;
          border: 1.5px solid var(--border, rgba(255,255,255,0.1));
          border-radius: 12px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: all 0.2s;
          background: transparent;
          width: 100%;
          text-align: left;
        }
        #sspk-trust-modal .trust-opt:hover {
          border-color: var(--accent, oklch(62% 0.16 50));
          background: var(--accent, oklch(62% 0.16 50 / 0.08));
          transform: translateX(2px);
        }
        #sspk-trust-modal .trust-opt-icon {
          font-size: 22px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        #sspk-trust-modal .trust-opt-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--fg, #fff);
          display: block;
          margin-bottom: 2px;
        }
        #sspk-trust-modal .trust-opt-desc {
          font-size: 12px;
          color: var(--muted, #aaa);
          display: block;
          line-height: 1.4;
        }
        #sspk-trust-modal .trust-opt.danger:hover {
          border-color: var(--danger, #f87171);
          background: rgba(248,113,113,0.08);
        }
      </style>
      <div class="trust-card">
        <div class="trust-icon">🔒</div>
        <h3>Trust this device?</h3>
        <p class="trust-sub">Choose how you want to stay signed in on this browser</p>

        <button class="trust-opt" id="trust-30days">
          <span class="trust-opt-icon">📅</span>
          <span>
            <span class="trust-opt-title">Remember me for 30 days</span>
            <span class="trust-opt-desc">Stay signed in automatically. You'll need to sign in again after 30 days.</span>
          </span>
        </button>

        <button class="trust-opt" id="trust-forever">
          <span class="trust-opt-icon">♾️</span>
          <span>
            <span class="trust-opt-title">Always trust this device</span>
            <span class="trust-opt-desc">Never ask again on this browser. Only signing out will log you out.</span>
          </span>
        </button>

        <button class="trust-opt danger" id="trust-none">
          <span class="trust-opt-icon">🚪</span>
          <span>
            <span class="trust-opt-title">Don't trust — sign in each time</span>
            <span class="trust-opt-desc">Your session will end when you close this browser tab.</span>
          </span>
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const applyTrust = (mode) => {
      setTrust(identifier, mode);
      // Update the session to use the selected mode
      try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY));
        if (s) {
          s.mode = mode;
          s.expiresAt = mode === 'forever' ? null : mode === 'none' ? Date.now() + 60 * 60 * 1000 : Date.now() + SESSION_DURATION_MS;
          localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        }
      } catch {}
      modal.style.animation = 'sspkFadeIn 0.15s ease reverse';
      setTimeout(() => modal.remove(), 150);
    };

    document.getElementById('trust-30days').addEventListener('click', () => applyTrust('30days'));
    document.getElementById('trust-forever').addEventListener('click', () => applyTrust('forever'));
    document.getElementById('trust-none').addEventListener('click',    () => applyTrust('none'));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  function showView(view) {
    if (authView) authView.classList.add('hidden');
    dashboardView.classList.add('hidden');
    adminView.classList.add('hidden');
    view.classList.remove('hidden');
  }

  const doLogout = async () => {
    clearAuth();
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  };

  logoutBtn?.addEventListener('click', doLogout);
  document.getElementById('adminLogoutBtn')?.addEventListener('click', doLogout);


  // ── Change Admin Password ─────────────────────────────────────────────────
  const toggleChangePwdBtn = document.getElementById('toggleChangePwdBtn');
  const changePwdPanel     = document.getElementById('changePwdPanel');
  const adminUpdatePwdBtn  = document.getElementById('adminUpdatePwdBtn');
  const adminPwdStatus     = document.getElementById('adminPwdStatus');

  toggleChangePwdBtn?.addEventListener('click', () => {
    changePwdPanel.classList.toggle('hidden');
    toggleChangePwdBtn.textContent = changePwdPanel.classList.contains('hidden')
      ? '🔑 Change Password'
      : '✕ Cancel';
  });

  adminUpdatePwdBtn?.addEventListener('click', async () => {
    const newPwd  = document.getElementById('adminNewPwd').value;
    const confPwd = document.getElementById('adminConfirmPwd').value;

    adminPwdStatus.style.color = 'var(--danger)';

    if (!newPwd || newPwd.length < 8) {
      adminPwdStatus.textContent = '⚠️ Password must be at least 8 characters.';
      return;
    }
    if (newPwd !== confPwd) {
      adminPwdStatus.textContent = '⚠️ Passwords do not match.';
      return;
    }

    adminUpdatePwdBtn.textContent = 'Updating...';
    adminUpdatePwdBtn.disabled = true;

    const { error } = await supabase.auth.updateUser({ password: newPwd });

    adminUpdatePwdBtn.textContent = 'Update Password';
    adminUpdatePwdBtn.disabled = false;

    if (error) {
      adminPwdStatus.style.color = 'var(--danger)';
      adminPwdStatus.textContent = '❌ ' + error.message;
    } else {
      adminPwdStatus.style.color = 'green';
      adminPwdStatus.textContent = '✅ Password updated successfully!';
      document.getElementById('adminNewPwd').value = '';
      document.getElementById('adminConfirmPwd').value = '';
      setTimeout(() => {
        changePwdPanel.classList.add('hidden');
        toggleChangePwdBtn.textContent = '🔑 Change Password';
        adminPwdStatus.textContent = '';
      }, 2500);
    }
  });

  // ============================================================
  // RENDER MEMBERSHIP CARD — loads from Supabase
  // ============================================================
  function formatJoinedDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  async function renderMembershipCard(session) {
    if (!session || !session.identifier) return;

    // 1. Instant UI update from local cache
    try {
      const cached = JSON.parse(localStorage.getItem('sspk_member_data'));
      if (cached) {
        cardName.textContent = cached.fname + ' ' + cached.lname;
        cardId.textContent = cached.member_id;
        if (cardJoinedDate) {
          cardJoinedDate.textContent = formatJoinedDate(cached.registered_at);
        }
      }
    } catch (e) {}

    // 2. Background sync to fetch fresh data
    const isEmail = session.identifier.includes('@');
    let query = supabase.from('members').select('fname, lname, member_id, registered_at');
    if (isEmail) {
      query = query.eq('email', session.identifier);
    } else {
      query = query.eq('phone', session.identifier);
    }

    const { data, error } = await query.maybeSingle();

    if (error) { console.error('Card background sync error:', error); return; }
    if (data) {
      // Update cache
      localStorage.setItem('sspk_member_data', JSON.stringify(data));
      // Update UI with fresh data (if it changed)
      cardName.textContent = data.fname + ' ' + data.lname;
      cardId.textContent = data.member_id;
      if (cardJoinedDate) {
        cardJoinedDate.textContent = formatJoinedDate(data.registered_at);
      }
    }
  }

  // ============================================================
  // ADMIN DASHBOARD — all queries run in PARALLEL for speed
  // ============================================================
  async function renderAdminDashboard() {
    // Fire all independent fetches simultaneously instead of serially
    await Promise.all([
      loadCategories(),
      renderAdminUsers(),
      renderAdminEvents(),
      renderAdminGallery(),
      populateGalleryEventDropdown()
    ]);
    // Categories must be loaded for the category list UI — render after
    renderAdminCategories();
  }

  async function renderAdminUsers() {
    const adminList = document.getElementById('adminUserList');
    if (!adminList) return;
    adminList.innerHTML = '<p style="color:var(--muted); font-size:13px;">Loading members...</p>';

    const { data, error } = await supabase
      .from('members')
      .select('fname, lname, phone, email, member_id, place, district')
      .order('registered_at', { ascending: false });

    if (error) { adminList.innerHTML = '<p style="color:red;">Error loading members.</p>'; return; }

    if (!data || data.length === 0) {
      adminList.innerHTML = '<p class="text-muted">No members registered yet.</p>';
      return;
    }

    adminList.innerHTML = '';
    data.forEach(u => {
      const div = document.createElement('div');
      div.className = 'admin-user-row';
      div.innerHTML = `
        <div class="user-info">
          <strong>${u.fname} ${u.lname}</strong> (ID: ${u.member_id})<br>
          <small>${u.phone} &middot; ${u.email || 'No Email'} &middot; ${u.place || 'No Place'} &middot; ${u.district || 'No District'}</small>
        </div>
      `;
      adminList.appendChild(div);
    });
  }

  // ============================================================
  // EVENT MANAGEMENT (Supabase CRUD)
  // ============================================================
  const addEventForm = document.getElementById('addEventForm');
  const showAddEventBtn = document.getElementById('showAddEventBtn');
  const cancelEventBtn = document.getElementById('cancelEventBtn');
  const adminEventList = document.getElementById('adminEventList');

  // Bulk operations state
  let selectedEventIds = new Set();
  let selectedEventsMap = new Map();

  function updateBulkActionBar() {
    const bar = document.getElementById('eventBulkActionBar');
    const countSpan = document.getElementById('selectedEventsCount');
    if (!bar || !countSpan) return;

    if (selectedEventIds.size > 0) {
      countSpan.textContent = selectedEventIds.size;
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  }

  // Bulk modal elements
  const bulkDuplicateModal = document.getElementById('bulkDuplicateModal');
  const bulkDuplicateModalBackdrop = document.getElementById('bulkDuplicateModalBackdrop');
  const closeBulkDuplicateModalBtn = document.getElementById('closeBulkDuplicateModalBtn');
  const cancelBulkDuplicateBtn = document.getElementById('cancelBulkDuplicateBtn');
  const saveBulkDuplicateBtn = document.getElementById('saveBulkDuplicateBtn');

  function closeBulkDuplicateModal() {
    bulkDuplicateModal?.classList.add('hidden');
    bulkDuplicateModalBackdrop?.classList.add('hidden');
  }

  closeBulkDuplicateModalBtn?.addEventListener('click', closeBulkDuplicateModal);
  cancelBulkDuplicateBtn?.addEventListener('click', closeBulkDuplicateModal);
  bulkDuplicateModalBackdrop?.addEventListener('click', closeBulkDuplicateModal);

  // Bulk Clear Selection
  document.getElementById('bulkClearBtn')?.addEventListener('click', () => {
    selectedEventIds.clear();
    selectedEventsMap.clear();
    document.querySelectorAll('.event-select-cb').forEach(cb => cb.checked = false);
    updateBulkActionBar();
  });

  // Bulk Delete
  document.getElementById('bulkDeleteBtn')?.addEventListener('click', async () => {
    if (selectedEventIds.size === 0) return;
    if (confirm(`Are you sure you want to delete the selected ${selectedEventIds.size} events?`)) {
      const ids = Array.from(selectedEventIds);
      
      try {
        // Fetch all selected events to see if they have brochure images to delete
        const { data: eventsToDelete } = await supabase
          .from('events')
          .select('description')
          .in('id', ids);
          
        if (eventsToDelete) {
          const brochurePathsToDelete = [];
          eventsToDelete.forEach(evt => {
            if (evt.description && evt.description.includes('|||')) {
              const parts = evt.description.split('|||');
              const brochurePath = parts[2] ? parts[2].trim() : '';
              if (brochurePath) brochurePathsToDelete.push(brochurePath);
            }
          });
          if (brochurePathsToDelete.length > 0) {
            await supabase.storage.from('gallery-images').remove(brochurePathsToDelete);
          }
        }
        
        const { error } = await supabase.from('events').delete().in('id', ids);
        if (error) {
          alert('Bulk delete failed: ' + error.message);
        } else {
          selectedEventIds.clear();
          selectedEventsMap.clear();
          updateBulkActionBar();
          renderAdminEvents();
        }
      } catch (err) {
        console.error('Error during bulk delete:', err);
        alert('An error occurred during deletion.');
      }
    }
  });

  // Bulk Duplicate Trigger
  document.getElementById('bulkDuplicateBtn')?.addEventListener('click', () => {
    if (selectedEventIds.size === 0) return;
    const container = document.getElementById('bulkDuplicateRowsContainer');
    if (!container) return;

    container.innerHTML = '';
    
    selectedEventsMap.forEach((evt, id) => {
      let descText = evt.description || '';
      let brochureUrl = '';
      let brochurePath = '';
      if (descText.includes('|||')) {
        const parts = descText.split('|||');
        descText = parts[0].trim();
        brochureUrl = parts[1] ? parts[1].trim() : '';
        brochurePath = parts[2] ? parts[2].trim() : '';
      }
      
      const row = document.createElement('div');
      row.className = 'bulk-duplicate-row';
      row.style = 'border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; background: var(--bg);';
      row.setAttribute('data-brochure-url', brochureUrl);
      row.setAttribute('data-brochure-path', brochurePath);
      
      row.innerHTML = `
        <h4 style="font-weight: 700; margin-bottom: 12px; color: var(--accent-dark);">Duplicate: ${evt.title}</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px;">Title</label>
            <input type="text" class="dup-title input" value="${evt.title}" required style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px;">Category</label>
            <select class="dup-category input" required style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
              <option value="bhajan" ${evt.category === 'bhajan' ? 'selected' : ''}>Bhajan</option>
              <option value="seva" ${evt.category === 'seva' ? 'selected' : ''}>Seva</option>
              <option value="study" ${evt.category === 'study' ? 'selected' : ''}>Study Circle</option>
              <option value="celebration" ${evt.category === 'celebration' ? 'selected' : ''}>Celebration</option>
            </select>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px; color: var(--accent-dark);">Date (Different)</label>
            <input type="date" class="dup-date input" value="${evt.date}" required style="width:100%; padding:8px; border:1.5px solid var(--accent); border-radius:4px; background:var(--surface); color:var(--fg); font-weight: 600;">
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px; color: var(--accent-dark);">Time (Different)</label>
            <input type="text" class="dup-time input" value="${evt.time || ''}" required style="width:100%; padding:8px; border:1.5px solid var(--accent); border-radius:4px; background:var(--surface); color:var(--fg); font-weight: 600;">
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px;">Venue</label>
            <input type="text" class="dup-venue input" value="${evt.venue || ''}" required style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px; color: var(--accent-dark);">Coordinator Name (Different)</label>
            <input type="text" class="dup-coordinator input" value="${evt.coordinator || ''}" required style="width:100%; padding:8px; border:1.5px solid var(--accent); border-radius:4px; background:var(--surface); color:var(--fg); font-weight: 600;">
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px;">Contact Number</label>
            <input type="tel" class="dup-contact input" value="${evt.contact || ''}" required style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg);">
          </div>
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px;">Description</label>
          <textarea class="dup-desc input" rows="2" required style="width:100%; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg); font-family:inherit;">${descText}</textarea>
        </div>
      `;
      container.appendChild(row);
    });

    bulkDuplicateModal?.classList.remove('hidden');
    bulkDuplicateModalBackdrop?.classList.remove('hidden');
  });

  // Bulk Duplicate Save
  saveBulkDuplicateBtn?.addEventListener('click', async () => {
    const rows = document.querySelectorAll('.bulk-duplicate-row');
    if (rows.length === 0) return;

    const newEvents = [];
    for (const row of rows) {
      const title = row.querySelector('.dup-title').value.trim();
      const category = row.querySelector('.dup-category').value;
      const date = row.querySelector('.dup-date').value;
      const time = row.querySelector('.dup-time').value.trim();
      const venue = row.querySelector('.dup-venue').value.trim();
      const coordinator = row.querySelector('.dup-coordinator').value.trim();
      const contact = row.querySelector('.dup-contact').value.trim();
      const descText = row.querySelector('.dup-desc').value.trim();
      
      const brochureUrl = row.getAttribute('data-brochure-url');
      const brochurePath = row.getAttribute('data-brochure-path');
      const finalDesc = brochureUrl ? `${descText} ||| ${brochureUrl} ||| ${brochurePath}` : descText;

      newEvents.push({
        title,
        category,
        date,
        time,
        venue,
        coordinator,
        contact,
        description: finalDesc
      });
    }

    saveBulkDuplicateBtn.textContent = 'Creating...';
    saveBulkDuplicateBtn.disabled = true;

    try {
      const { error } = await supabase.from('events').insert(newEvents);
      if (error) {
        alert('Bulk duplicate save failed: ' + error.message);
      } else {
        closeBulkDuplicateModal();
        selectedEventIds.clear();
        selectedEventsMap.clear();
        updateBulkActionBar();
        renderAdminEvents();
      }
    } catch (err) {
      console.error('Error saving bulk duplicates:', err);
      alert('An error occurred during save.');
    } finally {
      saveBulkDuplicateBtn.textContent = 'Create Events';
      saveBulkDuplicateBtn.disabled = false;
    }
  });

  showAddEventBtn?.addEventListener('click', () => {
    addEventForm.reset();
    document.getElementById('eventIdInput').value = '';
    document.getElementById('eventBrochureUrl').value = '';
    document.getElementById('eventBrochurePath').value = '';
    document.getElementById('eventBrochurePreviewContainer')?.classList.add('hidden');
    addEventForm.classList.remove('hidden');
    showAddEventBtn.classList.add('hidden');
  });

  cancelEventBtn?.addEventListener('click', () => {
    addEventForm.classList.add('hidden');
    showAddEventBtn.classList.remove('hidden');
  });

  document.getElementById('removeEventBrochureBtn')?.addEventListener('click', () => {
    document.getElementById('eventBrochureUrl').value = '';
    document.getElementById('eventBrochurePath').value = '';
    document.getElementById('eventBrochurePreviewContainer')?.classList.add('hidden');
    document.getElementById('eventBrochureInput').value = '';
  });

  async function renderAdminEvents() {
    if (!adminEventList) return;
    adminEventList.innerHTML = '<p style="color:var(--muted); font-size:13px;">Loading events...</p>';

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (error) { adminEventList.innerHTML = '<p style="color:red;">Error loading events.</p>'; return; }
    if (!data || data.length === 0) {
      adminEventList.innerHTML = '<p class="text-muted" style="font-size:14px;">No events found.</p>';
      return;
    }

    adminEventList.innerHTML = '';
    data.forEach(evt => {
      const div = document.createElement('div');
      div.style = 'padding:12px; border:1px solid var(--border); border-radius:6px; display:flex; justify-content:space-between; align-items:center; background:var(--surface);';
      div.innerHTML = `
        <div style="display:flex; align-items:center;">
          <input type="checkbox" class="event-select-cb" data-id="${evt.id}" data-evt='${JSON.stringify(evt).replace(/'/g, "&apos;")}' ${selectedEventIds.has(evt.id.toString()) ? 'checked' : ''} style="margin-right:12px; width:16px; height:16px; cursor:pointer;">
          <div>
            <strong style="color:var(--fg);">${evt.title}</strong>
            <span style="display:inline-block; margin-left:8px; padding:2px 6px; background:#e0f2fe; color:#0369a1; border-radius:4px; font-size:11px; font-family:monospace; font-weight:bold;" title="Type 'Event_${evt.id}' in Telegram caption to upload photos to this event">Telegram ID: Event_${evt.id}</span><br>
            <small style="color:var(--muted);">${evt.date} &middot; ${evt.time || ''} &middot; ${evt.venue || ''}</small>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline edit-evt-btn" data-evt='${JSON.stringify(evt).replace(/'/g, "&apos;")}' style="padding:4px 8px; font-size:12px;">Edit</button>
          <button class="btn btn-primary del-evt-btn" data-id="${evt.id}" style="padding:4px 8px; font-size:12px; background:#d9534f; border-color:#d9534f;">Del</button>
        </div>
      `;
      adminEventList.appendChild(div);
    });

    document.querySelectorAll('.event-select-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-id');
        const evt = JSON.parse(e.target.getAttribute('data-evt'));
        
        if (e.target.checked) {
          selectedEventIds.add(id);
          selectedEventsMap.set(id, evt);
        } else {
          selectedEventIds.delete(id);
          selectedEventsMap.delete(id);
        }
        updateBulkActionBar();
      });
    });

    document.querySelectorAll('.edit-evt-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const evt = JSON.parse(e.target.getAttribute('data-evt'));
        document.getElementById('eventIdInput').value = evt.id;
        document.getElementById('eventTitle').value = evt.title;
        document.getElementById('eventCategory').value = evt.category;
        document.getElementById('eventDate').value = evt.date;
        document.getElementById('eventTime').value = evt.time || '';
        document.getElementById('eventVenue').value = evt.venue || '';
        
        let descText = evt.description || '';
        let brochureUrl = '';
        let brochurePath = '';
        if (descText.includes('|||')) {
          const parts = descText.split('|||');
          descText = parts[0].trim();
          brochureUrl = parts[1] ? parts[1].trim() : '';
          brochurePath = parts[2] ? parts[2].trim() : '';
        }
        document.getElementById('eventDesc').value = descText;
        document.getElementById('eventBrochureUrl').value = brochureUrl;
        document.getElementById('eventBrochurePath').value = brochurePath;
        document.getElementById('eventBrochureInput').value = '';

        const previewContainer = document.getElementById('eventBrochurePreviewContainer');
        const brochureLink = document.getElementById('eventBrochureLink');
        if (previewContainer && brochureLink) {
          if (brochureUrl) {
            brochureLink.href = brochureUrl;
            previewContainer.classList.remove('hidden');
          } else {
            previewContainer.classList.add('hidden');
          }
        }

        document.getElementById('eventCoord').value = evt.coordinator || '';
        document.getElementById('eventContact').value = evt.contact || '';
        addEventForm.classList.remove('hidden');
        showAddEventBtn.classList.add('hidden');
      });
    });

    document.querySelectorAll('.del-evt-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('Are you sure you want to delete this event?')) {
          const id = e.target.getAttribute('data-id');
          // Fetch event details to see if it has a brochure path
          const { data: eventData } = await supabase.from('events').select('description').eq('id', id).single();
          if (eventData && eventData.description && eventData.description.includes('|||')) {
            const parts = eventData.description.split('|||');
            const brochurePath = parts[2] ? parts[2].trim() : '';
            if (brochurePath) {
              await supabase.storage.from('gallery-images').remove([brochurePath]);
            }
          }
          const { error } = await supabase.from('events').delete().eq('id', id);
          if (error) { alert('Delete failed: ' + error.message); return; }
          renderAdminEvents();
        }
      });
    });
  }

  addEventForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idInput = document.getElementById('eventIdInput').value;
    const saveBtn = addEventForm.querySelector('button[type="submit"]');
    const originalBtnText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
      let brochureUrl = document.getElementById('eventBrochureUrl').value || '';
      let brochurePath = document.getElementById('eventBrochurePath').value || '';
      const brochureFile = document.getElementById('eventBrochureInput').files[0];

      // If editing, check if we need to clean up old brochure from storage
      if (idInput) {
        const { data: oldEvt } = await supabase.from('events').select('description').eq('id', idInput).single();
        if (oldEvt && oldEvt.description && oldEvt.description.includes('|||')) {
          const parts = oldEvt.description.split('|||');
          const oldPath = parts[2] ? parts[2].trim() : '';
          // Delete if a new flyer is uploaded OR if current brochure was removed
          if (oldPath && (brochureFile || !brochureUrl)) {
            await supabase.storage.from('gallery-images').remove([oldPath]);
            if (!brochureFile) {
              brochureUrl = '';
              brochurePath = '';
            }
          }
        }
      }

      if (brochureFile) {
        const compressedBlob = await compressImage(brochureFile, 1200, 0.75);
        const fileName = `${Date.now()}_brochure_${brochureFile.name.replace(/\s+/g, '_')}`;
        brochurePath = `event-brochures/${fileName}`;

        const { error: storageError } = await supabase.storage
          .from('gallery-images')
          .upload(brochurePath, compressedBlob, { contentType: 'image/jpeg', upsert: false });

        if (!storageError) {
          const { data: urlData } = supabase.storage.from('gallery-images').getPublicUrl(brochurePath);
          brochureUrl = urlData?.publicUrl || '';
        } else {
          console.error('Storage upload failed:', storageError.message);
        }
      }

      const descInput = document.getElementById('eventDesc').value.trim();
      const finalDesc = brochureUrl ? `${descInput} ||| ${brochureUrl} ||| ${brochurePath}` : descInput;

      const evtData = {
        title: document.getElementById('eventTitle').value,
        category: document.getElementById('eventCategory').value,
        date: document.getElementById('eventDate').value,
        time: document.getElementById('eventTime').value,
        venue: document.getElementById('eventVenue').value,
        description: finalDesc,
        coordinator: document.getElementById('eventCoord').value,
        contact: document.getElementById('eventContact').value
      };

      let error;
      if (idInput) {
        ({ error } = await supabase.from('events').update(evtData).eq('id', idInput));
      } else {
        const { data: insertedData, error: insertError } = await supabase.from('events').insert([evtData]).select();
        error = insertError;
        if (!error && insertedData && insertedData.length > 0) {
          const newEvent = insertedData[0];
          // Fetch all registered user emails
          const { data: users, error: usersError } = await supabase
            .from('members')
            .select('email')
            .not('email', 'is', null);

          if (!usersError && users && users.length > 0) {
            const emails = users.map(u => u.email).filter(Boolean);
            if (emails.length > 0) {
              // Trigger Vercel function to notify users
              fetch('/api/notify-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: newEvent, emails })
              }).catch(err => console.error('Failed to send event notifications:', err));
            }
          }
        }
      }

      if (error) { 
        alert('Save failed: ' + error.message); 
      } else {
        addEventForm.reset();
        document.getElementById('eventBrochureUrl').value = '';
        document.getElementById('eventBrochurePath').value = '';
        document.getElementById('eventBrochurePreviewContainer')?.classList.add('hidden');
        addEventForm.classList.add('hidden');
        showAddEventBtn.classList.remove('hidden');
        selectedEventIds.clear();
        selectedEventsMap.clear();
        updateBulkActionBar();
        renderAdminEvents();
      }
    } catch (err) {
      console.error('Error saving event:', err);
      alert('An error occurred during save.');
    } finally {
      saveBtn.textContent = originalBtnText;
      saveBtn.disabled = false;
    }
  });

  // ============================================================
  // CATEGORIES CACHE & CRUD
  // ============================================================
  let CATEGORIES_DB = [];

  async function loadCategories() {
    try {
      const { data, error } = await supabase
        .from('event_categories')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data && data.length > 0) {
        CATEGORIES_DB = data;
      } else {
        console.warn('Empty or failed event_categories select, using fallbacks:', error?.message);
        CATEGORIES_DB = [{ name: 'Bhajans' }, { name: 'Seva' }, { name: 'Study Circle' }];
      }
    } catch (err) {
      console.warn('Failed to load categories, using fallbacks:', err);
      CATEGORIES_DB = [{ name: 'Bhajans' }, { name: 'Seva' }, { name: 'Study Circle' }];
    }
  }

  function populateEventCategoryDropdown() {
    const categorySelect = document.getElementById('eventCategory');
    if (!categorySelect) return;
    categorySelect.innerHTML = '';
    CATEGORIES_DB.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name.toLowerCase();
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  async function renderAdminCategories() {
    const categoryListEl = document.getElementById('adminCategoryList');
    if (!categoryListEl) return;
    
    // Populate event category choices
    populateEventCategoryDropdown();

    if (CATEGORIES_DB.length === 0) {
      categoryListEl.innerHTML = '<p class="text-muted" style="font-size:13px; width:100%;">No categories found.</p>';
      return;
    }

    categoryListEl.innerHTML = '';
    CATEGORIES_DB.forEach(cat => {
      const span = document.createElement('span');
      span.style = 'display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border-radius:20px; background:var(--accent-light); color:var(--accent-dark); border:1px solid var(--accent); font-size:12px; font-weight:600;';
      span.innerHTML = `
        ${cat.name}
        <button class="del-cat-btn" data-id="${cat.id}" data-name="${cat.name}" style="background:none; border:none; color:var(--accent-dark); font-weight:bold; font-size:14px; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; line-height:1;">&times;</button>
      `;
      categoryListEl.appendChild(span);
    });

    document.querySelectorAll('.del-cat-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.target.getAttribute('data-id');
        const name = e.target.getAttribute('data-name');
        if (confirm(`Are you sure you want to delete the category "${name}"? Events matching this category will remain, but the category option will be removed.`)) {
          const { error } = await supabase.from('event_categories').delete().eq('id', id);
          if (error) { alert('Delete failed: ' + error.message); return; }
          await loadCategories();
          renderAdminCategories();
        }
      });
    });
  }

  // Handle category creation
  const addCategoryForm = document.getElementById('addCategoryForm');
  addCategoryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('newCategoryName');
    const name = nameInput.value.trim();
    if (!name) return;

    const { error } = await supabase.from('event_categories').insert([{ name }]);
    if (error) {
      alert('Failed to create category: ' + error.message);
      return;
    }

    nameInput.value = '';
    await loadCategories();
    renderAdminCategories();
  });

  // ============================================================
  // GALLERY MANAGEMENT (Supabase Storage + table)
  // ============================================================
  const addGalleryForm = document.getElementById('addGalleryForm');
  const adminGalleryList = document.getElementById('adminGalleryList');

  // Populate Gallery Event Dropdown
  async function populateGalleryEventDropdown() {
    const eventSelect = document.getElementById('galleryEventSelect');
    if (!eventSelect) return;
    
    // Clear dynamic options (keep first one)
    eventSelect.innerHTML = '<option value="">-- Link to Event (Optional) --</option>';

    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, category, date, time')
        .order('date', { ascending: false });

      if (!error && data) {
        data.forEach(evt => {
          const opt = document.createElement('option');
          opt.value = evt.id;
          const timeStr = evt.time ? ` - ${evt.time}` : '';
          opt.textContent = `${evt.title} (${evt.date}${timeStr})`;
          opt.setAttribute('data-category', evt.category);
          eventSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Failed to load events for gallery linking:', err);
    }
  }

  // Selected event auto-sync details if any (currently category auto-sync removed)

  async function renderAdminGallery() {
    if (!adminGalleryList) return;
    adminGalleryList.innerHTML = '<p style="color:var(--muted); font-size:13px; grid-column:1/-1;">Loading gallery...</p>';

    const { data, error } = await supabase
      .from('gallery')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) { adminGalleryList.innerHTML = '<p style="color:red; grid-column:1/-1;">Error loading gallery.</p>'; return; }
    if (!data || data.length === 0) {
      adminGalleryList.innerHTML = '<p class="text-muted" style="grid-column:1/-1; font-size:14px;">No gallery images uploaded.</p>';
      return;
    }

    adminGalleryList.innerHTML = '';
    data.forEach(item => {
      const div = document.createElement('div');
      div.style = 'position:relative; border-radius:8px; overflow:hidden; aspect-ratio:1; background:#111;';
      const imgSrc = item.src_url || '';
      const isVideo = imgSrc.match(/\.(mp4|webm|mov|ogg)$/i);
      
      let mediaHtml = '';
      if (imgSrc) {
        if (isVideo) {
          mediaHtml = `<video src="${imgSrc}" controls style="width:100%; height:100%; object-fit:cover;"></video>`;
        } else {
          mediaHtml = `<img src="${imgSrc}" loading="lazy" style="width:100%; height:100%; object-fit:cover; opacity:0.85;">`;
        }
      } else {
        mediaHtml = `<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:32px;">${item.placeholder || '🖼️'}</div>`;
      }
      
      div.innerHTML = `
        ${mediaHtml}
        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); color:#fff; padding:4px 6px; font-size:10px; max-height:40px; overflow:hidden; text-overflow:ellipsis;">${item.caption || ''}</div>
        <button class="del-gal-btn" data-id="${item.id}" data-path="${item.storage_path || ''}" style="position:absolute; top:4px; right:4px; background:red; color:white; border:none; border-radius:50%; width:24px; height:24px; font-size:12px; cursor:pointer;">&times;</button>
      `;
      adminGalleryList.appendChild(div);
    });

    document.querySelectorAll('.del-gal-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('Delete this image from gallery?')) {
          const id = e.target.getAttribute('data-id');
          const storagePath = e.target.getAttribute('data-path');
          // Delete from storage if it has a path
          if (storagePath) {
            await supabase.storage.from('gallery-images').remove([storagePath]);
          }
          const { error } = await supabase.from('gallery').delete().eq('id', id);
          if (error) { alert('Delete failed: ' + error.message); return; }
          renderAdminGallery();
        }
      });
    });
  }

  addGalleryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const files = document.getElementById('galleryImageInput').files;
    
    // Compute category from selected event, or default to general
    const eventSelect = document.getElementById('galleryEventSelect');
    let category = 'general';
    let eventId = null;
    if (eventSelect && eventSelect.value) {
      const selectedOption = eventSelect.options[eventSelect.selectedIndex];
      category = selectedOption.getAttribute('data-category') || 'general';
      eventId = parseInt(eventSelect.value);
    }

    const caption = document.getElementById('galleryCaption').value;
    if (!files || files.length === 0) return;

    const uploadBtn = document.getElementById('uploadGalleryBtn');
    uploadBtn.disabled = true;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        uploadBtn.textContent = `Uploading ${i + 1} of ${files.length}...`;
        
        const isVideo = file.type.startsWith('video/');
        let uploadBlob = file;
        let contentType = file.type || (isVideo ? 'video/mp4' : 'image/jpeg');
        
        // Compress only if it's an image
        if (!isVideo && file.type.startsWith('image/')) {
          uploadBlob = await compressImage(file, 1200, 0.75);
          contentType = 'image/jpeg';
        }

        const fileExt = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
        const fileName = `${Date.now()}_${Math.floor(Math.random()*1000)}.${fileExt}`;
        const storagePath = `${category}/${fileName}`;

        // Upload to Supabase Storage
        const { error: storageError } = await supabase.storage
          .from('gallery-images')
          .upload(storagePath, uploadBlob, { contentType: contentType, upsert: false });

        let src_url = null;
        if (!storageError) {
          const { data: urlData } = supabase.storage.from('gallery-images').getPublicUrl(storagePath);
          src_url = urlData?.publicUrl || null;
        } else {
          console.warn('Storage upload failed, saving without URL:', storageError.message);
          continue; // Skip DB insert if storage upload failed
        }

        // Insert metadata into gallery table
        const insertData = {
          caption,
          category,
          src_url,
          storage_path: storagePath
        };

        if (eventId) {
          insertData.event_id = eventId;
        }

        let { error: dbError } = await supabase.from('gallery').insert([insertData]);

        if (dbError) {
          console.warn('First insert attempt with event_id failed:', dbError.message);
          if (dbError.message && (dbError.message.includes('event_id') || dbError.message.includes('column'))) {
            // Retry without event_id
            console.warn('Retrying database insert without event_id...');
            delete insertData.event_id;
            const { error: retryError } = await supabase.from('gallery').insert([insertData]);
            if (retryError) {
              console.error('Database save failed on retry: ' + retryError.message);
            }
          } else {
            console.error('Database save failed: ' + dbError.message);
          }
        }
      }

      addGalleryForm.reset();
      renderAdminGallery();
    } catch (err) {
      console.error('Gallery upload error:', err);
      alert('Upload failed. Please try again.');
    } finally {
      uploadBtn.textContent = 'Upload to Gallery';
      uploadBtn.disabled = false;
    }
  });

  // Compress image using canvas before upload
  function compressImage(file, maxSize, quality) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          canvas.toBlob(resolve, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ============================================================
  // DOWNLOAD CARD — html2canvas lazy-loaded on demand (saves ~500KB on startup)
  // ============================================================
  const downloadCardBtn = document.getElementById('downloadCardBtn');
  let _html2canvasPromise = null;

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (_html2canvasPromise) return _html2canvasPromise;
    _html2canvasPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas-pro@latest/dist/html2canvas-pro.min.js';
      s.onload = () => resolve(window.html2canvas);
      s.onerror = () => reject(new Error('Failed to load html2canvas'));
      document.head.appendChild(s);
    });
    return _html2canvasPromise;
  }

  downloadCardBtn?.addEventListener('click', async () => {
    const cardElement = document.querySelector('.member-card');
    if (!cardElement) return;
    const btn = downloadCardBtn;
    btn.textContent = 'Preparing...';
    btn.disabled = true;
    try {
      const h2c = await loadHtml2Canvas();
      const originalTransform = cardElement.style.transform;
      cardElement.style.transform = 'none';
      const canvas = await h2c(cardElement, { scale: 2, backgroundColor: null, useCORS: true });
      cardElement.style.transform = originalTransform;
      const link = document.createElement('a');
      link.download = 'Sathya_Sai_Membership_Card.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Card download error:', err);
      alert('Failed to download card. Please try again.');
    } finally {
      btn.textContent = 'Download Digital Card';
      btn.disabled = false;
    }
  });

  // ============================================================
  // DAILY BLESSINGS (QUOTES OF GURUS) WITH 3X RATE LIMIT PER GURU
  // ============================================================
  const getSaiQuoteBtn = document.getElementById('getSaiQuoteBtn');
  const getPeriyavaQuoteBtn = document.getElementById('getPeriyavaQuoteBtn');
  const saiLimitText = document.getElementById('saiLimitText');
  const periyavaLimitText = document.getElementById('periyavaLimitText');
  const quoteDisplayBox = document.getElementById('quoteDisplayBox');
  const quoteEnglish = document.getElementById('quoteEnglish');
  const quoteTamil = document.getElementById('quoteTamil');
  const quoteSource = document.getElementById('quoteSource');

  let cachedQuotes = {
    sai: [],
    periyava: []
  };

  const fallbackQuotes = {
    sai: [
      {
        quote_english: "Love all. Serve all. Help ever. Hurt never.",
        quote_tamil: "அனைவரையும் நேசி. அனைவருக்கும் சேவை செய். எப்போதும் உதவு. ஒருபோதும் வலிக்கவிடாதே."
      },
      {
        quote_english: "Where there is Faith, there is Love; where there is Love, there is Peace; where there is Peace, there is God.",
        quote_tamil: "நம்பிக்கை இருக்கும் இடத்தில் அன்பு உண்டு; அன்பு இருக்கும் இடத்தில் அமைதி உண்டு; அமைதி இருக்கும் இடத்தில் இறைவன் உண்டு."
      },
      {
        quote_english: "Money comes and goes; morality comes and grows.",
        quote_tamil: "பணம் வரும், போகும்; ஒழுக்கம் வரும், வளரும்."
      },
      {
        quote_english: "The end of knowledge is Love. The end of education is character.",
        quote_tamil: "அறிவின் முடிவு அன்பு; கல்வியின் முடிவு நற்குணம்."
      },
      {
        quote_english: "Do good, be good and see good. Do everything with love.",
        quote_tamil: "நன்மை செய், நல்லவனாக இரு, நன்மையை பார். எல்லாவற்றையும் அன்புடன் செய்."
      }
    ],
    periyava: [
      {
        quote_english: "One must not keep a long face, wear a scowl or keep lamenting one's hardships.",
        quote_tamil: "முகத்தை தொங்கவிட்டுக்கொண்டோ, கோபமான முகத்துடனோ, கஷ்டங்களை புலம்பியபடியோ இருக்கக்கூடாது."
      },
      {
        quote_english: "If you lose your cool you will be a burden to yourself as well as to others.",
        quote_tamil: "மனநிலையை இழந்தால், நீங்கள் உங்களுக்கும் மற்றவர்களுக்கும் சுமையாக மாறுவீர்கள்."
      },
      {
        quote_english: "Develop the attitude that everything happens according to the will of the Lord.",
        quote_tamil: "எல்லாம் இறைவனின் திருவுளப்படியே நடக்கிறது என்ற மனோபாவத்தை வளர்த்துக்கொள்ளுங்கள்."
      },
      {
        quote_english: "Service to man is service to God.",
        quote_tamil: "மனிதனுக்கு செய்யும் சேவையே இறைவனுக்கு செய்யும் சேவை."
      },
      {
        quote_english: "A contented man is truly wealthy.",
        quote_tamil: "திருப்தியுள்ளவனே உண்மையான செல்வந்தன்."
      }
    ]
  };

  // Helper to load limits from localStorage scoped by member/user
  function getLimitData(identifier) {
    const key = `sspk_quote_limit_${identifier}`;
    const today = new Date().toISOString().split('T')[0];
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(key));
    } catch (e) {
      console.error('Failed to parse quote limit data', e);
    }
    if (!data || data.date !== today) {
      data = { date: today, sai_count: 0, periyava_count: 0 };
      localStorage.setItem(key, JSON.stringify(data));
    }
    return data;
  }

  // Helper to update limits in localStorage and UI
  function updateLimitData(identifier, data) {
    const key = `sspk_quote_limit_${identifier}`;
    localStorage.setItem(key, JSON.stringify(data));
    renderLimitUI(identifier);
  }

  // Helper to update buttons and remaining text in UI
  function renderLimitUI(identifier) {
    const data = getLimitData(identifier);
    
    // Swami limit
    const remainingSai = Math.max(0, 1 - data.sai_count);
    if (saiLimitText) saiLimitText.textContent = `Remaining today: ${remainingSai}`;
    if (getSaiQuoteBtn) {
      if (remainingSai === 0) {
        getSaiQuoteBtn.disabled = true;
        getSaiQuoteBtn.textContent = "Limit reached for today";
        getSaiQuoteBtn.style.opacity = "0.6";
        getSaiQuoteBtn.style.cursor = "not-allowed";
      } else {
        getSaiQuoteBtn.disabled = false;
        getSaiQuoteBtn.textContent = "Get your day message from Swami";
        getSaiQuoteBtn.style.opacity = "1";
        getSaiQuoteBtn.style.cursor = "pointer";
      }
    }

    // Periyava limit
    const remainingPeriyava = Math.max(0, 1 - data.periyava_count);
    if (periyavaLimitText) periyavaLimitText.textContent = `Remaining today: ${remainingPeriyava}`;
    if (getPeriyavaQuoteBtn) {
      if (remainingPeriyava === 0) {
        getPeriyavaQuoteBtn.disabled = true;
        getPeriyavaQuoteBtn.textContent = "Limit reached for today";
        getPeriyavaQuoteBtn.style.opacity = "0.6";
        getPeriyavaQuoteBtn.style.cursor = "not-allowed";
      } else {
        getPeriyavaQuoteBtn.disabled = false;
        getPeriyavaQuoteBtn.textContent = "Get your day message from Periyava";
        getPeriyavaQuoteBtn.style.opacity = "1";
        getPeriyavaQuoteBtn.style.cursor = "pointer";
      }
    }
  }

  // Expose function globally
  window.initQuoteLimits = function(identifier) {
    renderLimitUI(identifier);
  };

  async function fetchQuotes() {
    const CACHE_KEY = 'sspk_quotes_cache';
    try {
      // 1. Check local cache (expires after 24h)
      const cachedStr = localStorage.getItem(CACHE_KEY);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (cached && cached.timestamp && (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000)) {
          cachedQuotes.sai = cached.data.filter(q => q.guru === 'sai');
          cachedQuotes.periyava = cached.data.filter(q => q.guru === 'periyava');
          console.log(`Loaded ${cachedQuotes.sai.length} Sai and ${cachedQuotes.periyava.length} Periyava quotes from local cache.`);
          return; // Skip network request
        }
      }

      // 2. Fetch from database if cache is missing or expired
      const { data, error } = await supabase
        .from('quotes')
        .select('guru, quote_english, quote_tamil');
      
      if (error) throw error;

      if (data && data.length > 0) {
        cachedQuotes.sai = data.filter(q => q.guru === 'sai');
        cachedQuotes.periyava = data.filter(q => q.guru === 'periyava');
        console.log(`Loaded ${cachedQuotes.sai.length} Sai and ${cachedQuotes.periyava.length} Periyava quotes from DB.`);
        
        // Save to cache
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          timestamp: Date.now(),
          data: data
        }));
      }
    } catch (err) {
      console.warn('Failed to load quotes from Supabase quotes table, using fallback:', err.message);
    }
  }

  function displayRandomQuote(guru) {
    const session = JSON.parse(localStorage.getItem('sspk_session'));
    if (!session || !session.identifier) return;

    const data = getLimitData(session.identifier);
    const countKey = guru === 'sai' ? 'sai_count' : 'periyava_count';

    if (data[countKey] >= 1) {
      renderLimitUI(session.identifier);
      return;
    }

    const list = (cachedQuotes[guru] && cachedQuotes[guru].length > 0) 
      ? cachedQuotes[guru] 
      : fallbackQuotes[guru];
      
    const randomIdx = Math.floor(Math.random() * list.length);
    const item = list[randomIdx];

    if (quoteDisplayBox && quoteEnglish && quoteTamil && quoteSource) {
      quoteDisplayBox.classList.add('hidden');
      setTimeout(() => {
        quoteEnglish.textContent = `"${item.quote_english}"`;
        quoteTamil.textContent = `தமிழ் அர்த்தம்: ${item.quote_tamil}`;
        quoteSource.textContent = guru === 'sai' ? '— Sathya Sai Baba' : '— Maha Periyava';
        
        quoteDisplayBox.classList.remove('hidden');
        quoteDisplayBox.style.animation = 'none';
        void quoteDisplayBox.offsetWidth; // Trigger reflow
        quoteDisplayBox.style.animation = 'fadeIn 0.4s ease';

        // Increment count and update
        data[countKey] += 1;
        updateLimitData(session.identifier, data);
      }, 100);
    }
  }

  getSaiQuoteBtn?.addEventListener('click', () => displayRandomQuote('sai'));
  getPeriyavaQuoteBtn?.addEventListener('click', () => displayRandomQuote('periyava'));

  // Run quotes setup
  fetchQuotes();

  // ── BFCache fix: expose re-init hook so pageshow event can restore dashboard ──
  window._sspkReinit = () => {
    checkAuthState();
  };

}

// ══════════════════════════════════════════════════════════════════════════
// WEEKLY MESSAGES (DISCOURSE) ADMIN
// ══════════════════════════════════════════════════════════════════════════
const WEEKLY_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const WEEKLY_THUMB_MAX_BYTES = 5 * 1024 * 1024;

async function initWeeklyMessagesAdmin() {
  const form = document.getElementById('weeklyMessageForm');
  const listEl = document.getElementById('weeklyMessageList');
  const statusEl = document.getElementById('weeklyStatus');
  const showBtn = document.getElementById('showAddWeeklyBtn');
  const cancelBtn = document.getElementById('cancelWeeklyBtn');
  const mediaTypeEl = document.getElementById('wmMediaType');
  const fileWrap = document.getElementById('wmFileWrap');
  const textWrap = document.getElementById('wmTextWrap');
  const linkWrap = document.getElementById('wmLinkWrap');
  const thumbFileEl = document.getElementById('wmThumbnailFile');
  const thumbPreviewEl = document.getElementById('wmThumbnailPreview');
  const thumbPreviewWrap = document.getElementById('wmThumbnailPreviewWrap');
  const thumbRemoveBtn = document.getElementById('wmThumbnailRemove');
  const thumbUrlEl = document.getElementById('wmThumbnail');
  let thumbPreviewUrl = null;
  let thumbRemoveRequested = false;
  if (!form || !listEl) return;

  let editingId = null;

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#d9534f' : 'var(--accent-dark)';
  }

  function resetThumbUpload() {
    if (thumbFileEl) thumbFileEl.value = '';
    if (thumbPreviewUrl) { URL.revokeObjectURL(thumbPreviewUrl); thumbPreviewUrl = null; }
    if (thumbPreviewEl) thumbPreviewEl.src = '';
    if (thumbPreviewWrap) thumbPreviewWrap.style.display = 'none';
    thumbRemoveRequested = false;
  }

  function showThumbPreview() {
    const f = thumbFileEl && thumbFileEl.files && thumbFileEl.files[0];
    if (!f) return;
    if (f.type !== 'image/jpeg' && f.type !== 'image/png') {
      setStatus('Thumbnail must be a JPEG or PNG image.', true);
      resetThumbUpload();
      return;
    }
    if (f.size > WEEKLY_THUMB_MAX_BYTES) {
      setStatus('Thumbnail is larger than 5MB.', true);
      resetThumbUpload();
      return;
    }
    if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
    thumbPreviewUrl = URL.createObjectURL(f);
    if (thumbPreviewEl) thumbPreviewEl.src = thumbPreviewUrl;
    if (thumbPreviewWrap) thumbPreviewWrap.style.display = 'flex';
    thumbRemoveRequested = false;
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session ? data.session.access_token : null;
  }

  async function api(path, method, body) {
    const token = await getToken();
    if (!token) throw new Error('Not signed in. Please sign in again.');
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || (data.errors && data.errors.join(', ')) || ('Request failed (' + res.status + ')');
      throw new Error(msg);
    }
    return data;
  }

  function toggleMode() {
    const t = mediaTypeEl.value;
    if (fileWrap) fileWrap.style.display = (t === 'text') ? 'none' : '';
    if (textWrap) textWrap.classList.toggle('hidden', t !== 'text');
    if (linkWrap) linkWrap.style.display = (t === 'text') ? 'none' : '';
  }

  async function loadMessages() {
    listEl.innerHTML = '<p style="color:var(--muted); font-size:13px;">Loading…</p>';
    try {
      const { data, error } = await supabase
        .from('weekly_messages')
        .select('*')
        .order('date', { ascending: false });
      if (error) throw error;
      const messages = data || [];
      if (messages.length === 0) {
        listEl.innerHTML = '<p style="color:var(--muted); font-size:13px;">No weekly messages yet.</p>';
        return;
      }
      listEl.innerHTML = messages.map((m) =>
        '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px; border:1px solid var(--border); border-radius:6px; background:var(--surface);">' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-weight:600; color:var(--accent-dark);">' + escapeHtml(m.title) + '</div>' +
            '<div style="font-size:12px; color:var(--muted);">' + escapeHtml(m.date) + ' &bull; ' + escapeHtml(m.media_type) +
              (m.category ? ' &bull; ' + escapeHtml(m.category) : '') + '</div>' +
          '</div>' +
          '<div style="display:flex; gap:8px;">' +
            '<button class="btn btn-outline" data-wm-edit="' + m.id + '" style="padding:4px 12px; font-size:12px;">Edit</button>' +
            '<button class="btn" data-wm-delete="' + m.id + '" style="padding:4px 12px; font-size:12px; background:#d9534f; border-color:#d9534f; color:#fff; cursor:pointer;">Delete</button>' +
          '</div>' +
        '</div>'
      ).join('');

      listEl.querySelectorAll('[data-wm-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = messages.find((x) => x.id === btn.getAttribute('data-wm-edit'));
          if (m) editMessage(m);
        });
      });
      listEl.querySelectorAll('[data-wm-delete]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-wm-delete');
          if (window.confirm('Delete this weekly message? The copy in the archive channel remains.')) deleteMessage(id);
        });
      });
    } catch (e) {
      listEl.innerHTML = '<p style="color:#d9534f; font-size:13px;">Failed to load: ' + escapeHtml(e.message) + '</p>';
    }
  }

  function openForm() {
    form.classList.remove('hidden');
    if (showBtn) showBtn.classList.add('hidden');
    toggleMode();
  }

  function closeForm() {
    form.reset();
    resetThumbUpload();
    editingId = null;
    document.getElementById('wmId').value = '';
    form.classList.add('hidden');
    if (showBtn) showBtn.classList.remove('hidden');
  }

  function editMessage(m) {
    editingId = m.id;
    document.getElementById('wmId').value = m.id;
    document.getElementById('wmTitle').value = m.title || '';
    document.getElementById('wmDate').value = m.date || '';
    document.getElementById('wmMediaType').value = m.media_type || 'audio';
    document.getElementById('wmDescription').value = m.description || '';
    document.getElementById('wmText').value = (m.media_type === 'text') ? (m.description || '') : '';
    document.getElementById('wmCategory').value = m.category || '';
    document.getElementById('wmLanguage').value = m.language || '';
    document.getElementById('wmDuration').value = m.duration || '';
    document.getElementById('wmThumbnail').value = m.thumbnail_url || '';
    document.getElementById('wmTelegramLink').value = '';
    resetThumbUpload();
    openForm();
    form.scrollIntoView({ behavior: 'smooth' });
  }

  async function deleteMessage(id) {
    setStatus('Deleting…');
    try {
      await api('/api/weekly-messages', 'DELETE', { id });
      setStatus('Deleted.');
      await loadMessages();
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const base = {
      title: document.getElementById('wmTitle').value.trim(),
      date: document.getElementById('wmDate').value,
      media_type: mediaTypeEl.value,
      description: document.getElementById('wmDescription').value.trim(),
      category: document.getElementById('wmCategory').value.trim(),
      language: document.getElementById('wmLanguage').value.trim(),
      duration: document.getElementById('wmDuration').value.trim(),
      thumbnail_url: document.getElementById('wmThumbnail').value.trim()
    };
    if (!base.title || !base.date) { setStatus('Title and date are required.', true); return; }

    const thumbFile = thumbFileEl && thumbFileEl.files && thumbFileEl.files[0];

    try {
      if (editingId) {
        if (thumbFile) {
          setStatus('Saving…');
          const fd = new FormData();
          Object.keys(base).forEach((k) => fd.append(k, base[k]));
          fd.append('id', editingId);
          fd.append('thumbnail', thumbFile, thumbFile.name);
          const token = await getToken();
          if (!token) throw new Error('Not signed in. Please sign in again.');
          const res = await fetch('/api/weekly-messages', {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = data.error || (data.errors && data.errors.join(', ')) || ('Save failed (' + res.status + ')');
            throw new Error(msg);
          }
        } else if (thumbRemoveRequested) {
          setStatus('Saving…');
          await api('/api/weekly-messages', 'PATCH', { id: editingId, thumbnail_url: null });
        } else {
          setStatus('Saving…');
          await api('/api/weekly-messages', 'PATCH', { id: editingId, ...base });
        }
        setStatus('Saved.');
        closeForm();
        await loadMessages();
        return;
      }

      const fileInput = document.getElementById('wmFile');
      const file = fileInput && fileInput.files && fileInput.files[0];
      const telegramLink = document.getElementById('wmTelegramLink').value.trim();
      const text = document.getElementById('wmText').value.trim();

      if (base.media_type === 'text') {
        if (!text) { setStatus('Discourse text is required for text messages.', true); return; }
        setStatus('Publishing text…');
        await api('/api/telegram-upload', 'POST', { ...base, text });
      } else if (file) {
        if (file.size > WEEKLY_UPLOAD_MAX_BYTES) {
          setStatus('File is larger than 50MB. Post it to the channel directly and use the message-link option instead.', true);
          return;
        }
        setStatus('Uploading…');
        const fd = new FormData();
        Object.keys(base).forEach((k) => fd.append(k, base[k]));
        fd.append('file', file, file.name);
        if (thumbFile) fd.append('thumbnail', thumbFile, thumbFile.name);
        const token = await getToken();
        if (!token) throw new Error('Not signed in. Please sign in again.');
        const res = await fetch('/api/telegram-upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: fd
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data.error || (data.errors && data.errors.join(', ')) || ('Upload failed (' + res.status + ')');
          throw new Error(msg);
        }
      } else if (telegramLink) {
        if (thumbFile) {
          setStatus('Creating from link…');
          const fd = new FormData();
          Object.keys(base).forEach((k) => fd.append(k, base[k]));
          fd.append('telegram_link', telegramLink);
          fd.append('thumbnail', thumbFile, thumbFile.name);
          const token = await getToken();
          if (!token) throw new Error('Not signed in. Please sign in again.');
          const res = await fetch('/api/weekly-messages', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = data.error || (data.errors && data.errors.join(', ')) || ('Create failed (' + res.status + ')');
            throw new Error(msg);
          }
        } else {
          setStatus('Creating from link…');
          await api('/api/weekly-messages', 'POST', { ...base, telegram_link: telegramLink });
        }
      } else {
        setStatus('Add a file, paste discourse text (text mode), or paste a channel message link.', true);
        return;
      }

      setStatus('Created.');
      closeForm();
      await loadMessages();
    } catch (err) {
      setStatus(err.message || 'Failed.', true);
    }
  });

  if (showBtn) showBtn.addEventListener('click', openForm);
  if (cancelBtn) cancelBtn.addEventListener('click', closeForm);
  if (mediaTypeEl) mediaTypeEl.addEventListener('change', toggleMode);

  if (thumbFileEl) thumbFileEl.addEventListener('change', showThumbPreview);
  if (thumbRemoveBtn) thumbRemoveBtn.addEventListener('click', function() {
    resetThumbUpload();
    thumbRemoveRequested = true;
    if (thumbUrlEl) thumbUrlEl.value = '';
  });
  if (thumbUrlEl) thumbUrlEl.addEventListener('input', function() {
    if (thumbUrlEl.value.trim() !== '') thumbRemoveRequested = false;
  });

  await loadMessages();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
  document.addEventListener('DOMContentLoaded', initWeeklyMessagesAdmin);
} else {
  initDashboard();
  initWeeklyMessagesAdmin();
}

// ── Bfcache back-navigation fix ────────────────────────────────────────────────
// When the user navigates Back from Events/Gallery, the browser may restore
// this page from bfcache without firing DOMContentLoaded, leaving all views
// hidden. The pageshow event ALWAYS fires, and persisted=true means bfcache.
window.addEventListener('pageshow', (e) => {
  if (e.persisted && typeof window._sspkReinit === 'function') {
    // Small delay to let Supabase JS finish hydrating its internal state
    setTimeout(window._sspkReinit, 50);
  }
});
