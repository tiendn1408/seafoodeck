import type { ContentPack, NameEntry, NameKind, TradeScenario } from '../domain/models';
import { imageMedia, imageSources } from './imageMedia';

const draft = { status: 'draft' as const };
const rows: {
  id: string;
  scientific: string;
  labels: Record<NameKind, string>;
  fixtureOnly: boolean;
}[] = [
  {
    id: 'black-tiger',
    scientific: 'Penaeus monodon',
    labels: {
      vi: 'Tôm sú',
      en: 'Black tiger shrimp',
      ja: 'ウシエビ',
      scientific: 'Penaeus monodon',
    },
    fixtureOnly: false,
  },
  {
    id: 'whiteleg',
    scientific: 'Penaeus vannamei',
    labels: {
      vi: 'Tôm thẻ chân trắng',
      en: 'Whiteleg shrimp',
      ja: 'バナメイエビ',
      scientific: 'Penaeus vannamei',
    },
    fixtureOnly: true,
  },
  {
    id: 'giant-river',
    scientific: 'Macrobrachium rosenbergii',
    labels: {
      vi: 'Tôm càng xanh',
      en: 'Giant river prawn',
      ja: 'オニテナガエビ',
      scientific: 'Macrobrachium rosenbergii',
    },
    fixtureOnly: true,
  },
];
const pronunciation: Partial<Record<NameKind, NameEntry['pronunciation']>> = {
  en: { text: '/blæk ˈtaɪɡɚ ʃrɪmp/', system: 'IPA-US' },
  ja: { text: 'うしえび · ushiebi', system: 'kana-romaji' },
  scientific: { text: 'Pe-nae-us · mo-no-don', system: 'course-convention' },
};
const options = [
  {
    id: '03061711',
    label: '0306.17.11',
    explanation: 'Mã minh họa 8 số của fixture A trong PRD; chưa được đối chiếu để phát hành.',
  },
  { id: '030617', label: '0306.17', explanation: 'Đây là mã cha 6 số; đề yêu cầu cấp mã 8 số.' },
  {
    id: 'insufficient',
    label: 'Chưa đủ thông tin',
    explanation: 'Chỉ chọn khi thiếu dữ kiện quyết định và xác định đúng điều cần hỏi.',
  },
];
const scenarioBase: Omit<
  TradeScenario,
  'id' | 'title' | 'description' | 'facts' | 'answerType' | 'explanation' | 'missingFact'
> = {
  ...draft,
  speciesId: 'black-tiger',
  expectedCodeLength: 8,
  tariffId: 'vn-2022-fixture',
  options,
  followUps: [
    { id: 'headRemoved', label: 'Hàng đã bỏ đầu chưa?' },
    { id: 'packaging', label: 'Hàng được đóng trong loại bao bì nào?' },
    { id: 'origin', label: 'Hàng được nuôi tại tỉnh nào?' },
  ],
  version: 'demo-1',
  fixtureOnly: true,
};

export const demoPack: ContentPack = {
  version: 'demo-1',
  audience: 'demo',
  sources: [
    {
      id: 'congbao-115-2022',
      title: 'Công báo 269+270 · NĐ 115/2022/NĐ-CP · Phụ lục II',
      location:
        'Trang in 85–86 (PDF 84–85): nhánh đông lạnh 0306.17, Tôm sú, dòng 0306.17.11 và 0306.17.19. Đối chiếu văn bản lịch sử, chưa duyệt nghiệp vụ/hiệu lực hiện hành.',
      url: 'https://congbao.cdnchinhphu.vn/CongBaoCP/CongBao/2023/2/38712/43398-1-269-270.pdf',
    },
    ...imageSources,
    {
      id: 'prd',
      title: 'Seafood Deck — Đặc tả sản phẩm MVP',
      location: 'docs/Seafood_Deck_PRD.md, mục 3',
      fixtureOnly: true,
    },
    {
      id: 'comparison-fixture',
      title: 'Fixture đối chiếu tên để kiểm thử giao diện',
      location: 'src/data/demo.ts; chưa kiểm chứng danh pháp, bản dịch và cách đọc',
      fixtureOnly: true,
    },
  ],
  species: rows.map((row) => ({
    ...draft,
    id: row.id,
    group: 'Tôm thương mại',
    scientificName: row.scientific,
    sourceId: row.fixtureOnly ? 'comparison-fixture' : 'prd',
    fixtureOnly: row.fixtureOnly,
  })),
  names: rows.flatMap((row) =>
    (Object.keys(row.labels) as NameKind[]).map((kind) => ({
      ...draft,
      id: `${row.id}:${kind}`,
      speciesId: row.id,
      kind,
      label: row.labels[kind],
      role: 'primary' as const,
      acceptedForms: [row.labels[kind]],
      sourceId: row.fixtureOnly ? 'comparison-fixture' : 'prd',
      pronunciation: row.id === 'black-tiger' ? pronunciation[kind] : undefined,
    })),
  ),
  media: imageMedia,
  tariffs: [
    {
      ...draft,
      id: 'vn-2022-fixture',
      market: 'VN',
      catalog: 'Danh mục hàng hóa xuất khẩu, nhập khẩu Việt Nam',
      version: 'Thông tư 31/2022/TT-BTC · phiên bản fixture',
      code: '0306.17.11',
      level: 8,
      parentCode: '0306.17',
      sourceId: 'prd',
      citation:
        'PRD mục 3, Fixture A — trích dẫn pháp lý và dòng mã chưa được người duyệt đối chiếu.',
      fixtureOnly: true,
    },
    {
      ...draft,
      id: 'vn-2022-head-on-draft',
      market: 'VN',
      catalog: 'Phụ lục II Nghị định 115/2022/NĐ-CP',
      version: 'NĐ 115/2022 · bản lịch sử đối chiếu · chưa duyệt',
      code: '0306.17.19',
      level: 8,
      parentCode: '0306.17',
      sourceId: 'congbao-115-2022',
      citation:
        'Trang in 85–86: nhánh đông lạnh → 0306.17 → Tôm sú; .11 đã bỏ đầu / .19 loại khác. Chỉ đối chiếu văn bản lịch sử, không xác nhận hiệu lực hiện hành.',
      checkedAt: '2026-11-17',
      fixtureOnly: true,
    },
  ],
  scenarios: [
    {
      ...scenarioBase,
      id: 'hs-a',
      title: 'Một lô tôm sú cấp đông',
      description: 'Tôm sú nguyên liệu, đã bỏ đầu, cấp đông, không tẩm ướp và không qua nấu chín.',
      facts: { frozen: true, headRemoved: true, cooked: false, seasoned: false },
      answerType: 'code',
      explanation:
        'Trong fixture A của PRD, hàng cấp đông, đã bỏ đầu, chưa nấu và không tẩm ướp được ghép với mã minh họa 0306.17.11. Đề đã cung cấp đủ dữ kiện. Kết quả này chỉ phục vụ kiểm thử; cần người duyệt đối chiếu văn bản và dòng mã trước khi dùng làm nội dung học chính thức.',
    },
    {
      ...scenarioBase,
      id: 'hs-b',
      title: 'Cùng loài, đã đủ thông tin?',
      description:
        'Tôm sú nguyên liệu, cấp đông, không tẩm ướp và không qua nấu chín. Hồ sơ chưa nêu tình trạng đầu.',
      facts: { frozen: true, headRemoved: 'unknown', cooked: false, seasoned: false },
      answerType: 'insufficient',
      missingFact: 'headRemoved',
      explanation:
        'Chưa biết hàng đã bỏ đầu hay chưa. “Chưa biết” khác với “chưa bỏ đầu”: không thể suy ra từ tên Tôm sú. Cần hỏi “Hàng đã bỏ đầu chưa?” trước khi chọn mã. Fixture này kiểm tra cách xử lý dữ kiện thiếu, chưa xác nhận phân loại pháp lý.',
    },
    {
      ...scenarioBase,
      id: 'hs-c',
      title: 'Tôm sú cấp đông còn nguyên đầu',
      description:
        'Tôm sú nguyên liệu, còn nguyên đầu, cấp đông, không hun khói, không tẩm ướp và không qua nấu chín.',
      facts: { frozen: true, headRemoved: false, cooked: false, seasoned: false },
      answerType: 'code',
      tariffId: 'vn-2022-head-on-draft',
      options: [
        {
          id: '03061711',
          label: '0306.17.11',
          explanation: 'Dòng đã bỏ đầu; tình huống này nói rõ còn nguyên đầu.',
        },
        {
          id: '03061719',
          label: '0306.17.19',
          explanation:
            'Trong bảng lịch sử NĐ 115/2022, dòng loại khác nằm cùng nhánh tôm sú đông lạnh, đối chiếu với dòng đã bỏ đầu. Chưa duyệt nghiệp vụ.',
        },
        { id: '030617', label: '0306.17', explanation: 'Mã cha 6 số, chưa đủ cấp 8 số.' },
        {
          id: 'insufficient',
          label: 'Chưa đủ thông tin',
          explanation: 'Đề này đã nói rõ tình trạng đầu và chế biến.',
        },
      ],
      explanation:
        'Đề nháp nội bộ: cùng Tôm sú nhưng còn nguyên đầu, khác fixture A đã bỏ đầu. Bảng Công báo lịch sử ghi .11 là đã bỏ đầu và .19 là loại khác trong nhánh tôm sú đông lạnh. Ở mô tả đã cho, bài nháp dùng 0306.17.19 để luyện đọc quy cách. Không dùng kết quả này khai báo; chưa có người duyệt và chưa xác nhận hiệu lực hiện hành.',
    },
  ],
};
