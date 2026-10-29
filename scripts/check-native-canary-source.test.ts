/** Project code must be governed before the canary step receives credentials. */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  assessCanarySourceClosure,
  runCanarySourcePreflight,
} from './check-native-canary-source.js';

const roots: string[] = [];
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'native-canary-source-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const check = (files: Record<string, string>): ReturnType<typeof assessCanarySourceClosure> =>
  assessCanarySourceClosure(fixture(files), 'src/entry.ts', ['/src/']);

describe('privileged canary project import closure', () => {
  it('measures a nonempty governed source closure without executing it', () => {
    const result = check({
      'src/entry.ts':
        "import { value } from './leaf.js'; import { z } from 'zod'; import { createHash } from 'node:crypto'; throw new Error('must-not-execute');",
      'src/leaf.ts': 'export const value = 1;',
    });
    expect(result).toMatchObject({ status: 'verified', complete: true });
    expect(result.modules.map((m) => m.path)).toEqual(['src/entry.ts', 'src/leaf.ts']);
    expect(result.modules[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.externalModules).toEqual(['node:crypto', 'zod']);
  });
  it('permits a governed leaf with measured absence of imports', () => {
    const result = check({ 'src/entry.ts': 'export const value = 1;' });
    expect(result).toMatchObject({ status: 'verified', complete: true });
    expect(result.modules).toHaveLength(1);
  });
  it.each([
    "import type { Value } from '../ordinary.js'; export const value = 1;",
    "export type { Value } from '../ordinary.js';",
  ])('does not treat erased type-only declarations as runtime edges', (text) => {
    expect(check({ 'src/entry.ts': text })).toMatchObject({ status: 'verified', complete: true });
  });
  it.each([
    "import '../ordinary.js';",
    "import { value } from '../ordinary.js';",
    "import * as values from '../ordinary.js';",
    "import { type Value, value } from '../ordinary.js';",
    "export * from '../ordinary.js';",
    "export { value } from '../ordinary.js';",
    "await import('../ordinary.js');",
    "require('../ordinary.js');",
  ])('rejects an ordinary runtime edge: %s', (text) => {
    expect(check({ 'src/entry.ts': text, 'ordinary.ts': 'export const value = 1;' })).toMatchObject(
      { status: 'refused', complete: false, reason: 'ungoverned-runtime-source' }
    );
  });
  it('checks the transitive dependency of an otherwise governed wrapper', () => {
    expect(
      check({
        'src/entry.ts': "import './wrapper.js';",
        'src/wrapper.ts': "import '../ordinary.js';",
        'ordinary.ts': '',
      })
    ).toMatchObject({ status: 'refused', complete: false, reason: 'ungoverned-runtime-source' });
  });
  it.each(["import('./' + name);", 'import(name);', 'require(name);', 'import(`./${name}.js`);'])(
    'rejects unknown computed module loading: %s',
    (text) => {
      expect(check({ 'src/entry.ts': text })).toMatchObject({
        status: 'refused',
        complete: false,
        reason: 'computed-runtime-import',
      });
    }
  );
  it('does not mistake comments and strings for imports', () => {
    expect(
      check({ 'src/entry.ts': '// import(name)\nexport const text = "require(name)";' })
    ).toMatchObject({ status: 'verified', complete: true });
  });
  it.each(['not-an-allowed-package', 'file:///outside.ts', 'data:text/javascript,export{}'])(
    'rejects unsupported external dependency %s',
    (specifier) => {
      expect(check({ 'src/entry.ts': `import ${JSON.stringify(specifier)};` })).toMatchObject({
        status: 'refused',
        complete: false,
        reason: 'unsupported-external-module',
      });
    }
  );
  it('rejects traversal outside the checkout', () => {
    expect(check({ 'src/entry.ts': "import '../../outside.js';" })).toMatchObject({
      status: 'refused',
      complete: false,
      reason: 'source-root-escape',
    });
  });
  it('rejects an absolute entry even when it names an existing file', () => {
    const root = fixture({ 'src/entry.ts': '' });
    expect(assessCanarySourceClosure(root, join(root, 'src/entry.ts'), ['/src/'])).toMatchObject({
      status: 'refused',
      complete: false,
      reason: 'source-root-escape',
    });
  });
  it.skipIf(process.platform === 'win32')('rejects a symlinked runtime module', () => {
    const root = fixture({ 'src/entry.ts': "import './alias.js';", 'src/actual.ts': '' });
    symlinkSync(join(root, 'src/actual.ts'), join(root, 'src/alias.ts'));
    expect(assessCanarySourceClosure(root, 'src/entry.ts', ['/src/'])).toMatchObject({
      status: 'refused',
      complete: false,
      reason: 'symlinked-runtime-source',
    });
  });
  it('names missing source coverage as unmeasured', () => {
    expect(check({ 'src/entry.ts': "import './missing.js';" })).toMatchObject({
      status: 'unmeasured',
      complete: false,
      reason: 'runtime-source-unreadable',
    });
  });
  it('names absent governor coverage as unmeasured', () => {
    expect(
      assessCanarySourceClosure(fixture({ 'src/entry.ts': '' }), 'src/entry.ts', [])
    ).toMatchObject({ status: 'unmeasured', complete: false, reason: 'governor-coverage-missing' });
  });
  it('names absent entry coverage as unmeasured', () => {
    expect(assessCanarySourceClosure(fixture({ 'src/entry.ts': '' }), '', ['/src/'])).toMatchObject(
      { status: 'unmeasured', complete: false, reason: 'entry-missing' }
    );
  });
  it('rejects malformed source instead of treating absent imports as healthy', () => {
    expect(check({ 'src/entry.ts': 'export const broken = ;' })).toMatchObject({
      status: 'unmeasured',
      complete: false,
      reason: 'source-syntax-unmeasured',
    });
  });
  it('bounds source size before compilation', () => {
    expect(check({ 'src/entry.ts': '// ' + 'a'.repeat(1_000_001) })).toMatchObject({
      status: 'unmeasured',
      complete: false,
      reason: 'source-size-limit',
    });
  });
  it('bounds graph size and never reports partial traversal as complete', () => {
    const files: Record<string, string> = { 'src/entry.ts': "import './m0.js';" };
    for (let i = 0; i < 65; i++)
      files[`src/m${String(i)}.ts`] = i === 64 ? '' : `import './m${String(i + 1)}.js';`;
    expect(check(files)).toMatchObject({
      status: 'unmeasured',
      complete: false,
      reason: 'source-graph-limit',
    });
  });
  it('terminates a protected cycle with complete unique coverage', () => {
    const result = check({
      'src/entry.ts': "import './leaf.js';",
      'src/leaf.ts': "import './entry.js';",
    });
    expect(result).toMatchObject({ status: 'verified', complete: true });
    expect(result.modules).toHaveLength(2);
  });
});

it.each([
  "import value = require('../ordinary.js');",
  "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); load('../ordinary.js');",
  "import * as vm from 'node:vm'; vm.runInThisContext('import(unknown)');",
  "eval('import(unknown)');",
  "new Function('return import(unknown)')();",
])('never verifies an opaque module-loading construct: %s', (text) => {
  expect(check({ 'src/entry.ts': text, 'ordinary.ts': '' }).status).not.toBe('verified');
});

it('bounds combined source bytes as well as individual files', () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 8; i++) {
    const path = i === 0 ? 'src/entry.ts' : `src/b${String(i)}.ts`;
    files[path] =
      (i === 7 ? '' : `import './b${String(i + 1)}.js';\n`) + '// ' + 'x'.repeat(150000);
  }
  expect(check(files)).toMatchObject({
    status: 'unmeasured',
    complete: false,
    reason: 'source-size-limit',
  });
});

const PREFLIGHT_FILES = {
  CODEOWNERS: '# @governor-section-start\n/scripts/ @fixture-owner\n# @governor-section-end\n',
  'scripts/native-approval-canary.ts': "throw new Error('must-not-execute');",
  'governance/native-approval-canary-runtime-closure.json': JSON.stringify({
    version: 1,
    paths: ['scripts/native-approval-canary.ts'],
  }),
};
it('refuses a runtime closure that differs from the committed path snapshot', () => {
  expect(
    runCanarySourcePreflight(
      fixture({
        ...PREFLIGHT_FILES,
        'scripts/native-approval-canary.ts': "import './new-leaf.js';",
        'scripts/new-leaf.ts': 'export {};',
      }),
      {}
    )
  ).toMatchObject({
    status: 'refused',
    complete: false,
    reason: 'runtime-closure-snapshot-mismatch',
  });
});
it('refuses a missing or empty committed closure snapshot', () => {
  expect(
    runCanarySourcePreflight(
      fixture({
        ...PREFLIGHT_FILES,
        'governance/native-approval-canary-runtime-closure.json': '{"version":1,"paths":[]}',
      }),
      {}
    )
  ).toMatchObject({
    status: 'unmeasured',
    complete: false,
    reason: 'runtime-closure-snapshot-unmeasured',
  });
});
it('retains preflight source hashes before any credential-bearing step', () => {
  const root = fixture(PREFLIGHT_FILES);
  expect(runCanarySourcePreflight(root, {})).toMatchObject({ status: 'verified', complete: true });
  const saved: unknown = JSON.parse(
    readFileSync(join(root, '.nexus-agents/native-approval-canary/source-closure.json'), 'utf8')
  );
  expect(saved).toMatchObject({
    status: 'verified',
    complete: true,
    modules: [{ path: 'scripts/native-approval-canary.ts' }],
  });
});
it.each(['GH_TOKEN', 'GITHUB_TOKEN'])('refuses exposed %s without serializing its value', (key) => {
  const root = fixture(PREFLIGHT_FILES);
  expect(runCanarySourcePreflight(root, { [key]: 'fixture-private-value' })).toMatchObject({
    status: 'refused',
    complete: false,
    reason: 'credentials-exposed-before-source-check',
  });
  expect(
    readFileSync(join(root, '.nexus-agents/native-approval-canary/source-closure.json'), 'utf8')
  ).not.toContain('fixture-private-value');
});
it('refuses a root override before declaring source closure verified', () => {
  expect(
    runCanarySourcePreflight(fixture(PREFLIGHT_FILES), { NEXUS_SCRIPT_ROOT: '/fixture/override' })
  ).toMatchObject({ status: 'refused', complete: false, reason: 'source-root-override-refused' });
});
it('records failed governor discovery as unmeasured', () => {
  expect(runCanarySourcePreflight(fixture({}), {})).toMatchObject({
    status: 'unmeasured',
    complete: false,
    reason: 'governor-coverage-missing',
  });
});
