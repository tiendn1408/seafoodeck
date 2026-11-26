import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

// Relative paths reaching a `studio` dir, `@seafoodeck/studio`, `@studio`, `.../apps/studio`.
const STUDIO_DYNAMIC =
  '/^((\\.{1,2}\\/)+(.*\\/)?studio(\\/.*)?|@seafoodeck\\/studio(\\/.*)?|@studio(\\/.*)?|.*\\/apps\\/studio(\\/.*)?)$/';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: hooks.configs.recommended.rules,
  },
  {
    // Learner/studio boundary: the learner app must never import the studio app.
    files: ['**/*.{ts,tsx,js,mjs}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@seafoodeck/studio', '@seafoodeck/studio/*', '@studio', '@studio/*'],
              message: 'apps/web must not import the studio app.',
            },
            {
              // Any relative path that reaches a `studio` directory (../../../studio/src/x, ../../../../apps/studio/...).
              regex: '^(?:\\.{1,2}/)+(?:.*/)?studio(?:/.*)?$',
              message: 'apps/web must not import apps/studio.',
            },
            {
              group: ['**/apps/studio', '**/apps/studio/**'],
              message: 'apps/web must not import apps/studio.',
            },
          ],
        },
      ],
      // Dynamic import() is not covered by no-restricted-imports. Same targets; for
      // template literals and `'a' + b` only the leading literal part is inspected.
      'no-restricted-syntax': [
        'error',
        ...['source.value', 'source.quasis.0.value.cooked', 'source.left.value'].map((path) => ({
          selector: `ImportExpression[${path}=${STUDIO_DYNAMIC}]`,
          message: 'apps/web must not import apps/studio.',
        })),
      ],
    },
  },
);
