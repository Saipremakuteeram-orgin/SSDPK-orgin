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
