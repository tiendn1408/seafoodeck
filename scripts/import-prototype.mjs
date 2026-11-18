#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { ApiClient, withRetry } from './prototype/client.mjs';
import {
  DUPLICATE_SCIENTIFIC,
  mediaInfo,
  parsePrototypeArray,
  planItem,
  toItem,
  toScenario,
} from './prototype/convert.mjs';

const TARIFF_SOURCE =
  'Prototype seafood-master-2 data/hs_cases.js — HS 2022 (WCO) cấp 6 số, chưa đối chiếu';
const USAGE =
  'Cách dùng: node scripts/import-prototype.mjs --source <dir> --base-url <url> [--dry-run] [--export <dir>]';

async function readCredentials() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const [username = '', password = ''] = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
    return { username: username.trim(), password };
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const ask = (question, hidden) =>
    new Promise((done) => {
      if (hidden) {
        rl._writeToOutput = (text) => {
          if (text.includes(question)) process.stdout.write(question);
        };
      }
      rl.question(question, (answer) => {
        rl._writeToOutput = (text) => process.stdout.write(text);
        if (hidden) process.stdout.write('\n');
        done(answer);
      });
    });
  const username = (await ask('Tên đăng nhập: ', false)).trim();
  const password = await ask('Mật khẩu: ', true);
  rl.close();
  return { username, password };
}

function bump(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      'base-url': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      export: { type: 'string' },
    },
  });
  const dryRun = values['dry-run'];
  if (!values.source || (!values.export && !values['base-url'])) {
    console.error(USAGE);
    return 2;
  }
  const source = resolve(values.source);

  // 1. Read + convert everything before any write.
  const species = parsePrototypeArray(
    readFileSync(join(source, 'data/species.js'), 'utf8'),
    'SPECIES',
  );
  const hsCases = parsePrototypeArray(
    readFileSync(join(source, 'data/hs_cases.js'), 'utf8'),
    'HS_CASES',
  );
  const entries = species.map((sp) => ({ species: sp, item: toItem(sp), scenarios: [] }));
  const byId = new Map(entries.map((e) => [e.species.id, e]));
  for (const hsCase of hsCases) {
    const scenario = toScenario(hsCase);
    const owner = byId.get(scenario.speciesId);
    if (!owner) throw new Error(`Hồ sơ ${hsCase.id}: không có loài ${scenario.speciesId}.`);
    owner.scenarios.push(scenario);
  }

  // 2. Export only.
  if (values.export) {
    const dir = resolve(values.export);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'species.json'),
      JSON.stringify(
        entries.map((e) => e.item),
        null,
        2,
      ) + '\n',
    );
    writeFileSync(
      join(dir, 'hs-cases.json'),
      JSON.stringify(
        entries.flatMap((e) => e.scenarios),
        null,
        2,
      ) + '\n',
    );
    console.log(`Đã xuất ${entries.length} loài và ${hsCases.length} hồ sơ HS vào ${dir}.`);
    return 0;
  }

  // 3. Login.
  const client = new ApiClient(values['base-url']);
  const { username, password } = await readCredentials();
  await withRetry(() => client.get('/auth/me'));
  await withRetry(() => client.post('/auth/login', { username, credential: password }));

  const counts = {};
  const duplicates = [];
  const failures = [];
  const tally = { scenarios: 0, images: 0, imagesMissingFile: 0, imagesNoAttribution: 0 };
  const tariffIds = new Map();

  const tariffFor = async (code) => {
    if (tariffIds.has(code)) return tariffIds.get(code);
    const query = `code=${encodeURIComponent(code)}&version=${encodeURIComponent('HS 2022')}&market=WCO`;
    const found = await withRetry(() => client.get(`/admin/tariffs?${query}`));
    let id = found.find((t) => t.code === code)?.id;
    if (!id) {
      if (dryRun) return null;
      const created = await withRetry(() =>
        client.post('/admin/tariffs', {
          code,
          level: 6,
          market: 'WCO',
          version: 'HS 2022',
          source: TARIFF_SOURCE,
        }),
      );
      id = created.id;
    }
    tariffIds.set(code, id);
    return id;
  };

  for (const { species: sp, item, scenarios } of entries) {
    try {
      if (DUPLICATE_SCIENTIFIC.includes(sp.scientific_name)) {
        bump(counts, 'skip-duplicate-species');
        duplicates.push(`${sp.id} (${sp.scientific_name})`);
        continue;
      }
      const state = await withRetry(() =>
        client.getOptional(`/admin/items/by-external/${encodeURIComponent(sp.id)}`),
      );
      const plan = planItem(state, item);
      bump(counts, plan);
      if (plan === 'skip-existing') continue;

      let revisionId = state?.latest.revisionId;
      if (plan === 'create' && !dryRun) {
        const ids = await withRetry(() => client.post('/admin/items', { item }));
        revisionId = ids[0];
      }

      const media = mediaInfo(sp);
      const imagePath = join(source, 'assets/images', `${sp.id}.jpg`);
      if (media && !state?.latest.hasProfileImage) {
        if (!existsSync(imagePath)) tally.imagesMissingFile += 1;
        else {
          if (!dryRun) {
            const form = new FormData();
            form.append(
              'file',
              new Blob([readFileSync(imagePath)], { type: 'image/jpeg' }),
              `${sp.id}.jpg`,
            );
            for (const [k, v] of Object.entries(media)) form.append(k, v);
            await withRetry(() => client.post(`/admin/revisions/${revisionId}/media`, form));
          }
          tally.images += 1;
          tally.imagesNoAttribution += 1;
        }
      }

      const have = new Set(state?.latest.scenarioCaseIds ?? []);
      for (const scenario of scenarios) {
        if (have.has(scenario.data.provenance.prototypeCaseId)) continue;
        const tariffId = await tariffFor(scenario.code);
        if (!dryRun) {
          await withRetry(() =>
            client.post('/admin/scenarios', { revisionId, data: scenario.data, tariffId }),
          );
        }
        tally.scenarios += 1;
      }
    } catch (error) {
      bump(counts, 'error');
      failures.push(`${sp.id}: ${error.message}`);
    }
  }

  console.log(dryRun ? 'Kế hoạch (dry-run, không ghi gì):' : 'Kết quả nhập:');
  for (const [key, n] of Object.entries(counts)) console.log(`  ${key}: ${n}`);
  console.log(`  scenario ${dryRun ? 'sẽ tạo' : 'đã tạo'}: ${tally.scenarios}`);
  console.log(`  ảnh ${dryRun ? 'sẽ tải' : 'đã tải'}: ${tally.images}`);
  console.log(`  ảnh thiếu file: ${tally.imagesMissingFile}`);
  console.log(`  ảnh rights thiếu ghi công: ${tally.imagesNoAttribution}`);
  console.log(`  loài trùng (bỏ qua): ${duplicates.length ? duplicates.join('; ') : 'không có'}`);
  console.log(`  lỗi: ${failures.length}`);
  for (const f of failures) console.log(`    - ${f}`);
  return failures.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`Lỗi: ${error.message}`);
    process.exit(1);
  },
);
