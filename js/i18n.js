// Sathya Sai Prema Kuteeram — Internationalization (i18n) Module
(function() {
  'use strict';

  const DEFAULT_LANG = 'en';
  const SUPPORTED_LANGS = ['en', 'ta', 'hi', 'te', 'kn', 'ml'];

  let currentLang = null;
  let translations = {};

  const LANG_FLAGS = {
    'en': '🇬🇧',
    'ta': '🇮🇳',
    'hi': '🇮🇳',
    'te': '🇮🇳',
    'kn': '🇮🇳',
    'ml': '🇮🇳'
  };

  const LANG_NAMES = {
    'en': 'English',
    'ta': 'தமிழ்',
    'hi': 'हिन्दी',
    'te': 'తెలుగు',
    'kn': 'ಕನ್ನಡ',
    'ml': 'മലയാളം'
  };

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
    } else {
      const browserLang = navigator.language || navigator.userLanguage || '';
      const browserLangCode = browserLang.toLowerCase().split('-')[0];
      if (SUPPORTED_LANGS.includes(browserLangCode)) {
        lang = browserLangCode;
      }
    }
    return lang;
  }

  async function loadTranslations(lang) {
    try {
      const response = await fetch('/i18n/' + lang + '.json');
      if (!response.ok) {
        if (lang !== DEFAULT_LANG) {
          console.warn('Failed to load ' + lang + '.json, falling back to English');
          await loadTranslations(DEFAULT_LANG);
          return;
        }
        throw new Error('Failed to load translations for language: ' + lang);
      }
      translations = await response.json();
      localStorage.setItem('sspk_lang', lang);
    } catch (error) {
      console.error('Error loading translations:', error);
    }
  }

  function applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(function(element) {
      const key = element.getAttribute('data-i18n');
      const translation = getNestedProperty(translations, key);
      if (translation) {
        if (element.tagName === 'INPUT' && element.getAttribute('placeholder') !== null) {
          element.setAttribute('placeholder', translation);
        } else if (element.tagName === 'TEXTAREA') {
          element.textContent = translation;
        } else {
          element.textContent = translation;
        }
      } else {
        console.warn('Missing translation for key: ' + key);
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
    currentLang = lang;
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('sspk_lang', lang);
    await loadTranslations(lang);
    applyTranslations();
    const url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    history.replaceState({}, '', url);
  }

  function createLanguageSwitcher() {
    const existingSwitcher = document.getElementById('langSwitcher');
    if (existingSwitcher) {
      existingSwitcher.remove();
    }

    const style = document.createElement('style');
    style.textContent = `
      .language-switcher {
        position: absolute;
        right: 80px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 1000;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: 6px 10px;
        backdrop-filter: blur(10px);
        box-shadow: var(--shadow-sm);
        transition: all 0.3s ease;
      }
      .language-switcher:hover {
        box-shadow: var(--shadow-md);
        border-color: var(--accent);
      }
      .lang-select {
        background: transparent;
        border: none;
        color: var(--fg);
        font-family: var(--font-body);
        font-size: 14px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        appearance: none;
        outline: none;
        background-image: url('data:image/svg+xml;utf8,<svg fill="%23a1a1a1" height="20" width="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>');
        background-repeat: no-repeat;
        background-position: right 8px center;
        background-size: 12px;
        min-width: 120px;
      }
      .lang-select option {
        background: var(--surface);
        color: var(--fg);
        padding: 8px;
      }
      .lang-select:hover, .lang-select:focus {
        background-color: var(--accent-light);
        color: var(--accent-dark);
      }
      @media (max-width: 768px) {
        .language-switcher {
          position: static;
          transform: none;
          margin-top: 8px;
          width: 100%;
          background: transparent;
          border: none;
          box-shadow: none;
          padding: 0;
        }
        .lang-select {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);

    const switcher = document.createElement('div');
    switcher.id = 'langSwitcher';
    switcher.className = 'language-switcher';

    const select = document.createElement('select');
    select.className = 'lang-select';

    SUPPORTED_LANGS.forEach(function(lang) {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = LANG_FLAGS[lang] + ' ' + LANG_NAMES[lang];
      if (lang === currentLang) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener('change', function(e) {
      setLanguage(e.target.value);
    });

    switcher.appendChild(select);

    const navbar = document.querySelector('nav .container');
    if (navbar) {
      navbar.appendChild(switcher);
    }
  }

  function initUserTranslationWidget() {
    const translateWidget = document.getElementById('translateWidget');
    if (!translateWidget) return;

    const translateBtn = translateWidget.querySelector('#translateBtn');
    const translateInput = translateWidget.querySelector('#translateInput');
    const translateResult = translateWidget.querySelector('#translateResult');

    if (!translateBtn || !translateInput) return;

    translateBtn.addEventListener('click', async function() {
      const text = translateInput.value.trim();
      if (!text) return;

      translateBtn.disabled = true;
      translateBtn.textContent = 'Translating...';

      try {
        const translation = await translateToTamil(text);
        translateResult.textContent = translation;
        translateResult.classList.remove('hidden');
      } catch (error) {
        translateResult.textContent = 'Translation unavailable';
        translateResult.classList.remove('hidden');
        console.error('Translation error:', error);
      } finally {
        translateBtn.disabled = false;
        translateBtn.textContent = 'Translate';
      }
    });
  }

  async function translateToTamil(text) {
    const apiUrl = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|ta';
    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data.responseStatus === 200) {
        return data.responseData.translatedText;
      } else {
        throw new Error('Translation API error');
      }
    } catch (error) {
      console.error('MyMemory API error:', error);
      throw error;
    }
  }

  function updateChatbotMessages() {
    if (!window.chatbotTranslations) {
      window.chatbotTranslations = translations.chatbot || {};
    }
    const chatbotElements = document.querySelectorAll('[data-chatbot-i18n]');
    chatbotElements.forEach(function(element) {
      const key = element.getAttribute('data-chatbot-i18n');
      const translation = window.chatbotTranslations[key];
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

  async function initI18n() {
    if (currentLang) return;
    currentLang = detectLanguage();
    await loadTranslations(currentLang);
    applyTranslations();
    document.documentElement.setAttribute('lang', currentLang);
    createLanguageSwitcher();
    initUserTranslationWidget();
  }

  window.i18n = {
    init: initI18n,
    setLanguage: setLanguage,
    getLanguage: function() { return currentLang; },
    t: function(key) { return getNestedProperty(translations, key) || key; },
    SUPPORTED_LANGS: SUPPORTED_LANGS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
  } else {
    initI18n();
  }
})();