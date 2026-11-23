// Real-Postgres check of the "last active admin" guard under concurrency, against the LOCAL Docker pilot
// stack only. Each round creates two fresh admins `qa-race<round><a|b>-<stamp>` through the API image's
// bootstrap (the admin API cannot create admins), signs both in, and fires two PATCH {disabled:true} at the
// same moment, each admin locking the other. Expected: exactly one of the pair stays active and exactly one
// request fails (400 guard, 401 actor already locked, or 409 BUSY). Afterwards the owner locks the survivor,
// so no active QA admin is left; the locked QA admins stay in the local DB.
// Reads .local/pilot.env itself; random passwords stay in memory (passed to `docker compose run` through the
// environment, never argv) and are never printed. Refuses non-loopback origins. Never run on VPS/production.
// Usage: node scripts/admin-lock-race-check.mjs [--rounds 5]
// Uses the same image tag variables as compose (API_TAG/WEB_TAG from the shell, else .local/pilot.env).
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isLoopbackOrigin} from './local-origin.mjs';

const origin = process.env.PILOT_ORIGIN ?? 'http://127.0.0.1:18089';
if (!isLoopbackOrigin(origin)) {
  console.error(`Từ chối chạy: ${origin} không phải máy local. Script này tạo quản trị QA.`);
  process.exit(2);
}
const roundsArg = process.argv.indexOf('--rounds');
const rounds = roundsArg > 0 ? Number(process.argv[roundsArg + 1]) : 5;
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) {
  console.error('--rounds phải là số nguyên 1–20.');
  process.exit(2);
}
const env = Object.fromEntries(readFileSync('.local/pilot.env', 'utf8').trim().split('\n').filter(l => l.includes('=')).map(l => {
  const i = l.indexOf('=');
  return [l.slice(0, i), l.slice(i + 1)];
}));
const secret = () => randomBytes(18).toString('base64url');

class Client {
  cookie = ''; csrf = '';
  async req(path, body, method = body === undefined ? 'GET' : 'POST') {
    const headers = {Origin: origin, ...(this.cookie ? {Cookie: this.cookie} : {}), ...(method === 'GET' ? {} : {'X-CSRF-Token': this.csrf, 'Content-Type': 'application/json'})};
    const res = await fetch(origin + '/api/v1' + path, {method, headers, redirect: 'error', body: body === undefined ? undefined : JSON.stringify(body)});
    const c = res.headers.getSetCookie()[0];
    if (c) this.cookie = c.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    if (data?.csrf) this.csrf = data.csrf;
    return {status: res.status, data};
  }
  async login(username, credential) {
    await this.req('/auth/me');
    const r = await this.req('/auth/login', {username, credential});
    if (r.status !== 201) throw new Error(`Đăng nhập ${username} thất bại (HTTP ${r.status}).`);
  }
}

/** Creates an admin with the API image's bootstrap; the password travels only in the child's environment. */
function bootstrapAdmin(username, password) {
  const file = process.env.PILOT_COMPOSE_FILE ?? 'compose.yaml';
  const out = execFileSync('docker', ['compose', '--env-file', '.local/pilot.env', '--project-directory', '.', '-f', file, 'run', '--rm', '--no-deps', '-e', 'ADMIN_USERNAME', '-e', 'ADMIN_PASSWORD', 'api', 'node', 'dist/bootstrap.js'], {env: {...process.env, ADMIN_USERNAME: username, ADMIN_PASSWORD: password}, stdio: ['ignore', 'pipe', 'pipe']}).toString();
  if (!out.includes('Administrator created')) throw new Error(`Bootstrap không tạo được ${username}.`);
}

const stamp = Date.now().toString(36);
const owner = new Client();
await owner.login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
let failed = 0;
for (let round = 0; round < rounds; round++) {
  const pair = ['a', 'b'].map(x => ({username: `qa-race${round}${x}-${stamp}`, password: secret()}));
  for (const u of pair) bootstrapAdmin(u.username, u.password);
  const listed = (await owner.req(`/admin/users?role=admin&q=${encodeURIComponent(`qa-race${round}`)}&limit=200`)).data.items.filter(r => pair.some(p => p.username === r.username));
  for (const u of pair) u.id = listed.find(r => r.username === u.username)?.id;
  if (pair.some(u => !u.id)) throw new Error('Không thấy quản trị QA vừa tạo trong danh sách.');
  const [a, b] = pair.map(() => new Client());
  await a.login(pair[0].username, pair[0].password);
  await b.login(pair[1].username, pair[1].password);
  const [ra, rb] = await Promise.all([
    a.req(`/admin/users/${pair[1].id}`, {disabled: true}, 'PATCH'),
    b.req(`/admin/users/${pair[0].id}`, {disabled: true}, 'PATCH'),
  ]);
  const codes = [ra.status, rb.status];
  const after = (await owner.req(`/admin/users?role=admin&q=${encodeURIComponent(`qa-race${round}`)}&limit=200`)).data.items.filter(r => pair.some(p => p.id === r.id));
  const active = after.filter(r => !r.disabled);
  const loser = codes.find(c => c !== 200);
  const ok = codes.filter(c => c === 200).length === 1 && [400, 401, 409].includes(loser) && after.length === 2 && active.length === 1;
  if (!ok) failed++;
  const why = [ra, rb].find(r => r.status !== 200)?.data;
  console.log(`${ok ? 'PASS' : 'FAIL'} round ${round + 1}: statuses ${codes.join('/')}, active admins of the pair ${active.length}${why ? `, refused: ${why.code ?? ''} ${JSON.stringify(why.message ?? '')}` : ''}`);
  // Leave no active QA admin behind.
  for (const r of active) {
    const locked = await owner.req(`/admin/users/${r.id}`, {disabled: true}, 'PATCH');
    if (locked.status !== 200) { console.log(`Không khóa được ${r.username} (HTTP ${locked.status}).`); failed++; }
  }
}
console.log(failed ? `${failed} vòng lỗi.` : `Đạt ${rounds}/${rounds} vòng.`);
process.exit(failed ? 1 : 0);
