#!/usr/bin/env node
// Web tier check on a running local stack (edge + web-learner + web-studio). One line per check, exit 1 on
// any failure. Read-only: HTTP GETs, `docker compose ps` and `exec ... find/grep`; no login, no writes.
//
//   npm run check:web-tier                     # project and ports from .local/pilot.env (or PILOT_ENV_FILE)
//   PILOT_PROJECT_NAME=... npm run check:web-tier
//
//   (a) the header matrix equals the baseline recorded from the old single `web` container
//   (b) only `edge` publishes ports
//   (c) web-learner holds only the learner build, web-studio only the Studio build, edge no app files
//   (d) the edge Caddyfile keeps the Studio-unconfigured abort guard
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE_NAME_MARKERS, MARKERS } from './check-bundles.mjs';
import { capture, diff } from './web-tier-headers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readEnvFile(file) {
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

const envFile = resolve(root, process.env.PILOT_ENV_FILE ?? '.local/pilot.env');
const fileEnv = readEnvFile(envFile);
const setting = (name, fallback) => process.env[name] ?? fileEnv[name] ?? fallback;
const project = setting('PILOT_PROJECT_NAME', 'seafoodeck-pilot');
const learnerUrl = `http://127.0.0.1:${setting('WEB_PORT', '18089')}`;
const studioUrl = `http://localhost:${setting('STUDIO_WEB_PORT', '18090')}`;

function compose(...args) {
  return execFileSync('docker', ['compose', '-p', project, '--env-file', envFile, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const execIn = (service, ...cmd) => compose('exec', '-T', service, ...cmd);
const filesUnderSrv = (service) =>
  execIn(service, 'find', '/srv', '-type', 'f').split('\n').filter(Boolean);
const STRING_MARKERS = MARKERS.filter((m) => typeof m.test === 'string');

async function checkHeaders() {
  const expected = JSON.parse(
    readFileSync(join(root, 'scripts/web-tier-headers.expected.json'), 'utf8'),
  );
  const problems = diff(expected, await capture({ learner: learnerUrl, studio: studioUrl }));
  return problems.length
    ? problems
    : `${Object.keys(expected).length} matrix entries equal the baseline`;
}

function parsePs(out) {
  const text = out.trim();
  if (!text) return [];
  return text.startsWith('[') ? JSON.parse(text) : text.split('\n').map((l) => JSON.parse(l));
}

function checkPorts() {
  const rows = parsePs(compose('ps', '--format', 'json'));
  const problems = [];
  const published = (r) => (r.Publishers ?? []).filter((p) => p.PublishedPort);
  if (!rows.some((r) => r.Service === 'edge' && published(r).length))
    problems.push('service edge is not running with published ports');
  for (const r of rows)
    if (r.Service !== 'edge' && published(r).length)
      problems.push(
        `service ${r.Service} publishes ${published(r)
          .map((p) => `${p.URL}:${p.PublishedPort}`)
          .join(', ')}`,
      );
  return problems.length ? problems : `only edge publishes ports (${rows.length} running services)`;
}

function checkFiles() {
  const problems = [];
  const learner = filesUnderSrv('web-learner');
  const studio = filesUnderSrv('web-studio');
  for (const [service, files] of [
    ['web-learner', learner],
    ['web-studio', studio],
  ]) {
    if (!files.includes('/srv/app/index.html'))
      problems.push(`${service}: /srv/app/index.html is missing`);
    const outside = files.filter((f) => !f.startsWith('/srv/app/'));
    if (outside.length)
      problems.push(`${service}: files outside /srv/app: ${outside.slice(0, 3).join(', ')}`);
  }
  // Learner: no studio-named chunk and no studio marker in any file (same lists as check-bundles.mjs).
  for (const f of learner)
    if (FILE_NAME_MARKERS.some((re) => re.test(f.split('/').pop())))
      problems.push(`web-learner: file name looks like a studio chunk: ${f}`);
  const hits = (() => {
    try {
      return execIn(
        'web-learner',
        'grep',
        '-rlF',
        ...STRING_MARKERS.flatMap((m) => ['-e', m.test]),
        '/srv',
      ).trim();
    } catch (e) {
      if (e.status === 1) return ''; // grep: no match
      throw e;
    }
  })();
  if (hits) problems.push(`web-learner: studio markers found in ${hits.split('\n').join(', ')}`);
  // Studio: every marker check-bundles requires in the studio dist is there.
  const required = STRING_MARKERS.filter((m) => !m.optionalInStudio).map((m) => m.test);
  const missing = execIn(
    'web-studio',
    'sh',
    '-c',
    'for m; do grep -rqF -e "$m" /srv || echo "$m"; done',
    'sh',
    ...required,
  ).trim();
  if (missing)
    problems.push(`web-studio: studio markers missing: ${missing.split('\n').join(', ')}`);
  // Neither holds the other's build: the JS/CSS files only one index.html loads are absent from the other
  // container. (Files both index.html load, e.g. vendor/runtime chunks, are content-hashed and
  // byte-identical in both builds: the same bytes, not the other app.)
  const entries = (service) =>
    [
      ...execIn(service, 'cat', '/srv/app/index.html').matchAll(
        /["'](\/assets\/[^"']+\.(?:js|css))["']/g,
      ),
    ].map((m) => `/srv/app${m[1]}`);
  const learnerEntries = entries('web-learner');
  const studioEntries = entries('web-studio');
  for (const [service, own, mine, theirs, other, otherFiles] of [
    ['web-learner', 'learner', learnerEntries, studioEntries, 'web-studio', studio],
    ['web-studio', 'Studio', studioEntries, learnerEntries, 'web-learner', learner],
  ]) {
    const list = mine.filter((f) => !theirs.includes(f));
    if (!list.length) problems.push(`${service}: index.html loads no ${own}-only JS or CSS`);
    const leaked = list.filter((f) => otherFiles.includes(f));
    if (leaked.length) problems.push(`${other} holds ${own} entry files: ${leaked.join(', ')}`);
  }
  const edgeFiles = filesUnderSrv('edge');
  if (edgeFiles.length)
    problems.push(`edge: app files under /srv: ${edgeFiles.slice(0, 3).join(', ')}`);
  return problems.length
    ? problems
    : `web-learner ${learner.length} files (no studio marker), web-studio ${studio.length} files (all markers), edge none`;
}

function checkStudioGuard() {
  const text = readFileSync(join(root, 'deploy/edge/Caddyfile'), 'utf8');
  const ok =
    text.includes('{$STUDIO_SITE_ADDRESS:http://studio.invalid} {') &&
    /@unconfigured expression `"\{\$STUDIO_SITE_ADDRESS:http:\/\/studio\.invalid\}" == "http:\/\/studio\.invalid"`/.test(
      text,
    ) &&
    /handle @unconfigured \{\s*abort\s*\}/.test(text);
  return ok
    ? 'deploy/edge/Caddyfile keeps the @unconfigured abort guard'
    : ['deploy/edge/Caddyfile lost the @unconfigured abort guard'];
}

const CHECKS = [
  ['(a) header matrix', checkHeaders],
  ['(b) published ports', checkPorts],
  ['(c) app files per container', checkFiles],
  ['(d) studio guard', checkStudioGuard],
];

let failed = 0;
console.log(`web-tier-check: project ${project}, learner ${learnerUrl}, studio ${studioUrl}`);
for (const [name, fn] of CHECKS) {
  let result;
  try {
    result = await fn();
  } catch (e) {
    result = [(e.stderr ? String(e.stderr).trim() : '') || e.message];
  }
  if (Array.isArray(result)) {
    failed++;
    console.log(`FAIL ${name}: ${result.join('; ')}`);
  } else console.log(`ok   ${name}: ${result}`);
}
process.exit(failed ? 1 : 0);
