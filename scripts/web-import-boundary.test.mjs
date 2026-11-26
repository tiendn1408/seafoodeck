import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web');
const eslint = new ESLint({ cwd: web });

async function messages(source, file = 'src/pilot/boundary-fixture.ts') {
  const [r] = await eslint.lintText(source, { filePath: join(web, file) });
  return r.messages.filter((m) => (m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-syntax'));
}

test('apps/web may not import apps/studio in any form', async () => {
  for (const spec of [
    '../../../studio/src/x',
    '../../../../apps/studio/src/x',
    '../../../studio',
    '../../../../studio/src/StudioApp',
    '@seafoodeck/studio',
    '@seafoodeck/studio/src/x',
    '@studio',
    '@studio/src/x',
  ]) {
    assert.ok((await messages(`import x from '${spec}';\nexport default x;\n`)).length >= 1, spec);
  }
});

test('re-exporting from apps/studio is rejected too', async () => {
  assert.ok((await messages("export * from '../../../studio/src/x';\n")).length >= 1);
});

test('dynamic import() of apps/studio is rejected in every literal form', async () => {
  for (const expr of [
    "import('../../../studio/src/x')",
    "import('../../../../apps/studio/src/x')",
    "import('@seafoodeck/studio')",
    "import('@seafoodeck/studio/src/x')",
    "import('@studio/src/x')",
    'import(`../../../studio/src/x`)',
    'import(`../../../studio/${name}`)',
    "import('../../../studio/' + name)",
  ]) {
    assert.ok((await messages(`export const p = ${expr};\n`)).length >= 1, expr);
  }
});

test('ordinary learner imports stay allowed', async () => {
  for (const spec of ['./api', '../learner/Login', 'react', '../studio-like-name', '@studio-like/x']) {
    assert.equal((await messages(`import x from '${spec}';\nexport default x;\n`)).length, 0, spec);
  }
});

test('dynamic import of benign look-alike names stays allowed', async () => {
  for (const expr of ["import('../studio-like-name')", "import('./api')", 'import(`./learner/${name}`)'])
    assert.equal((await messages(`export const p = ${expr};\n`)).length, 0, expr);
});
