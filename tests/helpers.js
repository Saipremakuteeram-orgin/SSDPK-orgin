// Test setup helper
export function setupDOM(html = '<html><body></body></html>') {
  // Add matchMedia if missing (jsdom doesn't have it by default)
  if (!window.matchMedia) {
    window.matchMedia = window.matchMedia || function(query) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: function() {},
        removeListener: function() {},
        addEventListener: function() {},
        removeEventListener: function() {},
        dispatchEvent: function() { return false; },
      };
    };
  }

  document.documentElement.innerHTML = '';
  document.head.innerHTML = '';
  document.body.innerHTML = '';

  const doc = document.open();
  doc.write(html);
  doc.close();

  // Add CSS custom properties
  document.documentElement.style.setProperty('--accent', '#40a940');
  document.documentElement.style.setProperty('--fg', '#1a1a1a');
  document.documentElement.style.setProperty('--muted', '#666666');
  document.documentElement.style.setProperty('--surface', '#ffffff');
  document.documentElement.style.setProperty('--border', '#e0e0e0');
  document.documentElement.style.setProperty('--shadow-sm', '0 1px 3px rgba(0,0,0,0.1)');
  document.documentElement.style.setProperty('--shadow-md', '0 4px 6px rgba(0,0,0,0.1)');
  document.documentElement.style.setProperty('--radius-sm', '4px');
  document.documentElement.style.setProperty('--radius-md', '8px');
  document.documentElement.style.setProperty('--font-body', 'Arial, sans-serif');
  document.documentElement.style.setProperty('--font-sacred', 'Arial, sans-serif');
  document.documentElement.style.setProperty('--accent-light', '#e8f5e8');
  document.documentElement.style.setProperty('--accent-dark', '#2e7d32');
  document.documentElement.style.setProperty('--danger', '#dc2626');
}

// Mock localStorage
export function mockLocalStorage(data = {}) {
  const store = { ...data };
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

// Mock fetch
export function mockFetch(responses = {}) {
  const defaultResponse = {
    ok: true,
    json: async () => ({}),
  };

  return (url) => {
    if (responses[url]) {
      return Promise.resolve({
        ok: responses[url].ok !== false,
        json: async () => responses[url].data || responses[url],
      });
    }
    return Promise.resolve(defaultResponse);
  };
}
