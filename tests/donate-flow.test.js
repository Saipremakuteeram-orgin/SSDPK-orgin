import { describe, it, expect, beforeEach, vi, afterEach, beforeAll } from 'vitest';
import { setupDOM, mockLocalStorage } from './helpers.js';

describe('donate flow (login-gated Support Us)', () => {
  let originalLocalStorage;
  let originalLocation;
  let originalConsole;

  // main.js is an IIFE; import once so the delegated click handler is
  // registered and window.SSPK is populated, then reuse the reference.
  let SSPK;

  const validSession = () => JSON.stringify({
    role: 'devotee',
    identifier: 'user@example.com',
    mode: 'email',
    expiresAt: Date.now() + 3600 * 1000
  });

  beforeAll(async () => {
    setupDOM(`<html><body></body></html>`);
    await import('../js/main.js');
    SSPK = window.SSPK;
  });

  beforeEach(() => {
    originalConsole = console;
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();

    setupDOM(`
      <html><body>
        <a id="donateCard" href="seva.html" data-donate class="card">Support Us</a>
      </body></html>
    `);
    originalLocalStorage = window.localStorage;
    window.localStorage = mockLocalStorage({});

    originalLocation = window.location;
    delete window.location;
    window.location = {
      ...originalLocation,
      href: 'http://localhost/index.html',
      hash: ''
    };
  });

  afterEach(() => {
    window.localStorage = originalLocalStorage;
    window.location = originalLocation;
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
  });

  describe('isSignedIn', () => {
    it('returns false when no session exists', async () => {
            expect(SSPK.isSignedIn()).toBe(false);
    });

    it('returns true when a valid session exists', async () => {
            window.localStorage.setItem('sspk_session', validSession());
      expect(SSPK.isSignedIn()).toBe(true);
    });

    it('returns false when session is missing identifier', async () => {
            window.localStorage.setItem('sspk_session', JSON.stringify({ role: 'devotee' }));
      expect(SSPK.isSignedIn()).toBe(false);
    });

    it('returns false when session JSON is corrupted', async () => {
            window.localStorage.setItem('sspk_session', 'not-json{{');
      expect(SSPK.isSignedIn()).toBe(false);
    });
  });

  describe('donate intent helpers', () => {
    it('setDonateIntent then getDonateIntent returns true', async () => {
            expect(SSPK.getDonateIntent()).toBe(false);
      SSPK.setDonateIntent();
      expect(SSPK.getDonateIntent()).toBe(true);
    });

    it('clearDonateIntent resets the intent', async () => {
            SSPK.setDonateIntent();
      SSPK.clearDonateIntent();
      expect(SSPK.getDonateIntent()).toBe(false);
    });
  });

  describe('afterAuthURL', () => {
    it('returns dashboard.html when no intent and clears intent', async () => {
            SSPK.clearDonateIntent();
      expect(SSPK.afterAuthURL()).toBe('dashboard.html');
      expect(SSPK.getDonateIntent()).toBe(false);
    });

    it('returns seva.html when intent set, then clears it', async () => {
            SSPK.setDonateIntent();
      expect(SSPK.afterAuthURL()).toBe('seva.html');
      expect(SSPK.getDonateIntent()).toBe(false);
    });
  });

  describe('redirectAfterAuth', () => {
    it('navigates to dashboard.html without intent', async () => {
            SSPK.clearDonateIntent();
      SSPK.redirectAfterAuth();
      expect(window.location.href).toBe('dashboard.html');
    });

    it('navigates to seva.html with intent then clears it', async () => {
            SSPK.setDonateIntent();
      SSPK.redirectAfterAuth();
      expect(window.location.href).toBe('seva.html');
      expect(SSPK.getDonateIntent()).toBe(false);
    });
  });

  describe('data-donate click handler', () => {
    it('redirects directly when signed in, without setting intent or showing modal', async () => {
            window.localStorage.setItem('sspk_session', validSession());

      const card = document.getElementById('donateCard');
      card.click();

      expect(window.location.href).toBe('seva.html');
      expect(SSPK.getDonateIntent()).toBe(false);
      expect(document.getElementById('sspk-donate-modal')).toBeNull();
    });

    it('sets intent and opens modal when not signed in', async () => {
      
      const card = document.getElementById('donateCard');
      card.click();

      expect(SSPK.getDonateIntent()).toBe(true);
      expect(document.getElementById('sspk-donate-modal')).not.toBeNull();
      expect(window.location.href).toBe('http://localhost/index.html');
    });

    it('does nothing when clicking a non-donate element', () => {
      const original = window.location.href;

      // No [data-donate] element targeted; preventDefault not invoked
      expect(window.location.href).toBe(original);
    });
  });

  describe('openDonateModal', () => {
    it('creates modal with Sign In and Register actions', async () => {
            SSPK.openDonateModal();

      const modal = document.getElementById('sspk-donate-modal');
      expect(modal).not.toBeNull();
      const signInLink = modal.querySelector('a[href="login.html"]');
      const signUpLink = modal.querySelector('a[href="signup.html"]');
      expect(signInLink).toBeTruthy();
      expect(signUpLink).toBeTruthy();
    });

    it('close button hides the modal', async () => {
            SSPK.openDonateModal();

      let modal = document.getElementById('sspk-donate-modal');
      const closeBtn = modal.querySelector('.sspk-modal-close');
      closeBtn.click();
      expect(modal.style.display).toBe('none');

      // Reopening restores visibility
      SSPK.openDonateModal();
      modal = document.getElementById('sspk-donate-modal');
      expect(modal.style.display).toBe('flex');
    });

    it('backdrop click hides the modal', async () => {
            SSPK.openDonateModal();

      const modal = document.getElementById('sspk-donate-modal');
      modal.click();
      expect(modal.style.display).toBe('none');
    });

    it('Escape key hides the modal', async () => {
            SSPK.openDonateModal();

      const modal = document.getElementById('sspk-donate-modal');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(modal.style.display).toBe('none');
    });
  });
});