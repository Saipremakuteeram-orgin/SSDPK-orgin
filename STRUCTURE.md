# Project Directory Structure — Sathya Sai Prema Kuteeram

This document provides a step-by-step overview of the files and directories in the Sathya Sai Prema Kuteeram website project to help developers navigate and maintain the repository.

---

## 📂 Core Folder Structure

```text
sathya-sai-website_new/
├── .env                  # Local development environment configuration
├── .gitignore            # Git exclusion patterns
├── STRUCTURE.md          # Project folder & layout documentation (this file)
├── IMPLEMENTATION.md     # Logo / tree rendering historical plan
├── about.html            # "About Us" information page
├── dashboard.html        # Member portal dashboard (membership card & daily blessings)
├── events.html           # Events calendar & physical study circle bookings
├── gallery.html          # Interactive image gallery linked to events
├── index.html            # Homepage (featuring the interactive animated flow tree)
├── login.html            # Member sign-in page (accepting Email or Phone OTP)
├── signup.html           # Member registration/signup page
├── vercel.json           # Vercel serverless routing and Clean URLs configuration
├── logo.jpg              # Primary trust logo
├── api/                  # Vercel Serverless Functions
│   ├── config.js         # Serves publishable Supabase credentials dynamically
│   ├── notify-event.js   # Sends automated email notifications for upcoming events
│   └── send-welcome.js   # Sends automated welcome email upon user registration
├── css/                  # Layout & Theme Styling
│   ├── theme.css         # Main stylesheet (color variables, fonts, components)
│   └── chatbot.css       # Floating AI chatbot support layout styling
├── js/                   # Frontend JavaScript Logic
│   ├── main.js           # Shared DOM layouts (navigation bar, mobile menus, state)
│   ├── supabase-client.js# Supabase client helper initialization
│   └── dashboard-app.js  # Member dashboard logic, cards, & quotes daily limit system
├── image_for_quote/      # Optimized assets for daily blessings quote display
│   ├── sathya_sai_baba.jpg
│   └── Maha Periyava.jpg
├── images/               # High-res master images & visual assets
│   ├── sathya_sai_baba.png
│   └── maha_periyava.png
└── quote/                # Database configuration & quotes seed SQL data
    ├── quotes_setup.sql  # SQL schema definition & 200 seed insert statement for quotes table
    ├── sathya_sai_baba_100_quotes.txt
    └── kanchi_maha_periyava_100_quotes.txt
```

---

## 📑 File Walkthrough & Purpose

### 1. Root Pages (`*.html`)
- **`index.html`**: The home page. Displays general details of the trust, contact forms, and the interactive SVG **Flow Tree** which dynamically animates when clicking the root node.
- **`about.html`**: Details the mission, gurus, and background of the trust.
- **`gallery.html`**: Displays user-contributed and official images. Integrates with the `events` table to show event-based images and categories.
- **`events.html`**: Lists upcoming study circles, bhajans, and celebrations, pulling directly from Supabase.
- **`dashboard.html`**: The membership landing page. Renders the custom ATM-styled membership card and includes the **Daily Blessings** section.

### 2. Assets (`images/` & `image_for_quote/`)
- **`images/`**: Contains original web assets.
- **`image_for_quote/`**: Contains performance-optimized, compressed JPG images (`sathya_sai_baba.jpg` and `Maha Periyava.jpg`) for the daily blessings section, ensuring low bandwidth overhead.

### 3. Serverless Backend (`api/`)
- **`api/config.js`**: Resolves Supabase credentials from server-side environment variables on Vercel to protect keys while permitting dynamic runtime integration.
- **`api/send-welcome.js`**: Integrates with standard mail endpoints to email members as soon as they sign up or register.

### 4. Database Setup (`quote/`)
- **`quotes_setup.sql`**: Schema definition and 200 insert statements containing quotes from Sathya Sai Baba and Maha Periyava in English and Tamil. This SQL can be executed in the Supabase SQL editor to populate the DB.
