# Design: Reach + Donations (Static, Multi-Admin, Fully Responsive)

**Date:** 2026-08-25
**Status:** Approved (Sections 1-5b)
**Constraints:** Must stay static hosting (Vercel static + existing serverless `api/`), no extra Supabase cost, multiple admins, adaptable on every device (mobile/tablet/laptop/desktop, no mess)
**Repo:** Saipremakuteeram-orgin/SSDPK-orgin | Branch: main

---

## 1. Goal & Scope

**Goal:** Lift organic reach (SEO) and donation conversion without new infrastructure.

**In scope:**
- SEO foundation: dynamic `sitemap.xml` + `robots.txt` audit, per-page `og:image`/canonical/hreflang, JSON-LD `Event` + `Article` for `events`/`discourse`
- Sharing: Web Share API + copy-link + `?utm_source=share` on event/discourse cards
- Donation nudge: impact calculator on `pages/seva.html:146` ("₹101 = 1 meal × 3 families"), sticky mobile donate bar, post-donation social proof from existing `donations` count, receipt link (Razorpay `payment_id` URL — no PDF storage to avoid cost)

**Out of scope:** New email provider, push VAPID, PDF generation, new DB tables, new npm deps.

---

## 2. Architecture (Multi-Admin, Static)

```
Browser (static pages/* → Vercel CDN)
  → vercel.json rewrite /sitemap.xml → api/sitemap.js (read-only Supabase, 1h edge cache)
  → Existing api/razorpay/webhook.js + history.js (donations)
  → Client JS (js/main.js:29 dynamic nav + js/seva.js + new seo-inject.js) — no backend for share/calculator
```

**Reuse only existing tables:** `events(id,title,date,category,venue,updated_at,updated_by)`, `gallery(event_id,src_url)`, `members`, `donations` (supabase_donations.sql), `site_admins(email)` (already queried in pages/login.html).

**Multi-admin safety (2-5 admins):**
- Last-write-wins with `updated_at` check: `UPDATE events SET ... WHERE id=X AND updated_at=$old` → if 0 rows, toast "Edited by other admin — reload"
- `updated_by` email written on save; admin console `pages/dashboard.html:549` shows "Saved by you / by X"
- `api/razorpay/webhook.js` already idempotent on `payment_id`

**Static guarantee:** No SSR, no new env vars, no migration. Sitemap cache `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`; falls back to hardcoded 14 static URLs if Supabase down.

**Files changed (5):** New `api/sitemap.js` (or `scripts/generate-sitemap.js`), `vercel.json:4`, `pages/events.html` + `pages/discourse.html` + `js/seo-inject.js`, `pages/seva.html` + `js/seva.js`, `css/theme.css` (sticky bar).

---

## 3. Components (6 Isolated Units)

1. **api/sitemap.js**
   - Does: `SELECT id,date FROM events UNION discourses` → XML `<url><loc>https://.../events?id=…` + `lastmod` + static pages. Cached.
   - Interface: `GET /sitemap.xml → application/xml`
   - Depends: `api/shared/_supabase.cjs`

2. **Per-page SEO injector (`js/seo-inject.js` ~40 LOC)**
   - Does: Sets `og:image` = brochure/gallery first `src_url` or `/share-image.jpg`, injects JSON-LD `Event`/`Article` from fetched row.
   - Depends: Supabase read-only

3. **Share tracker (client-only, js/main.js:522 pattern)**
   - Does: `[data-share]` → `navigator.share()` else `clipboard.writeText(…?utm_source=share)` → `localStorage.share_count++`
   - Interface: `data-share="event-123"`

4. **Impact calculator (`pages/seva.html:162` + `js/seva.js`)**
   - Does: Tier `101/501/1101` → live "₹501 feeds 3 families" (static map, no API)
   - Interface: `data-amount → #impactText`

5. **Sticky mobile donate bar (`css/theme.css` + `pages/seva.html:210`)**
   - Does: `position:sticky; bottom:0` CTA on seva mobile only, hidden `min-width:768`

6. **Social proof + receipt link**
   - Does: After Razorpay success, `GET api/razorpay/history?mine=1` count this month → "You joined 47 supporters". Receipt = Razorpay `payment_id` link.

Each unit independently testable.

---

## 4. Data Flow & Error Handling

**Flows:**
- Crawl: Google → `/sitemap.xml` → Supabase read → XML (1h cache). On 429/down → return static 14-page sitemap + `Retry-After`.
- Share: Click `[data-share]` → native sheet or copy → toast "Link copied" → no network.
- Donate: Tier → `api/razorpay/order.js` → Razorpay checkout → `webhook.js` verifies signature → insert `donations`.
- OG/JSON-LD: Fetch row → inject `<meta og:image>` + JSON-LD. On 404 → fallback `/share-image.jpg` (`js/discourse.js:7` pattern).

**Handling:**
- Supabase read fails → SEO degrades gracefully (default image, no JSON-LD, static sitemap) — site still renders.
- Webhook duplicate → `WHERE payment_id NOT EXISTS` idempotent.
- Multi-admin race → `WHERE updated_at=$old` check → reload warning, no overwrite.

---

## 5. Testing & Rollout

**Tests (vitest.config.mjs, jsdom):**
- `tests/sitemap.test.js` — mock events → XML contains `/events?id=` + static pages, cache headers, fallback
- `tests/share.test.js` — click `[data-share]` → `navigator.share` or clipboard
- `tests/seva-calculator.test.js` — tiers → impact text
- Existing 175+ tests still pass

**Manual QA (15 min):** sticky bar on seva mobile, share sheet, `curl /sitemap.xml`, view-source JSON-LD, concurrent admin edit warning.

**Rollout:**
1. `api/sitemap.js` + `vercel.json` → preview deploy
2. `curl /sitemap.xml` + Search Console submit
3. Ship seva calculator + share → monitor Razorpay count
No migration, no billing change.

---

## 5b. Responsive / Adaptive (Every Device, No Mess)

**Breakpoints:** `320-479` mobile S, `480-767` mobile L, `768-1023` tablet, `1024-1439` laptop, `1440+` desktop. Nav hamburger at `768` (`css/critical.css:167`).

**Adaptive rules:**
- Sticky bar: `position:sticky; bottom:0; padding:12px; safe-area-inset-bottom` — 44px tap target, hidden `min-width:768`
- Calculator tiers: `grid-template-columns:repeat(auto-fit,minmax(88px,1fr))` → 3 cols laptop, 2 tablet, 1 col 320px; `clamp(14px,2vw,16px)`
- Share buttons: `flex; gap:8px; flex-wrap:wrap` 48px touch, native sheet mobile / copy desktop
- Admin console `dashboard.html:549`: `grid 1fr` on <768 → stacked, tables `overflow-x:auto`
- Base guarantees: `container{max-width:1200px; padding:0 20px}` + `img{max-width:100%}` (`critical.css:6-9`) on all pages (fixed `privacy/terms/contact` to use `critical.css`), `clamp` + `auto-fit`, `prefers-reduced-motion` (`critical.css:169`)

**Test matrix:** DevTools 320, 375, 768, 1024, 1440 + real Android/iOS + Lighthouse mobile ≥90. No fixed widths, no horizontal scroll.

---

## Appendix: File References

- `pages/index.html:90-96` critical CSS deferred pattern
- `pages/index.html:114-131` nav header (synced to all 14 pages in `d77164f`)
- `js/main.js:29` dynamic nav, `js/main.js:522` donate intent, `pages/seva.html:146` tiers, `pages/dashboard.html:582` overview
- `vercel.json:4` rewrites, `api/razorpay/*`, `supabase_donations.sql`, `js/discourse.js:7` thumbnail fallback
