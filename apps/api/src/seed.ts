import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Db } from './db';
import { Catalog, ItemData, Kind } from './catalog';
import { Media } from './media';
import { passwordHash } from './security';
interface Pack {
  species: {
    id: string;
    group: string;
    identification: string;
    commercialNote: string;
    productForms: string[];
  }[];
  names: {
    speciesId: string;
    kind: Kind;
    label: string;
    sourceId: string;
    pronunciation?: { text: string };
  }[];
  sources: { id: string; url?: string; title: string }[];
  media: {
    speciesId: string;
    path: string;
    sourceUrl: string;
    credit: string;
    rights: string;
    originalImageId: string;
  }[];
  tariffs: {
    id: string;
    code: string;
    level: number;
    catalog: string;
    version: string;
    sourceId: string;
    citation: string;
  }[];
  scenarios: {
    id: string;
    speciesId: string;
    tariffId: string;
    title: string;
    description: string;
    explanation: string;
    answerType: string;
    missingFact?: string;
    facts: Record<string, boolean | 'unknown'>;
    options: { id: string; label: string }[];
    followUps: { id: string; label: string }[];
  }[];
}
async function main() {
  if (process.env.ALLOW_INTERNAL_DEMO !== 'true' || !process.env.INTERNAL_SEED_DIR)
    throw Error(
      'Internal seed requires explicit ALLOW_INTERNAL_DEMO and fixture directory; never runs on startup.',
    );
  const db = new Db(),
    catalog = new Catalog(db),
    media = new Media(db, catalog);
  try {
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16)
      throw Error('Set a strong ADMIN_PASSWORD before bootstrapping.');
    await db.user.upsert({
      where: { username: process.env.ADMIN_USERNAME ?? 'owner' },
      create: {
        username: process.env.ADMIN_USERNAME ?? 'owner',
        passwordHash: passwordHash(process.env.ADMIN_PASSWORD),
        role: 'admin',
      },
      update: {},
    });
    const existing = await db.setting.findUnique({ where: { id: 'current:internal' } });
    if (existing) {
      console.log('Internal release already exists; seed is idempotent, no content overwritten.');
      return;
    }
    await media.initialize();
    const pack: Pack = JSON.parse(
      await readFile(path.join(process.env.INTERNAL_SEED_DIR, 'pilot-pack.json'), 'utf8'),
    );
    const source = (id: string) => {
      const s = pack.sources.find((s) => s.id === id);
      return s?.url ?? s?.title ?? 'Internal fixture';
    };
    const ids: string[] = [],
      bySpecies = new Map<string, string>();
    for (const s of pack.species) {
      const names = pack.names.filter((n) => n.speciesId === s.id);
      const data: ItemData = {
        externalId: s.id,
        sku: `INTERNAL-${s.id}`,
        group: s.group,
        vi: names.find((n) => n.kind === 'vi')!.label,
        en: names.find((n) => n.kind === 'en')!.label,
        ja: names.find((n) => n.kind === 'ja')!.label,
        scientific: names.find((n) => n.kind === 'scientific')!.label,
        source: source(names[0].sourceId),
        aliases: [],
        forms: s.productForms ?? [],
        identification: s.identification ?? '',
        note: `Mẫu nội bộ, chưa phải hàng khách hoặc nội dung được duyệt. ${s.commercialNote ?? ''}`,
        pronunciation: Object.fromEntries(
          names.filter((n) => n.pronunciation).map((n) => [n.kind, n.pronunciation!.text]),
        ),
      };
      const [id] = await catalog.import([data], 'internal-seed');
      ids.push(id);
      bySpecies.set(s.id, id);
      for (const n of names)
        await db.nameEntry.update({
          where: { revisionId_kind: { revisionId: id, kind: n.kind } },
          data: { source: source(n.sourceId) },
        });
      for (const m of pack.media.filter((m) => m.speciesId === s.id)) {
        const asset = await media.upload(
          path.join(process.env.INTERNAL_SEED_DIR, 'pilot-media', path.basename(m.path)),
          {
            role: 'identification',
            aiGenerated: false,
            source: m.sourceUrl,
            credit: m.credit,
            rights: m.rights,
            originalImageId: m.originalImageId,
          },
        );
        await db.mediaLink.create({ data: { revisionId: id, assetId: asset.id } });
      }
    }
    const tariffIds = new Map<string, string>();
    for (const t of pack.tariffs) {
      const row = await db.tariffReference.create({
        data: {
          code: t.code,
          level: t.level,
          market: 'VN',
          version: t.version,
          source: source(t.sourceId) + ' ' + t.citation,
        },
      });
      tariffIds.set(t.id, row.id);
    }
    for (const s of pack.scenarios) {
      const tariff = pack.tariffs.find((t) => t.id === s.tariffId)!;
      const options = s.options.map((o) => ({
        label: o.label,
        correct:
          s.answerType === 'insufficient'
            ? o.id === 'insufficient'
            : o.id === tariff.code.replaceAll('.', '') ||
              o.label.replace(/[.\s]/g, '') === tariff.code.replaceAll('.', ''),
      }));
      if (options.filter((o) => o.correct).length !== 1)
        throw Error(`Seed case ${s.id}: expected one explicit answer mapping.`);
      await db.tradeScenario.create({
        data: {
          revisionId: bySpecies.get(s.speciesId)!,
          tariffId: tariffIds.get(s.tariffId),
          data: {
            prompt: s.title + '\n' + s.description,
            explanation: s.explanation,
            kind: s.answerType === 'insufficient' ? 'insufficient' : 'code',
            facts: s.facts,
            requiredFact: s.missingFact,
            options,
            ...(s.answerType === 'insufficient'
              ? {
                  followUps: s.followUps.map((o) => ({
                    label: o.label,
                    correct: o.id === s.missingFact,
                    fact: o.id,
                  })),
                }
              : {}),
          },
        },
      });
    }
    const count = Number(process.env.INTERNAL_SEED_COUNT ?? 6);
    if (!Number.isInteger(count) || count < 6 || count > 2000)
      throw Error('INTERNAL_SEED_COUNT must be 6–2000.');
    const extra: ItemData[] = [];
    for (let n = 6; n < count; n++)
      extra.push({
        externalId: `load-${String(n).padStart(4, '0')}`,
        sku: `TEST-${n}`,
        group: 'Mẫu tải nội bộ',
        vi: `SKU kiểm tải ${n}`,
        en: '',
        ja: '',
        scientific: '',
        source: 'Synthetic pagination fixture, not customer material',
        aliases: [],
        forms: [],
        identification: '',
        note: 'Chỉ đo phân trang, không sinh câu học.',
        pronunciation: {},
      });
    if (extra.length) ids.push(...(await catalog.import(extra, 'internal-load-seed')));
    const release = await catalog.publish(ids, 'internal-seed', true);
    console.log(
      JSON.stringify({
        internalRelease: release.id,
        items: ids.length,
        photos: pack.media.length,
        audio: 0,
        approvedContent: 0,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
