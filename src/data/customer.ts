import type { ContentPack, NameEntry, NameKind, Species, TradeScenario } from '../domain/models';
import { customerMedia, customerImageSources } from './customerMedia';

export const CUSTOMER_VERSION = 'seafood-trade-demo-1';
export const groups = [
  { id: 'cephalopod', label: 'Mực & bạch tuộc', short: 'Chân đầu' },
  { id: 'fish', label: 'Cá thương mại', short: 'Cá' },
  { id: 'bivalve', label: 'Nghêu & vẹm', short: 'Hai mảnh vỏ' },
] as const;
const draft = { status: 'draft' as const };
const checkedAt = '2026-11-17';
const source = (id: string, title: string, url: string, location: string) => ({
  id,
  title,
  url,
  location,
  checkedAt,
});
export const customerSources = [
  source(
    'vn-species',
    'Bộ NN&PTNT · VBHN 22/2024 — danh mục loài',
    'https://congbao.cdnchinhphu.vn/CongBaoCP/VanBan/2024/7/42515/51348-1-2024961-96222-vbhn-bnnptnt.pdf',
    'Đối chiếu tên Việt/khoa học của mực ống Trung Hoa, cá ngừ vây vàng, nghêu Bến Tre; không dùng làm nguồn xác nhận mã HS hiện hành.',
  ),
  source(
    'vn-mussel',
    'Bộ NN&PTNT · TT 24/2017 — vẹm xanh',
    'https://congbao.chinhphu.vn/tai-ve-van-ban-so-24-2017-tt-bnnptnt-25404-20413?format=pdf',
    'Tên Vẹm xanh — Perna viridis; nguồn tên lịch sử, không lấy mã HS trong văn bản này làm đáp án.',
  ),
  source(
    'jp-caa',
    'Cơ quan Tiêu dùng Nhật · tên gọi thủy sản 2025',
    'https://www.caa.go.jp/policies/policy/food_labeling/food_labeling_act/assets/food_labeling_cms201_250328_1032.pdf',
    'マダコ — Octopus sinensis; tên Nhật đối chiếu, chưa nghe duyệt phát âm.',
  ),
  source(
    'jp-squid',
    'Cơ quan Tiêu dùng Nhật · nhóm mực ống',
    'https://www.caa.go.jp/policies/policy/food_labeling/meeting_materials/assets/food_labeling_cms201_250123_05.pdf',
    'ヒラケンサキイカ — Uroteuthis (Photololigo) chinensis.',
  ),
  source(
    'jp-cod',
    'MAFF Nhật · danh sách thủy sản',
    'https://www.maff.go.jp/j/syouan/suisan/suisan_yobo/export/attach/pdf/Vietnam-live-2.pdf',
    'Gadus morhua — タイセイヨウダラ; không ghép với マダラ (Gadus macrocephalus).',
  ),
  source(
    'jp-tuna',
    'JAMARC · mẫu cá ngừ vây vàng',
    'https://www.fra.go.jp/jamarc/archive/jyoho/hakusei/jr_kihada/jr_kihada.htm',
    'Thunnus albacares — キハダ.',
  ),
  source(
    'jp-clam',
    'Cơ quan Tiêu dùng Nhật · tên gọi nhuyễn thể',
    'https://www.caa.go.jp/policies/policy/food_labeling/meeting_materials/assets/food_labeling_cms202_250731_08.pdf',
    'Meretrix lyrata — ミスハマグリ. ハマグリ là tên nhóm có thể bao gồm nhiều loài, không dùng làm đáp án loài ở bộ này.',
  ),
  source(
    'jp-mussel',
    'Viện Nghiên cứu Môi trường Nhật · Perna viridis',
    'https://www.nies.go.jp/biodiversity/invasive/DB/detail/70280.html',
    'Perna viridis — ミドリイガイ, Green mussel; dạng vỏ thuôn và mép xanh là gợi ý, không phải bằng chứng duy nhất.',
  ),
  source(
    'noaa-cod',
    'NOAA Fisheries · Atlantic cod',
    'https://www.fisheries.noaa.gov/species/atlantic-cod',
    'Gadus morhua; mô tả nhận diện và tên Anh.',
  ),
  source(
    'cod-white',
    'University of Maine Sea Grant · Cod',
    'https://seagrant.umaine.edu/maine-seafood-guide/cod/',
    'Atlantic cod thuộc nhóm cá thịt trắng theo mô tả sản phẩm, không phải một bậc phân loại sinh học.',
  ),
  source(
    'noaa-tuna',
    'NOAA Fisheries · Yellowfin tuna',
    'https://www.fisheries.noaa.gov/species/atlantic-yellowfin-tuna',
    'Thunnus albacares; tên Anh, các vây và vây phụ màu vàng.',
  ),
  source(
    'fao-squid',
    'FAO · Cephalopods of the world, tập 2',
    'https://www.fao.org/4/i1920e/i1920e.pdf',
    'Uroteuthis (Photololigo) chinensis — Mitre squid.',
  ),
  source(
    'octopus-revision',
    'Gleadall 2016 · định danh bạch tuộc Đông Á',
    'https://www.jstage.jst.go.jp/article/specdiv/21/1/21_31/_article',
    'Octopus sinensis là loài riêng của bạch tuộc thường Đông Á, không tự đồng nhất với Octopus vulgaris Đại Tây Dương/Địa Trung Hải.',
  ),
  source(
    'fao-clam',
    'FAO · tài nguyên biển Tây Trung Thái Bình Dương, tập 1',
    'https://www.vliz.be/imisdocs/publications/391449.pdf',
    'Meretrix lyrata — Lyrate hard clam.',
  ),
  source(
    'editorial-cod-vi',
    'Biên tập tên Việt — cá tuyết Đại Tây Dương',
    'https://www.vietnamtradeportal.gov.vn/index.php?id=4134&r=site/display',
    'Tên nhóm Cá tuyết/Gadus morhua trong nguồn Việt, kết hợp phạm vi Atlantic từ NOAA. Đây là tên Việt diễn giải trong bản nháp; cần duyệt cách gọi thương mại.',
  ),
  source(
    'editorial-octopus-vi',
    'Biên tập tên Việt — bạch tuộc Đông Á',
    'https://www.jstage.jst.go.jp/article/specdiv/21/1/21_31/_article',
    'Diễn giải East Asian common octopus thành Bạch tuộc Đông Á. Nguồn xác nhận tên Anh/khoa học, không xác nhận tên thương mại tiếng Việt; tên Việt chưa duyệt.',
  ),
  source(
    'tuna-red',
    'University of Hawaiʻi · Yellowfin tuna — đặc điểm sản phẩm',
    'https://manoa.hawaii.edu/ctahr/pacificfoodguide/index.php/chosen-from-the-sea/tuna-yellowfin-tuna/',
    'Mô tả thịt cá ngừ vây vàng hồng đến đỏ đậm; dùng làm ngữ cảnh nhóm thương mại, không dùng màu thịt để suy ra loài hoặc mã HS.',
  ),
  source(
    'vn-hs-2022',
    'Cổng Thông tin Thương mại Việt Nam · HS 2022 trong TT 01/2024/TT-BCT',
    'https://www.vietnamtradeportal.gov.vn/index.php?id=4134&r=site/display',
    'Phụ lục: 0303.42 cá ngừ vây vàng đông lạnh (không phải phi lê), 0304.87 phi lê cá ngừ đông lạnh, 0303.63 cá tuyết đông lạnh. Dùng đúng cấp 6 số của bản nguồn; chưa duyệt nghiệp vụ/hiệu lực hiện hành để khai báo.',
  ),
  ...customerImageSources,
];

type Row = {
  id: string;
  labels: Record<NameKind, string>;
  species: Omit<Species, 'id' | 'status' | 'fixtureOnly'>;
  sources: Record<NameKind, string>;
  reading: string;
};
const rows: Row[] = [
  {
    id: 'atlantic-cod',
    labels: {
      vi: 'Cá tuyết Đại Tây Dương',
      en: 'Atlantic cod',
      ja: 'タイセイヨウダラ',
      scientific: 'Gadus morhua',
    },
    species: {
      group: 'Cá',
      tradeCategory: 'Cá thịt trắng',
      tradeSourceId: 'cod-white',
      scientificName: 'Gadus morhua',
      sourceId: 'noaa-cod',
      identification:
        'Râu dưới cằm, ba vây lưng và đường bên nhạt màu là các dấu hiệu cần quan sát cùng nhau.',
      commercialNote:
        'Đại diện nhóm thịt trắng trong bộ mẫu; màu thịt không tự xác định loài hay mã hàng.',
      productForms: ['Nguyên con đông lạnh', 'Phi lê đông lạnh'],
      notes:
        'Tên Việt diễn giải theo tên nhóm Cá tuyết và phạm vi Atlantic; cần duyệt cách gọi thương mại.',
    },
    sources: { vi: 'editorial-cod-vi', en: 'noaa-cod', ja: 'jp-cod', scientific: 'noaa-cod' },
    reading: 'たいせいようだら · taiseiyōdara',
  },
  {
    id: 'yellowfin-tuna',
    labels: {
      vi: 'Cá ngừ vây vàng',
      en: 'Yellowfin tuna',
      ja: 'キハダ',
      scientific: 'Thunnus albacares',
    },
    species: {
      group: 'Cá',
      tradeCategory: 'Cá thịt đỏ',
      tradeSourceId: 'tuna-red',
      scientificName: 'Thunnus albacares',
      sourceId: 'noaa-tuna',
      identification:
        'Quan sát thân thuôn, vây lưng thứ hai, vây hậu môn và các vây phụ. Màu vàng có thể khó thấy trong ảnh dưới nước.',
      commercialNote:
        'Tên cá ngừ bao gồm nhiều loài; khi chào hàng cần đối chiếu cả tên khoa học. Nhãn thịt đỏ chỉ là nhóm thương mại trong bộ mẫu.',
      productForms: ['Nguyên con đông lạnh', 'Phi lê đông lạnh'],
      notes: 'Ví dụ dạng hàng để học nghiệp vụ; không suy ra quy cách hoặc chứng nhận của khách.',
    },
    sources: { vi: 'vn-species', en: 'noaa-tuna', ja: 'jp-tuna', scientific: 'noaa-tuna' },
    reading: 'きはだ · kihada',
  },
  {
    id: 'mitre-squid',
    labels: {
      vi: 'Mực ống Trung Hoa',
      en: 'Mitre squid',
      ja: 'ヒラケンサキイカ',
      scientific: 'Uroteuthis chinensis',
    },
    species: {
      group: 'Mực & bạch tuộc',
      tradeCategory: 'Mực ống',
      scientificName: 'Uroteuthis chinensis',
      sourceId: 'fao-squid',
      identification:
        'Thân dạng ống và vây là dấu hiệu nhóm mực ống; cần tài liệu chuyên môn để phân biệt các loài gần nhau.',
      commercialNote:
        'Loligo chinensis là tên khoa học cũ gặp trong hồ sơ; tên hiện dùng trong bộ là Uroteuthis chinensis.',
      productForms: ['Nguyên con', 'Thân làm sạch', 'Khoanh mực'],
      notes:
        'Chưa có ảnh thật đủ điều kiện trong bộ hiện tại. Minh họa nhóm không được dùng thay ảnh định danh.',
    },
    sources: { vi: 'vn-species', en: 'fao-squid', ja: 'jp-squid', scientific: 'fao-squid' },
    reading: 'ひらけんさきいか · hirakensakiika',
  },
  {
    id: 'east-asian-octopus',
    labels: {
      vi: 'Bạch tuộc Đông Á',
      en: 'East Asian common octopus',
      ja: 'マダコ',
      scientific: 'Octopus sinensis',
    },
    species: {
      group: 'Mực & bạch tuộc',
      tradeCategory: 'Bạch tuộc',
      scientificName: 'Octopus sinensis',
      sourceId: 'octopus-revision',
      identification:
        'Quan sát tay có giác bám và phần thân. Ảnh ngoài không đủ tự phân biệt mọi loài trong phức hợp bạch tuộc thường.',
      commercialNote:
        'マダコ đối chiếu theo Octopus sinensis trong tài liệu Nhật cập nhật; không dùng nguồn cũ để gán tự động thành O. vulgaris.',
      productForms: ['Nguyên con', 'Làm sạch', 'Tay bạch tuộc'],
      notes:
        'Bạch tuộc Đông Á là tên Việt mô tả trong bản nháp, chưa phải tên thương mại Việt Nam đã duyệt.',
    },
    sources: {
      vi: 'editorial-octopus-vi',
      en: 'octopus-revision',
      ja: 'jp-caa',
      scientific: 'octopus-revision',
    },
    reading: 'まだこ · madako',
  },
  {
    id: 'lyrate-clam',
    labels: {
      vi: 'Nghêu Bến Tre',
      en: 'Lyrate hard clam',
      ja: 'ミスハマグリ',
      scientific: 'Meretrix lyrata',
    },
    species: {
      group: 'Nghêu & vẹm',
      tradeCategory: 'Nghêu',
      scientificName: 'Meretrix lyrata',
      sourceId: 'vn-species',
      identification:
        'Vỏ tương đối tròn dạng tam giác và các đường tăng trưởng là gợi ý; cần đối chiếu mẫu/nguồn khi gần các loài Meretrix khác.',
      commercialNote:
        'Tên Nghêu Bến Tre trong bộ biểu thị tên loài phổ biến; không xác nhận lô hàng có xuất xứ Bến Tre.',
      productForms: ['Nguyên vỏ', 'Thịt nghêu'],
      notes: 'Tên nhóm ハマグリ không dùng làm đáp án riêng cho Meretrix lyrata.',
    },
    sources: { vi: 'vn-species', en: 'fao-clam', ja: 'jp-clam', scientific: 'vn-species' },
    reading: 'みすはまぐり · misuhamaguri',
  },
  {
    id: 'green-mussel',
    labels: { vi: 'Vẹm xanh', en: 'Green mussel', ja: 'ミドリイガイ', scientific: 'Perna viridis' },
    species: {
      group: 'Nghêu & vẹm',
      tradeCategory: 'Vẹm',
      scientificName: 'Perna viridis',
      sourceId: 'jp-mussel',
      identification:
        'Vỏ thuôn dài, phần mép xanh là gợi ý quan sát; màu vỏ có thể thay đổi, không dùng làm căn cứ duy nhất.',
      commercialNote: 'Không đồng nhất Green mussel với mọi loài vẹm hoặc Perna canaliculus.',
      productForms: ['Nguyên vỏ', 'Nửa mảnh vỏ', 'Thịt vẹm'],
      notes: 'Các dạng hàng là ví dụ học tập, không phải mặt hàng khách đã xác nhận.',
    },
    sources: { vi: 'vn-mussel', en: 'jp-mussel', ja: 'jp-mussel', scientific: 'jp-mussel' },
    reading: 'みどりいがい · midoriigai',
  },
];
const tariffs = [
  {
    id: 'vn-yft-whole-6',
    code: '0303.42',
    parentCode: '0303',
    citation: 'HS 2022, nhánh cá đông lạnh trừ phi lê: 0303.42 — Thunnus albacares.',
  },
  {
    id: 'vn-yft-fillet-6',
    code: '0304.87',
    parentCode: '0304',
    citation:
      'HS 2022, nhánh phi lê đông lạnh: 0304.87 — cá ngừ. Đây là mã nhóm gồm nhiều loài, không phải mã riêng của loài.',
  },
  {
    id: 'vn-cod-whole-6',
    code: '0303.63',
    parentCode: '0303',
    citation:
      'HS 2022, nhánh cá tuyết đông lạnh: 0303.63 — Gadus morhua, G. ogac, G. macrocephalus.',
  },
].map((t) => ({
  ...draft,
  ...t,
  market: 'VN' as const,
  catalog: 'Danh mục HS 2022 — bản nguồn Việt Nam',
  version: 'HS 2022 · đối chiếu phụ lục TT 01/2024/TT-BCT',
  level: 6 as const,
  sourceId: 'vn-hs-2022',
  checkedAt,
  fixtureOnly: false,
}));
const options = [
  {
    id: '030342',
    label: '0303.42',
    explanation: 'Cá ngừ vây vàng đông lạnh trong nhánh không phải phi lê.',
  },
  {
    id: '030487',
    label: '0304.87',
    explanation: 'Phi lê cá ngừ đông lạnh; mã nhóm không chỉ dành cho cá ngừ vây vàng.',
  },
  {
    id: '030363',
    label: '0303.63',
    explanation: 'Nhánh cá tuyết, không phù hợp với cá ngừ vây vàng trong mô tả.',
  },
  {
    id: 'insufficient',
    label: 'Chưa đủ thông tin',
    explanation: 'Chỉ chọn khi thiếu dữ kiện quyết định và xác định đúng điều cần hỏi.',
  },
];
const scenarioBase = {
  ...draft,
  speciesId: 'yellowfin-tuna',
  expectedCodeLength: 6 as const,
  options,
  followUps: [
    { id: 'filleted', label: 'Hàng nguyên con hay phi lê?' },
    { id: 'packaging', label: 'Thùng hàng có màu gì?' },
    { id: 'origin', label: 'Bên bán ở tỉnh nào?' },
  ],
  version: CUSTOMER_VERSION,
  fixtureOnly: true,
};
const scenarios: TradeScenario[] = [
  {
    ...scenarioBase,
    id: 'trade-yft-whole',
    title: 'Cá ngừ nguyên con đông lạnh',
    description:
      'Cá ngừ vây vàng (Thunnus albacares) nguyên con, đông lạnh; không phải phi lê hoặc phụ phẩm, chưa nấu chín, không hun khói, không tẩm ướp. Bài yêu cầu mã 6 số trong bản nguồn HS 2022.',
    facts: { frozen: true, filleted: false, cooked: false, seasoned: false, smoked: false },
    answerType: 'code',
    tariffId: 'vn-yft-whole-6',
    explanation:
      'Đối chiếu nhánh cá đông lạnh không phải phi lê và tên Thunnus albacares: 0303.42. Chỉ kết luận ở cấp 6 số của bài học, không tự nối thành mã 8 số để khai báo.',
  },
  {
    ...scenarioBase,
    id: 'trade-yft-missing-form',
    title: 'Hồ sơ chưa rõ dạng hàng',
    description:
      'Cá ngừ vây vàng (Thunnus albacares), đông lạnh; chưa nấu chín, không hun khói và không tẩm ướp. Hồ sơ chưa cho biết nguyên con hay phi lê. Bài phân biệt 0303.42 với 0304.87 ở cấp 6 số.',
    facts: { frozen: true, filleted: 'unknown', cooked: false, seasoned: false, smoked: false },
    answerType: 'insufficient',
    missingFact: 'filleted',
    tariffId: 'vn-yft-whole-6',
    explanation:
      'Tên loài và trạng thái đông lạnh chưa quyết định được nhánh nguyên con/phi lê. Cần hỏi “Hàng nguyên con hay phi lê?”; unknown không phải là khẳng định hàng nguyên con.',
  },
  {
    ...scenarioBase,
    id: 'trade-yft-fillet',
    title: 'Cùng loài, chuyển sang phi lê',
    description:
      'Phi lê cá ngừ vây vàng (Thunnus albacares), đông lạnh; không phải thịt băm hoặc phụ phẩm, chưa nấu chín, không hun khói, không tẩm ướp. Bài yêu cầu mã 6 số trong bản nguồn HS 2022.',
    facts: { frozen: true, filleted: true, cooked: false, seasoned: false, smoked: false },
    answerType: 'code',
    tariffId: 'vn-yft-fillet-6',
    explanation:
      'Cùng loài nhưng dạng phi lê đưa bài sang nhánh phi lê cá ngừ đông lạnh 0304.87 thay cho 0303.42. Đây là mã nhóm gồm nhiều loài cá ngừ. Phải đối chiếu phiên bản và cấp mã khi xử lý lô hàng thực tế.',
  },
];
export const customerPack: ContentPack = {
  version: CUSTOMER_VERSION,
  audience: 'demo',
  sources: customerSources,
  species: rows.map((r) => ({ ...draft, id: r.id, ...r.species, fixtureOnly: false })),
  names: rows.flatMap((r) =>
    (['vi', 'en', 'ja', 'scientific'] as NameKind[]).map(
      (kind) =>
        ({
          ...draft,
          id: `${r.id}:${kind}`,
          speciesId: r.id,
          kind,
          label: r.labels[kind],
          role: 'primary' as const,
          acceptedForms: [r.labels[kind]],
          sourceId: r.sources[kind],
          ...(kind === 'ja'
            ? { pronunciation: { text: r.reading, system: 'kana-romaji' as const } }
            : {}),
        }) satisfies NameEntry,
    ),
  ),
  media: customerMedia,
  tariffs,
  scenarios,
};
