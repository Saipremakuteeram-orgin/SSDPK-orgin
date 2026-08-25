import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('dashboard encoding', () => {
  const html = fs.readFileSync('pages/dashboard.html', 'utf8');
  const raw = fs.readFileSync('pages/dashboard.html');

  it('has no double-mojibake bytes (c3 83)', () => {
    // Double-mojibake leaves bytes c3 83 on disk
    expect(raw.includes(Buffer.from([0xc3, 0x83]))).toBe(false);
  });

  it('has no garbled sequences', () => {
    expect(html).not.toContain('Ã¢');
    expect(html).not.toContain('Ã°');
    expect(html).not.toContain('�');
  });

  it('contains correct em dash — at title and Seva lines', () => {
    expect(html).toContain('Sathya Sai Trust — Dashboard');
    // Seva placeholder dash (sevaPayCount)
    expect(html).toContain('<div id="sevaPayCount"');
    expect(html).toContain('—'); // em dash should be present
  });

  it('contains ellipsis … at Checking and Loading', () => {
    expect(html).toContain('Checking…');
    expect(html).toContain('Loading your contribution history…');
  });

  it('contains proper key icon 🔑 at Change Password', () => {
    expect(html).toContain('🔑 Change Password');
  });
});
