#!/usr/bin/env node
// Learner/studio code boundary guard (no dependencies).
//
// - apps/web/dist (learner) must contain none of the MARKERS and none of the
//   studio chunk file names, and index.html may only reference learner files.
// - apps/studio/dist must contain every marker (otherwise the markers went stale
//   and the learner check proves nothing).
//
// Markers are runtime strings that survive minification: endpoint paths, route
// names, CSS class names, tab labels, role literals. Function/component names do
// not survive a build, so they are not listed. One list, below; changes to it or
// to ALLOW show up in review.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLE = '(?:editor|reviewer|publisher|manager|admin)';

// `sample` is a snippet that matches the marker; tests plant it into bundles.
export const MARKERS = [
  { name: 'endpoint /admin', test: '/admin', sample: '`/admin/overview`' },
  { name: 'endpoint /manager', test: '/manager', sample: '`/manager/learners`' },
  { name: 'endpoint admin/users', test: 'admin/users', sample: '`admin/users`' },
  { name: 'endpoint manager/learners', test: 'manager/learners', sample: '`manager/learners`' },
  { name: 'route #admin', test: '#admin', sample: '`#admin`' },
  { name: 'route #manager', test: '#manager', sample: '`#manager`' },
  { name: 'css class pilot-admin', test: 'pilot-admin', sample: '.pilot-admin{}' },
  { name: 'studio product name', test: 'Seafood Deck Studio', sample: '`Seafood Deck Studio`' },
  // Tab labels. Case-sensitive on purpose: learner copy says "tài khoản học viên".
  { name: 'tab label Quản trị', test: 'Quản trị', sample: '`Quản trị`' },
  { name: 'tab label Người dùng', test: 'Người dùng', sample: '`Người dùng`' },
  { name: 'tab label Học viên', test: 'Học viên', sample: '`Học viên`' },
  // Role names as runtime string literals (quoted/backticked).
  { name: 'role literal', test: new RegExp('[`\'"]' + ROLE + '[`\'"]'), sample: '`reviewer`' },
];

// Studio screen chunk/file names (vite hashes them as `Name-<hash>.ext`).
export const FILE_NAME_MARKERS = [
  /^(?:Admin|HsAdmin|UsersAdmin|BulkUsers|AdminTabs|ManagerLearners|ManagerLearnerDetail|StudioApp|StaffLogin|admin|users)-[\w-]+\.\w+$/,
];

// Reviewed exceptions: a learner match is ignored only when the text around it
// contains `context`. Each entry needs a reason. Do NOT add admin copy here to
// make the check pass; change the copy instead.
export const ALLOW = [
  // { marker: 'tab label Học viên', context: '...', reason: '...' },
];

const matches = (marker, text) => {
  const t = marker.test;
  const out = [];
  if (typeof t === 'string') {
    for (let i = text.indexOf(t); i !== -1; i = text.indexOf(t, i + t.length)) out.push([i, t.length]);
  } else {
    for (const m of text.matchAll(new RegExp(t.source, 'g'))) out.push([m.index, m[0].length]);
  }
  return out;
};

function allowed(marker, text, [index, length]) {
  return ALLOW.some(
    (a) => a.marker === marker.name && text.slice(Math.max(0, index - 80), index + length + 80).includes(a.context),
  );
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

function indexReferences(html) {
  return [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
}

export function checkBundles({ webDist, studioDist }) {
  const errors = [];
  const web = resolve(webDist);
  const studio = resolve(studioDist);
  if (!isDir(web)) errors.push(`learner dist folder is missing: ${web}`);
  if (!isDir(studio)) errors.push(`studio dist folder is missing: ${studio}`);
  if (errors.length) return { ok: false, errors };

  const rel = (root, f) => relative(root, f).split(sep).join('/');

  // Learner: no marker, no studio-named file.
  for (const file of listFiles(web)) {
    const name = rel(web, file);
    const base = name.split('/').pop();
    if (FILE_NAME_MARKERS.some((re) => re.test(base))) errors.push(`learner file name looks like a studio chunk: ${name}`);
    const text = readFileSync(file, 'utf8');
    for (const marker of MARKERS)
      for (const hit of matches(marker, text))
        if (!allowed(marker, text, hit)) {
          errors.push(`learner file ${name} contains marker "${marker.name}"`);
          break;
        }
  }

  // Learner index.html: every reference is a file inside the learner dist.
  const indexFile = join(web, 'index.html');
  if (!existsSync(indexFile)) errors.push('learner index.html is missing');
  else {
    for (const ref of indexReferences(readFileSync(indexFile, 'utf8'))) {
      if (ref.startsWith('#') || ref.startsWith('data:')) continue;
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(ref)) {
        errors.push(`learner index.html references an external asset: ${ref}`);
        continue;
      }
      const target = resolve(web, '.' + (ref.startsWith('/') ? ref : '/' + ref).split(/[?#]/)[0]);
      if (target !== web && !target.startsWith(web + sep))
        errors.push(`learner index.html references a path outside the learner files: ${ref}`);
      else if (!existsSync(target) || !statSync(target).isFile())
        errors.push(`learner index.html references an asset that is not a learner file: ${ref}`);
    }
  }

  // Studio: every marker must be present somewhere.
  const studioText = listFiles(studio).map((f) => readFileSync(f, 'utf8'));
  for (const marker of MARKERS)
    if (!studioText.some((t) => matches(marker, t).length))
      errors.push(`marker "${marker.name}" is missing from the studio dist (stale marker list?)`);

  return { ok: errors.length === 0, errors };
}

function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const arg = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i === -1 ? fallback : argv[i + 1];
  };
  const webDist = arg('--web', join(root, 'apps/web/dist'));
  const studioDist = arg('--studio', join(root, 'apps/studio/dist'));
  const { ok, errors } = checkBundles({ webDist, studioDist });
  if (!ok) {
    console.error('check-bundles: FAILED');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`check-bundles: ok (${MARKERS.length} markers absent from learner, present in studio; learner index.html clean)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
