# Delink from Sathya Sai Organisation + Header Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all external links and affiliation claims to the Sathya Sai organisation from the website while fixing the broken navigation header.

**Architecture:** Two independent work streams: (1) content edits removing sathyasai.org/sssbpt.org/Wikipedia links and "teachings of Sri Sathya Sai Baba" affiliation claims across HTML pages and i18n; (2) two CSS/JS fixes to the nav flex layout. All changes are static-content edits; the site is a static Vercel deploy with no build step beyond Vercel's static output.

**Tech Stack:** Static HTML/CSS/JS, vitest test suite, Vercel CLI deploys.

## Global Constraints

- Keep org name "Sathya Sai Prema Kuterram" and "Sri Sai Dharma Samrakshana Prema Kuteeram" unchanged everywhere.
- Keep "Sai Ram" greetings, dashboard Sai-quote feature, Discourses page content, `images/sathya_sai_baba.*`, email templates unchanged.
- No `sathyasai.org`, `sssbpt.org`, or `en.wikipedia.org/wiki/Sathya_Sai_Baba` links may remain in any served HTML after completion.
- New footer tagline (exact): "A registered charitable trust serving with love through seva, devotion, and community."
- Canonical domain: `https://saidharmasamrakshanapremakuteeram.qzz.io`
- No code comments unless the file already uses them in that style.
- Every task ends with `npm test` passing and a commit.

---

### Task 1: Delink homepage (index.html)

**Files:**
- Modify: `pages/index.html`

**Interfaces:**
- Consumes: none
- Produces: homepage with no external Sai-org links or affiliation claims (all other tasks depend on the served HTML being clean)

- [ ] **Step 1: Remove Organization schema `sameAs` array and reword description**

In `pages/index.html`, locate the Organization `application/ld+json` block (starts ~line 41). Remove the entire `"sameAs": [...]` array (lines ~49-53). Change `"description"` from:
```
"A spiritual trust dedicated to selfless service, universal love, and the teachings of Sri Sathya Sai Baba."
```
to:
```
"A registered charitable trust dedicated to selfless service, universal love, and community building."
```

- [ ] **Step 2: Reword Event schema description**

In the Event `application/ld+json` block (~line 112), change `"description"` from:
```
"Weekly bhajan devotional singing and prayers following the teachings of Sri Sathya Sai Baba, open to all devotees and seekers."
```
to:
```
"Weekly bhajan devotional singing and prayers, open to all devotees and seekers."
```

- [ ] **Step 3: Reword hero subtitle**

In the hero section (`<p data-i18n="home.heroSubtitle">`, ~line 200), change:
```
A spiritual trust dedicated to selfless service, universal love, and the teachings of Sri Sathya Sai Baba — inspiring you through seva, devotion, and community. Whether you join a bhajan, volunteer at a food drive, or simply offer your prayers, there is a place for you here.
```
to:
```
A registered charitable trust dedicated to selfless service, universal love, and community building — inspiring you through seva, devotion, and prayer. Whether you join a bhajan, volunteer at a food drive, or simply offer your prayers, there is a place for you here.
```

- [ ] **Step 4: Reword "What Is SSPK" paragraph and remove Wikipedia link**

In the "What Is Sathya Sai Prema Kuterram?" paragraph (~line 332), change:
```
Sathya Sai Prema Kuterram (officially <strong>Sri Sai Dharma Samrakshana Prema Kuteeram</strong>) is a public charitable trust inspired by the teachings of <a href="https://en.wikipedia.org/wiki/Sathya_Sai_Baba" target="_blank" rel="noopener">Sri Sathya Sai Baba</a>. Consequently, the trust unites devotees around the twin principles of <em>Love All, Serve All</em> — transforming devotion into concrete acts of service such as food drives, health camps, bhajans, and value-based education for children and youth.
```
to:
```
Sathya Sai Prema Kuterram (officially <strong>Sri Sai Dharma Samrakshana Prema Kuteeram</strong>) is a public charitable trust devoted to selfless service and spiritual growth. Consequently, the trust unites devotees around the twin principles of <em>Love All, Serve All</em> — transforming devotion into concrete acts of service such as food drives, health camps, bhajans, and value-based education for children and youth.
```

- [ ] **Step 5: Remove sathyasai.org link from impact table**

In the impact table (~line 384), change the "Seva activities" row's Source cell from:
```
<td><a href="https://www.sathyasai.org/" target="_blank" rel="noopener">Annual seva review</a></td>
```
to:
```
<td>SSPK annual impact review</td>
```

- [ ] **Step 6: Drop sssbpt.org clause from citation paragraph**

In the citation paragraph (~line 391), change:
```
Our research and reporting on voluntary service consistently link structured community programs with stronger long-term engagement. For example, peer-reviewed findings on <a href="https://www.sciencedirect.com/science/article/pii/S0048733317300333" target="_blank" rel="noopener">volunteering and organizational impact</a> support this model, as does guidance from the <a href="https://www.sssbpt.org/" target="_blank" rel="noopener">Sri Sathya Sai Baba Central Trust</a>.
```
to:
```
Our research and reporting on voluntary service consistently link structured community programs with stronger long-term engagement. For example, peer-reviewed findings on <a href="https://www.sciencedirect.com/science/article/pii/S0048733317300333" target="_blank" rel="noopener">volunteering and organizational impact</a> support this model.
```

- [ ] **Step 7: Remove blockquote cite attributes**

Find the two `<blockquote cite=...>` elements (~lines 424, 428). Remove the `cite` attribute from both, leaving `<blockquote>`.

- [ ] **Step 8: Reword FAQ answer**

In the FAQ "What Is Sathya Sai Prema Kuterram?" answer (~line 494), change:
```
It is a public charitable trust inspired by Sri Sathya Sai Baba, focused on selfless service, spiritual growth, and community building. In short, you will find seva, bhajan, and study circles under one roof.
```
to:
```
It is a public charitable trust focused on selfless service, spiritual growth, and community building. In short, you will find seva, bhajan, and study circles under one roof.
```

- [ ] **Step 9: Reword homepage footer tagline**

In the footer (~line 562), change:
```
A spiritual trust dedicated to the teachings of Sri Sathya Sai Baba. Love All, Serve All.
```
to:
```
A registered charitable trust serving with love through seva, devotion, and community.
```

- [ ] **Step 10: Verify no Sai-org links remain in homepage**

Run:
```
rg -n -i "sathyasai\.org|sssbpt|wikipedia.org/wiki/Sathya_Sai_Baba" pages/index.html
```
Expected: no output (exit code 1).

- [ ] **Step 11: Run tests and commit**

Run: `npm test`
Expected: 175 tests pass.

```bash
git add pages/index.html
git commit -m "delink: remove Sathya Sai org links and claims from homepage"
```

---

### Task 2: Reword remaining page footers

**Files:**
- Modify: `pages/about.html`, `pages/dashboard.html`, `pages/events.html`, `pages/discourse.html`, `pages/gallery.html`, `pages/login.html`, `pages/seva.html`, `pages/signup.html`, `pages/trustees.html`, `pages/contact.html`

**Interfaces:**
- Consumes: new footer tagline from Global Constraints
- Produces: consistent neutral footer on all public pages

- [ ] **Step 1: Replace footer tagline in every page**

In each file listed above, find the footer line:
```
<p>A spiritual trust dedicated to the teachings of Sri Sathya Sai Baba. Love All, Serve All.</p>
```
and replace with:
```
<p>A registered charitable trust serving with love through seva, devotion, and community.</p>
```

Exact locations:
- `pages/about.html:445`
- `pages/dashboard.html:798`
- `pages/events.html:614`
- `pages/discourse.html:119`
- `pages/gallery.html:210`
- `pages/login.html:199`
- `pages/seva.html:209`
- `pages/signup.html:245`
- `pages/trustees.html:584`
Note: `pages/contact.html` has no footer tagline (minimal page) — skip it.

- [ ] **Step 2: Verify no old tagline remains**

Run:
```
rg -n "teachings of Sri Sathya Sai Baba" pages/
```
Expected: only lines in the about.html meta description and index.html already handled in Task 1 (or none after Task 3); no footer occurrences.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`
Expected: 175 tests pass.

```bash
git add pages/about.html pages/dashboard.html pages/events.html pages/discourse.html pages/gallery.html pages/login.html pages/seva.html pages/signup.html pages/trustees.html pages/contact.html
git commit -m "delink: reword footer taglines across all pages"
```

---

### Task 3: Reword about.html claims

**Files:**
- Modify: `pages/about.html`

**Interfaces:**
- Consumes: none
- Produces: about page with neutral meta description, subtitle, and event card

- [ ] **Step 1: Reword meta descriptions**

In `pages/about.html` (~lines 10, 16), change:
```
Discover the activities of Sathya Sai Prema Kuterram â€” seva drives, bhajans, study circles, health camps, and value-based education guided by Sri Sathya Sai Baba.
```
to:
```
Discover the activities of Sathya Sai Prema Kuterram â€” seva drives, bhajans, study circles, health camps, and value-based education.
```
Apply to the `<meta name="description">` line and the `<meta property="og:description">` line.

- [ ] **Step 2: Reword event card**

In `pages/about.html` (~line 178), change:
```
Birthday celebration of Sri Sathya Sai Baba with devotional programs.
```
to:
```
Annual birthday celebration with devotional programs and community gathering.
```

- [ ] **Step 3: Reword section subtitle**

In `pages/about.html` (~line 412), change:
```
Numbers that reflect our commitment to Love All, Serve All.
```
to:
```
Numbers that reflect our commitment to seva and community.
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test`
Expected: 175 tests pass.

```bash
git add pages/about.html
git commit -m "delink: neutralize about page claims"
```

---

### Task 4: Update i18n en.json hero subtitle

**Files:**
- Modify: `i18n/en.json`

**Interfaces:**
- Consumes: new hero subtitle text from Task 1 Step 3
- Produces: translation matching the reworded hero subtitle (only the `en` locale is updated; other locales are the user's responsibility)

- [ ] **Step 1: Reword heroSubtitle in en.json**

In `i18n/en.json` (~line 16), change:
```
"heroSubtitle": "A spiritual trust dedicated to selfless service, universal love, and the teachings of Sri Sathya Sai Baba.",
```
to:
```
"heroSubtitle": "A registered charitable trust dedicated to selfless service, universal love, and community building.",
```

- [ ] **Step 2: Run tests and commit**

Run: `npm test`
Expected: 175 tests pass.

```bash
git add i18n/en.json
git commit -m "delink: update en hero subtitle translation"
```

---

### Task 5: Fix desktop nav flex bug

**Files:**
- Modify: `css/theme.css:114-116`

**Interfaces:**
- Consumes: none
- Produces: `.nav-brand` no longer stretches on desktop

- [ ] **Step 1: Fix the nav container flex rule**

In `css/theme.css`, change:
```css
nav .container > * {
  flex: 1;
}
```
to:
```css
nav .container > .nav-links {
  flex: 1;
}
```

- [ ] **Step 2: Verify the change with a headless browser**

Run the CDP inspection script against the local server (see Task 7 for the reusable script). Expected on desktop (1366px): `.nav-brand` computed `flex: 0 0 auto` with content width (~106px), not ~388px.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`
Expected: 175 tests pass.

```bash
git add css/theme.css
git commit -m "fix(header): stop nav brand from stretching on desktop"
```

---

### Task 6: Fix mobile language switcher overflow

**Files:**
- Modify: `js/i18n.js:186-200`

**Interfaces:**
- Consumes: none
- Produces: compact language switcher inside the nav on mobile

- [ ] **Step 1: Fix the mobile media query**

In `js/i18n.js` mobile media query, change:
```css
@media (max-width: 768px) {
  .language-switcher {
    order: 10;
    margin-left: 0;
    margin-top: 8px;
    width: 100%;
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
  }
  .lang-select {
    width: 100%;
  }
}
```
to:
```css
@media (max-width: 768px) {
  .language-switcher {
    order: 10;
    margin-left: auto;
    width: auto;
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
  }
  .lang-select {
    width: auto;
  }
}
```

- [ ] **Step 2: Verify with a headless browser**

Run the CDP inspection script (Task 7). Expected on mobile (762px): `#langSwitcher` rect width ≤ ~160px, right edge inside the nav container, no horizontal overflow.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`
Expected: 175 tests pass.

```bash
git add js/i18n.js
git commit -m "fix(header): prevent language switcher overflow on mobile"
```

---

### Task 7: Verify delinking + header fix, deploy

**Files:**
- Create: `C:\Users\Sathya\AppData\Local\Temp\opencode\cdp_verify.js` (reusable CDP script)
- Test: manual browser verification

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified production deployment

- [ ] **Step 1: Write the CDP verification script**

Create `C:\Users\Sathya\AppData\Local\Temp\opencode\cdp_verify.js`:

```js
const http = require('http');
const { spawn } = require('child_process');

const BRAVE = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const PORT = 9231;
const brave = spawn(BRAVE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, '--user-data-dir=C:\\Users\\Sathya\\AppData\\Local\\Temp\\opencode\\brave-verify', 'about:blank'], { stdio: 'ignore' });
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function getJson(url) { return new Promise((resolve, reject) => { http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject); }); }

let id = 0;
const pending = {};
async function main() {
  await sleep(3500);
  let tabs = await getJson(`http://localhost:${PORT}/json/list`);
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = msg => { const m = JSON.parse(msg.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } };
  const send = (method, params) => new Promise(res => { pending[++id] = res; ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');

  async function inspect(width, label) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 769 });
    await send('Page.navigate', { url: 'http://127.0.0.1:8899/pages/index.html' });
    await sleep(6000);
    const expr = `JSON.stringify((() => {
      const nav = document.getElementById('mainNav');
      const brand = nav.querySelector('.nav-brand');
      const links = document.getElementById('navLinks');
      const lang = document.getElementById('langSwitcher');
      const r = el => { const x = el.getBoundingClientRect(); return { x: Math.round(x.x), w: Math.round(x.width), right: Math.round(x.right) }; };
      const nb = getComputedStyle(brand), nf = getComputedStyle(nav), ncon = nav.querySelector('.container').getBoundingClientRect();
      return {
        width: window.innerWidth,
        brandFlex: nb.flex, brandRect: r(brand),
        linksDisplay: getComputedStyle(links).display,
        langRect: r(lang),
        navContainerRight: Math.round(ncon.right),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    })())`;
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    console.log(label, res.result.value);
  }
  await inspect(1366, 'DESKTOP:');
  await inspect(762, 'MOBILE:');
  ws.close(); brave.kill(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run local server + verify header**

Start the static server (if not already running):
```bash
Start-Process python -ArgumentList "-m","http.server","8899","--bind","127.0.0.1" -WorkingDirectory "C:\Users\Sathya\Downloads\Project\SSDPK-orgin" -WindowStyle Hidden
```
Then run:
```bash
node "C:\Users\Sathya\AppData\Local\Temp\opencode\cdp_verify.js"
```
Expected:
- DESKTOP: `brandFlex` = `0 0 auto` (not `1 1 0%`), brand width ~106px
- MOBILE: `langRect.w` small, `langRect.right` ≤ `navContainerRight`, `horizontalOverflow` = false

- [ ] **Step 3: Verify no Sai-org links in any served HTML**

Run:
```
rg -n -i "sathyasai\.org|sssbpt|wikipedia.org/wiki/Sathya_Sai_Baba" pages/ i18n/ feed.xml
```
Expected: no output. Also confirm `i18n/en.json` heroSubtitle is neutral.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: 175 tests pass.

- [ ] **Step 5: Commit any remaining changes**

```bash
git add -A
git commit -m "delink: verify no Sathya Sai org references remain" 
```
(If nothing to commit, skip.)

- [ ] **Step 6: Push and deploy**

```bash
git push origin main
npx vercel --prod --yes
```

- [ ] **Step 7: Verify production**

Run the CDP script against the production URL by replacing `http://127.0.0.1:8899/pages/index.html` with `https://saidharmasrakshanapremakuteeram.qzz.io/`. Alternatively, curl the production homepage and confirm:
```bash
curl.exe -s "https://saidharmasrakshanapremakuteeram.qzz.io/" | rg -i "sathyasai\.org|sssbpt|wikipedia.org/wiki/Sathya_Sai_Baba"
```
Expected: no output.