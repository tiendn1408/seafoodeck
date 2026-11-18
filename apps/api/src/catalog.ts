import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthSession, Prisma } from './generated/prisma/client';
import { parse } from 'csv-parse/sync';
import { Db } from './db';
import { hash } from './security';
import { validateHs, type HsData } from './hs';

export const kinds = ['vi', 'en', 'ja', 'scientific'] as const;
export type Kind = (typeof kinds)[number];
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
}
export function validateItem(input: unknown): ItemData {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Dòng không phải object.');
  const row = input as Record<string, unknown>;
  for (const key of ['externalId', 'group', 'sku', ...kinds, 'source', 'identification', 'note']) {
    if (typeof row[key] !== 'string' || (row[key] as string).length > 3000)
      throw new BadRequestException(`Thiếu/sai ${key}.`);
  }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(row.externalId as string) || !(row.vi as string).trim())
    throw new BadRequestException('externalId/tên Việt không hợp lệ.');
  if (/tôm|shrimp|prawn/iu.test([row.group, row.vi, row.en, row.scientific].join(' ')))
    throw new BadRequestException('Bộ khách hiện không bao gồm tôm.');
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
  async list(actor: AuthSession, page = 1, limit = 12, query = '', group = '', learnable = false) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      query.length > 100 ||
      group.length > 80
    )
      throw new BadRequestException('Phân trang/bộ lọc không hợp lệ.');
    const release = await this.current(actor);
    const where: Prisma.RevisionWhereInput = {
      ...(learnable
        ? { AND: kinds.map((kind) => ({ names: { some: { kind, label: { not: '' } } } })) }
        : {}),
      releases: { some: { releaseId: release.id } },
      ...(query
        ? {
            names: {
              some: {
                OR: [
                  { label: { contains: query, mode: 'insensitive' } },
                  { searchText: { contains: query, mode: 'insensitive' } },
                ],
              },
            },
          }
        : {}),
      ...(group ? { data: { path: ['group'], equals: group } } : {}),
    };
    const [total, rows] = await this.db.$transaction([
      this.db.revision.count({ where }),
      this.db.revision.findMany({
        where,
        orderBy: { item: { externalId: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
        include: { names: true, media: { include: { asset: true } } },
      }),
    ]);
    return {
      releaseId: release.id,
      internal: release.internal,
      page,
      limit,
      total,
      items: rows.map((r) => this.dto(r)),
    };
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
            if (
              r.status !== 'approved' ||
              !r.reviewedBy ||
              kinds.some((k) => !r.names.some((n) => n.kind === k && n.source))
            )
              throw new BadRequestException('Mục học chưa đủ tên/nguồn/duyệt.');
            for (const kind of ['en', 'ja', 'scientific'])
              if (
                !r.names.find((n) => n.kind === kind)?.pronunciation ||
                !r.media.some(
                  (m) =>
                    m.asset.role === 'pronunciation' &&
                    m.asset.nameKind === kind &&
                    m.asset.status === 'approved' &&
                    !m.asset.revokedAt,
                )
              )
                throw new BadRequestException('Thiếu audio/hướng dẫn đọc được duyệt.');
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
