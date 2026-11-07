import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const files = [
  'AGENTS.md',
  ...(await readdir('Resource'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => `Resource/${file}`),
];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^(https?:|#)/.test(match[1])) continue;
    await access(resolve(dirname(file), decodeURIComponent(match[1].split('#')[0])));
  }
}
console.log(`Documentation links checked in ${files.length} files.`);
