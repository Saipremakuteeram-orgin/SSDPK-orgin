// api/sitemap.js — dynamic sitemap, static fallack, 1h cache
const BASE = 'https://saidharmasamrakshanapremakuteeram.qzz.io';
const STATIC_PATHS = ['/','/about','/trustees','/gallery','/events','/discourse','/seva','/dashboard','/login','/signup','/contact','/privacy','/terms','/about.html'];
module.exports = async function handler(req,res){
  if(req.method !== 'GET') return res.status(405).send('Method not allowed');
  res.setHeader('Content-Type','application/xml');
  res.setHeader('Cache-Control','public, max-age=3600, stale-while-revalidate=86400');
  let events=[], discourses=[];
  try{
    let createClient;
    try {
      // Prefer ESM import so Vitest vi.mock can intercept; fallback to require for CJS runtime
      const mod = await import('@supabase/supabase-js');
      createClient = mod.createClient;
    } catch {
      createClient = require('@supabase/supabase-js').createClient;
    }
    const url=process.env.SUPABASE_URL||'http://localhost', key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'test-key';
    {
      const sb=createClient(url,key);
      // helper to support both real Supabase builder (with .limit) and test mock (order returns Promise directly)
      const fetchWithLimit = async (table) => {
        const q = sb.from(table).select('id,date').order('date',{ascending:false});
        if(q && typeof q.limit === 'function'){
          return await q.limit(500);
        }
        // mock returns Promise directly from order()
        return await q;
      };
      const ev=await fetchWithLimit('events');
      const dc=await fetchWithLimit('weekly_messages');
      if(!ev.error && ev.data) events=ev.data;
      if(!dc.error && dc.data) discourses=dc.data;
      else {
        const dc2=await fetchWithLimit('discourse');
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
