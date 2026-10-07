/** Real TypeScript parsing guards security scan coverage (#7249). */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const probe = spawnSync('semgrep', ['--version'], {
  cwd: process.env['VITEST_SYSTEM_TMPDIR'] ?? tmpdir(),
  timeout: 10_000,
  encoding: 'utf8',
});
const scannerOnPath = (process.env['PATH'] ?? '')
  .split(delimiter)
  .some((directory) => existsSync(join(directory, 'semgrep')));
const scannerAbsent =
  !scannerOnPath &&
  probe.error !== undefined &&
  'code' in probe.error &&
  probe.error.code === 'ENOENT';
const suiteName = scannerAbsent
  ? 'production TypeScript parsing (#7249): skipped because semgrep executable is absent from PATH'
  : 'production TypeScript parsing (#7249)';

const FILES = [
  'packages/nexus-agents/src/agents/experts/expert-prompts/prompt-composer.ts',
  'packages/nexus-agents/src/security/input-sanitizer.ts',
  'packages/nexus-agents/src/orchestration/aorchestra/cross-wave-context.ts',
  'packages/nexus-agents/src/agents/skills/skill-loader-types.ts',
  'packages/nexus-agents/src/agents/wave-scheduler-types.ts',
  'packages/nexus-agents/src/research/research-validator.ts',
  'packages/nexus-agents/src/self-eval/aggregation-types.ts',
  'packages/nexus-agents/src/orchestration/graph/graph-executor.ts',
  'packages/nexus-agents/src/cli/research-command.ts',
  'packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts',
  'packages/nexus-agents/src/testing/cli-spawn-guard.setup.ts',
  'scripts/governance-markers.ts',
];

// A broad AST pattern forces parsing even when security rules would prefilter
// a source file out. A regex rule would not exercise the TypeScript parser.
const PARSE_RULE = [
  'rules:',
  '- id: typescript-parse-coverage',
  '  pattern: $F(...)',
  '  languages: [typescript]',
  '  message: parser coverage',
  '  severity: INFO',
  '',
].join('\n');

describe.skipIf(scannerAbsent)(suiteName, () => {
  let directory: string;
  let rules: string;

  beforeAll(async () => {
    // An installed but broken scanner must fail, rather than silently skip.
    expect(probe.status, probe.error?.message ?? probe.stderr).toBe(0);
    directory = await mkdtemp(join(tmpdir(), 'semgrep-parsing-'));
    rules = join(directory, 'rule.yaml');
    await writeFile(rules, PARSE_RULE);
  });

  afterAll(async () => {
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  });

  it('fully parses all twelve production sources', () => {
    const scan = spawnSync(
      'semgrep',
      ['scan', '--config', rules, '--json', '--metrics=off', ...FILES],
      { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }
    );
    expect(scan.status, scan.error?.message ?? scan.stderr).toBe(0);
    const result = JSON.parse(scan.stdout) as {
      errors: unknown[];
      paths: { scanned: string[] };
    };
    expect(result.paths.scanned.toSorted()).toEqual(FILES.toSorted());
    expect(result.errors).toEqual([]);
  }, 120_000);
});
