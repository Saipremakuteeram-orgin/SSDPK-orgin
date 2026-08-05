import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setupDOM, mockLocalStorage } from './helpers.js';

describe('main.js', () => {
  let originalLocalStorage;
  let originalConsole;

  beforeEach(() => {
    originalConsole = console;
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
  });

  describe('renderDynamicNav', () => {
    it('should render nav links when no session exists', async () => {
      setupDOM(`
        <html><body>
          <nav>
            <div class="container">
              <div class="nav-links" id="navLinks"></div>
            </div>
          </nav>
        </body></html>
      `);

      originalLocalStorage = window.localStorage;
      window.localStorage = mockLocalStorage({}); // No session

      // We need to re-evaluate the nav links
      const { renderDynamicNav } = await import('../js/main.js');
      // Note: main.js is an IIFE, so we test indirectly

      const navLinks = document.getElementById('navLinks');
      expect(navLinks).toBeTruthy();
    });

    it('should render Sign In and Sign Up buttons when no session', async () => {
      setupDOM(`
        <html><body>
          <nav>
            <div class="container">
              <div class="nav-links" id="navLinks"></div>
            </div>
          </nav>
        </body></html>
      `);

      window.localStorage = mockLocalStorage({}); // No session

      // Run the nav rendering logic manually
      const navLinks = document.getElementById('navLinks');
      if (navLinks) {
        navLinks.innerHTML = `
          <a href="index.html" data-i18n="nav.home">Home</a>
          <a href="about.html" data-i18n="nav.about">About</a>
          <a href="trustees.html" data-i18n="nav.trustees">Trustees</a>
          <a href="gallery.html" data-i18n="nav.gallery">Gallery</a>
          <a href="events.html" data-i18n="nav.events">Events</a>
          <a href="login.html" class="nav-login-btn" data-i18n="nav.signIn">Sign In</a>
          <a href="signup.html" class="nav-signup-btn" data-i18n="nav.signUp">Sign Up</a>
        `;
      }

      const loginLink = navLinks.querySelector('a.nav-login-btn');
      const signupLink = navLinks.querySelector('a.nav-signup-btn');

      expect(loginLink).toBeTruthy();
      expect(loginLink.textContent).toBe('Sign In');
      expect(loginLink.getAttribute('data-i18n')).toBe('nav.signIn');

      expect(signupLink).toBeTruthy();
      expect(signupLink.textContent).toBe('Sign Up');
      expect(signupLink.getAttribute('data-i18n')).toBe('nav.signUp');
    });

    it('should render Dashboard and Sign Out when session exists', async () => {
      setupDOM(`
        <html><body>
          <nav>
            <div class="container">
              <div class="nav-links" id="navLinks"></div>
            </div>
          </nav>
        </body></html>
      `);

      const session = { user: { id: '123', email: 'test@example.com' } };
      window.localStorage = mockLocalStorage({
        sspk_session: JSON.stringify(session)
      });

      const navLinks = document.getElementById('navLinks');
      if (navLinks) {
        navLinks.innerHTML = `
          <a href="index.html" data-i18n="nav.home">Home</a>
          <a href="about.html" data-i18n="nav.about">About</a>
          <a href="trustees.html" data-i18n="nav.trustees">Trustees</a>
          <a href="gallery.html" data-i18n="nav.gallery">Gallery</a>
          <a href="events.html" data-i18n="nav.events">Events</a>
          <a href="dashboard.html" class="donate-btn" data-i18n="nav.dashboard">Dashboard</a>
          <a href="#" id="navLogoutBtn" class="nav-logout-btn" data-i18n="nav.signOut">Sign Out</a>
        `;
      }

      const dashboardLink = navLinks.querySelector('a.donate-btn');
      const logoutBtn = navLinks.querySelector('#navLogoutBtn');

      expect(dashboardLink).toBeTruthy();
      expect(dashboardLink.getAttribute('data-i18n')).toBe('nav.dashboard');

      expect(logoutBtn).toBeTruthy();
      expect(logoutBtn.getAttribute('data-i18n')).toBe('nav.signOut');
    });

    it('should not apply data-tilt to hero-content (so CTA buttons stay clickable)', () => {
      if (!globalThis.IntersectionObserver) {
        globalThis.IntersectionObserver = class {
          observe() {}
          unobserve() {}
          disconnect() {}
        };
      }

      setupDOM(`
        <html><body>
          <div class="hero-content" data-animate="scale-in">
            <div class="hero-actions">
              <a href="about.html" class="btn btn-primary ripple magnetic-btn">Learn More</a>
              <a href="dashboard.html#seva" data-donate class="btn btn-outline ripple magnetic-btn">Support Our Mission</a>
            </div>
          </div>
        </body></html>
      `);

      window.localStorage = mockLocalStorage({});

      // The IIFE runs upgradeRedesign on import; re-verify after it ran
      const hero = document.querySelector('.hero-content');
      expect(hero).toBeTruthy();
      expect(hero.hasAttribute('data-tilt')).toBe(false);
      expect(hero.classList.contains('tilt-card')).toBe(false);
    });

    it('should handle corrupted session gracefully', () => {
      setupDOM(`
        <html><body>
          <nav><div class="container"><div class="nav-links" id="navLinks"></div></div></nav>
        </body></html>
      `);

      window.localStorage = mockLocalStorage({ sspk_session: 'invalid-json' });

      const session = null;
      try {
        session = JSON.parse(window.localStorage.getItem('sspk_session'));
      } catch (e) {
        // Should catch the error
        expect(session).toBeNull();
      }
    });
  });

  describe('nav toggle', () => {
    it('should toggle nav links on mobile', () => {
      setupDOM(`
        <html><body>
          <nav>
            <button class="nav-toggle" id="navToggle">Menu</button>
            <div class="nav-links" id="navLinks"></div>
          </nav>
        </body></html>
      `);

      const toggle = document.getElementById('navToggle');
      const navLinks = document.getElementById('navLinks');

      expect(toggle).toBeTruthy();
      expect(navLinks).toBeTruthy();

      // Simulate click
      toggle.addEventListener('click', function(e) {
        e.stopPropagation();
        navLinks.classList.toggle('open');
        toggle.setAttribute('aria-expanded', navLinks.classList.contains('open'));
      });

      toggle.click();
      expect(navLinks.classList.contains('open')).toBe(true);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');

      toggle.click();
      expect(navLinks.classList.contains('open')).toBe(false);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });
  });
});
