# Language Module Design — SSDPK Website

## Overview

Add a client-side i18n (internationalization) module to the Sri Sai Dharma Samrakshana Prema Kuteeram spiritual trust website. The module translates all static UI content across 6 languages, with a language switcher in the navbar, user-input auto-translation to Tamil, and chatbot message translation.

## Supported Languages

| Code | Language | Script |
|------|----------|--------|
| `en` | English | Latin |
| `ta` | Tamil | Tamil |
| `hi` | Hindi | Devanagari |
| `te` | Telugu | Telugu |
| `kn` | Kannada | Kannada |
| `ml` | Malayalam | Malayalam |

## File Structure

```
i18n/
  en.json
  ta.json
  hi.json
  te.json
  kn.json
  ml.json
js/
  i18n.js
```

## Translation JSON Format

Each JSON file uses page-scoped dot-notation keys. All files must have identical key structures; only values differ.

```json
{
  "nav": {
    "home": "Home",
    "about": "Activities",
    "trustees": "Trustees",
    "gallery": "Gallery",
    "events": "Events",
    "dashboard": "Dashboard",
    "signIn": "Sign In",
    "signUp": "Sign Up",
    "signOut": "Sign Out"
  },
  "home": {
    "heroTitle": "Sathya Sai Prema Kuterram",
    "heroSubtitle": "A spiritual trust dedicated to selfless service, universal love, and the teachings of Sri Sathya Sai Baba.",
    "learnMore": "Learn More",
    "supportMission": "Support Our Mission"
  },
  "about": {
    "pageTitle": "Our Activities",
    "pageSubtitle": "Spiritual devotion, selfless service, education, and community outreach."
  },
  "events": {
    "pageTitle": "Events",
    "pageSubtitle": "Upcoming bhajans, celebrations, and community programs."
  },
  "gallery": {
    "pageTitle": "Gallery"
  },
  "dashboard": {
    "pageTitle": "Member Portal",
    "pageSubtitle": "Access your digital membership and manage your profile."
  },
  "login": {
    "pageTitle": "Sign In",
    "pageSubtitle": "Access your digital membership and manage your profile.",
    "welcomeBack": "Welcome Back",
    "signInPrompt": "Sign in with your registered phone number or email.",
    "forgotPassword": "Forgot password?",
    "newMember": "New to the trust?",
    "registerHere": "Register here"
  },
  "signup": {
    "pageTitle": "Trust Registration",
    "pageSubtitle": "Become a member of the Sathya Sai family.",
    "registerTitle": "Register",
    "registerPrompt": "Create your member profile to join the trust activities.",
    "alreadyRegistered": "Already registered?",
    "signIn": "Sign in"
  },
  "resetPassword": {
    "pageTitle": "Set New Password",
    "resetTitle": "Reset Password"
  },
  "trustees": {
    "pageTitle": "Board of Trustees"
  },
  "chatbot": {
    "welcome": "Hello! How can I help you today?",
    "placeholder": "Type your message...",
    "send": "Send",
    "usageLimit": "Usage limit reached. Resets tomorrow.",
    "offline": "Offline",
    "rateLimit": "Rate limit",
    "reqLeft": "req left"
  },
  "donation": {
    "donateBtn": "Donate via Razorpay",
    "openingRazorpay": "Opening Razorpay...",
    "thankYou": "Thank you for your donation! Payment ID:",
    "enterValidAmount": "Please enter a valid donation amount.",
    "amountPlaceholder": "Enter amount"
  },
  "footer": {
    "email": "Email: info@sathyasaipremakuterram.org",
    "phone": "Phone: +91-XXXXXXXXXX",
    "copyright": "All rights reserved by Sri Sai Dharma Samrakshana Prema Kuteeram Public Charitable Trust."
  },
  "translate": {
    "label": "Translate to Tamil",
    "placeholder": "Enter text to translate...",
    "button": "Translate",
    "translating": "Translating..."
  }
}
```

## HTML Integration

### Data Attributes

Add `data-i18n` attributes to all translatable HTML elements. The attribute value is the dot-notation key path.

```html
<h1 data-i18n="home.heroTitle">Sathya Sai Prema Kuterram</h1>
<a href="about.html" data-i18n="nav.about">Activities</a>
<button data-i18n="donation.donateBtn">Donate via Razorpay</button>
```

### Language Switcher in Navbar

Add a language switcher dropdown to the navbar in all pages. The switcher is injected by `i18n.js` into a container element with id `langSwitcher`.

```html
<div id="langSwitcher"></div>
```

The dropdown shows language names with country flags (emoji):
- 🇬🇧 English
- 🇮🇳 தமிழ்
- 🇮🇳 हिन्दी
- 🇮🇳 తెలుగు
- 🇮🇳 ಕನ್ನಡ
- 🇮🇳 മലയാളം

## JavaScript Module — `js/i18n.js`

### Core Functions

1. **`initI18n()`** — Called on page load. Detects language from URL param, localStorage, or browser settings. Loads the appropriate JSON file and applies translations.

2. **`loadTranslations(lang)`** — Fetches `/i18n/{lang}.json` via `fetch()`. Caches loaded translations in memory.

3. **`applyTranslations(translations)`** — Finds all `[data-i18n]` elements and replaces their `textContent` with the translated value. Supports nested keys via dot notation (e.g., `nav.home`).

4. **`setLanguage(lang)`** — Sets the active language. Updates `localStorage`, URL param `?lang=xx`, and re-applies translations. Also updates the `html[lang]` attribute.

5. **`translateUserInput(text, targetLang)`** — Sends user text to MyMemory Translation API for free on-the-fly translation. Returns the translated text.

### Language Detection Priority

1. URL param `?lang=xx`
2. `localStorage.getItem('sspk_lang')`
3. `navigator.language` mapped to supported codes (`ta` → `ta`, `hi` → `hi`, etc.)
4. Default: `en`

### Chatbot Integration

- `chatbot.js` strings are replaced with `i18n.t('chatbot.welcome')` etc.
- When language changes, chatbot UI text updates automatically
- User messages sent to the AI backend are auto-translated to Tamil when the active language is `ta`

### User Input Translation Feature

A translate widget (text input + button) that can be placed on any page. When the user enters English text and clicks Translate:
1. The text is sent to MyMemory Translation API
2. The Tamil translation is displayed below the input
3. The translation can be copied to clipboard

### MyMemory Translation API

- Endpoint: `https://api.mymemory.translated.net/get`
- Parameters: `q` (text), `langpair` (source|target, e.g., `en|ta`)
- Free tier: 10,000 chars/day, no API key required
- Fallback: If the API fails, display the original text with a "Translation unavailable" message

## Vercel Config Update

Add a rewrite rule in `vercel.json` so that `/i18n/*.json` requests are served as static files:

```json
{
  "cleanUrls": true,
  "framework": null,
  "rewrites": [
    {
      "source": "/api/config",
      "destination": "/api/config.js"
    }
  ]
}
```

No rewrite needed — Vercel serves static files from the root by default. The `i18n/` directory will be served as static assets.

## CSS for Language Switcher

Add styles to `css/theme.css` for the language switcher dropdown:

- Position: top-right of navbar
- Style: glassmorphism matching existing theme
- Responsive: collapses to a compact selector on mobile

## Error Handling

- If a translation file fails to load, fall back to English
- If a key is missing in a translation file, display the English fallback
- If the translation API fails, show original text with a warning
- All errors logged to console without breaking page functionality

## Success Criteria

1. Language switcher appears on all pages
2. Switching language updates all `data-i18n` elements instantly
3. Language preference persists across page navigations (localStorage + URL)
4. User can type English text and get Tamil translation via the translate widget
5. Chatbot UI text is translated when language changes
6. No console errors when switching languages
7. Fallback to English works when a translation file is missing