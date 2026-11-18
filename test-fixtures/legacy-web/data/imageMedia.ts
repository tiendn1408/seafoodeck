import type { MediaAsset, Source } from '../../../apps/web/src/domain/models';

export const imageSources: Source[] = [
  {
    id: 'commons-m001',
    title: 'Penaeus monodon — Almandine / Epipelagic',
    location: 'Bản Commons bỏ thước, 2816×2112',
    url: 'https://commons.wikimedia.org/wiki/File:Penaeus_monodon.jpg',
  },
  {
    id: 'commons-m003',
    title: 'Macrobrachium rosenbergii — Citron',
    location: 'Bản gốc 2100×1127',
    url: 'https://commons.wikimedia.org/wiki/File:Macrobrachium_rosenbergii.jpg',
  },
  {
    id: 'commons-usda-k3507-12',
    title: 'USDA Agricultural Research Service · K3507-12',
    location: 'Bản Commons 2700×1787; ảnh tôm non, có phản chiếu',
    url: 'https://commons.wikimedia.org/wiki/File:Penaeus_vannamei_01.jpg',
  },
];
export const imageMedia: MediaAsset[] = [
  {
    id: 'm001',
    speciesId: 'black-tiger',
    sourceId: 'commons-m001',
    originalImageId: 'commons-m001',
    credit: 'Almandine; bản Commons do Epipelagic chỉnh bỏ thước',
    rights: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: imageSources[0].url,
    sha256: '298113473c2391a0a1c2e78981d7990179c19f26a330104674b34a138da64432',
    explanation:
      'Quan sát các dải sẫm trên bụng và hình dạng đầu/chủy. Dải thân là gợi ý, không đủ tự xác nhận loài.',
  },
  {
    id: 'm003',
    speciesId: 'giant-river',
    sourceId: 'commons-m003',
    originalImageId: 'commons-m003',
    credit: 'Citron / CC-BY-SA-3.0',
    rights: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: imageSources[1].url,
    sha256: '0652184eecc63e324645e7c033dbc4af85908965c50e0b04750141b4d97d0e8c',
    explanation:
      'Quan sát đôi càng dài và hình dạng đầu/chủy. Không lấy nền bể hoặc màu càng làm căn cứ duy nhất.',
  },
  {
    id: 'm005',
    speciesId: 'whiteleg',
    sourceId: 'commons-usda-k3507-12',
    originalImageId: 'commons-usda-k3507-12',
    credit: 'USDA Agricultural Research Service · K3507-12',
    rights: 'Public domain tại Hoa Kỳ theo nguồn USDA ARS; chưa kết luận phạm vi toàn cầu',
    licenseUrl: 'https://commons.wikimedia.org/wiki/File:Penaeus_vannamei_01.jpg#Licensing',
    sourceUrl: imageSources[2].url,
    sha256: 'c7ac3e79ac9f249fe95f4d1a30478b0226afe8a4c3f87103ba5f4d20c141e274',
    explanation:
      'Ảnh nguồn USDA mô tả một cá thể tôm non; phần bên dưới là phản chiếu. Quan sát thân, chân và đầu; không yêu cầu đếm răng chủy từ ảnh này. Chưa duyệt dấu hiệu nhận diện.',
  },
].map((asset) => ({
  ...asset,
  type: 'species_photo',
  purposes: ['profile', 'identification'],
  path: `/media/demo/${asset.id}-v1.jpg`,
  status: 'draft',
  aiGenerated: false,
  version: '1',
}));
