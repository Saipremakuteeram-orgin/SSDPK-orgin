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
