#!/usr/bin/env node
// Header matrix for the web tier (no dependencies). Captures status and the headers that the outside world
// sees on both hosts, so the edge + web-learner + web-studio split can be compared with the old single `web`
// container (baseline: scripts/web-tier-headers.expected.json, recorded from the old stack).
//
//   node scripts/web-tier-headers.mjs --record http://127.0.0.1:18089 http://localhost:18090 > scripts/web-tier-headers.expected.json
//
// Requests go through node:http (not fetch) so Accept-Encoding is exactly what the matrix says: absent, or
// `gzip`. fetch would add its own Accept-Encoding and decode the body, hiding a doubled Content-Encoding.
import http from 'node:http';
import https from 'node:https';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `/assets/*` stands for the first `/assets/...` URL referenced by that host's served index.html (the hash
// changes with every build, the key must not).
export const ASSET = '/assets/*';

export const MATRIX = ['learner', 'studio'].flatMap((host) => [
  { host, path: '/' },
  { host, path: ASSET },
  { host, path: '/some/spa/route' },
  // Public /healthz is a SPA route (index.html); the container health checks use non-public listeners.
  { host, path: '/healthz' },
  // Unauthenticated API call the e2e makes on start: 401 without a session.
  { host, path: '/api/v1/auth/me' },
  // S3 path proxy (storage:8333): whatever status storage gives for an unknown key, with the edge headers.
  { host, path: '/seafoodeck-private/x' },
  { host, path: '/', acceptEncoding: 'gzip' },
  { host, path: ASSET, acceptEncoding: 'gzip' },
]);

export const HEADERS = [
  'cache-control',
  'x-robots-tag',
  'x-content-type-options',
  'referrer-policy',
  'x-frame-options',
  'content-encoding',
  'content-type',
];

export const keyOf = ({ host, path, acceptEncoding }) =>
  `${host} ${path}${acceptEncoding ? ` [accept-encoding: ${acceptEncoding}]` : ''}`;

export function request(url, acceptEncoding, extraHeaders = {}) {
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? https : http;
  const headers = {
    ...(acceptEncoding ? { 'accept-encoding': acceptEncoding } : {}),
    ...extraHeaders,
  };
  return new Promise((done, fail) => {
    const req = lib.request(u, { method: 'GET', headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
      );
      res.on('error', fail);
    });
    req.setTimeout(10_000, () => req.destroy(new Error(`timeout: ${url}`)));
    req.on('error', fail);
    req.end();
  });
}

async function firstAsset(base) {
  const res = await request(new URL('/', base).href);
  const html = res.body.toString('utf8');
  const m = html.match(/["'](\/assets\/[^"']+)["']/);
  if (!m) throw new Error(`no /assets/ URL in index.html served by ${base}`);
  return m[1];
}

async function captureRows(baseUrls) {
  const assets = {};
  for (const host of ['learner', 'studio']) assets[host] = await firstAsset(baseUrls[host]);
  const rows = [];
  for (const entry of MATRIX) {
    const path = entry.path === ASSET ? assets[entry.host] : entry.path;
    const res = await request(new URL(path, baseUrls[entry.host]).href, entry.acceptEncoding);
    const headers = {};
    for (const h of HEADERS) if (res.headers[h] !== undefined) headers[h] = String(res.headers[h]);
    rows.push({
      key: keyOf(entry),
      host: entry.host,
      path,
      status: res.status,
      headers,
      via: res.headers.via,
    });
  }
  return rows;
}

/** Captures the matrix; keys are "<host> <path>" (plus the Accept-Encoding sent, if any). */
export async function capture(baseUrls) {
  const out = {};
  for (const r of await captureRows(baseUrls))
    out[r.key] = { status: r.status, headers: r.headers };
  return out;
}

/** The same requests with the `via` response header kept per row (the baseline does not hold it). */
export const captureVia = captureRows;

const S3_PREFIX = '/seafoodeck-private/';
const CADDY_VIA = '1.1 Caddy';

/**
 * Rules for the `Via` header on captured rows ({host, path, via}): files served by the app containers
 * carry none (the edge strips it), while API and S3-proxy responses keep the `1.1 Caddy` they always had.
 */
export function viaProblems(rows) {
  const out = [];
  for (const { host, path, via } of rows) {
    const proxied = path.startsWith('/api/') || path.startsWith(S3_PREFIX);
    if (!proxied && via !== undefined)
      out.push(
        `${host} ${path}: app-served response must not have a via header, got ${JSON.stringify(via)}`,
      );
    if (proxied && via !== CADDY_VIA)
      out.push(
        `${host} ${path}: proxied response must have via ${JSON.stringify(CADDY_VIA)}, got ${via === undefined ? '(absent)' : JSON.stringify(via)}`,
      );
  }
  return out;
}

/** Differences between two captures, one message each; an empty array means identical. */
export function diff(expected, actual) {
  const out = [];
  for (const key of Object.keys(expected)) {
    const e = expected[key];
    const a = actual[key];
    if (!a) {
      out.push(`${key}: missing from the capture`);
      continue;
    }
    if (e.status !== a.status) out.push(`${key}: status ${a.status}, expected ${e.status}`);
    for (const h of new Set([...Object.keys(e.headers), ...Object.keys(a.headers)])) {
      if (e.headers[h] === a.headers[h]) continue;
      const show = (v) => (v === undefined ? '(absent)' : JSON.stringify(v));
      out.push(`${key}: ${h} ${show(a.headers[h])}, expected ${show(e.headers[h])}`);
    }
  }
  for (const key of Object.keys(actual))
    if (!(key in expected)) out.push(`${key}: not in the baseline`);
  return out;
}

async function main(argv) {
  if (argv[0] !== '--record' || argv.length !== 3) {
    console.error(
      'usage: node scripts/web-tier-headers.mjs --record <learner-base-url> <studio-base-url>',
    );
    process.exit(2);
  }
  const result = await capture({ learner: argv[1], studio: argv[2] });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((e) => {
    console.error(`web-tier-headers: ${e.message}`);
    process.exit(1);
  });
