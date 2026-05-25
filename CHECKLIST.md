# 📋 SSPK Web Portal: Local & Deployment Checklist

This checklist ensures all features (Events Calendar, Member Registration, Digital Card Downloads, Gallery Sync, and Telegram Bot) are 100% operational in your local environment and live on Vercel.

---

## 💻 1. Local Environment Checklist (Avoid CORS Blocks)

> [!WARNING]
> **Do not double-click `index.html` to open it in your browser!** 
> Opening static files directly via `file:///` causes browsers to block Supabase connections and dynamic features due to strict **CORS (Cross-Origin Resource Sharing)** security.

### How to run locally:
To test your website locally, you must run it through a local web server:
1. Open PowerShell in your project directory:
   ```powershell
   python -m http.server 8000
   ```
2. Open your browser and go to:
   ```text
   http://localhost:8000
   ```

### Local Checklist:
- [x] **Local Server Running:** Served at `http://localhost:8000` via Python or VS Code Live Server.
- [x] **Supabase Connected:** Press `F12` in your browser → select the **Console** tab. Verify there are no red network errors related to `createClient` or Supabase fetch blockages.
- [x] **Home Page (`index.html`):** The brand logo zoom popup works, and the neon dark saffron colors render perfectly.
- [x] **Events Page (`events.html`):** Loads upcoming events from Supabase. Tabular rows click open the centered popup details modal.
- [x] **Gallery Page (`gallery.html`):** Loads photos dynamically from Supabase database references.
- [x] **Dashboard (`dashboard.html`):** 
  - [x] Login with `saiadmin` / `Sai@1926@@` works.
  - [x] Member registration and OTP simulation work.
  - [x] Golden Digital ATM Membership Card renders and downloads perfectly.
  - [x] Adding/Editing/Deleting events syncs live with Supabase.
  - [x] Uploading gallery photos (with image compression) uploads successfully to Supabase Storage.

---

## ☁️ 2. Supabase Settings Checklist

For both local and Vercel builds to function, your Supabase project must be configured as follows:

- [x] **Supabase SQL Schema:** You have copied the entire contents of `supabase_setup.sql` and run them successfully in your **Supabase SQL Editor** to create `members`, `events`, and `gallery` tables.
- [x] **Supabase Storage Bucket:**
  1. Go to your **Supabase Dashboard** → **Storage**.
  2. Create a bucket exactly named: **`gallery-images`**.
  3. **CRITICAL:** Toggle the bucket to **Public** so that Vercel and the Telegram bot can fetch image URLs publicly.
- [x] **Row Level Security (RLS) Policies:** Enabled as defined in `supabase_setup.sql` so that standard users can read items, and admins can write/delete items.

---

## 🚀 3. Vercel Deployment Checklist

- [x] **Correct Commit Email:** Git configured to use your verified GitHub email address (`sk143sathya@gmail.com`) so Vercel does not block deployments.
- [x] **Active Supabase Keys in Code:** In your local workspace, **`js/supabase-client.js`** contains your actual Supabase URL and Anon Key. (This must be committed to GitHub so Vercel's build output contains the correct endpoint references).
- [x] **Automatic Rebuilding:** When you push a commit to the `main` branch on GitHub, your Vercel project automatically triggers a new deployment build.
- [x] **Verify Vercel Live Build:** Visit your public `.vercel.app` URL and check if the database contents (Events & Gallery) load dynamically.

---

## 🤖 4. Telegram Bot Checklist (`bot.py`)

- [x] **Dependencies Installed:** `pip install -r requirements.txt` executed successfully.
- [x] **Environment Configuration:** Your `.env` file contains your **real** keys:
  - `TELEGRAM_BOT_TOKEN` (from @BotFather)
  - `GEMINI_API_KEY` (from Google AI Studio)
  - `SUPABASE_URL` and `SUPABASE_ANON_KEY` (from Supabase Settings)
- [x] **Asyncio Event Loop compatibility:** Standard asyncio event loops initialized on startup to support Python 3.12+ environments on Windows.
- [x] **Command verification:**
  - [x] `/start` sends the premium welcoming interface.
  - [x] `/menu` opens the dynamic inline keyboard (Events, Quote, Gallery, and Contact support).
  - [x] `/gallery` displays Supabase category buttons.
  - [x] `/addgallery` (admin conversation flow) downloads photo, uploads to Supabase Storage `gallery-images` bucket, and saves reference URL in `gallery` table successfully.
  - [x] Global Inline queries (typing `@your_bot_name` in any chat) searches database and shares cards smoothly.
