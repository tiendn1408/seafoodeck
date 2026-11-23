// Plays a few flashcard sessions as an existing learner account through the real API, so the manager
// screens have data to show. The password is read from a hidden prompt (never argv/env) and, like the
// cookie and CSRF token, is never printed. Refuses non-loopback origins unless --allow-nonlocal is given
// AND the operator retypes the exact hostname. Never run against production data you care about.
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isLoopbackOrigin} from './local-origin.mjs';

export const DEFAULT_ORIGIN = 'http://127.0.0.1:18089';
export const KNOWN_RATIO = 0.5;
const FLAGS = new Set(['--origin', '--username', '--sessions', '--seed', '--allow-nonlocal']);

/** Parses argv (without node/script). Throws Error with a message on invalid input. Rejects any password-like flag. */
export function parseArgs(argv) {
  const out = {origin: DEFAULT_ORIGIN, username: '', sessions: 3, seed: 1, allowNonlocal: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!FLAGS.has(a)) throw new Error(`Tham số không hợp lệ: ${a.startsWith('--pass') ? '(mật khẩu chỉ nhập qua prompt ẩn)' : a}`);
    if (a === '--allow-nonlocal') { out.allowNonlocal = true; continue; }
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) throw new Error(`Thiếu giá trị cho ${a}`);
    if (a === '--origin') out.origin = v.replace(/\/+$/, '');
    else if (a === '--username') out.username = v;
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || (a === '--sessions' && n > 50)) throw new Error(`Giá trị không hợp lệ cho ${a}: ${v}`);
      if (a === '--sessions') out.sessions = n; else out.seed = n;
    }
  }
  if (!out.username) throw new Error('Cần --username');
  try { new URL(out.origin); } catch { throw new Error(`--origin không phải URL: ${out.origin}`); }
  return out;
}

/** Origin gate: null when allowed without confirmation, {confirmHost} when the operator must retype it, or {refuse}. */
export function originGate(origin, allowNonlocal) {
  if (isLoopbackOrigin(origin)) return null;
  if (!allowNonlocal) return {refuse: `Từ chối: ${origin} không phải máy local (127.0.0.1, localhost, ::1). Chỉ dùng --allow-nonlocal cho môi trường kiểm thử riêng.`};
  return {confirmHost: new URL(origin).hostname};
}

export function hostConfirmed(origin, typed) {
  return typeof typed === 'string' && typed.trim() === new URL(origin).hostname;
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic ratings: exactly round(count*ratio) 'known', the rest 'again', shuffled by seed. */
export function ratingPlan(count, seed, ratio = KNOWN_RATIO) {
  const known = Math.round(count * ratio);
  const plan = Array.from({length: count}, (_, i) => (i < known ? 'known' : 'again'));
  const rnd = mulberry32(seed);
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan;
}

/** Removes terminal escape sequences (arrow keys, Home/End, bracketed-paste markers, …) from a typed chunk,
 * so their printable bytes never end up inside the password. Plain control keys are left to the caller. */
export function stripEscapes(chunk) {
  // CSI (ESC [ params final), SS3 (ESC O x), then any other ESC + one character.
  return chunk.replace(/\u001b\[[0-?]*[ -/]*[@-~]|\u001bO.|\u001b[\s\S]?/g, '');
}

/** Applies one typed chunk to the hidden value: {value, done?: 'enter' | 'cancel'}. Other control characters are dropped. */
export function applyTyped(value, chunk) {
  for (const ch of stripEscapes(chunk)) {
    if (ch === '\r' || ch === '\n' || ch === '\u0004') return {value, done: 'enter'};
    if (ch === '\u0003') return {value, done: 'cancel'};
    if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
    else if (!/[\u0000-\u001f\u007f-\u009f]/.test(ch)) value += ch;
  }
  return {value};
}

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const {stdin, stderr} = process;
    if (!stdin.isTTY) return reject(new Error('Cần terminal tương tác để nhập mật khẩu ẩn.'));
    // Raw mode is restored on every way out (Enter, Ctrl+C, an error exit, a kill signal), never leaving a mute terminal.
    const restore = () => { try { stdin.setRawMode(false); } catch { /* stdin already closed */ } };
    const onSignal = () => { restore(); process.exit(130); };
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    process.on('exit', restore);
    for (const s of signals) process.on(s, onSignal);
    // Raw mode first: initialising stderr before it would leave the terminal echoing the password.
    stdin.setRawMode(true);
    stderr.write(question);
    let value = '';
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = chunk => {
      const r = applyTyped(value, chunk);
      value = r.value;
      if (r.done === 'enter') { done(); resolve(value); }
      else if (r.done === 'cancel') { done(); reject(new Error('Đã hủy.')); }
    };
    const done = () => {
      restore();
      process.off('exit', restore);
      for (const s of signals) process.off(s, onSignal);
      stdin.pause(); stdin.off('data', onData); stderr.write('\n');
    };
    stdin.on('data', onData);
  });
}

function promptLine(question) {
  return new Promise((resolve, reject) => {
    const {stdin, stderr} = process;
    if (!stdin.isTTY) return reject(new Error('Cần terminal tương tác.'));
    stderr.write(question);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.once('data', d => { stdin.pause(); resolve(String(d).trim()); });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gate = originGate(args.origin, args.allowNonlocal);
  if (gate?.refuse) { console.error(gate.refuse); process.exit(2); }
  if (gate?.confirmHost && !hostConfirmed(args.origin, await promptLine(`Máy không phải local. Gõ lại đúng tên miền "${gate.confirmHost}" để xác nhận: `))) {
    console.error('Tên miền không khớp. Dừng.'); process.exit(2);
  }
  const password = await promptHidden(`Mật khẩu của ${args.username}: `);
  let cookie = '', csrf = '';
  const call = async (path, body) => {
    const method = body === undefined ? 'GET' : 'POST';
    const headers = {Origin: args.origin, ...(cookie ? {Cookie: cookie} : {}), ...(method === 'GET' ? {} : {'X-CSRF-Token': csrf, 'Content-Type': 'application/json'})};
    // redirect:'error': never follow a redirect that could carry the cookie/CSRF to another origin.
    const res = await fetch(args.origin + '/api/v1' + path, {method, headers, redirect: 'error', body: body === undefined ? undefined : JSON.stringify(body)});
    const c = res.headers.getSetCookie()[0];
    if (c) cookie = c.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    if (data?.csrf) csrf = data.csrf;
    return {status: res.status, data};
  };
  await call('/auth/me');
  const login = await call('/auth/login', {username: args.username, credential: password});
  if (login.status !== 201) { console.error(`Đăng nhập thất bại (HTTP ${login.status}).`); process.exit(1); }
  const me = await call('/me');
  if (me.data?.mustChangePassword) { console.error('Tài khoản đang buộc đổi mật khẩu; đổi trong giao diện trước.'); process.exit(1); }
  let sessions = 0, attempts = 0, known = 0, again = 0;
  for (let s = 0; s < args.sessions; s++) {
    const session = await call('/learning/sessions', {mode: 'flashcard'});
    if (session.status !== 201) { console.error(`Không mở được phiên (HTTP ${session.status}).`); break; }
    sessions++;
    const qs = session.data.questions;
    const plan = ratingPlan(qs.length, args.seed + s);
    for (let i = 0; i < qs.length; i++) {
      await call(`/learning/sessions/${session.data.id}/questions/${qs[i].id}/reveal`, {});
      const r = await call(`/learning/sessions/${session.data.id}/questions/${qs[i].id}/attempts`, {key: randomUUID(), answer: {rating: plan[i]}});
      if (r.status !== 201) { console.error(`Ghi đánh giá thất bại (HTTP ${r.status}).`); continue; }
      attempts++; if (plan[i] === 'known') known++; else again++;
    }
  }
  console.log(`Xong: ${sessions} phiên flashcard, ${attempts} tự đánh giá (${known} Đã nhớ, ${again} Học lại) cho ${args.username}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
