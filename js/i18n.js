// Sathya Sai Prema Kuteeram — Internationalization (i18n) Module
(function() {
  'use strict';

  // Default language
  const DEFAULT_LANG = 'en';

  // Supported languages
  const SUPPORTED_LANGS = ['en', 'ta', 'hi', 'te', 'kn', 'ml'];

  // Language detection cache
  let currentLang = null;
  let translations = {};

  // Language emoji flags
  const LANG_FLAGS = {
    'en': '🇬🇧',
    'ta': '🇮🇳',
    'hi': '🇮🇳',
    'te': '🇮🇳',
    'kn': '🇮🇳',
    'ml': '🇮🇳'
  };

  // Language names
  const LANG_NAMES = {
    'en': 'English',
    'ta': 'தமிழ்',
    'hi': 'हिन्दी',
    'te': 'తెలుగు',
    'kn': 'ಕನ್ನಡ',
    'ml': 'മലയാളം'
  };

  // Initialize i18n
  async function initI18n() {
    if (currentLang) return; // Already initialized

    // Detect language from URL, localStorage, or browser
    currentLang = detectLanguage();

    // Load translations for the detected language
    await loadTranslations(currentLang);

    // Apply translations
    applyTranslations();

    // Update HTML lang attribute
    document.documentElement.setAttribute('lang', currentLang);

    // Create language switcher
    createLanguageSwitcher();

    // Initialize user input translation widget if present
    initUserTranslationWidget();

    // Update chatbot messages
    updateChatbotMessages();

    console.log('i18n initialized:', currentLang);
  }

  // Detect user's preferred language
  function detectLanguage() {
    let lang = DEFAULT_LANG;

    // Check URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get('lang');
    if (urlLang && SUPPORTED_LANGS.includes(urlLang)) {
      lang = urlLang;
    }

    // Check localStorage
    else if (localStorage.getItem('sspk_lang')) {
      const storedLang = localStorage.getItem('sspk_lang');
      if (SUPPORTED_LANGS.includes(storedLang)) {
        lang = storedLang;
      }
    }

    // Check browser language
    else {
      const browserLang = navigator.language || navigator.userLanguage || '';
      const browserLangCode = browserLang.toLowerCase().split('-')[0];
      if (SUPPORTED_LANGS.includes(browserLangCode)) {
        lang = browserLangCode;
      }
    }

    return lang;
  }

  // Load translation file
  async function loadTranslations(lang) {
    try {
      const response = await fetch(`/i18n/${lang}.json`);
      if (!response.ok) {
        if (lang !== DEFAULT_LANG) {
          console.warn(`Failed to load ${lang}.json, falling back to English`);
          await loadTranslations(DEFAULT_LANG);
          return;
        }
        throw new Error(`Failed to load translations for language: ${lang}`);
      }

      translations = await response.json();
      localStorage.setItem('sspk_lang', lang);
    } catch (error) {
      console.error('Error loading translations:', error);
    }
  }

  // Apply translations to all elements with data-i18n attribute
  function applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = getNestedProperty(translations, key);

      if (translation) {
        // Handle different element types
        if (element.tagName === 'INPUT' && element.getAttribute('placeholder') !== null) {
          element.setAttribute('placeholder', translation);
        } else if (element.tagName === 'TEXTAREA') {
          element.textContent = translation;
        } else {
          element.textContent = translation;
        }
      } else {
        console.warn(`Missing translation for key: ${key}`);
      }
    });
  }

  // Get nested property from object using dot notation
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

  // Set language and reload translations
  async function setLanguage(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) {
      console.error(`Unsupported language: ${lang}`);
      return;
    }

    currentLang = lang;
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('sspk_lang', lang);

    await loadTranslations(lang);
    applyTranslations();

    // Update URL with language parameter
    const url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    history.replaceState({}, '', url);

    // Update chatbot messages
    updateChatbotMessages();

    console.log('Language changed to:', lang);
  }

  // Create language switcher dropdown
  function createLanguageSwitcher() {
    const existingSwitcher = document.getElementById('langSwitcher');
    if (existingSwitcher) {
      existingSwitcher.remove();
    }

    const switcher = document.createElement('div');
    switcher.id = 'langSwitcher';
    switcher.className = 'language-switcher';

    // Create dropdown
    const select = document.createElement('select');
    select.className = 'lang-select';

    SUPPORTED_LANGS.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = `${LANG_FLAGS[lang]} ${LANG_NAMES[lang]}`;
      if (lang === currentLang) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener('change', async (e) => {
      await setLanguage(e.target.value);
    });

    switcher.appendChild(select);

    // Find navbar container and append switcher
    const navbar = document.querySelector('nav .container');
    if (navbar) {
      navbar.appendChild(switcher);
    }
  }

  // Initialize user input translation widget
  function initUserTranslationWidget() {
    const translateWidget = document.getElementById('translateWidget');
    if (!translateWidget) return;

    const translateBtn = translateWidget.querySelector('#translateBtn');
    const translateInput = translateWidget.querySelector('#translateInput');
    const translateResult = translateWidget.querySelector('#translateResult');

    if (!translateBtn || !translateInput) return;

    translateBtn.addEventListener('click', async () => {
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

  // Translate text to Tamil using MyMemory API
  async function translateToTamil(text) {
    const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ta`;

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

  // Update chatbot messages with current language
  function updateChatbotMessages() {
    if (!window.chatbotTranslations) {
      window.chatbotTranslations = translations.chatbot || {};
    }

    const chatbotElements = document.querySelectorAll('[data-chatbot-i18n]');
    chatbotElements.forEach(element => {
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

  // Expose public methods
  window.i18n = {
    init: initI18n,
    setLanguage: setLanguage,
    getLanguage: () => currentLang,
    t: (key) => getNestedProperty(translations, key) || key,
    SUPPORTED_LANGS: SUPPORTED_LANGS
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
  } else {
    initI18n();
  }
})();