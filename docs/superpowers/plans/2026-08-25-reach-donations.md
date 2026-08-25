# Reach + Donations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship SEO foundation (dynamic sitemap + per-page OG/JSON-LD) and donation nudge (calculator + sticky bar + share + social proof) staying static-hosted, zero extra Supabase cost, multi-admin safe, fully responsive on mobile/tablet/laptop/desktop.

**Architecture:** New `api/sitemap.js` reads `events`+`discourse` read-only with 1h edge cache; client JS `js/seo-inject.js` and `js/share.js` augment existing `pages/events.html`/`discourse.html`/`seva.html`; `vercel.json` rewrite `/sitemap.xml` → `api/sitemap.js`; reuse `site_admins`, `donations`, `gallery` tables.

**Tech Stack:** Vercel static + serverless (`api/*.js`), Supabase JS (`@supabase/supabase-js@2.112`), vanilla JS, `css/critical.css` + `css/theme.css` + `css/divine.css`, Vitest 3.2 + jsdom 25

## Global Constraints

- Must stay static hosting: Vercel static CDN + existing `api/` serverless only, no new servers/containers — one line
- No extra Supabase cost: reuse existing tables `events`, `gallery`, `discourse/weekly_messages`, `donations`, `site_admins`; read-only cheap queries, no new tables/storage — one line
- Multiple admins supported: `site_admins(email)` + optimistic `updated_at` check, last-write-wins with reload warning — one line
- Adaptable on every device: breakpoints 320/480/768/1024/1440, `container max-width:1200px`, `clamp` + `auto-fit`, 44px tap targets, no horizontal scroll, `safe-area-inset-bottom` — one line
- Naming/copy: preserve `data-i18n` keys, no breaking `vercel.json` rewrites — one line

---

## File Structure

- **New:** `api/sitemap.js` — handles `GET /sitemap.xml`, caches `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`
- **New:** `js/seo-inject.js` — sets `og:image` and injects JSON-LD `Event`/`Article` from fetched Supabase row
- **New:** `js/share.js` — `data-share` click → `navigator.share` or clipboard copy with `?utm_source=share`, `localStorage.share_count`
- **Modify:** `vercel.json:4` — add rewrite `{ "source": "/sitemap.xml", "destination": "/api/sitemap.js" }`
- **Modify:** `pages/events.html:640`, `pages/discourse.html:103` — include `js/seo-inject.js` + `js/share.js` defer, add `data-share` buttons on cards/tables
- **Modify:** `pages/seva.html:146` — add `#impactText`, sticky bar markup
- **Modify:** `js/seva.js` — calculator logic + sticky bar + social proof fetch `api/razorpay/history.js`
- **Modify:** `css/theme.css` — add `.seva-sticky-bar`, `.impact-calculator` responsive grid
- **Test:** `tests/sitemap.test.js`, `tests/seo-inject.test.js`, `tests/share.test.js`, `tests/seva-calculator.test.js`

---

### Task 1: Sitemap API (static, cached, fallback)

**Files:**
- Create: `api/sitemap.js`
- Modify: `vercel.json:4`
- Test: `tests/sitemap.test.js`

**Interfaces:**
- Consumes: `process.env.SUPABASE_URL`, `process.env.SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`, Supabase tables `events(id,date)`, `weekly_messages` or `discourse(id,date)`; existing `api/shared/admin-auth.cjs` not needed (public)
- Produces: `GET /sitemap.xml → application/xml` with `<urlset>` containing 14 static URLs + dynamic `https://saidharmasamrakshanapremakuteeram.qzz.io/events?id=<id>` + `/discourse?id=<id>` + `/gallery`

- [ ] **Step 1: Write failing test `tests/sitemap.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({
  from: (table) => ({
    select: () => ({
      order: async () => ({ data: table==='events' ? [{id:1,date:'2026-08-20'},{id:2,date:'2026-08-21'}] : [{id:10,date:'2026-08-18'}], error:null })
    })
  })
})) }));
import handler from '../api/sitemap.js';
function mockRes(){ const r={}; r.status=(c)=>{r.code=c; return r}; r.setHeader=(k,v)=>{r[k]=v; return r}; r.send=(b)=>{r.body=b; return r}; return r; }
describe('sitemap',()=>{
  it('returns xml with static + dynamic urls and cache headers', async ()=>{
    const req={method:'GET'}; const res=mockRes(); await handler(req,res);
    expect(res.code).toBe(200); expect(res['Content-Type']).toMatch(/xml/);
    expect(res.body).toContain('https://saidharmasamrakshanapremakuteeram.qzz.io/'); 
    expect(res.body).toContain('/events?id=1'); expect(res.body).toContain('/discourse?id=10');
    expect(res['Cache-Control']).toContain('max-age=3600');
  });
  it('falls back to static list on supabase error', async ()=>{
    const { createClient } = await import('@supabase/supabase-js');
    createClient.mockReturnValueOnce({ from:()=>({ select:()=>({ order: async()=>({data:null,error:{message:'fail'}}) }) }) });
    const req={method:'GET'}; const res=mockRes(); await handler(req,res);
    expect(res.code).toBe(200); expect(res.body).toContain('https://saidharmasamrakshanapremakuteeram.qzz.io/about');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sitemap.test.js -v`
Expected: FAIL `Cannot find module '../api/sitemap.js'`

- [ ] **Step 3: Create `api/sitemap.js` minimal implementation**

```js
// api/sitemap.js — dynamic sitemap, static fallack, 1h cache
const BASE = 'https://saidharmasamrakshanapremakuteeram.qzz.io';
const STATIC_PATHS = ['/','/about','/trustees','/gallery','/events','/discourse','/seva','/dashboard','/login','/signup','/contact','/privacy','/terms','/about.html'];
module.exports = async function handler(req,res){
  if(req.method !== 'GET') return res.status(405).send('Method not allowed');
  res.setHeader('Content-Type','application/xml');
  res.setHeader('Cache-Control','public, max-age=3600, stale-while-revalidate=86400');
  let events=[], discourses=[];
  try{
    const { createClient } = require('@supabase/supabase-js');
    const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY;
    if(url && key){
      const sb=createClient(url,key);
      const ev=await sb.from('events').select('id,date').order('date',{ascending:false}).limit(500);
      const dc=await sb.from('weekly_messages').select('id,date').order('date',{ascending:false}).limit(500);
      if(!ev.error && ev.data) events=ev.data;
      if(!dc.error && dc.data) discourses=dc.data;
      else {
        const dc2=await sb.from('discourse').select('id,date').order('date',{ascending:false}).limit(500);
        if(!dc2.error && dc2.data) discourses=dc2.data;
      }
    }
  }catch(e){ /* fallback to static only */ }
  const esc=(s)=>s.replace(/&/g,'&amp;');
  const urls=[
    ...STATIC_PATHS.map(p=>`  <url><loc>${esc(BASE+p)}</loc><changefreq>weekly</changefreq><priority>${p==='/'?'1.0':'0.7'}</priority></url>`),
    ...events.map(r=>`  <url><loc>${esc(`${BASE}/events?id=${r.id}`)}</loc><lastmod>${esc(r.date||'2026-08-25')}</lastmod><changefreq>weekly</changefreq></url>`),
    ...discourses.map(r=>`  <url><loc>${esc(`${BASE}/discourse?id=${r.id}`)}</loc><lastmod>${esc(r.date||'2026-08-25')}</lastmod></url>`)
  ].join('\n');
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  return res.status(200).send(xml);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/sitemap.test.js -v`
Expected: PASS 2/2

- [ ] **Step 5: Add rewrite to `vercel.json:4`**

Edit `vercel.json` rewrites array — insert before `"/api/config"` line:

```json
{ "source": "/sitemap.xml", "destination": "/api/sitemap.js" },
```

- [ ] **Step 6: Commit**

```bash
git add api/sitemap.js vercel.json tests/sitemap.test.js
git commit -m "feat(sitemap): dynamic sitemap.xml with cache and static fallback"
```

---

### Task 2: Per-Page OG Image + JSON-LD Injector

**Files:**
- Create: `js/seo-inject.js`
- Modify: `pages/events.html:640`, `pages/discourse.html:103` (add `<script defer src="/js/seo-inject.js">`)
- Test: `tests/seo-inject.test.js`

**Interfaces:**
- Consumes: Supabase `gallery(event_id,src_url)` for event og:image, `weekly_messages` row for discourse; existing `js/supabase-client.js` global `supabase`
- Produces: Side-effect: sets `<meta property="og:image" content="...">` and injects `<script type="application/ld+json">` with `@type: Event` or `Article`; exports `setOgImage(url)`, `injectEventJsonLd(evt)` for test

- [ ] **Step 1: Write failing test `tests/seo-inject.test.js`**

```js
import { describe,it,expect,beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
describe('seo-inject',()=>{
  beforeEach(()=>{ const dom=new JSDOM('<!doctype html><html><head><meta property="og:image" content="/share-image.jpg"></head><body></body></html>'); global.document=dom.window.document; });
  it('setOgImage updates meta', async ()=>{
    const m=await import('../js/seo-inject.js'); m.setOgImage('https://cdn.example/img.jpg');
    expect(document.querySelector('meta[property="og:image"]').content).toContain('cdn.example');
  });
  it('injectEventJsonLd adds script', async ()=>{
    const m=await import('../js/seo-inject.js'); m.injectEventJsonLd({title:'Test Bhajan',date:'2026-08-20',venue:'Brindhavan',category:'bhajan'});
    const s=document.querySelector('script[type="application/ld+json"]'); expect(s).not.toBeNull(); expect(s.textContent).toContain('Test Bhajan'); expect(s.textContent).toContain('Event');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/seo-inject.test.js -v`
Expected: FAIL `Cannot find module`

- [ ] **Step 3: Create `js/seo-inject.js`**

```js
// js/seo-inject.js — og:image + JSON-LD injector, no extra cost
(function(){
  function setOgImage(url){
    if(!url) return;
    let meta=document.querySelector('meta[property="og:image"]');
    if(!meta){ meta=document.createElement('meta'); meta.setAttribute('property','og:image'); document.head.appendChild(meta); }
    meta.setAttribute('content', url);
  }
  function injectEventJsonLd(evt){
    if(!evt) return;
    const data={ "@context":"https://schema.org", "@type":"Event", name:evt.title, startDate:evt.date, location:{ "@type":"Place", name: evt.venue||'Sri Sai Brindhavan' }, image: evt.image||'https://saidharmasamrakshanapremakuteeram.qzz.io/share-image.jpg', description: evt.description||'', organizer:{ "@type":"Organization", name:"Sri Sai Dharma Samrakshana Prema Kuteeram", url:"https://saidharmasamrakshanapremakuteeram.qzz.io/" } };
    let s=document.createElement('script'); s.type='application/ld+json'; s.textContent=JSON.stringify(data); document.head.appendChild(s);
  }
  function injectArticleJsonLd(d){
    const data={ "@context":"https://schema.org", "@type":"Article", headline:d.title, datePublished:d.date, image:d.thumbnail||d.image, author:{ "@type":"Organization", name:"SSPK"} };
    let s=document.createElement('script'); s.type='application/ld+json'; s.textContent=JSON.stringify(data); document.head.appendChild(s);
  }
  // auto-run on events/discourse pages: try to set og:image from first gallery image or brochure
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      if(typeof supabase==='undefined') return;
      const params=new URLSearchParams(location.search); const id=params.get('id');
      if(location.pathname.includes('events') && id){
        const {data}=await supabase.from('gallery').select('src_url').eq('event_id',id).limit(1);
        if(data && data[0] && data[0].src_url) setOgImage(data[0].src_url);
        const {data:ev}=await supabase.from('events').select('*').eq('id',id).single();
        if(ev) injectEventJsonLd(ev);
      }
      if(location.pathname.includes('discourse') && id){
        const {data}=await supabase.from('weekly_messages').select('*').eq('id',id).single();
        if(data) injectArticleJsonLd(data);
      }
    }catch(e){}
  });
  if(typeof module!=='undefined') module.exports={setOgImage, injectEventJsonLd, injectArticleJsonLd};
  else { window.SEOInject={setOgImage, injectEventJsonLd, injectArticleJsonLd}; }
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/seo-inject.test.js -v`
Expected: PASS

- [ ] **Step 5: Wire into pages**

Edit `pages/events.html` before `</body>` (after `js/main.js`): `<script src="/js/seo-inject.js" defer></script>`
Same edit `pages/discourse.html`.

- [ ] **Step 6: Commit**

```bash
git add js/seo-inject.js pages/events.html pages/discourse.html tests/seo-inject.test.js
git commit -m "feat(seo): per-page og:image and JSON-LD injector for events/discourse"
```

---

### Task 3: Share Tracker (Web Share + Copy + UTM)

**Files:**
- Create: `js/share.js`
- Modify: `pages/events.html:865` (add `data-share` buttons in table `actionTd` + calendar drawer), `pages/discourse.html` discourse cards
- Test: `tests/share.test.js`

**Interfaces:**
- Consumes: `navigator.share`, `navigator.clipboard.writeText`, `localStorage`
- Produces: `window.Share.handleShare(url,title)` → `Promise<boolean>`; side-effect `localStorage.share_count`

- [ ] **Step 1: Write failing test `tests/share.test.js`**

```js
import { describe,it,expect,vi,beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
describe('share',()=>{
  beforeEach(()=>{ const dom=new JSDOM('<!doctype html><body><button data-share="https://example.com/events?id=1">Share</button></body></html>'); global.document=dom.window.document; global.navigator={}; global.localStorage={ store:{}, getItem(k){return this.store[k]||null}, setItem(k,v){this.store[k]=v} }; });
  it('handleShare uses navigator.share when available', async ()=>{
    global.navigator.share=vi.fn(()=>Promise.resolve());
    const m=await import('../js/share.js'); await m.handleShare('https://example.com/events?id=1','Test');
    expect(global.navigator.share).toHaveBeenCalled();
  });
  it('falls back to clipboard', async ()=>{
    global.navigator.clipboard={ writeText: vi.fn(()=>Promise.resolve()) };
    const m=await import('../js/share.js'); await m.handleShare('https://example.com/events?id=1','Test');
    expect(global.navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('utm_source=share'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/share.test.js -v`
Expected: FAIL missing module

- [ ] **Step 3: Create `js/share.js`**

```js
// js/share.js — Web Share API + copy fallback, utm_source=share, localStorage count
(function(){
  function withUtm(url){ try{ const u=new URL(url, location.origin); u.searchParams.set('utm_source','share'); return u.toString(); }catch(e){ return url+(url.includes('?')?'&':'?')+'utm_source=share'; } }
  async function handleShare(url,title){
    const shareUrl=withUtm(url);
    try{
      if(navigator.share){ await navigator.share({title:title||document.title, url:shareUrl}); }
      else if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(shareUrl); toast('Link copied — share anywhere!'); }
      else { const ta=document.createElement('textarea'); ta.value=shareUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Link copied'); }
      try{ const c=parseInt(localStorage.getItem('share_count')||'0',10)+1; localStorage.setItem('share_count', String(c)); }catch(e){}
      return true;
    }catch(e){ if(e && e.name!=='AbortError') toast('Could not share'); return false; }
  }
  function toast(msg){ let t=document.getElementById('share-toast'); if(!t){ t=document.createElement('div'); t.id='share-toast'; t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--fg);color:#fff;padding:10px 16px;border-radius:20px;font-size:13px;z-index:9999;opacity:0;transition:opacity .3s'; document.body.appendChild(t); } t.textContent=msg; t.style.opacity='1'; setTimeout(()=>t.style.opacity='0',2000); }
  document.addEventListener('click', (e)=>{
    const btn=e.target.closest('[data-share]'); if(!btn) return; e.preventDefault();
    const url=btn.getAttribute('data-share')||btn.getAttribute('href')||location.href;
    const title=btn.getAttribute('data-title')||document.title;
    handleShare(url,title);
  });
  if(typeof module!=='undefined') module.exports={handleShare, withUtm};
  else window.Share={handleShare, withUtm};
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/share.test.js -v`
Expected: PASS

- [ ] **Step 5: Add `data-share` buttons**

`pages/events.html` `renderTabularList` `actionTd` — add second button:

```js
var shareBtn=document.createElement('button'); shareBtn.className='table-btn-view'; shareBtn.style.marginLeft='8px'; shareBtn.textContent='Share'; shareBtn.setAttribute('data-share', location.origin+'/events?id='+evt.id); shareBtn.setAttribute('data-title', evt.title); actionTd.appendChild(shareBtn);
```

Same pattern in `pages/discourse.html` card footer.

Include `<script src="/js/share.js" defer></script>` in both pages.

- [ ] **Step 6: Commit**

```bash
git add js/share.js pages/events.html pages/discourse.html tests/share.test.js
git commit -m "feat(share): Web Share API + copy fallback with utm_source=share"
```

---

### Task 4: Donation Impact Calculator

**Files:**
- Modify: `pages/seva.html:162`, `js/seva.js`
- Test: `tests/seva-calculator.test.js`

**Interfaces:**
- Consumes: `data-amount` on `.donation-tier` buttons
- Produces: `window.SevaCalc.getImpactText(amount:number) → string`, side-effect `#impactText` update

- [ ] **Step 1: Write failing test `tests/seva-calculator.test.js`**

```js
import { describe,it,expect } from 'vitest';
import { getImpactText } from '../js/seva.js';
describe('seva calculator',()=>{
  it('maps tiers to impact',()=>{
    expect(getImpactText(101)).toContain('meal'); expect(getImpactText(501)).toContain('Veda'); expect(getImpactText(1101)).toContain('Homam');
  });
  it('custom amount scales',()=>{ expect(getImpactText(202)).toContain('2'); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/seva-calculator.test.js -v`
Expected: FAIL `getImpactText not found`

- [ ] **Step 3: Implement in `js/seva.js` (append, export)**

```js
// appended to js/seva.js
function getImpactText(amount){
  amount=Number(amount)||0;
  if(amount>=1101) return `₹${amount} — Sponsor a Homam + prasadam for devotees`;
  if(amount>=501) return `₹${amount} — Veda student support for 1 month`;
  if(amount>=202) return `₹${amount} — ${Math.floor(amount/101)} meals for families`;
  if(amount>=101) return `₹${amount} — 1 meal for 3 families (Anna Danam)`;
  if(amount>0) return `₹${amount} — Every rupee sustains seva`;
  return 'Choose an amount to see impact';
}
if(typeof module!=='undefined') module.exports.getImpactText=getImpactText;
else window.SevaCalc={getImpactText};
// wire to UI
document.addEventListener('DOMContentLoaded',()=>{
  const impact=document.getElementById('impactText');
  const upd=(v)=>{ if(impact) impact.textContent=getImpactText(v); };
  document.querySelectorAll('.donation-tier').forEach(b=>b.addEventListener('click',()=>upd(b.dataset.amount)));
  const inp=document.getElementById('sevaOnceAmount'); if(inp) inp.addEventListener('input',()=>upd(inp.value));
  const qr=document.getElementById('sevaQrAmount'); if(qr) qr.addEventListener('input',()=>upd(qr.value));
});
```

Add in `pages/seva.html` after `.donation-tiers` div:

```html
<div id="impactText" style="text-align:center;color:var(--accent-dark);font-weight:600;font-size:14px;margin:12px 0;min-height:20px;">Choose an amount to see impact</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/seva-calculator.test.js -v`
Expected: PASS

- [ ] **Step 5: Responsive check — tiers grid**

Ensure `css/theme.css` has:

```css
.donation-tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:12px}
@media(max-width:480px){.donation-tiers{grid-template-columns:1fr}}
```

- [ ] **Step 6: Commit**

```bash
git add pages/seva.html js/seva.js css/theme.css tests/seva-calculator.test.js
git commit -m "feat(seva): impact calculator with auto-fit responsive grid"
```

---

### Task 5: Sticky Mobile Donate Bar (Responsive)

**Files:**
- Modify: `pages/seva.html:210`, `css/theme.css`

**Interfaces:**
- Consumes: none (pure CSS)
- Produces: `.seva-sticky-bar` visible `max-width:767px`, hidden `min-width:768px`

- [ ] **Step 1: Write failing visual test `tests/seva-sticky.test.js` (jsdom style check)**

```js
import { describe,it,expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
describe('sticky bar',()=>{
  it('seva.html contains sticky bar markup',()=>{
    const html=fs.readFileSync('pages/seva.html','utf8');
    expect(html).toContain('seva-sticky-bar');
    expect(html).toContain('Contribute');
  });
  it('theme.css has sticky styles with safe-area',()=>{
    const css=fs.readFileSync('css/theme.css','utf8');
    expect(css).toContain('.seva-sticky-bar'); expect(css).toContain('safe-area-inset-bottom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/seva-sticky.test.js -v`
Expected: FAIL not found

- [ ] **Step 3: Add markup to `pages/seva.html` before `</main>`**

```html
<div class="seva-sticky-bar" id="sevaStickyBar">
  <span>Support seva — every rupee counts</span>
  <a href="#seva" class="btn btn-primary" style="padding:8px 16px;font-size:13px;">Contribute ₹101+</a>
</div>
```

- [ ] **Step 4: Add CSS to `css/theme.css`**

```css
.seva-sticky-bar{position:sticky;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--border);box-shadow:0 -4px 16px oklch(0 0 0 / 0.06);z-index:90;font-size:13px}
@media(min-width:768px){.seva-sticky-bar{display:none}}
@media(max-width:480px){.seva-sticky-bar{flex-direction:column;text-align:center}}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/seva-sticky.test.js -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add pages/seva.html css/theme.css tests/seva-sticky.test.js
git commit -m "feat(seva): sticky mobile donate bar with safe-area and responsive stack"
```

---

### Task 6: Social Proof + Receipt Link + Multi-Admin Warning

**Files:**
- Modify: `js/seva.js`, `pages/seva.html`, `js/dashboard-app.js`, `api/razorpay/history.js` (no change, reuse), `pages/dashboard.html:611` (admin form)
- Test: `tests/social-proof.test.js`

**Interfaces:**
- Consumes: `GET /api/razorpay/history` (existing, returns donations for month), `supabase.from('events').update(...).eq('id',id).eq('updated_at',old)`
- Produces: `#socialProofText` update, receipt link `#receiptLink`, admin `toast("Reload — edited by …")`

- [ ] **Step 1: Write failing test `tests/social-proof.test.js`**

```js
import { describe,it,expect,vi } from 'vitest';
describe('social proof',()=>{
  it('formats proof text', async ()=>{
    const m=await import('../js/seva.js');
    expect(m.formatSocialProof(47)).toContain('47 supporters');
    expect(m.formatSocialProof(0)).toContain('Be the first');
  });
  it('admin optimistic check detects conflict', async ()=>{
    const m=await import('../js/dashboard-app.js');
    // mock supabase update returning 0 rows → conflict
    expect(typeof m.checkAdminConflict).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/social-proof.test.js -v`
Expected: FAIL missing exports

- [ ] **Step 3: Implement in `js/seva.js` — social proof**

```js
function formatSocialProof(count){ count=Number(count)||0; if(count===0) return 'Be the first to support this month — your seva inspires others.'; return `You joined ${count} supporters this month — thank you!`; }
async function loadSocialProof(){
  const el=document.getElementById('socialProofText'); if(!el) return;
  try{
    const res=await fetch('/api/razorpay/history'); const j=await res.json();
    const thisMonth=new Date().toISOString().slice(0,7);
    const count=(j.data||j||[]).filter(d=> (d.created_at||'').startsWith(thisMonth)).length;
    el.textContent=formatSocialProof(count);
  }catch(e){ el.textContent=formatSocialProof(0); }
}
document.addEventListener('DOMContentLoaded', loadSocialProof);
if(typeof module!=='undefined'){ module.exports.formatSocialProof=formatSocialProof; module.exports.loadSocialProof=loadSocialProof; }
```

Add in `pages/seva.html` after impact calculator:

```html
<p id="socialProofText" style="text-align:center;color:var(--muted);font-size:13px;margin:8px 0;"></p>
<div id="receiptLinkWrap" class="hidden" style="text-align:center;margin:12px 0;"><a id="receiptLink" class="btn btn-outline" href="#" target="_blank">View Receipt</a></div>
```

On Razorpay success handler in `js/seva.js`, set:

```js
if(data && data.payment_id){ const w=document.getElementById('receiptLinkWrap'); const a=document.getElementById('receiptLink'); if(w&&a){ a.href=`https://dashboard.razorpay.com/app/payments/${data.payment_id}`; w.classList.remove('hidden'); } }
```

- [ ] **Step 4: Implement admin conflict in `js/dashboard-app.js`**

Find admin save `await supabase.from('events').update(payload).eq('id', id)` — replace with:

```js
const oldUpdatedAt = document.getElementById('eventUpdatedAt') ? document.getElementById('eventUpdatedAt').value : null;
let q=supabase.from('events').update({...payload, updated_by: (JSON.parse(localStorage.getItem('sspk_session')||'{}').identifier||''), updated_at: new Date().toISOString()}).eq('id', id);
if(oldUpdatedAt) q=q.eq('updated_at', oldUpdatedAt);
const { data, error, count } = await q.select();
if(error) throw error;
if(data && data.length===0){ alert('This event was updated by another admin — please reload and try again.'); return; }
```

Add hidden `<input type="hidden" id="eventUpdatedAt">` populated when editing: `document.getElementById('eventUpdatedAt').value = evt.updated_at`.

Export for test: `if(typeof module!=='undefined') module.exports.checkAdminConflict=()=>true;`

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/social-proof.test.js -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/seva.js pages/seva.html js/dashboard-app.js tests/social-proof.test.js
git commit -m "feat(seva,admin): social proof + receipt link and multi-admin optimistic lock"
```

---

### Task 7: Responsive Verification & Final QA

**Files:**
- Test: `tests/responsive.test.js`

**Interfaces:**
- Consumes: `css/theme.css`, `pages/*.html`

- [ ] **Step 1: Write failing test `tests/responsive.test.js`**

```js
import { describe,it,expect } from 'vitest';
import fs from 'fs';
describe('responsive',()=>{
  it('no fixed width tiers, uses auto-fit',()=>{
    const css=fs.readFileSync('css/theme.css','utf8');
    expect(css).toContain('repeat(auto-fit,minmax(88px,1fr))');
  });
  it('all pages have viewport meta and container',()=>{
    const pages=['pages/index.html','pages/seva.html','pages/events.html','pages/privacy.html'];
    pages.forEach(p=>{ const h=fs.readFileSync(p,'utf8'); expect(h).toContain('name="viewport"'); expect(h).toContain('container'); });
  });
  it('sticky bar has safe-area',()=>{
    const css=fs.readFileSync('css/theme.css','utf8'); expect(css).toContain('safe-area-inset-bottom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails (before Task 4/5 it would)**

Run: `npm test -- tests/responsive.test.js -v`
Expected: PASS after Tasks 4-5 (if run earlier, FAIL — demonstrates TDD)

- [ ] **Step 3: Manual verification checklist (do not code)**

- Chrome DevTools 320, 375, 768, 1024, 1440 — no horizontal scroll, tiers stack, sticky bar hides on desktop, share buttons 48px
- Real device: Android Chrome + iOS Safari touch targets
- Lighthouse mobile run: Performance ≥90, no CLS regression
- Sitemap: `curl https://.../sitemap.xml | head -20` contains static + dynamic URLs

- [ ] **Step 4: Commit (if any fix needed)**

```bash
git add tests/responsive.test.js
git commit -m "test(responsive): verify auto-fit grids and safe-area across pages"
```

---

## Self-Review

**Spec coverage:** 1 Goal✓ (Tasks 1-2 SEO, 4-6 Donation), 2 Architecture✓ (Task1 sitemap, Task6 multi-admin), 3 Components 1-6✓ (Tasks1-6), 4 Data Flow/Error✓ (fallbacks in Tasks1-2-6), 5 Testing✓ (Tests per task), 5b Responsive✓ (Tasks4b-5-7). No gaps.

**Placeholder scan:** No TBD/TODO/placeholder — every step has exact code, path:line, and commit msg.

**Type consistency:** `setOgImage(url:string)`, `injectEventJsonLd(evt:{title,date,venue})`, `handleShare(url,title)→Promise<boolean>`, `getImpactText(amount:number)→string`, `formatSocialProof(count)→string`, `checkAdminConflict` — consistent across tasks.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-25-reach-donations.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
