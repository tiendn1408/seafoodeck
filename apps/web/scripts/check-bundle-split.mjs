#!/usr/bin/env node
// Proves the role split of the production build (run after `vite build`):
// the JavaScript every visitor downloads (the entry script in dist/index.html plus everything it
// imports statically, i.e. its modulepreloads) carries no admin or manager code, and that code
// does exist in a lazily loaded chunk. The markers are the endpoints only those screens call.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, posix } from 'node:path';
import process from 'node:process';

const dist = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'dist'));
const MARKERS = [
  '/admin/users',
  '/admin/overview',
  '/admin/csv-template',
  '/admin/items',
  '/admin/media',
  '/admin/import',
  '/admin/releases',
  '/admin/revisions',
  '/admin/tariffs',
  '/admin/scenarios',
  '/manager/learners',
];

function fail(message) {
  console.error(`check-bundle-split: ${message}`);
  process.exit(1);
}
if (!existsSync(join(dist, 'index.html'))) fail(`no ${dist}/index.html; run vite build first`);
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const toFile = (url) => join(dist, url.replace(/^\//, ''));
const entries = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map((m) =>
  toFile(m[1]),
);
if (entries.length !== 1) fail(`expected one module entry script, found ${entries.length}`);
const preloads = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) =>
  toFile(m[1]),
);

// Static imports only: `import"./x.js"` and `from"./x.js"`. A dynamic `import("./x.js")` has a
// parenthesis after `import`, so it is not followed.
const staticImport = /(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+\.js)["']/g;
const eager = new Set();
const queue = [...entries, ...preloads];
while (queue.length) {
  const file = queue.pop();
  if (eager.has(file)) continue;
  eager.add(file);
  const code = readFileSync(file, 'utf8');
  for (const m of code.matchAll(staticImport)) {
    queue.push(join(file, '..', m[1]));
  }
}

const assets = join(dist, 'assets');
const allJs = readdirSync(assets)
  .filter((f) => f.endsWith('.js'))
  .map((f) => join(assets, f));
const lazy = allJs.filter((f) => !eager.has(f));
const rel = (f) => posix.join(...f.slice(dist.length + 1).split(/[\\/]/));
const sizes = (f) => {
  const buf = readFileSync(f);
  return { file: rel(f), kB: buf.length / 1000, gzipKB: gzipSync(buf).length / 1000 };
};

const problems = [];
for (const file of eager) {
  const code = readFileSync(file, 'utf8');
  for (const marker of MARKERS)
    if (code.includes(marker))
      problems.push(`${rel(file)} (loaded for every visitor) contains ${marker}`);
}
for (const marker of MARKERS)
  if (!lazy.some((f) => readFileSync(f, 'utf8').includes(marker)))
    problems.push(`no lazy chunk contains ${marker} (marker list out of date?)`);

const table = (files) =>
  files
    .map(sizes)
    .map(
      (s) =>
        `  ${s.file.padEnd(48)} ${s.kB.toFixed(2).padStart(9)} kB  gzip ${s.gzipKB.toFixed(2).padStart(8)} kB`,
    )
    .join('\n');
const total = (files) =>
  files
    .map(sizes)
    .reduce((a, s) => ({ kB: a.kB + s.kB, gzipKB: a.gzipKB + s.gzipKB }), { kB: 0, gzipKB: 0 });
const eagerTotal = total([...eager]);
console.log(`Loaded for every visitor (entry + static imports):\n${table([...eager])}`);
console.log(`  total ${eagerTotal.kB.toFixed(2)} kB, gzip ${eagerTotal.gzipKB.toFixed(2)} kB`);
console.log(`Lazy chunks:\n${table(lazy)}`);
if (problems.length) fail(`role split broken:\n  ${problems.join('\n  ')}`);
console.log(`check-bundle-split: ok (${MARKERS.length} admin/manager markers only in lazy chunks)`);
