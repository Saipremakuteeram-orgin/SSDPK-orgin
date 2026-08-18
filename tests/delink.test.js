import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Patterns that tie this site to an external Sathya Sai organisation.
// None of these may appear in served/static content (pages, i18n JSON, llms.txt).
const BANNED = [
  /sathyasai\.org/i,
  /sssbpt\.org/i,
  /wikipedia\.org\/wiki\/sathya_sai_baba/i,
];

const ROOT = join(fileURLToPath(import.meta.url), '../..');

function collectFiles(dir, exts) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (exts.has(extname(entry.name))) {
        out.push(full);
      }
    }
  }
  return out;
}

const htmlFiles = collectFiles(join(ROOT, 'pages'), new Set(['.html']));
const jsonFiles = collectFiles(join(ROOT, 'i18n'), new Set(['.json']));
const textFiles = [join(ROOT, 'llms.txt')];
const allFiles = [...htmlFiles, ...jsonFiles, ...textFiles];

describe('delink content guard', () => {
  it('targets served/static content files', () => {
    expect(htmlFiles).not.toHaveLength(0);
    expect(jsonFiles).not.toHaveLength(0);
    expect(textFiles).not.toHaveLength(0);
  });

  allFiles.forEach((file) => {
    it(`contains no Sathya Sai organisation links in ${file.replace(ROOT + '/', '')}`, () => {
      const content = readFileSync(file, 'utf8');
      const hits = BANNED.filter((re) => re.test(content));
      expect(
        hits,
        `${file} contains banned reference(s): ${hits.map((r) => r.toString()).join(', ')}`,
      ).toHaveLength(0);
    });
  });
});
