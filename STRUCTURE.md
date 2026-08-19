# Project Directory Structure — Sathya Sai Prema Kuteeram

This document describes the files and directories of the Sathya Sai Prema Kuteeram website project to help developers navigate and maintain the repository.

---

## 📂 Core Folder Structure

```text
SSDPK-orgin/
├── pages/                     # All HTML pages (served via Vercel rewrites)
│   ├── index.html             # Homepage (hero, flow tree, contact forms)
│   ├── about.html             # Mission, gurus, activities
│   ├── events.html            # Events calendar, brochures, reports, location
│   ├── gallery.html           # Interactive image gallery linked to events
│   ├── dashboard.html         # Member portal (digital card, daily blessings, admin console)
│   ├── discourse.html         # Weekly messages (Discourse) public view
│   ├── seva.html              # Seva contributions & Razorpay subscriptions
│   ├── trustees.html          # Board of Trustees
│   ├── login.html             # Sign-in (email/phone OTP, password)
│   ├── signup.html            # Member registration
│   └── reset-password.html    # Password recovery
├── api/                       ← Vercel Serverless Functions
│   ├── config.js              # Serves publishable Supabase credentials
│   ├── notify-event.js        # Email notifications for upcoming events
│   ├── send-welcome.js        # Welcome email on registration
│   ├── weekly-messages.js     # Weekly media upload/download, event report upload
│   ├── razorpay/              # Order, subscription, plans, webhook, history, etc.
│   └── shared/                ← Admin auth, Telegram bot, validators
├── css/                       ← Theme & page styles
│   ├── theme.css              ← Main stylesheet (tokens, components)
│   ├── divine.css             ← Sacred/typography extras
│   ├── discourse.css          ← Weekly message card styling
│   ├── chatbot.css            ← Floating AI chatbot layout
│   └── trustees.css           ← Trustees page styling
├── js/                        ← Frontend logic
│   ├── main.js                ← Shared nav, auth redirects, DOM upgrades
│   ├── supabase-client.js     ← Supabase client singleton
│   ├── dashboard-app.js       ← Member dashboard + admin console
│   ├── discourse.js           ← Weekly messages rendering (+ thumbnail latency fix)
│   ├── seva.js                ← Seva page logic
│   ├── i18n.js              ← Internationalization (6 languages)
│   ├── chatbot.js             ← AI chatbot
│   ├── razorpay-helpers.js    ← Razorpay checkout helpers
│   └── mail-helpers.js        ← Email HTML builders
├── i18n/                      ← Locale JSON files (en, ta, hi, te, kn, ml)
├── audio/                     ← Audio assets
├── images/                    ← High-res images
├── image_for_quote/           ← Optimized daily-blessings images
├── tests/                     ← Vitest test suite (175+ tests)
├── docs/superpowers/          ← Plans & design specs (agent-generated)
├── .github/workflows/         ← CI tests + Supabase keep-alive
├── vercel.json                ← Rewrites (pages + API) and clean URLs
├── package.json               ← Dependencies & test scripts
├── vitest.config.mjs          ← Vitest config
├── .gitignore                 ← Git exclusion patterns
├── README.md                  ← Project overview
├── STRUCTURE.md               ← This file
├── supabase_donations.sql     ← Donations schema (public reference)
├── logo.jpg                   ← Primary trust logo
├── favicon-16.png             ← Browser favicon
├── favicon-32.png             ← Browser favicon
├── apple-touch-icon.png       ← Mobile home-screen icon
└── llms.txt                   ← LLM-readable site summary
```

---

## 📑 Routing Notes

- Pages live in `pages/` but are reachable at both the new paths (`/about`, `/about.html`) and any legacy URLs via `vercel.json` rewrites.
- All API routes (`/api/...`) are mapped to their function files in `vercel.json`.

---

## 🧪 Testing

```bash
npm install
npm test
```