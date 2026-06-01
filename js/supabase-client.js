// supabase-client.js
// Shared Supabase client instance for the entire project.
//
// The anon key is safe to expose — Row Level Security (RLS) enforces access control.
// Get credentials from: https://supabase.com/dashboard/project/_/settings/api

const DEFAULT_SUPABASE_URL     = 'https://zkzotagctwqthxypczej.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprem90YWdjdHdxdGh4eXBjemVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMjc3NzMsImV4cCI6MjA5NTcwMzc3M30.8xL23N-3MfbrXOA-ljsOnFy_LIDKCSxbYfHRzvMqCak';

// ── Initialise immediately with hardcoded defaults (zero latency) ──────────────
// This ensures supabase is available the moment this script loads.
var supabase = window.supabase.createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storageKey: 'sspk-auth',
    detectSessionInUrl: true
  }
});

// ── Async background re-init from /api/config (non-blocking) ──────────────────
// Previously this was a SYNCHRONOUS XHR that froze the main thread.
// Now it runs asynchronously — if /api/config returns different credentials,
// the client is re-created. dashboard-app.js calls initAuthState() on
// DOMContentLoaded, which fires after this fetch completes in practice.
(async () => {
  try {
    const res = await fetch('/api/config', { cache: 'force-cache' });
    if (res.ok) {
      const data = await res.json();
      if (data.SUPABASE_URL && data.SUPABASE_ANON_KEY) {
        const newUrl = data.SUPABASE_URL.trim();
        const newKey = data.SUPABASE_ANON_KEY.trim();
        if (newUrl && newKey && (newUrl !== DEFAULT_SUPABASE_URL || newKey !== DEFAULT_SUPABASE_ANON_KEY)) {
          supabase = window.supabase.createClient(newUrl, newKey, {
            auth: { persistSession: true, storageKey: 'sspk-auth', detectSessionInUrl: true }
          });
          console.log('Supabase client re-configured from /api/config');
        }
      }
    }
  } catch (e) {
    // /api/config not available — default credentials are already active, no action needed.
  }
})();
