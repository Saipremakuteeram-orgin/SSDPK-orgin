# Delink from Sathya Sai Organisation + Header Fix

Date: 2026-08-18
Status: Approved

## Context

The trust is entirely independent from the Sathya Sai organisation (sathyasai.org, SSSBPT, and their official bodies). The website currently contains external links and affiliation claims that incorrectly associate SSPK with that organisation. This spec removes those external links/claims while preserving the trust's own name, devotional content, and features.

Separately, the navigation header is broken on desktop (logo stretches to 388px, pushing links off-center) and on mobile (language switcher overflows past the nav width).

## Scope — Keep vs Change

### Keep (no changes)
- Org name "Sathya Sai Prema Kuterram" / "Sri Sai Dharma Samrakshana Prema Kuteeram"
- General bhajan/seva/study-circle content
- "Sai Ram" greetings (loader, chatbot, login modal, emails)
- Dashboard "Sathya Sai Baba" quote card + "Get your day message from Swami" button + guru toggle
- Discourses page content (nav link, page, sitemap, feed) — footer tagline still reworded per approval
- `images/sathya_sai_baba.*`, `js/dashboard-app.js` quote logic, email templates

### Remove / reword (external links + affiliation claims)
1. `pages/index.html` Organization schema: delete `sameAs` array (en.wikipedia.org/Sathya_Sai_Baba, sathyasai.org, sssbpt.org)
2. `pages/index.html` Organization + Event schema `description`: drop "teachings of Sri Sathya Sai Baba"
3. `pages/index.html` hero subtitle: reword to selfless service / universal love / community
4. `pages/index.html` "What Is SSPK" paragraph: remove Wikipedia link, reword "inspired by the teachings of Sri Sathya Sai Baba"
5. `pages/index.html` impact table "Annual seva review" cell: remove sathyasai.org link → "SSPK annual impact review"
6. `pages/index.html` citation paragraph: drop sssbpt.org "Sri Sathya Sai Baba Central Trust guidance" clause; keep sciencedirect source
7. `pages/index.html` blockquote `cite` attributes pointing at sathyasai.org / sssbpt.org
8. `pages/index.html` FAQ answer + footer tagline
9. All other pages' footers (about, events, discourse, gallery, login, seva, signup, trustees, dashboard, contact): reword tagline to "A registered charitable trust serving with love through seva, devotion, and community."
10. `i18n/en.json` `home.heroSubtitle`: match reworded subtitle
11. `pages/about.html` meta descriptions, "Birthday celebration of Sri Sathya Sai Baba" card, subtitle

## Header Fix

### Desktop
`css/theme.css` rule `nav .container > * { flex: 1 }` overrides `.nav-brand{flex:0 0 auto}` (specificity), stretching the logo to ~388px and pushing links off-center.
Fix: `nav .container > .nav-links { flex: 1 }` so only the links flex.

### Mobile (≤768px)
`js/i18n.js` mobile media query sets `.language-switcher { width: 100% }`, which overflows the flex-row nav (714px inside a 754px bar).
Fix: `width: auto` (compact selector beside the hamburger).

## Verification
- `npm test` passes
- Headless-browser (Brave CDP) re-check: desktop 1366px — brand auto-width, links centered; mobile 762px — langSwitcher fits, no horizontal overflow
- No `sathyasai.org` / `sssbpt.org` / Wikipedia-Sai links remain in served HTML
- Commit, push, deploy via `npx vercel --prod --yes`