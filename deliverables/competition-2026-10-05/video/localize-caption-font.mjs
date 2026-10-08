import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/yuemokm/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/hyperframes/package.json');
const fontkit = require('fontkit');
const cache = 'C:/Users/yuemokm/.cache/hyperframes/fonts/noto-sans-jp';
const source = await fs.readFile('author-composition.mjs', 'utf8');
const chars = new Set([...source].map(value => value.codePointAt(0)));
await fs.mkdir('assets/fonts', { recursive: true });
const names = await fs.readdir(cache); let css = '', records = [];
for (const weight of [400, 700]) {
  const candidates = [];
  for (const name of names.filter(value => value.startsWith(weight + '-normal-') && value.endsWith('.woff2'))) {
    const bytes = await fs.readFile(path.join(cache, name));
    const font = fontkit.create(bytes), coverage = font.characterSet.filter(value => chars.has(value));
    if (coverage.length) candidates.push({ name, bytes, coverage });
  }
  const remaining = new Set(chars);
  while (remaining.size) {
    candidates.sort((a, b) => b.coverage.filter(value => remaining.has(value)).length - a.coverage.filter(value => remaining.has(value)).length);
    const next = candidates.shift(); if (!next) break;
    const used = next.coverage.filter(value => remaining.has(value)); if (!used.length) break;
    const destination = path.join('assets/fonts', next.name); await fs.writeFile(destination, next.bytes);
    css += `@font-face{font-family:"Slash Caption";font-style:normal;font-weight:${weight};font-display:block;src:url("assets/fonts/${next.name}") format("woff2");unicode-range:${used.map(value => 'U+' + value.toString(16)).join(',')}}\n`;
    used.forEach(value => remaining.delete(value)); records.push({ name: next.name, weight, bytes: next.bytes.length, characters: used.length });
  }
}
await fs.writeFile('assets/caption-font-faces.css', css);
await fs.writeFile('assets/fonts/provenance.json', JSON.stringify({ source: 'HyperFrames downloaded Noto Sans JP cache', notice: 'Existing WOFF2 subsets selected by actual caption glyph coverage; font bytes unchanged.', records }, null, 2));
console.log(JSON.stringify({ files: records.length, bytes: records.reduce((sum, value) => sum + value.bytes, 0) }));
