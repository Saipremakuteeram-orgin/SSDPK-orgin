// Sathya Sai Prema Kuteeram — Internationalization (i18n) Module
(function() {
  'use strict';

  const DEFAULT_LANG = 'en';
  const SUPPORTED_LANGS = ['en', 'ta', 'hi', 'te', 'kn', 'ml'];

  let currentLang = null;
  let translations = {};
  const translationCache = {};

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
    if (translationCache[lang]) {
      return translationCache[lang];
    }
    const response = await fetch('/i18n/' + lang + '.json');
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
    const previousLang = currentLang;
    currentLang = lang;
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('sspk_lang', lang);
    try {
      translations = await loadTranslations(lang);
      applyTranslations();
      updateChatbotMessages();
    } catch (error) {
      console.error('Error switching language:', error);
      currentLang = previousLang;
      document.documentElement.setAttribute('lang', previousLang);
      localStorage.setItem('sspk_lang', previousLang);
    }
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
        display: flex;
        align-items: center;
        flex: 0 0 auto;
        order: 10;
        z-index: 1000;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: 2px 6px;
        backdrop-filter: blur(10px);
        box-shadow: var(--shadow-sm);
        transition: all 0.3s ease;
        opacity: 1;
        transform: scale(1);
      }
      .language-switcher:hover {
        box-shadow: var(--shadow-md);
        border-color: var(--accent);
        transform: scale(1.03);
      }
      .language-switcher.switching {
        transform: scale(0.95);
        opacity: 0.7;
        box-shadow: 0 0 12px oklch(58% 0.16 50 / 0.4);
      }
      .lang-select {
        background: transparent;
        border: none;
        color: var(--fg);
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        appearance: none;
        outline: none;
        background-image: url('data:image/svg+xml;utf8,<svg fill="%23a1a1a1" height="20" width="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>');
        background-repeat: no-repeat;
        background-position: right 4px center;
        background-size: 10px;
        min-width: 110px;
        transition: color 0.2s ease, background-color 0.2s ease;
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
          order: 10;
          margin-left: 0;
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
      const newLang = e.target.value;
      if (newLang === currentLang) return;
      switcher.classList.add('switching');
      select.disabled = true;
      setLanguage(newLang).then(function() {
        select.disabled = false;
        setTimeout(function() {
          switcher.classList.remove('switching');
        }, 300);
      }).catch(function(err) {
        select.disabled = false;
        switcher.classList.remove('switching');
        console.error('Language switch failed:', err);
      });
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
    const chatbotTranslations = translations.chatbot || {};
    const chatbotElements = document.querySelectorAll('[data-chatbot-i18n]');
    chatbotElements.forEach(function(element) {
      const key = element.getAttribute('data-chatbot-i18n');
      const translation = chatbotTranslations[key];
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
    try {
      translations = await loadTranslations(currentLang);
    } catch (error) {
      console.error('Error initializing i18n:', error);
      translations = {};
    }
    applyTranslations();
    document.documentElement.setAttribute('lang', currentLang);
    createLanguageSwitcher();
    initUserTranslationWidget();
    SUPPORTED_LANGS.forEach(function(lang) {
      if (lang !== currentLang) {
        loadTranslations(lang).catch(function(err) {
          console.warn('Preloading failed for ' + lang + ':', err);
        });
      }
    });
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