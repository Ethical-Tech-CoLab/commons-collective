import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('tracked authored text contains no em-dash glyphs or encoded em dashes', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const forms = [String.fromCodePoint(0x2014), '&' + 'mdash;', '&#' + '8212;', '\\u' + '2014'];
  const offending = [];
  for (const file of files) {
    if (!/\.(?:md|json|mjs|js|html|css|svg|py|yml|yaml|txt)$/i.test(file) && !['LICENSE', 'README'].includes(path.basename(file))) continue;
    const text = await readFile(path.resolve(root, file), 'utf8');
    if (forms.some(form => text.includes(form))) offending.push(file);
  }
  assert.deepEqual(offending, [], 'Remove authored em dashes without modifying source images or falsifying upstream provenance.');
});
