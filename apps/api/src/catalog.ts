import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type AuthSession } from './generated/prisma/client';
import { parse } from 'csv-parse/sync';
import { Db } from './db';
import { alternateNameIdsSql, ungroupedIdsSql } from './search-sql';
import { hash } from './security';
import { validateHs, type HsData } from './hs';
import { EXTERNAL_ID_PATTERN } from './import-state';
import {
  groupTotals,
  summarizeOverview,
  toOverviewRow,
  type GroupTotals,
  type OverviewRow,
} from './overview';

export const kinds = ['vi', 'en', 'ja', 'scientific'] as const;
export type Kind = (typeof kinds)[number];
export function publicRowProblem(row: {
  status: string;
  reviewedBy: string | null;
  names: { kind: string; source: string }[];
}): string | null {
  if (
    row.status !== 'approved' ||
    !row.reviewedBy ||
    kinds.some((k) => !row.names.some((n) => n.kind === k && n.source))
  )
    return 'Mục học chưa đủ tên/nguồn/duyệt.';
  return null;
}
export interface ItemData {
  externalId: string;
  group: string;
  sku: string;
  vi: string;
  en: string;
  ja: string;
  scientific: string;
  source: string;
  aliases: string[];
  forms: string[];
  identification: string;
  note: string;
  pronunciation: Partial<Record<Kind, string>>;
  taxonomicGroup?: 'fish' | 'crustacean' | 'mollusc' | 'other';
  family?: string;
  familyVi?: string;
  enAliases?: string[];
  jaKanji?: string | null;
  jaTrade?: string | null;
  rarity?: 'common' | 'uncommon' | 'rare' | 'legendary';
  tradeRestriction?: string | null;
  marketPrice?: {
    rangeUsd: string;
    rangeVnd: string;
    specRef: string;
    note: string;
    sourced: false;
  };
  hsHints?: { state: string; labelVi: string; hs6: string }[];
  provenance?: Provenance;
}
export type Provenance = {
  origin: 'prototype:seafood-master-2';
  prototypeId: string;
  digest: string;
  verified: false;
};
export const extendedKeys: readonly string[] = [
  'taxonomicGroup',
  'family',
  'familyVi',
  'enAliases',
  'jaKanji',
  'jaTrade',
  'rarity',
  'tradeRestriction',
  'marketPrice',
  'hsHints',
  'provenance',
];
const taxonomicGroups = ['fish', 'crustacean', 'mollusc', 'other'];
const rarities = ['common', 'uncommon', 'rare', 'legendary'];
const text = (v: unknown) => typeof v === 'string' && v.length <= 3000;
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function validateExtended(row: Record<string, unknown>) {
  const bad = (key: string): never => {
    throw new BadRequestException(`Sai ${key}.`);
  };
  const has = (key: string) => key in row;
  if (has('taxonomicGroup') && !taxonomicGroups.includes(row.taxonomicGroup as string))
    bad('taxonomicGroup');
  if (has('rarity') && !rarities.includes(row.rarity as string)) bad('rarity');
  for (const key of ['family', 'familyVi']) if (has(key) && !text(row[key])) bad(key);
  for (const key of ['jaKanji', 'jaTrade', 'tradeRestriction'])
    if (has(key) && row[key] !== null && !text(row[key])) bad(key);
  if (
    has('enAliases') &&
    (!Array.isArray(row.enAliases) ||
      row.enAliases.length > 50 ||
      !row.enAliases.every((v) => typeof v === 'string' && v.length < 500))
  )
    bad('enAliases');
  if (has('marketPrice')) {
    const m = row.marketPrice;
    if (
      !isObject(m) ||
      !['rangeUsd', 'rangeVnd', 'specRef', 'note'].every((k) => text(m[k])) ||
      m.sourced !== false
    )
      bad('marketPrice');
  }
  if (
    has('hsHints') &&
    (!Array.isArray(row.hsHints) ||
      row.hsHints.length > 10 ||
      !row.hsHints.every(
        (h) =>
          isObject(h) && text(h.state) && text(h.labelVi) && /^\d{4}\.\d{2}$/.test(String(h.hs6)),
      ))
  )
    bad('hsHints');
  if (has('provenance')) {
    const p = row.provenance;
    if (
      !isObject(p) ||
      p.origin !== 'prototype:seafood-master-2' ||
      !text(p.prototypeId) ||
      !text(p.digest) ||
      p.verified !== false
    )
      bad('provenance');
  }
}
export function validateItem(input: unknown): ItemData {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Dòng không phải object.');
  const row = input as Record<string, unknown>;
  for (const key of ['externalId', 'group', 'sku', ...kinds, 'source', 'identification', 'note']) {
    if (typeof row[key] !== 'string' || (row[key] as string).length > 3000)
      throw new BadRequestException(`Thiếu/sai ${key}.`);
  }
  if (!EXTERNAL_ID_PATTERN.test(row.externalId as string) || !(row.vi as string).trim())
    throw new BadRequestException('externalId/tên Việt không hợp lệ.');
  for (const key of ['aliases', 'forms'])
    if (
      !Array.isArray(row[key]) ||
      (row[key] as unknown[]).length > 50 ||
      !(row[key] as unknown[]).every((v) => typeof v === 'string' && v.length < 500)
    )
      throw new BadRequestException(`Sai ${key}.`);
  if (
    !row.pronunciation ||
    typeof row.pronunciation !== 'object' ||
    Object.entries(row.pronunciation).some(
      ([k, v]) => !kinds.includes(k as Kind) || typeof v !== 'string' || v.length > 1000,
    )
  )
    throw new BadRequestException('Sai pronunciation.');
  validateExtended(row);
  return Object.fromEntries(
    [
      'externalId',
      'group',
      'sku',
      ...kinds,
      'source',
      'identification',
      'note',
      'aliases',
      'forms',
      'pronunciation',
      ...extendedKeys.filter((k) => k in row),
    ].map((k) => [k, row[k]]),
  ) as unknown as ItemData;
}
export const csvHeader =
  'externalId,sku,group,vi,en,ja,scientific,source,aliases,forms,identification,note,enPronunciation,jaPronunciation,scientificPronunciation';
export function readCsv(csv: string) {
  if (Buffer.byteLength(csv) > 2 * 1024 * 1024) throw new BadRequestException('CSV tối đa 2 MiB.');
  let rows: Record<string, string>[];
  try {
    rows = parse(csv, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      max_record_size: 16000,
      relax_column_count: false,
    });
  } catch {
    throw new BadRequestException('CSV UTF-8 không hợp lệ.');
  }
  if (!rows.length || rows.length > 2000) throw new BadRequestException('CSV cần 1–2.000 dòng.');
  const errors: { row: number; message: string }[] = [],
    items: ItemData[] = [],
    seen = new Set<string>();
  rows.forEach((r, i) => {
    try {
      if (seen.has(r.externalId)) throw new Error('externalId trùng trong file.');
      const item = validateItem({
        ...r,
        aliases: (r.aliases ?? '').split('|').filter(Boolean),
        forms: (r.forms ?? '').split('|').filter(Boolean),
        pronunciation: {
          en: r.enPronunciation ?? '',
          ja: r.jaPronunciation ?? '',
          scientific: r.scientificPronunciation ?? '',
        },
      });
      seen.add(item.externalId);
      items.push(item);
    } catch (e) {
      errors.push({ row: i + 2, message: (e as Error).message });
    }
  });
  return { items, errors, count: rows.length };
}
@Injectable()
export class Catalog {
  constructor(public db: Db) {}
  async current(actor: AuthSession) {
    const current = await this.db.setting.findUnique({
      where: { id: actor.internal ? 'current:internal' : 'current:public' },
    });
    if (!current) throw new NotFoundException('Chưa có bộ học được xuất bản cho phạm vi này.');
    const release = await this.db.contentRelease.findUniqueOrThrow({
      where: { id: current.value },
    });
    if (release.internal && !actor.internal) throw new NotFoundException();
    return release;
  }
  async list(
    actor: AuthSession,
    page = 1,
    limit = 12,
    query = '',
    group = '',
    learnable = false,
    taxon = '',
  ) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      query.length > 100 ||
      group.length > 80 ||
      !['', 'fish', 'crustacean', 'mollusc', 'other', 'none'].includes(taxon)
    )
      throw new BadRequestException('Phân trang/bộ lọc không hợp lệ.');
    const release = await this.current(actor);
    const altIds = query
      ? (await this.db.$queryRaw<{ id: string }[]>(alternateNameIdsSql(release.id, query))).map(
          (r) => r.id,
        )
      : [];
    const base: Prisma.RevisionWhereInput = {
      AND: [
        ...(learnable
          ? kinds.map((kind) => ({ names: { some: { kind, label: { not: '' } } } }))
          : []),
      ],
      releases: { some: { releaseId: release.id } },
      ...(query
        ? {
            OR: [
              {
                names: {
                  some: {
                    OR: [
                      { label: { contains: query, mode: 'insensitive' } },
                      { searchText: { contains: query, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              { id: { in: altIds } },
            ],
          }
        : {}),
      ...(group ? { data: { path: ['group'], equals: group } } : {}),
    };
    // "none" = no named group recorded (missing, null or unknown value), as the web shows it.
    const ungrouped =
      taxon === 'none'
        ? (await this.db.$queryRaw<{ id: string }[]>(ungroupedIdsSql(release.id))).map((r) => r.id)
        : [];
    const inGroup = (t: string): Prisma.RevisionWhereInput => ({
      ...base,
      AND: [
        ...(base.AND as Prisma.RevisionWhereInput[]),
        { data: { path: ['taxonomicGroup'], equals: t } },
      ],
    });
    const where: Prisma.RevisionWhereInput = !taxon
      ? base
      : taxon === 'none'
        ? {
            ...base,
            AND: [...(base.AND as Prisma.RevisionWhereInput[]), { id: { in: ungrouped } }],
          }
        : inGroup(taxon);
    const [all, fish, crustacean, mollusc, other, rows] = await this.db.$transaction([
      this.db.revision.count({ where: base }),
      this.db.revision.count({ where: inGroup('fish') }),
      this.db.revision.count({ where: inGroup('crustacean') }),
      this.db.revision.count({ where: inGroup('mollusc') }),
      this.db.revision.count({ where: inGroup('other') }),
      this.db.revision.findMany({
        where,
        orderBy: { item: { externalId: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
        include: { names: true, media: { include: { asset: true } } },
      }),
    ]);
    // Chip totals ignore the taxon, so each chip shows what selecting it would list.
    const groups = groupTotals(all, { fish, crustacean, mollusc, other });
    return {
      releaseId: release.id,
      internal: release.internal,
      page,
      limit,
      total: taxon ? groups[taxon as keyof GroupTotals] : all,
      items: rows.map((r) => this.dto(r)),
      groups,
    };
  }
  async overview(actor: AuthSession) {
    const release = await this.current(actor);
    const revisions = await this.db.revision.findMany({
      where: {
        releases: { some: { releaseId: release.id } },
        AND: kinds.map((kind) => ({ names: { some: { kind, label: { not: '' } } } })),
      },
      orderBy: { item: { externalId: 'asc' } },
      include: { names: true, media: { include: { asset: true } } },
    });
    const rows: OverviewRow[] = revisions.map(toOverviewRow);
    const hsCases = await this.db.tradeScenario.count({
      where: {
        revisionId: { in: rows.map((r) => r.revisionId) },
        ...(!release.internal ? { status: 'approved' } : {}),
      },
    });
    return summarizeOverview(rows, hsCases, release);
  }
  dto(row: {
    id: string;
    data: Prisma.JsonValue;
    names: { kind: string; label: string; source: string; pronunciation: string | null }[];
    media: {
      asset: {
        id: string;
        role: string;
        nameKind: string | null;
        status: string;
        revokedAt: Date | null;
      };
    }[];
  }) {
    const d = row.data as unknown as ItemData;
    return {
      revisionId: row.id,
      externalId: d.externalId,
      sku: d.sku,
      group: d.group,
      names: row.names.map((n) => ({
        kind: n.kind,
        label: n.label,
        source: n.source,
        pronunciation: n.pronunciation,
      })),
      forms: d.forms,
      identification: d.identification,
      note: d.note,
      taxonomicGroup: d.taxonomicGroup ?? null,
      family: d.family ?? null,
      familyVi: d.familyVi ?? null,
      enAliases: d.enAliases ?? [],
      jaKanji: d.jaKanji ?? null,
      jaTrade: d.jaTrade ?? null,
      media: row.media
        .filter((m) => !m.asset.revokedAt)
        .map((m) => ({
          id: m.asset.id,
          role: m.asset.role,
          nameKind: m.asset.nameKind,
          approved: m.asset.status === 'approved',
        })),
    };
  }
  async detail(actor: AuthSession, revisionId: string) {
    const release = await this.current(actor);
    const row = await this.db.revision.findFirst({
      where: {
        OR: [{ id: revisionId }, { item: { externalId: revisionId } }],
        releases: { some: { releaseId: release.id } },
      },
      include: { names: true, media: { include: { asset: true } } },
    });
    if (!row) throw new NotFoundException();
    return this.dto(row);
  }
  async import(items: ItemData[], actorId: string) {
    return this.db.$transaction(
      async (tx) => {
        const result: string[] = [];
        for (const data of items) {
          const item = await tx.item.upsert({
            where: { externalId: data.externalId },
            create: { externalId: data.externalId },
            update: {},
          });
          const digest = hash(JSON.stringify(data));
          const same = await tx.revision.findFirst({ where: { itemId: item.id, digest } });
          if (same) {
            result.push(same.id);
            continue;
          }
          const previous = await tx.revision.findFirst({
            where: { itemId: item.id },
            orderBy: { version: 'desc' },
          });
          const revision = await tx.revision.create({
            data: {
              itemId: item.id,
              version: (previous?.version ?? 0) + 1,
              data: data as unknown as Prisma.InputJsonValue,
              digest,
              createdBy: actorId,
              names: {
                create: kinds
                  .filter((k) => data[k])
                  .map((kind) => ({
                    kind,
                    label: data[kind],
                    aliases: kind === 'vi' ? data.aliases : [],
                    acceptedForms: [data[kind]],
                    searchText: data[kind] + ' ' + (kind === 'vi' ? data.aliases.join(' ') : ''),
                    source: data.source,
                    pronunciation: data.pronunciation[kind] || null,
                  })),
              },
            },
          });
          if (data.scientific) {
            const species = await tx.species.upsert({
              where: { id: data.externalId },
              create: { id: data.externalId, scientificName: data.scientific, source: data.source },
              update: {},
            });
            await tx.productSpecies.upsert({
              where: { itemId_speciesId: { itemId: item.id, speciesId: species.id } },
              create: { itemId: item.id, speciesId: species.id },
              update: {},
            });
          }
          await tx.audit.create({
            data: {
              actorId,
              action: 'draft.create',
              targetId: revision.id,
              detail: { externalId: data.externalId },
            },
          });
          result.push(revision.id);
        }
        return result;
      },
      { timeout: 30000, isolationLevel: 'Serializable' },
    );
  }
  async review(id: string, actorId: string) {
    return this.db.$transaction(async (tx) => {
      const r = await tx.revision.findUniqueOrThrow({ where: { id } });
      if (r.status !== 'review')
        throw new ConflictException('Cần chuyển nháp sang chờ duyệt trước.');
      await tx.revision.update({
        where: { id },
        data: { status: 'approved', reviewedBy: actorId, reviewedAt: new Date() },
      });
      await tx.audit.create({
        data: { actorId, action: 'revision.approve', targetId: id, detail: {} },
      });
      return { id, status: 'approved' };
    });
  }
  async publish(ids: string[], actorId: string, internal = false) {
    if (!ids.length || ids.length > 2000 || new Set(ids).size !== ids.length)
      throw new BadRequestException('Danh sách revision không hợp lệ.');
    if (internal && process.env.ALLOW_INTERNAL_DEMO !== 'true')
      throw new BadRequestException('Không cho phép xuất bản seed nội bộ ở môi trường này.');
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.revision.findMany({
          where: { id: { in: ids } },
          include: { names: true, media: { include: { asset: true } } },
        });
        if (rows.length !== ids.length || new Set(rows.map((r) => r.itemId)).size !== rows.length)
          throw new BadRequestException('Thiếu hoặc trùng mục học.');
        if (!internal) {
          for (const r of rows) {
            const problem = publicRowProblem(r);
            if (problem) throw new BadRequestException(problem);
          }
          if (
            rows.filter((r) =>
              r.media.some(
                (m) =>
                  m.asset.role === 'identification' &&
                  !m.asset.aiGenerated &&
                  m.asset.status === 'approved' &&
                  !m.asset.revokedAt,
              ),
            ).length < 3
          )
            throw new BadRequestException('Cần ảnh identification đã duyệt của ít nhất 3 mục.');
          const originals = new Set(
            rows
              .flatMap((r) =>
                r.media
                  .filter(
                    (m) =>
                      m.asset.role === 'identification' &&
                      m.asset.status === 'approved' &&
                      !m.asset.aiGenerated &&
                      !m.asset.revokedAt,
                  )
                  .map((m) => (m.asset.metadata as { originalImageId?: string }).originalImageId),
              )
              .filter(Boolean),
          );
          if (originals.size < 3)
            throw new BadRequestException(
              'Cần 3 ảnh gốc khác nhau; các crop cùng ảnh không được tính riêng.',
            );
          for (const kind of kinds)
            if (
              new Set(
                rows.map((r) =>
                  r.names
                    .find((n) => n.kind === kind)
                    ?.label.normalize('NFKC')
                    .trim()
                    .toLocaleLowerCase(),
                ),
              ).size < 3
            )
              throw new BadRequestException('Chưa đủ 3 tên chính không mơ hồ cho mỗi hướng ghép.');
          const hs = await tx.tradeScenario.findMany({
            where: { revisionId: { in: ids }, status: 'approved', reviewedBy: { not: null } },
          });
          if (hs.length < 3) throw new BadRequestException('Cần 3 hồ sơ HS đã duyệt.');
          const references = await tx.tariffReference.findMany();
          for (const scenario of hs)
            validateHs(
              scenario.data as unknown as HsData,
              references.find((t) => t.id === scenario.tariffId) ?? null,
            );
          if (!hs.some((s) => (s.data as unknown as HsData).kind === 'insufficient'))
            throw new BadRequestException('Thiếu case unknown.');
          const codes = hs.filter((s) => (s.data as unknown as HsData).kind === 'code');
          if (
            !codes.some((a) =>
              codes.some((b) => a.revisionId === b.revisionId && a.tariffId !== b.tariffId),
            )
          )
            throw new BadRequestException('Cần cặp cùng mặt hàng khác quy cách và mã.');
        }
        const release = await tx.contentRelease.create({
          data: {
            internal,
            createdBy: actorId,
            items: { create: ids.map((revisionId) => ({ revisionId })) },
          },
        });
        await tx.setting.upsert({
          where: { id: internal ? 'current:internal' : 'current:public' },
          create: { id: internal ? 'current:internal' : 'current:public', value: release.id },
          update: { value: release.id },
        });
        await tx.audit.create({
          data: {
            actorId,
            action: 'release.publish',
            targetId: release.id,
            detail: { internal, revisions: ids },
          },
        });
        return { id: release.id, internal };
      },
      { timeout: 30000, isolationLevel: 'Serializable' },
    );
  }
}
