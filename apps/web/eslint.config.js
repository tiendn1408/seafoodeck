import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

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
              group: ['@seafoodeck/studio', '@seafoodeck/studio/*'],
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
    },
  },
);
