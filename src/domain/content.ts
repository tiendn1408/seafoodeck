import type { ContentPack, MediaAsset, NameKind } from './models';
import { normalizeHs, normalizeName } from './scoring';

export const languageLabels: Record<NameKind, string> = {
  vi: 'Tiếng Việt',
  en: 'Tiếng Anh',
  ja: 'Tiếng Nhật',
  scientific: 'Tên khoa học',
};
export function primaryName(pack: ContentPack, speciesId: string, kind: NameKind) {
  return pack.names.find(
    (n) => n.speciesId === speciesId && n.kind === kind && n.role === 'primary',
  );
}
export function canUseMedia(
  asset: MediaAsset | undefined,
  purpose: MediaAsset['purposes'][number],
): boolean {
  if (
    !asset ||
    asset.status !== 'approved' ||
    !asset.reviewer ||
    !asset.reviewedAt ||
    !asset.rights ||
    !asset.sourceId ||
    !asset.version
  )
    return false;
  const pathValid = /^(?:\/(?!\/)|https:\/\/)/u.test(asset.path);
  if (!pathValid || !asset.purposes.includes(purpose)) return false;
  return purpose === 'pronunciation'
    ? asset.type === 'audio'
    : purpose === 'identification'
      ? asset.type === 'species_photo' && asset.aiGenerated === false
      : asset.type !== 'audio';
}

// Draft photos may be previewed only by the explicitly labelled demo pack.
export function usableImage(pack: ContentPack, asset: MediaAsset): boolean {
  if (
    asset.type !== 'species_photo' ||
    asset.aiGenerated !== false ||
    !asset.speciesId ||
    !asset.originalImageId ||
    !asset.rights ||
    !asset.credit ||
    !asset.sourceUrl ||
    !pack.sources.some((s) => s.id === asset.sourceId) ||
    !pack.species.some((s) => s.id === asset.speciesId)
  )
    return false;
  return pack.audience === 'demo'
    ? /^\/media\/(?:demo|customer)\/[a-z0-9-]+\.jpg$/u.test(asset.path)
    : canUseMedia(asset, 'identification');
}

export function imageQuestions(
  pack: ContentPack,
  speciesOrder = pack.species.map((s) => s.id),
): import('./models').Question[] {
  const originals = new Set<string>();
  const photos: MediaAsset[] = [];
  for (const id of [...new Set(speciesOrder)]) {
    const photo = pack.media.find(
      (m) => m.speciesId === id && usableImage(pack, m) && !originals.has(m.originalImageId!),
    );
    if (photo) {
      photos.push(photo);
      originals.add(photo.originalImageId!);
    }
    if (photos.length === 3) break;
  }
  if (photos.length !== 3) return [];
  return photos.map((m, i) => ({
    id: `image-${m.id}`,
    type: 'image' as const,
    assetId: m.id,
    speciesId: m.speciesId!,
    options: [photos[(i + 1) % 3].speciesId!, photos[(i + 2) % 3].speciesId!, m.speciesId!],
  }));
}
export function buildPairs(
  pack: ContentPack,
  kind: 'en' | 'ja' | 'scientific',
  ids = pack.species.map((s) => s.id),
) {
  const pairs = ids.slice(0, 3).map((speciesId) => ({
    speciesId,
    left: primaryName(pack, speciesId, 'vi')?.label ?? '',
    right: primaryName(pack, speciesId, kind)?.label ?? '',
  }));
  if (pairs.length !== 3 || pairs.some((p) => !p.left || !p.right)) return null;
  for (const side of ['left', 'right'] as const) {
    if (new Set(pairs.map((p) => normalizeName(p[side]))).size !== 3) return null;
  }
  const accepted = new Map<string, string>();
  for (const entry of pack.names.filter(
    (n) => ids.includes(n.speciesId) && (n.kind === kind || n.kind === 'vi'),
  )) {
    if (entry.role === 'alias' && entry.status !== 'approved') continue;
    const forms = [entry.label, ...(entry.status === 'approved' ? entry.acceptedForms : [])];
    for (const form of forms) {
      const key = `${entry.kind}:${normalizeName(form)}`;
      if (accepted.has(key) && accepted.get(key) !== entry.speciesId) return null;
      accepted.set(key, entry.speciesId);
    }
  }
  return pairs;
}
export function validateContent(pack: ContentPack, forPublication = false): string[] {
  const errors: string[] = [];
  const sources = new Map(pack.sources.map((s) => [s.id, s]));
  const add = (id: string, message: string) => errors.push(`${id}: ${message}`);
  for (const collection of [
    pack.sources,
    pack.species,
    pack.names,
    pack.media,
    pack.tariffs,
    pack.scenarios,
  ]) {
    if (new Set(collection.map((x) => x.id)).size !== collection.length) add('pack', 'ID trùng');
  }
  const approved = (item: {
    id: string;
    status: string;
    reviewer?: string;
    reviewedAt?: string;
  }) => {
    if (forPublication && (item.status !== 'approved' || !item.reviewer || !item.reviewedAt))
      add(item.id, 'chưa có người duyệt');
  };
  const source = (id: string, sourceId: string) => {
    const entry = sources.get(sourceId);
    if (!entry) add(id, 'nguồn không tồn tại');
    if (forPublication && (!entry?.url || entry.fixtureOnly))
      add(id, 'nguồn chưa đủ điều kiện public');
  };
  if (forPublication && (pack.audience !== 'public' || pack.species.length === 0))
    add('pack', 'bộ public chưa sẵn sàng');
  for (const species of pack.species) {
    approved(species);
    source(species.id, species.sourceId);
    if (forPublication && species.fixtureOnly) add(species.id, 'fixture không được public');
    for (const kind of ['vi', 'en', 'ja', 'scientific'] as const) {
      const names = pack.names.filter(
        (n) => n.speciesId === species.id && n.kind === kind && n.role === 'primary',
      );
      if (names.length !== 1) add(species.id, `cần đúng một tên ${kind}`);
    }
  }
  for (const entry of pack.names) {
    approved(entry);
    source(entry.id, entry.sourceId);
    if (!pack.species.some((s) => s.id === entry.speciesId)) add(entry.id, 'loài không tồn tại');
    if (entry.audioAssetId && !pack.media.some((m) => m.id === entry.audioAssetId))
      add(entry.id, 'audio không tồn tại');
    if (forPublication && entry.role === 'primary' && entry.kind !== 'vi') {
      if (!entry.pronunciation?.text) add(entry.id, 'thiếu phiên âm');
      if (
        !canUseMedia(
          pack.media.find((m) => m.id === entry.audioAssetId),
          'pronunciation',
        )
      )
        add(entry.id, 'thiếu audio đã duyệt');
    }
  }
  for (const media of pack.media) {
    approved(media);
    source(media.id, media.sourceId);
    if (
      forPublication &&
      media.purposes.includes('identification') &&
      !canUseMedia(media, 'identification')
    )
      add(media.id, 'ảnh nhận diện chưa hợp lệ');
    if (forPublication && (!media.rights || !media.path))
      add(media.id, 'thiếu quyền sử dụng hoặc tệp');
  }
  for (const tariff of pack.tariffs) {
    approved(tariff);
    source(tariff.id, tariff.sourceId);
    const code = normalizeHs(tariff.code),
      parent = normalizeHs(tariff.parentCode);
    if (!code || code.length !== tariff.level) add(tariff.id, 'cấp mã không hợp lệ');
    if (
      tariff.level === 8
        ? !parent || parent.length !== 6 || !code?.startsWith(parent)
        : !/^\d{4}$/u.test(tariff.parentCode) || !code?.startsWith(tariff.parentCode)
    )
      add(tariff.id, 'mã cha sai cấp');
    if (
      forPublication &&
      (tariff.fixtureOnly || !tariff.checkedAt || !tariff.effectiveFrom || !tariff.citation)
    )
      add(tariff.id, 'tham chiếu chưa kiểm chứng');
  }
  for (const scenario of pack.scenarios) {
    approved(scenario);
    const tariff = pack.tariffs.find((t) => t.id === scenario.tariffId);
    if (!pack.species.some((s) => s.id === scenario.speciesId))
      add(scenario.id, 'loài không tồn tại');
    if (!tariff || tariff.level !== scenario.expectedCodeLength)
      add(scenario.id, 'tham chiếu mã không khớp');
    if (scenario.version !== pack.version) add(scenario.id, 'phiên bản không khớp');
    if (scenario.answerType === 'code' && Object.values(scenario.facts).includes('unknown'))
      add(scenario.id, 'đề chọn mã còn thiếu dữ kiện');
    if (
      scenario.answerType === 'insufficient' &&
      (!scenario.missingFact ||
        scenario.facts[scenario.missingFact] !== 'unknown' ||
        !scenario.followUps.some((f) => f.id === scenario.missingFact))
    )
      add(scenario.id, 'dữ kiện thiếu không hợp lệ');
    const answers = scenario.options.filter((o) =>
      scenario.answerType === 'insufficient'
        ? o.id === 'insufficient'
        : normalizeHs(o.id) === normalizeHs(tariff?.code ?? ''),
    );
    if (answers.length !== 1) add(scenario.id, 'cần đúng một đáp án');
    if (forPublication && scenario.fixtureOnly) add(scenario.id, 'fixture không được public');
  }
  for (const kind of ['en', 'ja', 'scientific'] as const) {
    if (pack.species.length >= 3 && !buildPairs(pack, kind)) add(kind, 'bàn ghép mơ hồ');
  }
  return errors;
}
