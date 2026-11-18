import type { ContentPack } from '../../../apps/web/src/domain/models';

// Independent allowlist. Never derive this pack by copying demo fixtures.
export const publicPack: ContentPack = {
  version: 'public-0',
  audience: 'public',
  sources: [],
  species: [],
  names: [],
  media: [],
  tariffs: [],
  scenarios: [],
};
export const PUBLIC_CONTENT_ENABLED = false;
