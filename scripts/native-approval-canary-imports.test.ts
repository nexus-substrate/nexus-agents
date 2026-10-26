/** Real tsx imports, no credentials or network: ordinary providers must stay outside the launcher. */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessCanarySourceClosure } from './check-native-canary-source.js';
import { governorPathsFromCodeowners } from './governor-section.js';
import { REPOSITORY_ROOT } from './script-paths.js';

const roots: string[] = [];
const ENTRY = 'scripts/native-approval-canary.ts';
const MARKER = 'ordinary-provider-marker-observed';
const cli = fileURLToPath(import.meta.resolve('tsx/cli'));
function isolatedImport(
  control: boolean,
  launch: boolean
): { code: number | null; stdout: string; stderr: string; root: string } {
  const closure = assessCanarySourceClosure(
    REPOSITORY_ROOT,
    ENTRY,
    governorPathsFromCodeowners(readFileSync(join(REPOSITORY_ROOT, 'CODEOWNERS'), 'utf8'))
  );
  expect(closure.complete).toBe(true);
  expect(closure.modules.map((module) => module.path)).not.toContain(
    'packages/nexus-agents/src/core/index.ts'
  );
  const root = mkdtempSync(join(tmpdir(), 'canary-import-proof-'));
  roots.push(root);
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const module of closure.modules)
    write(module.path, readFileSync(join(REPOSITORY_ROOT, module.path), 'utf8'));
  for (const name of ['github-provider.ts', 'github-provider-traits.ts'])
    write(`packages/nexus-agents/src/scm/${name}`, `console.log('${MARKER}'); export {};`);
  if (control)
    write(
      ENTRY,
      readFileSync(join(root, ENTRY), 'utf8') +
        "\nimport '../packages/nexus-agents/src/scm/github-provider-traits.js';\n"
    );
  write('package.json', '{"type":"module"}');
  write('probe.ts', `import './${ENTRY}'; console.log('import-complete');`);
  write('bin/gh', '#!/bin/sh\necho unexpected-github-call >&2\nexit 93\n');
  chmodSync(join(root, 'bin/gh'), 0o755);
  symlinkSync(join(REPOSITORY_ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
  const child = spawnSync(process.execPath, [cli, join(root, launch ? ENTRY : 'probe.ts')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
    env: { PATH: join(root, 'bin'), HOME: root, LANG: 'C.UTF-8' },
  });
  return { code: child.status, stdout: child.stdout, stderr: child.stderr, root };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe('minimal launcher runtime boundary', () => {
  it('has a sensitive control: an ordinary provider import executes the harmless marker', () => {
    const result = isolatedImport(true, false);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(MARKER);
  });
  it('imports the real extracted launcher without evaluating the ordinary provider', () => {
    const result = isolatedImport(false, false);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('import-complete');
    expect(result.stdout).not.toContain(MARKER);
    expect(result.stderr).not.toContain('unexpected-github-call');
  });
  it('retains an actual launcher refusal without importing the provider or calling GitHub', () => {
    const result = isolatedImport(false, true);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain(MARKER);
    expect(result.stderr).not.toContain('unexpected-github-call');
    const record: unknown = JSON.parse(
      readFileSync(join(result.root, '.nexus-agents/native-approval-canary/result.json'), 'utf8')
    );
    expect(record).toMatchObject({
      status: 'unmeasured',
      reason: 'launcher-refused',
      writeAttempted: false,
    });
  });
});
