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
