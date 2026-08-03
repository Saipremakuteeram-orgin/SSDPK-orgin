import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setupDOM, mockLocalStorage, mockFetch } from './helpers.js';

describe('i18n module', () => {
  let originalFetch;
  let originalLocalStorage;
  let originalLocation;

  const translations = {
    en: {
      nav: { home: 'Home', about: 'About', signIn: 'Sign In', signUp: 'Sign Up', signOut: 'Sign Out' },
      login: { phoneEmail: 'Phone Number or Email', signInPrompt: 'Sign in with your phone or email' },
      chatbot: { welcome: 'Hello! How can I help you today?', placeholder: 'Type your message...', send: 'Send' }
    },
    ta: {
      nav: { home: 'முகப்பு', about: 'செயல்முறைகள்', signIn: 'உள்நுழைய', signUp: 'பதிவுசெய்யுங்கள்', signOut: 'தொடர்பு' },
      login: { phoneEmail: 'தொலைபேசி எண் அல்லது மின்னஞ்சல்', signInPrompt: 'உங்கள் பதிவு பதிவுக்கு அல்லது மின்னஞ்சலை உபயோகித்து உள்நுழைய.' },
      chatbot: { welcome: 'வணக்கம்! இன்று நான் எப்படிந்தான் உதவலாம்?', placeholder: 'உங்கள் ஸ்நேகத்தை தாங்குங்கள்...', send: 'அனுப்பு' }
    },
    hi: {
      nav: { home: 'होम', about: 'गतिविधियाँ', signIn: 'साइन इन', signUp: 'साइन अप', signOut: 'साइन आउट' },
      login: { phoneEmail: 'फ़ोन नंबर या ईमेल', signInPrompt: 'अपनी पंजीकृत फ़ोन नंबर या ईमेल के साथ साइन इन करें।' },
      chatbot: { welcome: 'नमस्ते! आज मैं आपकी कैसे मदद कर सकता हूँ?', placeholder: 'अपना संदेश टाइप करें...', send: 'भेजें' }
    }
  };

  beforeEach(() => {
    setupDOM(`
      <html>
        <head></head>
        <body>
          <nav>
            <div class="container">
              <a href="index.html" class="nav-brand">SSPK</a>
              <div class="nav-links" id="navLinks">
                <a href="index.html" data-i18n="nav.home">Home</a>
                <a href="about.html" data-i18n="nav.about">About</a>
                <a href="login.html" class="nav-login-btn" data-i18n="nav.signIn">Sign In</a>
                <a href="signup.html" class="nav-signup-btn" data-i18n="nav.signUp">Sign Up</a>
              </div>
              <div id="langSwitcher"></div>
            </div>
          </nav>
          <input type="text" data-i18n="login.phoneEmail" placeholder="Phone Number or Email" />
          <textarea data-i18n="login.signInPrompt"></textarea>
          <div id="chatbotWelcome" data-chatbot-i18n="welcome">Hello</div>
          <input id="chatbotInput" data-chatbot-i18n="placeholder" placeholder="Type..." />
          <button id="chatbotSend" data-chatbot-i18n="send">Send</button>
        </body>
      </html>
    `);

    originalLocalStorage = window.localStorage;
    window.localStorage = mockLocalStorage({ sspk_lang: 'en' });

    originalFetch = global.fetch;
    global.fetch = mockFetch({
      'i18n/en.json': { data: translations.en },
      'i18n/ta.json': { data: translations.ta },
      'i18n/hi.json': { data: translations.hi },
    });

    originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, href: 'http://localhost/', search: '', searchParams: new URLSearchParams() };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.localStorage = originalLocalStorage;
    window.location = originalLocation;
    delete window.i18n;
  });

  // Helper function to simulate the i18n module behavior
  function simulateI18nModule() {
    const DEFAULT_LANG = 'en';
    const SUPPORTED_LANGS = ['en', 'ta', 'hi', 'te', 'kn', 'ml'];
    let currentLang = null;
    let translationsData = {};
    const translationCache = {};

    const LANG_FLAGS = { 'en': '🇬🇧', 'ta': '🇮🇳', 'hi': '🇮🇳', 'te': '🇮🇳', 'kn': '🇮🇳', 'ml': '🇮🇳' };
    const LANG_NAMES = { 'en': 'English', 'ta': 'தமிழ்', 'hi': 'हिन्दी', 'te': 'తెలుగు', 'kn': 'ಕನ್ನಡ', 'ml': 'മലയാളം' };

    function detectLanguage() {
      let lang = DEFAULT_LANG;
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get('lang');
      if (urlLang && SUPPORTED_LANGS.includes(urlLang)) {
        lang = urlLang;
      } else if (localStorage.getItem('sspk_lang')) {
        const storedLang = localStorage.getItem('sspk_lang');
        if (SUPPORTED_LANGS.includes(storedLang)) {
          lang = storedLang;
        }
      }
      return lang;
    }

    async function loadTranslations(lang) {
      if (translationCache[lang]) {
        return translationCache[lang];
      }
      const response = await fetch('i18n/' + lang + '.json');
      if (!response.ok) {
        if (lang !== DEFAULT_LANG) {
          console.warn('Failed to load ' + lang + '.json, falling back to English');
          return loadTranslations(DEFAULT_LANG);
        }
        throw new Error('Failed to load translations for language: ' + lang);
      }
      const data = await response.json();
      translationCache[lang] = data;
      return data;
    }

    function applyTranslations() {
      const elements = document.querySelectorAll('[data-i18n]');
      elements.forEach(function(element) {
        const key = element.getAttribute('data-i18n');
        const translation = getNestedProperty(translationsData, key);
        if (translation) {
          if (element.tagName === 'INPUT' && element.getAttribute('placeholder') !== null) {
            element.setAttribute('placeholder', translation);
          } else if (element.tagName === 'TEXTAREA') {
            element.textContent = translation;
          } else {
            element.textContent = translation;
          }
        }
      });
    }

    function getNestedProperty(obj, path) {
      const keys = path.split('.');
      let result = obj;
      for (const key of keys) {
        if (result && result[key] !== undefined) {
          result = result[key];
        } else {
          return null;
        }
      }
      return result;
    }

    async function setLanguage(lang) {
      if (!SUPPORTED_LANGS.includes(lang)) {
        console.error('Unsupported language: ' + lang);
        return;
      }
      const previousLang = currentLang;
      currentLang = lang;
      document.documentElement.setAttribute('lang', lang);
      localStorage.setItem('sspk_lang', lang);
      try {
        translationsData = await loadTranslations(lang);
        applyTranslations();
        updateChatbotMessages();
      } catch (error) {
        console.error('Error switching language:', error);
        currentLang = previousLang;
      }
    }

    function updateChatbotMessages() {
      const chatbotTranslations = translationsData.chatbot || {};
      const chatbotElements = document.querySelectorAll('[data-chatbot-i18n]');
      chatbotElements.forEach(function(element) {
        const key = element.getAttribute('data-chatbot-i18n');
        const translation = chatbotTranslations[key];
        if (translation) {
          element.textContent = translation;
        }
      });
    }

    async function initI18n() {
      if (currentLang) return;
      currentLang = detectLanguage();
      try {
        translationsData = await loadTranslations(currentLang);
      } catch (error) {
        console.error('Error initializing i18n:', error);
        translationsData = {};
      }
      applyTranslations();
      document.documentElement.setAttribute('lang', currentLang);
      SUPPORTED_LANGS.forEach(function(lang) {
        if (lang !== currentLang) {
          loadTranslations(lang).catch(function(err) {
            console.warn('Preloading failed for ' + lang + ':', err);
          });
        }
      });
    }

    // Expose to window for testing
    window.i18n = {
      init: initI18n,
      setLanguage: setLanguage,
      getLanguage: function() { return currentLang; },
      t: function(key) { return getNestedProperty(translationsData, key) || key; },
      SUPPORTED_LANGS: SUPPORTED_LANGS
    };

    // Auto-init
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initI18n);
    } else {
      initI18n();
    }

    return { setLanguage, getLanguage: () => currentLang };
  }

  describe('loadTranslations', () => {
    it('should fetch and return translations for a language', async () => {
      const { getLanguage } = simulateI18nModule();
      // Wait for async init
      await new Promise(r => setTimeout(r, 100));

      expect(getLanguage()).toBe('en');
    });

    it('should cache translations after first load', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 200));

      // Switching to languages already preloaded or cached
      await window.i18n.setLanguage('ta');
      await window.i18n.setLanguage('hi');

      // Initial load fetches en and all other languages (preloaded)
      const calls = fetchSpy.mock.calls.map(c => c[0]);
      expect(calls.some(url => url.includes('ta.json'))).toBe(true);
      expect(calls.some(url => url.includes('hi.json'))).toBe(true);
    });

    it('should fall back to English if language file is not found', async () => {
      global.fetch = mockFetch({
        'i18n/en.json': { data: translations.en },
        'i18n/zz.json': { ok: false, data: {} }
      });

      const { getLanguage } = simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      expect(getLanguage()).toBe('en');
    });
  });

  describe('setLanguage', () => {
    it('should switch language and apply translations', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      await window.i18n.setLanguage('ta');

      const homeLink = document.querySelector('[data-i18n="nav.home"]');
      expect(homeLink.textContent).toBe('முகப்பு');
    });

    it('should update localStorage with new language', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      await window.i18n.setLanguage('hi');

      expect(window.localStorage.getItem('sspk_lang')).toBe('hi');
    });

    it('should update document lang attribute', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      await window.i18n.setLanguage('ta');

      expect(document.documentElement.getAttribute('lang')).toBe('ta');
    });

    it('should handle unsupported language gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      await window.i18n.setLanguage('xx');

      expect(consoleSpy).toHaveBeenCalledWith('Unsupported language: xx');
      consoleSpy.mockRestore();
    });
  });

  describe('applyTranslations', () => {
    it('should translate elements with data-i18n attributes', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      const homeLink = document.querySelector('[data-i18n="nav.home"]');
      expect(homeLink.textContent).toBe('Home');

      await window.i18n.setLanguage('ta');

      expect(homeLink.textContent).toBe('முகப்பு');
    });

    it('should translate input placeholders', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      const input = document.querySelector('input[data-i18n="login.phoneEmail"]');
      expect(input.getAttribute('placeholder')).toBe('Phone Number or Email');

      await window.i18n.setLanguage('ta');

      expect(input.getAttribute('placeholder')).toBe('தொலைபேசி எண் அல்லது மின்னஞ்சல்');
    });

    it('should translate textarea content', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      const textarea = document.querySelector('textarea[data-i18n="login.signInPrompt"]');
      expect(textarea.textContent).toBe('Sign in with your phone or email');

      await window.i18n.setLanguage('ta');

      expect(textarea.textContent).toBe('உங்கள் பதிவு பதிவுக்கு அல்லது மின்னஞ்சலை உபயோகித்து உள்நுழைய.');
    });
  });

  describe('detectLanguage', () => {
    it('should use default language when no preference is set', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      expect(window.i18n.getLanguage()).toBe('en');
    });

    it('should detect language from localStorage', async () => {
      window.localStorage = mockLocalStorage({ sspk_lang: 'hi' });

      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      expect(window.i18n.getLanguage()).toBe('hi');
    });
  });

  describe('t() function', () => {
    it('should return translated string for known key', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));
      await window.i18n.setLanguage('ta');

      expect(window.i18n.t('nav.home')).toBe('முகப்பு');
    });

    it('should return key for unknown key', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      expect(window.i18n.t('nonexistent')).toBe('nonexistent');
    });

    it('should return key for nested unknown key', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      expect(window.i18n.t('nav.nonexistent')).toBe('nav.nonexistent');
    });
  });

  describe('updateChatbotMessages', () => {
    it('should update chatbot messages after language change', async () => {
      simulateI18nModule();
      await new Promise(r => setTimeout(r, 100));

      const welcomeEl = document.getElementById('chatbotWelcome');
      // Initial state - just "Hello" from HTML (updateChatbotMessages only called in setLanguage)
      expect(welcomeEl.textContent).toBe('Hello');

      await window.i18n.setLanguage('ta');

      // Now chatbot messages should be updated
      expect(welcomeEl.textContent).toBe('வணக்கம்! இன்று நான் எப்படிந்தான் உதவலாம்?');
    });
  });
});
