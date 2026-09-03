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
  it('theme.css has mobile touch guards',()=>{
    const css=fs.readFileSync('css/theme.css','utf8');
    expect(css).toContain('@media (hover: none) and (pointer: coarse)');
    expect(css).toContain('.tilt-card {');
    expect(css).toContain('transform: none !important');
  });
  it('theme.css has mobile nav tap targets',()=>{
    const css=fs.readFileSync('css/theme.css','utf8');
    expect(css).toContain('min-height: 48px');
    expect(css).toContain('align-items: center');
  });
  it('theme.css has mobile button sizing',()=>{
    const css=fs.readFileSync('css/theme.css','utf8');
    expect(css).toContain('min-height: 48px');
  });
  it('critical.css has mobile responsive rules',()=>{
    const css=fs.readFileSync('css/critical.css','utf8');
    expect(css).toContain('@media(max-width:768px)');
    expect(css).toContain('@media(max-width:480px)');
  });
  it('main.js has touch device detection',()=>{
    const js=fs.readFileSync('js/main.js','utf8');
    expect(js).toContain('isTouchDevice');
    expect(js).toContain('ontouchstart');
  });
  it('main.js skips tilt on touch devices',()=>{
    const js=fs.readFileSync('js/main.js','utf8');
    expect(js).toContain('if (isTouchDevice) return;');
  });
  it('main.js reduces particles on touch devices',()=>{
    const js=fs.readFileSync('js/main.js','utf8');
    expect(js).toContain('isTouchDevice ? 6 : 15');
  });
});
