export type NameKind = 'vi' | 'en' | 'ja' | 'scientific';
export type ReviewStatus = 'draft' | 'approved';
export type Fact = boolean | 'unknown';
export type TradeFactKey = 'frozen' | 'headRemoved' | 'cooked' | 'seasoned' | 'filleted' | 'smoked';

export interface Source {
  id: string;
  title: string;
  location: string;
  url?: string;
  fixtureOnly?: boolean;
  checkedAt?: string;
}
export interface Approval {
  status: ReviewStatus;
  reviewer?: string;
  reviewedAt?: string;
}
export interface Species extends Approval {
  tradeCategory?: string;
  tradeSourceId?: string;
  identification?: string;
  commercialNote?: string;
  productForms?: string[];
  notes?: string;
  id: string;
  group: string;
  scientificName: string;
  sourceId: string;
  fixtureOnly: boolean;
}
export interface NameEntry extends Approval {
  id: string;
  speciesId: string;
  kind: NameKind;
  label: string;
  role: 'primary' | 'alias';
  acceptedForms: string[];
  pronunciation?: { text: string; system: 'IPA-US' | 'kana-romaji' | 'course-convention' };
  audioAssetId?: string;
  sourceId: string;
}
export interface MediaAsset extends Approval {
  id: string;
  type: 'audio' | 'species_photo' | 'product_photo' | 'illustration';
  purposes: ('pronunciation' | 'profile' | 'identification')[];
  path: string;
  sourceId: string;
  rights: string;
  locale?: string;
  voice?: string;
  aiGenerated: boolean;
  version: string;
  speciesId?: string;
  originalImageId?: string;
  credit?: string;
  licenseUrl?: string;
  sourceUrl?: string;
  sha256?: string;
  explanation?: string;
}
export interface TariffReference extends Approval {
  id: string;
  market: 'VN';
  catalog: string;
  version: string;
  code: string;
  level: 6 | 8;
  parentCode: string;
  sourceId: string;
  citation: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  checkedAt?: string;
  fixtureOnly: boolean;
}
export interface TradeScenario extends Approval {
  id: string;
  speciesId: string;
  title: string;
  description: string;
  facts: Partial<Record<TradeFactKey, Fact>> & { frozen: Fact; cooked: Fact; seasoned: Fact };
  expectedCodeLength: 6 | 8;
  answerType: 'code' | 'insufficient';
  tariffId: string;
  missingFact?: TradeFactKey;
  options: { id: string; label: string; explanation: string }[];
  followUps: { id: string; label: string }[];
  explanation: string;
  version: string;
  fixtureOnly: boolean;
}
export interface ContentPack {
  version: string;
  audience: 'demo' | 'public';
  sources: Source[];
  species: Species[];
  names: NameEntry[];
  media: MediaAsset[];
  tariffs: TariffReference[];
  scenarios: TradeScenario[];
}
export type Skill =
  | 'name:en'
  | 'name:ja'
  | 'name:scientific'
  | 'match:en'
  | 'match:ja'
  | 'match:scientific'
  | 'listening'
  | 'image'
  | 'hs';
export interface Attempt {
  id: string;
  sessionId: string;
  questionId: string;
  targetId: string;
  skill: Skill;
  contentVersion: string;
  attemptNumber: number;
  correct: boolean;
  selfRated: boolean;
  isReview: boolean;
  answer: string;
  at: string;
  skipped?: boolean;
}
export interface ReviewState {
  key: string;
  targetId: string;
  skill: Skill;
  stage: number;
  dueAt: string;
  lastSessionId: string;
  contentVersion: string;
  selfRated: boolean;
}
export type Question =
  | { id: string; type: 'image'; speciesId: string; assetId: string; options: string[] }
  | { id: string; type: 'flashcard'; speciesId: string; kind: 'en' | 'ja' | 'scientific' }
  | {
      id: string;
      type: 'match';
      kind: 'en' | 'ja' | 'scientific';
      pairs: { speciesId: string; left: string; right: string }[];
      rightOrder: string[];
    }
  | { id: string; type: 'hs'; scenarioId: string };
export interface StudySession {
  id: string;
  mode: 'full' | 'flashcard' | 'match' | 'hs' | 'image' | 'review';
  contentVersion: string;
  questions: Question[];
  cursor: number;
  startedAt: string;
  completedAt?: string;
  ui: Record<string, { flipped?: boolean; choice?: string; followUp?: string }>;
}
export interface AppState {
  schemaVersion: 1;
  session: StudySession | null;
  attempts: Attempt[];
  reviews: Record<string, ReviewState>;
}
