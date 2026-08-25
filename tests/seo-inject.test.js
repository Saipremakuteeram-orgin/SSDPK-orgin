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
