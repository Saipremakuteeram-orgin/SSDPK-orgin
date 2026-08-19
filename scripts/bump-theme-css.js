import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const pagesDir = 'pages';
const oldStrings = ['theme.css?v=1.2.0', 'theme.css?v=1.1.0'];
const replacement = 'theme.css?v=1.2.1';

let edited = [];
for (const entry of readdirSync(pagesDir)) {
  const full = join(pagesDir, entry);
  if (!statSync(full).isFile() || !entry.endsWith('.html')) continue;
  const buf = readFileSync(full);
  let s = buf.toString('latin1'); // byte-preserving for ASCII substrings
  let changed = false;
  for (const old of oldStrings) {
    if (s.includes(old)) {
      s = s.split(old).join(replacement);
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(full, Buffer.from(s, 'latin1'));
    edited.push(entry);
  }
}
console.log('Edited', edited.length, 'file(s):', edited.join(', '));