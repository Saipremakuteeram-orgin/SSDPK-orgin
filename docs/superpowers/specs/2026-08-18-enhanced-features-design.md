# Enhanced Features — Sathya Sai Prema Kuteeram

Date: 2026-08-18
Status: Proposed feature menu (not yet selected for implementation)

This document captures the feature ideas brainstormed for the website, organized around four strategic goals. Each feature is mapped to existing infrastructure so implementation effort can be estimated against what the site already has.

---

## Strategic Goals

1. **Grow donations/seva support** — more donation paths, receipts, donor engagement, campaigns
2. **Engage existing members** — richer member portal, community, events, communication
3. **Reach new visitors** — content, SEO, outreach, storytelling
4. **Streamline admin work** — reduce manual effort for trustees/volunteers

---

## Feature Menu

### A. Grow donations/seva support

| # | Feature | Description | Reuses |
|---|---------|-------------|--------|
| 1 | **One-time donation page** | Simple "donate once" flow with amount tiers + instant confirmation. Currently only Razorpay *subscriptions* exist. | Razorpay order API, seva.js |
| 2 | **Donation receipts** | Auto-email PDF receipts with a tracking ID after any donation. | `api/_mail.js`, `api/razorpay/webhook.js` |
| 3 | **Donor wall / recent contributions** | Public gratitude list of recent donors, anonymous by default. | Razorpay history API, Supabase |
| 4 | **Campaigns / fundraisers** | e.g. "Winter blankets", "Festival feast" with progress bars and campaign-specific donations. | Razorpay order/subscription, events schema |

### B. Engage existing members

| # | Feature | Description | Reuses |
|---|---------|-------------|--------|
| 5 | **Member directory** | Searchable member list with privacy controls (show/hide contact info). | Supabase `profiles`, dashboard-app.js |
| 6 | **Event registration & RSVP** | Sign up for events from the calendar, automated reminders before the event. | `api/notify-event.js`, events schema |
| 7 | **Birthday/anniversary wishes** | Automated greetings sent via email or Telegram on member special dates. | `api/_mail.js`, Telegram bot in `api/shared/` |
| 8 | **Community feed / announcements** | Threaded member posts/announcements in the dashboard (distinct from weekly Discourse messages). | Supabase, dashboard-app.js |

### C. Reach new visitors

| # | Feature | Description | Reuses |
|---|---------|-------------|--------|
| 9 | **Blog / News section** | SEO-friendly articles, sitemap, social share links. | pages/ + vercel.json rewrites |
| 10 | **Video/photo storytelling** | Embed YouTube videos and photo albums on the homepage; gallery is currently event-tied. | gallery.html, images/ |
| 11 | **Volunteer signup form** | Capture interest, skills, and availability; lands in admin console. | Supabase, admin console |
| 12 | **Testimonials** | Curated stories from members/donors. | Supabase |

### D. Streamline admin work

| # | Feature | Description | Reuses |
|---|---------|-------------|--------|
| 13 | **Export to CSV** | Export members, donations, events from the admin console. | dashboard-app.js admin console |
| 14 | **Telegram broadcast to members** | One-click announcements pushed to members via the existing Telegram bot. | `api/shared/telegram-bot.cjs` |
| 15 | **Pending approvals queue** | Moderate new signups, gallery uploads, and event reports in a single screen. | Admin console, weekly-messages.js |
| 16 | **Event RSVP tracking** | Attendance sheets, who's coming, post-event report linkage. | events schema, uploadEventReport |

---

## Recommended starting point

**One-time donations + receipts (A1–A2)** and **Event registration & RSVP (B6)** are the highest-value first selections:

- Both reuse existing Razorpay, mail, and Telegram infrastructure.
- One-time donations directly grow seva support (goal 1).
- Event RSVP engages members (goal 2) and reduces admin effort (goal 4).
- Together they also give visitors a clear call to action (goal 3).

---

## Next steps

1. Select 1–2 features from the menu to brainstorm in depth.
2. Write a detailed design spec per selected feature.
3. Produce an implementation plan and build.
