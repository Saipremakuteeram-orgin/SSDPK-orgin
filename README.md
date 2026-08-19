<div align="center">

<img src="logo.jpg" alt="Sathya Sai Prema Kuteeram" width="140" style="border-radius: 50%; box-shadow: 0 0 30px rgba(232, 149, 74, 0.4);">

# 🙏 Sri Sai Dharma Samrakshana Prema Kuteeram

### *"SELFLESS SERVICE , SELFLESS LOVE"*

<br>

[![Trust Registered](https://img.shields.io/badge/Trust_Registered-Document_No._51/2026-blue?style=for-the-badge)](https://saidharmasamrakshanapremakuteeram.qzz.io/)
[![Vercel Deployed](https://img.shields.io/badge/Deployed_on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ecf8e?style=for-the-badge&logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/License-©_2026_SSPK-orange?style=for-the-badge)](LICENSE)

---

## ✨ Recent Updates (ALL FIXES DOCUMENTED)

| # | Fix | File | Description |
|---|-----|------|-------------|
| 🟢 **1** | **Header Issue Resolved** | `css/theme.css` | Simplified nav CSS, removed broken `!important` syntax causing messy flex layout |
| 🟢 **2** | **Footer Standardized** | `pages/*.html` (7 pages) | Removed duplicate "Events" links, consistent 3-section footer structure |
| 🟢 **3** | **Gallery Folder Icon** | `pages/gallery.html` | Updated event cards to use 📂 folder emoji; Telegram banner uses folder emoji |
| 🟢 **4** | **FAQ Line Spacing** | `pages/index.html` + `css/theme.css` | Added `margin-bottom: 8px` to `.faq-list details summary` for readable spacing |
| 🟢 **5** | **Counter Text Updated** | `pages/gallery.html` | Changed "event gallery folder(s) loaded" to "event(s) in gallery" |
| 🟢 **5** | **Config Updates** | `.env.example`, `api/config.js` | Added Supabase credentials configuration |
| 🟢 **7** | **Discourse Thumbnail Latency** | `js/discourse.js` | Added width/height attributes, onerror fallback for image loading |
| 🟢 **8** | **README Rebuild** | `README.md` | This document — comprehensive fix documentation |

---

## 🌐 Live Demo

**Website**: [https://saidharmasamrakshanapremakuteeram.qzz.io/](https://saidharmasamrakshanapremakuteeram.qzz.io/)

**Vercel Deployment**: [ssdpk-orgin-h1hunjo4j-sk143sathyabusiness-projects.vercel.app](https://vercel.com)

---

## ✨ Pages

| Page | File | Description |
|------|------|-------------|
| 🏠 **Home** | `pages/index.html` | Mission overview with animated flow tree, guide sections, FAQ |
| 📖 **About** | `pages/about.html` | Trust background & philosophy |
| 🖼️ **Gallery** | `pages/gallery.html` | Event & seva photos with folder icons |
| 📅 **Events** | `pages/events.html` | Bhajans, seva, study calendar & bookings |
| 📊 **Dashboard** | `pages/dashboard.html` | Member portal (membership card, daily blessings, admin console) |
| 🎙️ **Discourses** | `pages/discourse.html` | Weekly messages archive |
| 🙏 **Seva** | `pages/seva.html` | Donations & monthly subscriptions (Razorpay) |
| 🧑‍🤝‍🧑 **Trustees** | `pages/trustees.html` | Board of Trustees |
| 🔐 **Login / Signup / Reset** | `pages/login.html` / `pages/signup.html` / `pages/reset-password.html` | Email or Phone OTP-based authentication |

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
│   Telegram Bot (bot.py) · Vercel Serverless (api/)  │
└─────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

> See [`STRUCTURE.md`](./STRUCTURE.md) for a full file-by-file breakdown.

```
SSDPK-orgin/
├── pages/              ← All HTML pages
│   ├── index.html / about.html / events.html / gallery.html
│   ├── dashboard.html / discourse.html / seva.html / trustees.html
│   ├── login.html / signup.html / reset-password.html
├── api/                ← Vercel serverless functions
│   ├── config.js
│   ├── notify-event.js
│   ├── send-welcome.js
│   ├── weekly-messages.js
│   ├── razorpay/       ← Orders, subscriptions, webhooks
│   └── shared/         ← Admin auth, Telegram bot, validators
├── css/
│   ├── theme.css       ← Global theme (nav fix applied)
│   ├── divine.css             # Sacred/typography extras
│   ├── discourse.css          # Weekly message card styling
│   ├── chatbot.css            # Floating AI chatbot layout
│   └── trustees.css           # Trustees page styling
├── js/
│   ├── main.js
│   ├── supabase-client.js
│   ├── dashboard-app.js
│   ├── discourse.js           ← Weekly messages rendering (+ thumbnail latency fix)
│   ├── seva.js                ← Seva page logic
│   ├── i18n.js         ← 6 languages
│   ├── chatbot.js             # AI chatbot
│   ├── razorpay-helpers.js    ← Razorpay checkout helpers
│   └── mail-helpers.js        ← Email HTML builders
├── i18n/               ← Locale JSON files (en, ta, hi, te, kn, ml)
├── tests/              ← Vitest suite (175+ tests)
├── images/             ← Site images & assets
├── image_for_quote/    ← Quote background images
├── audio/              ← Audio files
├── logo.jpg            ← Trust logo
├── vercel.json         ← Vercel routing config
├── package.json
├── vitest.config.mjs          ← Vitest config
├── .gitignore                 ← Git exclusion patterns
├── README.md                  ← Project overview
├── STRUCTURE.md               ← Project directory structure
├── supabase_donations.sql     ← Donations schema (public reference)
├── logo.jpg                   ← Trust logo
├── favicon-16.png             ← Browser favicon
├── favicon-32.png             ← Browser favicon
├── apple-touch-icon.png       ← Mobile home-screen icon
└── llms.txt                   ← LLM-readable site summary
```

---

## 🕉️ Trust Details

<div align="center">

### **Sri Sai Dharma Samrakshana Prema Kuteeram**
#### *Public Charitable Trust*

**Registered at** Melakarur, Karur  
**Document No.** 51/2026 | **Dated:** 02/07/2026

</div>

| Role | Name |
|------|------|
| **Settlor & Managing Trustee** | Shri S. Govindaraj |
| **Registered Office** | No.104, Mettu Street, Karur – 639001 |

---

### 🙏 Board of Trustees & Responsibilities

<details>
<summary><strong>1. Sri Sai Prakash</strong></summary>

**Spiritual Activities:**
Guru Purnima · Ganapathi Homam · Gayatri Homam · Sai Jayanthi · Rudra Japam · Monthly Amavasya Tarpanam · Annual Thithi / Shraddha

**Seva Activities** *(with Sri Chandrasekaran):*
Grocery aid · Temple archakas / gurus support · Veda students · Diwali clothing

</details>

<details>
<summary><strong>2. Sri Sathyamoorthy</strong></summary>

**Spiritual Activities:**
Rathakalpa Pooja · Sathyanarayana Pooja · Lalitha / Krishna / Rama Navami Jayanthis · Karthigai Deepam · Sankaranthi · Anumath / Adi Shankarar Jayanthi · Maha Periyava & Sai Jayanthi

**Communications** *(with Sri Darshan):*
Website · Social media · Digital comms · Invitations / posters · Media relations · Photography / documentation

</details>

<details>
<summary><strong>3. Dr. Sri Chandrasekaran</strong></summary>

**Spiritual Activities** *(with Sri Hariharan):*
Sannyastha Mahalayam · Maha Periyava / Sai / Sivananda Geethananda aradhanas

**Seva:**
Family welfare aid · Veda school · Old-age home · Temple service · Tree planting · Monthly Brindhavan pooja support

**Education & Awareness:**
Career guidance · Health / hygiene programs

</details>

<details>
<summary><strong>5. Sri Prem Sai</strong></summary>

**Spiritual:**
Nagara Sankeerthanam · Special bhajans *(with Sri Amarnath)* · **Narayana Seva** *(personally responsible)*

**Seva:**
Veda school · Old-age home

**Education:**
Satsangs · Spiritual classes

</details>

<details>
<summary><strong>6. Sri Amarnath</strong></summary>

**Spiritual Activities** *(with Sri Prem Sai):*
Nagara Sankeerthanam · Special bhajans

</details>

<details>
<summary><strong>7. Mrs. Sridevi Sairam</strong></summary>

**Education:**
Satsangs *(with Sri Prem Sai & Sri Darshan)*

</details>

<details>
<summary><strong>8. Dr. Srividya Sairam</strong></summary>

**Education:**
Spiritual classes *(with Sri Prem Sai)*

</details>

<details>
<summary><strong>9. Sri Sathyanarayanan Sairam</strong></summary>

**Education & Awareness:**
Career guidance · Health / hygiene programs *(with Dr. Chandrasekaran)*

</details>

<details>
<summary><strong>10. Mrs. Nithya Hariharan</strong></summary>

**Spiritual Publications:**
"Deivathin Kural" · Maha Periyava teachings · Audio / video / e-publications *(with Sri Hariharan)*

</details>

<details>
<summary><strong>11. Sri Prasad Sairam</strong></summary>

**Administration:**
Fundraising · Donor coordination · Income–expenditure accounts · Financial management

</details>

<details>
<summary><strong>12. Sri Darshan Sairam</strong></summary>

**Education:**
Satsangs *(with Mrs. Sridevi Sairam & Sri Prem Sai)*

**Communications:**
Website maintenance · Social media · Digital comms · Graphic design · Trust publications *(with Sri Sathyamoorthy)*

</details>

---

### 🎯 Trust Objects

> Education aid for poor children · Veda training & scholarships · Poor feeding · Orphanages & old-age homes ·  
> **Gosamrakshana** (cow protection / Goshalas) · Veda Patasalas · Temple renovation · Medical assistance ·  
> Yoga & wellness programs · And other charitable activities — all **non-profit**, **service-motive only**, confined to **India**.

---

### 📜 License & Rights

<div align="center">

> **All rights are exclusively reserved by Sri Sai Dharma Samrakshana Prema Kuteeram Public Charitable Trust.**
>
> This repository, its source code, design, content, images, and all associated materials are the **sole intellectual property** of the Trust.
>
> **Unauthorized reproduction, modification, distribution, or use** of any part of this project — in whole or in part — is **strictly prohibited** without prior written consent from the Trust.

</div>

| Right | Status |
|-------|--------|
| 📁 **Source Code** | Sole property of SSPK Trust |
| 🖼️ **Images & Assets** | Sole property of SSPK Trust |
| 📝 **Content & Text** | Sole property of SSPK Trust |
| 🎨 **Design & Layout** | Sole property of SSPK Trust |
| 🌐 **Domain & Deployment** | Sole property of SSPK Trust |

```
© 2026 Sri Sai Dharma Samrakshana Prema Kuteeram Public Charitable Trust
Registered at Melakarur, Karur — Document No. 51/2026, dated 02/07/2026
Settlor & Managing Trustee: Shri S. Govindaraj
Registered Office: No.104, Mettu Street, Karur – 639001
```

---

<div align="center">

### 🙏 *Sarva Loka Sukhino Bhavantu*

*"May all beings everywhere be happy and free"*

<br>

**🕉️ Om Sai Ram 🙏**

</div>

---

## 🚀 Razorpay Seva (Contribution) Setup

Serverless functions in `api/razorpay/` handle one-time orders, QR payment links, monthly subscriptions, and webhooks. Configure these in Vercel Environment Variables:

- `RAZORPAY_KEY_ID` (public, also used client-side)
- `RAZORPAY_KEY_SECRET` (secret, server-only)
- `RAZORPAY_WEBHOOK_SECRET` (secret, for webhook signature)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret, server-only)
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (optional, for admin alerts)

Run `supabase_donations.sql` in the Supabase SQL editor to create the `donations` table.

---

Powered by **Vercel**, **Supabase**, and **Razorpay** — serving with love since 2026.