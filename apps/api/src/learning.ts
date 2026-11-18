import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthSession, Prisma } from './generated/prisma/client';
import { randomInt, randomUUID } from 'node:crypto';
import { Db } from './db';
import { Catalog, Kind } from './catalog';
import { Media } from './media';
import { hash } from './security';
type Option = { id: string; label: string };
export interface PrivateQuestion {
  type: string;
  targetId: string;
  skill: string;
  front?: string;
  prompt: string;
  options?: Option[];
  left?: Option[];
  right?: Option[];
  correct?: string;
  pairs?: Record<string, string>;
  targets?: Record<string, string>;
  reveal?: unknown;
  explanation: string;
  source?: string;
  assetId?: string;
  followUps?: Option[];
  correctFollowUp?: string;
  followUpRequiredFor?: string;
  catalog?: string;
}
export function shuffled<T>(rows: T[]) {
  const result = [...rows];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function distinctNames<T>(rows: T[], labels: (row: T) => string[]) {
  const seen: Set<string>[] = [];
  return rows.filter((row) => {
    const keys = labels(row).map((label) => label.normalize('NFKC').trim().toLocaleLowerCase());
    if (keys.some((key, i) => !key || seen[i]?.has(key))) return false;
    keys.forEach((key, i) => (seen[i] ??= new Set()).add(key));
    return true;
  });
}
export function selectHsCases<
  T extends { id: string; revisionId: string; tariffId: string | null; data: unknown },
>(rows: T[], focusId?: string): T[] {
  if (focusId) {
    const focus = rows.find((row) => row.id === focusId);
    if (!focus) throw new BadRequestException('Hồ sơ HS không còn trong bộ hiện hành.');
    return [focus, ...rows.filter((row) => row.id !== focusId)].slice(0, 3);
  }
  const kind = (row: T) => (row.data as { kind?: string })?.kind;
  const missing = rows.find((row) => kind(row) === 'insufficient');
  const codes = rows.filter((row) => kind(row) === 'code' && row.tariffId);
  for (const first of codes) {
    const second = codes.find(
      (row) =>
        row.id !== first.id &&
        row.revisionId === first.revisionId &&
        row.tariffId !== first.tariffId,
    );
    if (second && missing) return [first, second, missing];
  }
  return rows.slice(0, 3);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function grade(q: PrivateQuestion, answer: Record<string, unknown>) {
  if (answer.skip === true)
    return { answered: false, skipped: true, correct: false, selfRated: false };
  if (q.type === 'flashcard') {
    if (!['known', 'again'].includes(String(answer.rating)))
      throw new BadRequestException('Cần tự đánh giá thẻ.');
    return { answered: true, skipped: false, correct: answer.rating === 'known', selfRated: true };
  }
  let correct: boolean;
  if (q.type === 'match') {
    const pairs = answer.pairs;
    if (
      !pairs ||
      typeof pairs !== 'object' ||
      Array.isArray(pairs) ||
      Object.keys(pairs).length !== Object.keys(q.pairs!).length ||
      Object.values(pairs).some((v) => typeof v !== 'string') ||
      new Set(Object.values(pairs)).size !== Object.keys(pairs).length
    )
      throw new BadRequestException('Cần ghép đủ các cặp khác nhau.');
    correct = Object.entries(q.pairs!).every(
      ([l, r]) => (pairs as Record<string, string>)[l] === r,
    );
  } else {
    if (!q.options?.some((o) => o.id === answer.optionId))
      throw new BadRequestException('Lựa chọn không thuộc câu hỏi.');
    if (
      q.correctFollowUp &&
      answer.optionId === q.correct &&
      !q.followUps?.some((o) => o.id === answer.followUpId)
    )
      throw new BadRequestException('Cần chọn dữ kiện phải hỏi thêm.');
    if (
      q.followUpRequiredFor === answer.optionId &&
      !q.followUps?.some((o) => o.id === answer.followUpId)
    )
      throw new BadRequestException('Chọn dữ kiện cần hỏi khi trả lời chưa đủ thông tin.');
    correct =
      answer.optionId === q.correct &&
      (!q.correctFollowUp || answer.followUpId === q.correctFollowUp);
  }
  return { answered: true, skipped: false, correct, selfRated: false };
}
@Injectable()
export class Learning {
  constructor(
    private db: Db,
    private catalog: Catalog,
    private media: Media,
  ) {}
  async start(
    actor: AuthSession,
    mode: string,
    kind: Kind = 'en',
    revisionId?: string,
    reviewOf?: string,
    reviewTargets?: { targetId: string; skill: string }[],
    focusTarget = false,
    focusCaseId?: string,
  ) {
    if (
      !['flashcard', 'match', 'image', 'hs', 'full', 'review', 'listening'].includes(mode) ||
      !['en', 'ja', 'scientific'].includes(kind)
    )
      throw new BadRequestException('Chế độ/hướng học không hợp lệ.');
    const release = await this.catalog.current(actor);
    let questions: PrivateQuestion[] = [];
    if (reviewTargets?.length) {
      if (mode !== 'review' || reviewTargets.length > 30)
        throw new BadRequestException('Tối đa 30 mục ôn mỗi lượt.');
      for (const target of reviewTargets) {
        if (!target || typeof target.targetId !== 'string' || typeof target.skill !== 'string')
          throw new BadRequestException('Mục ôn không hợp lệ.');
        const [category, direction] = target.skill.split(':');
        const nextMode = category === 'name' ? 'flashcard' : category;
        if (!['flashcard', 'match', 'hs', 'image', 'listening'].includes(nextMode))
          throw new BadRequestException('Kỹ năng ôn không hợp lệ.');
        const revision = await this.db.revision.findFirst({
          where: {
            itemId: target.targetId.split('/listening/')[0],
            releases: { some: { releaseId: release.id } },
          },
        });
        const temporary = await this.start(
          actor,
          nextMode,
          (direction ?? target.targetId.split('/listening/')[1] ?? 'en') as Kind,
          revision?.id,
          undefined,
          undefined,
          true,
          category === 'hs' ? target.targetId : undefined,
        );
        const built = await this.db.question.findMany({ where: { sessionId: temporary.id } });
        const found = built
          .map((q) => q.private as unknown as PrivateQuestion)
          .find(
            (q) =>
              q.skill === target.skill &&
              (q.targetId === target.targetId ||
                Object.values(q.targets ?? {}).includes(target.targetId)),
          );
        await this.db.gameSession.delete({ where: { id: temporary.id } });
        if (!found)
          throw new BadRequestException('Mục ôn không còn đủ dữ liệu trong bộ hiện hành.');
        questions.push(found);
      }
    } else if (reviewOf) {
      const old = await this.session(actor, reviewOf);
      questions = old.questions
        .filter((q) => q.attempt && !(q.attempt.result as { correct: boolean }).correct)
        .map((q) => q.private as unknown as PrivateQuestion);
      if (!questions.length) throw new BadRequestException('Không có câu cần làm lại.');
      if (old.releaseId !== release.id)
        throw new ConflictException('Bộ học đã đổi; lịch sử cũ giữ riêng.');
    } else {
      const rows = await this.db.revision.findMany({
        where: {
          releases: { some: { releaseId: release.id } },
          AND: ['vi', 'en', 'ja', 'scientific'].map((k) => ({
            names: { some: { kind: k, label: { not: '' } } },
          })),
        },
        take: 100,
        include: { names: true, media: { include: { asset: true } } },
      });
      const selected = revisionId ? rows.find((r) => r.id === revisionId) : rows[0];
      if (!selected) throw new BadRequestException('Chưa có mục đủ bốn tên để học.');
      const label = (r: typeof selected, k: string) => r.names.find((n) => n.kind === k)!.label;
      if (mode === 'flashcard' || mode === 'full')
        for (const k of ['en', 'ja', 'scientific']) {
          const n = selected.names.find((n) => n.kind === k)!;
          const audio = selected.media.find(
            (m) =>
              m.asset.role === 'pronunciation' &&
              m.asset.nameKind === k &&
              !m.asset.revokedAt &&
              (release.internal || m.asset.status === 'approved'),
          );
          questions.push({
            type: 'flashcard',
            targetId: selected.itemId,
            skill: `name:${k}`,
            front: label(selected, 'vi'),
            prompt: `Tên ${k === 'en' ? 'tiếng Anh' : k === 'ja' ? 'tiếng Nhật' : 'khoa học'}`,
            reveal: {
              label: n.label,
              pronunciation: n.pronunciation,
              source: n.source,
              audioAssetId: audio?.assetId ?? null,
            },
            explanation: 'Tự đánh giá, không tính vào tỷ lệ chấm tự động.',
          });
        }
      if (mode === 'match' || mode === 'full') {
        const chosen = distinctNames(
          [selected, ...shuffled(rows.filter((r) => r.id !== selected.id))],
          (r) => [label(r, 'vi'), label(r, kind)],
        ).slice(0, 3);
        if (chosen.length < 3) throw new BadRequestException('Chưa đủ 3 cặp tên không mơ hồ.');
        const pairs: Record<string, string> = {};
        const targets: Record<string, string> = {};
        const left: Option[] = [],
          right: Option[] = [];
        for (const r of chosen) {
          const l = randomUUID(),
            rr = randomUUID();
          pairs[l] = rr;
          targets[l] = r.itemId;
          left.push({ id: l, label: label(r, 'vi') });
          right.push({ id: rr, label: label(r, kind) });
        }
        questions.push({
          type: 'match',
          targetId: 'matching',
          skill: `match:${kind}`,
          prompt: 'Ghép tên thương mại',
          left,
          right: shuffled(right),
          pairs,
          targets,
          explanation: 'Các cặp thuộc cùng một định danh; tên nhóm hàng không thay tên loài.',
        });
      }
      if (mode === 'listening') {
        const hashes = new Set<string>();
        const eligible = distinctNames(
          (focusTarget
            ? [selected, ...shuffled(rows.filter((r) => r.id !== selected.id))]
            : shuffled(rows)
          ).flatMap((r) => {
            const asset = r.media.find(
              (m) =>
                m.asset.role === 'pronunciation' &&
                m.asset.nameKind === kind &&
                !m.asset.revokedAt &&
                (release.internal || m.asset.status === 'approved'),
            )?.asset;
            if (!asset || hashes.has(asset.hash)) return [];
            hashes.add(asset.hash);
            return [{ r, asset }];
          }),
          ({ r }) => [label(r, kind)],
        ).slice(0, 3);
        if (eligible.length < 3)
          throw new BadRequestException(
            'Chưa đủ 3 bản thu khác nhau, đúng hướng ngôn ngữ. Có thể học Ghép tên.',
          );
        for (const { r, asset } of eligible) {
          const opts = shuffled(eligible).map((s) => ({
            id: randomUUID(),
            label: label(s.r, kind),
            revisionId: s.r.id,
          }));
          questions.push({
            type: 'listening',
            targetId: r.itemId + '/listening/' + kind,
            skill: 'listening',
            prompt: 'Nghe bản thu, chọn đúng tên',
            assetId: asset.id,
            options: opts.map((o) => ({ id: o.id, label: o.label })),
            correct: opts.find((o) => o.revisionId === r.id)!.id,
            explanation: 'Đối chiếu bản thu với tên đã được cấp quyền trong bộ học.',
            source: (asset.metadata as { source: string }).source,
          });
        }
      }
      if (mode === 'image') {
        const originals = new Set<string>();
        const choices = distinctNames(
          (focusTarget
            ? [selected, ...shuffled(rows.filter((r) => r.id !== selected.id))]
            : shuffled(rows)
          ).flatMap((r) => {
            const asset = r.media.find(
              (m) =>
                m.asset.role === 'identification' &&
                !m.asset.aiGenerated &&
                !m.asset.revokedAt &&
                (release.internal || m.asset.status === 'approved'),
            )?.asset;
            if (!asset) return [];
            const original =
              (asset.metadata as { originalImageId?: string }).originalImageId ?? asset.hash;
            if (originals.has(original)) return [];
            originals.add(original);
            return [{ r, asset }];
          }),
          ({ r }) => [label(r, 'vi')],
        ).slice(0, 3);
        if (choices.length < 3)
          throw new BadRequestException('Chưa đủ 3 ảnh gốc hợp lệ của 3 mục. Có thể học Ghép tên.');
        for (const { r, asset } of choices) {
          const namedOptions = distinctNames(
            [r, ...shuffled(rows.filter((s) => s.id !== r.id))],
            (s) => [label(s, 'vi')],
          ).slice(0, 3);
          if (namedOptions.length < 3)
            throw new BadRequestException('Chưa đủ 3 tên Việt không mơ hồ. Có thể học Flashcard.');
          const opts = shuffled(namedOptions).map((s) => ({
            id: randomUUID(),
            label: label(s, 'vi'),
            revision: s.id,
          }));
          questions.push({
            type: 'image',
            targetId: r.itemId,
            skill: 'image',
            prompt: 'Nhìn hình, chọn đúng loài',
            assetId: asset.id,
            options: opts.map((o) => ({ id: o.id, label: o.label })),
            correct: opts.find((o) => o.revision === r.id)!.id,
            explanation: (r.data as { identification: string }).identification,
            source: `${(asset.metadata as { credit: string }).credit} · ${(asset.metadata as { rights: string }).rights}\n${(asset.metadata as { source: string }).source}`,
          });
        }
      }
      if (mode === 'hs' || mode === 'full') {
        const availableScenarios = await this.db.tradeScenario.findMany({
          where: {
            revisionId: { in: rows.map((r) => r.id) },
            ...(!release.internal ? { status: 'approved' } : {}),
          },
          include: { tariff: true },
          orderBy: { id: 'asc' },
        });
        const scenarios = selectHsCases(availableScenarios, focusCaseId);
        if (scenarios.length < 3) throw new BadRequestException('Chưa đủ 3 hồ sơ HS cho bộ này.');
        for (const s of scenarios) {
          const data = s.data as {
            prompt: string;
            options: { label: string; correct: boolean }[];
            followUps?: { label: string; correct: boolean }[];
            explanation: string;
          };
          const opts = data.options.map((o) => ({ ...o, id: randomUUID() })),
            fups = (
              data.followUps ?? [
                { label: 'Hàng nguyên con hay phi lê?', correct: false },
                { label: 'Thùng hàng có màu gì?', correct: false },
                { label: 'Bên bán ở tỉnh nào?', correct: false },
              ]
            ).map((o) => ({ ...o, id: randomUUID() }));
          questions.push({
            type: 'hs',
            targetId: s.id,
            skill: 'hs',
            prompt: data.prompt,
            options: opts.map((o) => ({ id: o.id, label: o.label })),
            correct: opts.find((o) => o.correct)!.id,
            followUps: fups?.map((o) => ({ id: o.id, label: o.label })),
            correctFollowUp: fups?.find((o) => o.correct)?.id,
            followUpRequiredFor: opts.find((o) => o.label === 'Chưa đủ thông tin')?.id,
            explanation: data.explanation,
            source: s.tariff?.source,
            catalog: s.tariff
              ? `${s.tariff.market} · ${s.tariff.version} · Cấp ${s.tariff.level} số`
              : 'VN · Cần đối chiếu nguồn',
          });
        }
      }
    }
    if (!questions.length) throw new BadRequestException('Không có câu hỏi hợp lệ.');
    const session = await this.db.gameSession.create({
      data: {
        actorId: actor.id,
        releaseId: release.id,
        mode,
        expiresAt: new Date(Date.now() + Number(process.env.GAME_TTL_MINUTES ?? 120) * 60000),
        questions: {
          create: questions.map((q, position) => ({
            position,
            private: JSON.parse(JSON.stringify(q)) as Prisma.InputJsonValue,
          })),
        },
      },
    });
    return this.view(actor, session.id);
  }
  async session(actor: AuthSession, id: string) {
    const session = await this.db.gameSession.findFirst({
      where: { id, actorId: actor.id },
      include: {
        questions: { include: { attempt: true }, orderBy: { position: 'asc' } },
        release: true,
      },
    });
    if (!session || (session.release.internal && !actor.internal)) throw new NotFoundException();
    if (session.expiresAt.getTime() < Date.now())
      throw new GoneException('Lượt học đã hết hạn; bắt đầu lượt mới, không cộng lại điểm.');
    return session;
  }
  async view(actor: AuthSession, id: string) {
    const s = await this.session(actor, id);
    return {
      id: s.id,
      releaseId: s.releaseId,
      mode: s.mode,
      internal: s.release.internal,
      expiresAt: s.expiresAt,
      questions: await Promise.all(
        s.questions.map(async (row) => {
          const q = row.private as unknown as PrivateQuestion;
          let image: { url: string; expiresIn: number } | undefined,
            unavailable = false;
          if (q.assetId) {
            const a = await this.db.mediaAsset.findUnique({ where: { id: q.assetId } });
            if (!a || a.revokedAt) unavailable = true;
            else image = await this.media.url(a);
          }
          return {
            id: row.id,
            type: q.type,
            prompt: q.prompt,
            front: q.front,
            options: q.options,
            left: q.left,
            right: q.right,
            followUps: q.followUps,
            catalog: q.catalog,
            image: q.type === 'listening' ? undefined : image,
            audio: q.type === 'listening' ? image : undefined,
            unavailable,
            result: row.attempt?.result,
          };
        }),
      ),
    };
  }
  async reveal(actor: AuthSession, sessionId: string, questionId: string) {
    const s = await this.session(actor, sessionId),
      row = s.questions.find((q) => q.id === questionId),
      q = row?.private as unknown as PrivateQuestion;
    if (!row || q.type !== 'flashcard') throw new BadRequestException('Chỉ lật thẻ flashcard.');
    const detail = q.reveal as {
      label: string;
      pronunciation: string | null;
      source: string;
      audioAssetId: string | null;
    };
    const asset = detail.audioAssetId
      ? await this.db.mediaAsset.findUnique({ where: { id: detail.audioAssetId } })
      : null;
    return { ...detail, audio: asset && !asset.revokedAt ? await this.media.url(asset) : null };
  }
  async submit(
    actor: AuthSession,
    sessionId: string,
    questionId: string,
    key: string,
    answer: Record<string, unknown>,
  ) {
    if (
      !/^[a-zA-Z0-9_-]{8,100}$/.test(key) ||
      !answer ||
      typeof answer !== 'object' ||
      Array.isArray(answer) ||
      Buffer.byteLength(canonical(answer)) > 12000
    )
      throw new BadRequestException('Payload/idempotency key không hợp lệ.');
    const s = await this.session(actor, sessionId),
      row = s.questions.find((q) => q.id === questionId);
    if (!row) throw new NotFoundException();
    const payloadHash = hash(canonical({ sessionId, questionId, answer }));
    const existing = await this.db.attempt.findUnique({
      where: { actorId_idempotencyKey: { actorId: actor.id, idempotencyKey: key } },
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw new ConflictException('Cùng key nhưng khác payload.');
      return existing.result;
    }
    if (row.attempt) {
      if (row.attempt.payloadHash !== payloadHash)
        throw new ConflictException('Câu đã nộp; dùng lượt ôn riêng.');
      return row.attempt.result;
    }
    const q = row.private as unknown as PrivateQuestion;
    if (q.assetId) {
      const asset = await this.db.mediaAsset.findUnique({ where: { id: q.assetId } });
      if (!asset || asset.revokedAt) answer = { skip: true };
    }
    const scored = grade(q, answer);
    const result = {
      ...scored,
      at: new Date().toISOString(),
      questionId,
      row: row.position,
      targetId: q.targetId,
      targetLabel:
        q.front ?? q.options?.find((o) => o.id === q.correct)?.label ?? q.prompt.split('\n')[0],
      skill: q.skill,
      contentVersion: s.releaseId,
      explanation: scored.skipped
        ? 'Câu bỏ qua không tính đúng/sai hoặc tạo lịch ôn.'
        : q.explanation,
      ...(q.type === 'match' && !scored.skipped
        ? {
            items: Object.entries(q.pairs!).map(([left, right]) => ({
              targetId: q.targets![left],
              label: q.left?.find((o) => o.id === left)?.label,
              correct: (answer.pairs as Record<string, string>)[left] === right,
            })),
          }
        : {}),
      ...(!scored.skipped
        ? { source: q.source, correctOption: q.correct, correctPairs: q.pairs, reveal: q.reveal }
        : {}),
    };
    try {
      return (
        await this.db.$transaction(async (tx) =>
          tx.attempt.create({
            data: {
              questionId,
              actorId: actor.id,
              idempotencyKey: key,
              payloadHash,
              answer: answer as Prisma.InputJsonValue,
              result: JSON.parse(JSON.stringify(result)),
            },
          }),
        )
      ).result;
    } catch (e) {
      if ((e as { code: string }).code !== 'P2002') throw e;
      const old = await this.db.attempt.findFirst({
        where: { OR: [{ questionId }, { actorId: actor.id, idempotencyKey: key }] },
      });
      if (!old || old.payloadHash !== payloadHash)
        throw new ConflictException('Lần nộp đồng thời có payload khác.');
      return old.result;
    }
  }
}
