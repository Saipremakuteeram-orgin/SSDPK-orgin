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
