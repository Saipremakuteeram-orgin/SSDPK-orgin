<div align="center">

<img src="logo.jpg" alt="Sathya Sai Prema Kuteeram" width="140" style="border-radius: 50%; box-shadow: 0 0 30px rgba(232, 149, 74, 0.4);">

# 🙏 Sri Sai Dharma Samrakshana Prema Kuteeram

### *"SELFLESS SERVICE, SELFLESS LOVE"*

<br>

[![Trust Registered](https://img.shields.io/badge/Trust_Registered-Public_Charitable_Trust-blue?style=for-the-badge)](https://saidharmasamrakshanapremakuteeram.qzz.io/)
[![Vercel Deployed](https://img.shields.io/badge/Deployed_on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ecf8e?style=for-the-badge&logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/License-©_2026_SSPK-orange?style=for-the-badge)](LICENSE)

---

## ✨ Recent Updates

| # | Fix | File | Description |
|---|-----|------|-------------|
| 🟢 **1** | Header Issue Resolved | `css/theme.css` | Simplified nav CSS, removed broken `!important` syntax causing messy flex layout |
| 🟢 **2** | Footer Standardized | `pages/*.html` (7 pages) | Removed duplicate "Events" links, consistent 3-section footer structure |
| 🟢 **3** | Gallery Folder Icon | `pages/gallery.html` | Updated event cards to use 📂 folder emoji; Telegram banner uses folder emoji |
| 🟢 **4** | FAQ Line Spacing | `pages/index.html` + `css/theme.css` | Added `margin-bottom: 8px` to `.faq-list details summary` for readable spacing |
| 🟢 **5** | Counter Text Updated | `pages/gallery.html` | Changed "event gallery folder(s) loaded" to "event(s) in gallery" |
| 🟢 **6** | Config Updates | `.env.example`, `api/config.js` | Added Supabase credentials configuration |
| 🟢 **7** | Discourse Thumbnail Latency | `js/discourse.js` | Added width/height attributes, onerror fallback for image loading |
| 🟢 **8** | README Rebuild | `README.md` | This document — comprehensive fix documentation |

---

## 🌐 Live Demo

**Website**: Available on Vercel platform

---

## ✨ Pages

| Page | File | Description |
|------|------|-------------|
| Home | `pages/index.html` | Mission overview with animated flow tree, guide sections, FAQ |
| About | `pages/about.html` | Trust background & philosophy |
| Gallery | `pages/gallery.html` | Event & seva photos with folder icons |
| Events | `pages/events.html` | Bhajans, seva, study calendar & bookings |
| Dashboard | `pages/dashboard.html` | Member portal (membership card, daily blessings, admin console) |
| Discourses | `pages/discourse.html` | Weekly messages archive |
| Seva | `pages/seva.html` | Donations & monthly subscriptions (Razorpay) |
| Trustees | `pages/trustees.html` | Board of Trustees |
| Login / Signup / Reset | `pages/login.html` / `pages/signup.html` / `pages/reset-password.html` | Email or Phone OTP-based authentication |

---

## 🛠️ Tech Stack

```
┌─────────────────────────────────────────────────────┐
│                  FRONTEND                           │
│   Static HTML · CSS · JavaScript · Tailwind CSS     │
├─────────────────────────────────────────────────────┤
│                  DEPLOYMENT                         │
│   Vercel (Serverless Functions · Routing)           │
├─────────────────────────────────────────────────────┤
│                  BACKEND                            │
│   Supabase (Auth · Database · Realtime)             │
├─────────────────────────────────────────────────────┤
│                  PAYMENTS                           │
│   Razorpay (Donations · Memberships)                │
├─────────────────────────────────────────────────────┤
│                  AUTOMATION                         │
│   Telegram Bot · Vercel Serverless Functions        │
└─────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

> See [`STRUCTURE.md`](./STRUCTURE.md) for a full file-by-file breakdown.

```
SSDPK-orgin/
├── pages/              # All HTML pages
│   ├── index.html
│   ├── about.html
│   ├── events.html
│   ├── gallery.html
│   ├── dashboard.html
│   ├── discourse.html
│   ├── seva.html
│   ├── trustees.html
│   ├── login.html
│   ├── signup.html
│   └── reset-password.html
├── api/                # Vercel serverless functions
│   ├── config.js
│   ├── notify-event.js
│   ├── send-welcome.js
│   ├── weekly-messages.js
│   ├── razorpay/
│   └── shared/
├── css/                # Theme & page styles
│   ├── theme.css       # Global theme (nav fix applied)
│   ├── divine.css
│   ├── discourse.css
│   ├── chatbot.css
│   └── trustees.css
├── js/                 # Frontend logic
│   ├── main.js
│   ├── supabase-client.js
│   ├── dashboard-app.js
│   ├── discourse.js    # Weekly messages (+ thumbnail latency fix)
│   ├── seva.js
│   ├── i18n.js         # 6 languages
│   ├── chatbot.js
│   ├── razorpay-helpers.js
│   └── mail-helpers.js
├── i18n/               # Locale JSON files
├── tests/              # Vitest test suite
├── docs/               # Plans & design specs
├── images/             # Site images & assets
├── image_for_quote/    # Quote background images
├── audio/              # Audio assets
├── logo.jpg            # Trust logo
├── vercel.json         # Vercel routing config
├── package.json        # Dependencies & scripts
├── vitest.config.mjs   # Vitest config
├── .gitignore
├── README.md           # This file
├── STRUCTURE.md        # Project directory structure
├── supabase_donations.sql  # Donations schema
├── favicon-16.png      # Browser favicon
├── favicon-32.png      # Browser favicon
├── apple-touch-icon.png # Mobile icon
└── llms.txt            # LLM-readable site summary
```

---

## 🕉️ Trust Details

<div align="center">

### **Sri Sai Dharma Samrakshana Prema Kuteeram**
#### *Public Charitable Trust*

</div>

---

## 📜 License & Rights

<div align="center">

> **All rights are exclusively reserved by the Trust.**
>
> This repository, its source code, design, content, images, and all associated materials are the **sole intellectual property** of the Trust.
>
> **Unauthorized reproduction, modification, distribution, or use** of any part of this project — in whole or in part — is **strictly prohibited** without prior written consent from the Trust.

</div>

| Right | Status |
|-------|--------|
| Source Code | Sole property of Trust |
| Images & Assets | Sole property of Trust |
| Content & Text | Sole property of Trust |
| Design & Layout | Sole property of Trust |
| Domain & Deployment | Sole property of Trust |

```
© 2026 Sri Sai Dharma Samrakshana Prema Kuteeram Public Charitable Trust
```

---

<div align="center">

### 🙏 *Sarva Loka Sukhino Bhavantu*

*"May all beings everywhere be happy and free"*

<br>

**🕉️ Om Sai Ram 🙏**

</div>

---

## 🚀 Deployment Setup

This project uses environment variables for configuration. Set these in your deployment environment:

- Payment gateway credentials
- Supabase configuration
- Telegram Bot token
- Database connection strings

Run the provided SQL schema script in your database to create required tables.

---

Powered by **Vercel**, **Supabase**, and **Razorpay** — serving with love since 2026.