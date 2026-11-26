// Web tier shape of both compose files (deploy/compose.pilot.ghcr.yaml = VPS, compose.yaml = local) and of
// scripts/publish-pilot.sh. Uses `docker compose config` with dummy values (read-only: starts nothing).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VPS = 'deploy/compose.pilot.ghcr.yaml';
const LOCAL = 'compose.yaml';

// Dummy project directory: the compose files read .local/pilot.env (env_file) and the VPS file needs the refs.
const dummy = mkdtempSync(join(tmpdir(), 'compose-web-tier-'));
mkdirSync(join(dummy, '.local'));
writeFileSync(join(dummy, '.local', 'pilot.env'), 'X=1\n');
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  POSTGRES_DB: 'd',
  POSTGRES_USER: 'u',
  POSTGRES_PASSWORD: 'p',
  PUBLIC_ORIGIN: 'http://localhost',
  API_IMAGE_REF: 'ghcr.io/x/seafoodeck-api@sha256:a',
  EDGE_IMAGE_REF: 'ghcr.io/x/seafoodeck-edge@sha256:b',
  LEARNER_IMAGE_REF: 'ghcr.io/x/seafoodeck-web-learner@sha256:c',
  STUDIO_IMAGE_REF: 'ghcr.io/x/seafoodeck-web-studio@sha256:d',
  PILOT_ENV_FILE: join(dummy, '.local', 'pilot.env'),
};
const config = (file) =>
  JSON.parse(
    execFileSync('docker', ['compose', '--project-directory', dummy, '-f', join(root, file), 'config', '--format', 'json'], {
      env,
      encoding: 'utf8',
    }),
  );
const text = (file) => readFileSync(join(root, file), 'utf8');
const portsOf = (svc) =>
  (svc.ports ?? []).map((p) => `${p.published}:${p.target}${p.protocol === 'udp' ? '/udp' : ''}`).sort();

const vps = config(VPS);
const local = config(LOCAL);

test('only edge publishes ports in the VPS compose (exactly 80, 443, 443/udp)', () => {
  assert.deepEqual(portsOf(vps.services.edge), ['443:443', '443:443/udp', '80:80']);
  for (const [name, svc] of Object.entries(vps.services)) {
    if (name !== 'edge') assert.deepEqual(svc.ports ?? [], [], `${name} must publish nothing`);
  }
});

test('edge mounts caddy_data and caddy_config (same volumes the old web used, certificates survive)', () => {
  const mounts = Object.fromEntries(vps.services.edge.volumes.map((v) => [v.source, v.target]));
  assert.equal(mounts.caddy_data, '/data');
  assert.equal(mounts.caddy_config, '/config');
  assert.ok('caddy_data' in vps.volumes && 'caddy_config' in vps.volumes);
});

test('web services publish no ports and no volumes', () => {
  for (const name of ['web-learner', 'web-studio']) {
    assert.deepEqual(vps.services[name].ports ?? [], [], `${name} ports`);
    assert.deepEqual(vps.services[name].volumes ?? [], [], `${name} volumes`);
  }
});

test('images come from the three refs, each in the required-variable form', () => {
  const raw = text(VPS);
  for (const key of ['EDGE_IMAGE_REF', 'LEARNER_IMAGE_REF', 'STUDIO_IMAGE_REF']) {
    assert.match(raw, new RegExp(`image: \\$\\{${key}:\\?Set ${key} in \\.local/pilot\\.env\\}`), key);
  }
  assert.equal(vps.services.edge.image, env.EDGE_IMAGE_REF);
  assert.equal(vps.services['web-learner'].image, env.LEARNER_IMAGE_REF);
  assert.equal(vps.services['web-studio'].image, env.STUDIO_IMAGE_REF);
  assert.doesNotMatch(raw, /WEB_IMAGE_REF/);
});

test('no service named web in either compose file', () => {
  assert.equal('web' in vps.services, false);
  assert.equal('web' in local.services, false);
});

test('edge depends on api, web-learner and web-studio being healthy', () => {
  for (const cfg of [vps, local]) {
    const deps = cfg.services.edge.depends_on;
    for (const name of ['api', 'web-learner', 'web-studio']) {
      assert.equal(deps[name]?.condition, 'service_healthy', name);
    }
  }
});

test('web-learner and web-studio publish no ports in compose.yaml either', () => {
  for (const name of ['web-learner', 'web-studio']) assert.deepEqual(local.services[name].ports ?? [], [], name);
  assert.deepEqual(portsOf(local.services.edge), ['18089:80', '18090:8090']);
});

test('publish-pilot.sh loops over exactly api edge web-learner web-studio', () => {
  const m = text('scripts/publish-pilot.sh').match(/^for service in (.+); do$/m);
  assert.ok(m, 'for loop found');
  assert.deepEqual(m[1].split(/\s+/), ['api', 'edge', 'web-learner', 'web-studio']);
});
