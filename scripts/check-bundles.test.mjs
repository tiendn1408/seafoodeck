import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MARKERS, checkBundles } from './check-bundles.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-bundles.mjs');

const LEARNER_JS = 'export const copy = `Đăng nhập`; // tài khoản học viên\n';
const INDEX = (js) => `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/${js}"></script>
<link rel="icon" href="/favicon.svg" />
</head><body><div id="root"></div></body></html>`;

// A studio bundle containing every marker, so the "present" half passes.
const studioJs = () => MARKERS.map((m) => m.sample).join('\n');

const matchesText = (m, text) => (typeof m.test === 'string' ? text.includes(m.test) : m.test.test(text));

function write(root, rel, body) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}

function fixture({ learnerExtra, studioJs: studio = studioJs(), learnerIndex, skip } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-bundles-'));
  const web = join(root, 'web');
  const studioDir = join(root, 'studio');
  if (skip !== 'web') {
    write(web, 'index.html', learnerIndex ?? INDEX('index-abc.js'));
    write(web, 'favicon.svg', '<svg/>');
    write(web, 'assets/index-abc.js', LEARNER_JS + (learnerExtra ?? ''));
  }
  if (skip !== 'studio') {
    write(studioDir, 'index.html', INDEX('index-xyz.js'));
    write(studioDir, 'assets/index-xyz.js', studio);
  }
  return { root, web, studio: studioDir };
}

function run(opts) {
  const f = fixture(opts);
  try {
    return checkBundles({ webDist: f.web, studioDist: f.studio });
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
}

test('clean learner + marked studio passes', () => {
  const r = run();
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('every marker planted in the learner bundle fails', () => {
  for (const m of MARKERS) {
    const r = run({ learnerExtra: `const x = ${m.sample};` });
    assert.equal(r.ok, false, m.name);
    assert.ok(r.errors.some((e) => e.includes(m.name)), m.name);
  }
});

test('a studio file name marker in the learner dist fails', () => {
  const f = fixture();
  try {
    write(f.web, 'assets/UsersAdmin-Dk3.js', 'x');
    const r = checkBundles({ webDist: f.web, studioDist: f.studio });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('UsersAdmin-Dk3.js')));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('a marker missing from the studio bundle fails', () => {
  for (const m of MARKERS) {
    const without = MARKERS.filter((o) => o !== m).map((o) => o.sample).join('\n');
    // Overlapping markers (e.g. /manager vs manager/learners) can still be satisfied by a sibling sample.
    if (matchesText(m, without)) continue;
    const r = run({ studioJs: without });
    assert.equal(r.ok, false, m.name);
    assert.ok(r.errors.some((e) => e.includes(m.name) && /missing/i.test(e)), m.name);
  }
});

test('missing dist folders fail', () => {
  assert.equal(run({ skip: 'web' }).ok, false);
  assert.equal(run({ skip: 'studio' }).ok, false);
  assert.ok(run({ skip: 'web' }).errors.some((e) => /missing/i.test(e)));
});

test('learner copy with the lowercase shared word is not a marker', () => {
  assert.equal(run({ learnerExtra: 'const a = `Chưa có tài khoản học viên`;' }).ok, true);
});

test('learner index.html referencing a foreign asset fails', () => {
  for (const html of [
    INDEX('Admin-abc.js'), // not a learner file
    INDEX('index-abc.js').replace('</head>', '<script src="https://cdn.example.com/x.js"></script></head>'),
    INDEX('index-abc.js').replace('/favicon.svg', '/../studio/assets/index-xyz.js'),
  ]) {
    const r = run({ learnerIndex: html });
    assert.equal(r.ok, false, html);
    assert.ok(r.errors.some((e) => /index\.html/.test(e)));
  }
});

test('CLI exits non-zero for missing dist and zero for a good tree', () => {
  const bad = spawnSync(process.execPath, [SCRIPT, '--web', '/nonexistent/web', '--studio', '/nonexistent/studio']);
  assert.notEqual(bad.status, 0);
  const f = fixture();
  try {
    const good = spawnSync(process.execPath, [SCRIPT, '--web', f.web, '--studio', f.studio]);
    assert.equal(good.status, 0, String(good.stderr));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
