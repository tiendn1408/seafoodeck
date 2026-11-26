// init-pilot writes .local/pilot.env relative to its own location, so run a copy inside a temp tree.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const scripts = dirname(fileURLToPath(import.meta.url));

function initEnv() {
  const tree = mkdtempSync(join(tmpdir(), 'init-pilot-'));
  mkdirSync(join(tree, 'scripts'));
  copyFileSync(join(scripts, 'init-pilot.mjs'), join(tree, 'scripts', 'init-pilot.mjs'));
  execFileSync(process.execPath, [join(tree, 'scripts', 'init-pilot.mjs')], { cwd: tree, stdio: 'pipe' });
  const out = {};
  for (const line of readFileSync(join(tree, '.local', 'pilot.env'), 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

test('pilot.env carries the three web tier image refs and no WEB_IMAGE_REF', () => {
  const env = initEnv();
  assert.match(env.EDGE_IMAGE_REF, /^ghcr\.io\/tiendn1408\/seafoodeck-edge:/);
  assert.match(env.LEARNER_IMAGE_REF, /^ghcr\.io\/tiendn1408\/seafoodeck-web-learner:/);
  assert.match(env.STUDIO_IMAGE_REF, /^ghcr\.io\/tiendn1408\/seafoodeck-web-studio:/);
  assert.match(env.API_IMAGE_REF, /seafoodeck-api:/);
  assert.equal('WEB_IMAGE_REF' in env, false);
});

test('deploy/pilot.env.example names the same keys and no WEB_IMAGE_REF', () => {
  const raw = readFileSync(join(scripts, '..', 'deploy', 'pilot.env.example'), 'utf8');
  for (const key of ['EDGE_IMAGE_REF', 'LEARNER_IMAGE_REF', 'STUDIO_IMAGE_REF']) assert.match(raw, new RegExp(`^${key}=`, 'm'));
  assert.doesNotMatch(raw, /WEB_IMAGE_REF/);
});
