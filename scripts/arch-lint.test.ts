import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  checkSecurity,
  checkTempDirCleanup,
  checkTestHygiene,
  collectLintTargets,
  lintVerdict,
  type Violation,
} from './arch-lint.js';
import { SRC_ROOT } from './script-paths.js';

const srcFile = (rel: string): string => join(SRC_ROOT, rel);

describe('checkTempDirCleanup', () => {
  it('flags a file that creates a nexus tempdir but never removes one', () => {
    const content = [
      "import { nexusMkdtempSync } from '../../config/nexus-tmp-dir.js';",
      'export function run(): string {',
      "  return nexusMkdtempSync('leaky-');",
      '}',
    ].join('\n');

    const violations = checkTempDirCleanup(srcFile('mcp/tools/leaky.ts'), content);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe('tmpdir-cleanup');
    expect(violations[0]?.severity).toBe('error');
    // Anchored to the creating call so the message points at the leak.
    expect(violations[0]?.line).toBe(3);
  });

  it('accepts the synchronous rmSync teardown idiom', () => {
    const content = [
      "import { nexusMkdtempSync } from '../../config/nexus-tmp-dir.js';",
      "const dir = nexusMkdtempSync('ok-');",
      'try {',
      '  work(dir);',
      '} finally {',
      '  rmSync(dir, { recursive: true, force: true });',
      '}',
    ].join('\n');

    expect(checkTempDirCleanup(srcFile('mcp/tools/sync-ok.ts'), content)).toEqual([]);
  });

  it('accepts the async rm teardown idiom', () => {
    const content = [
      "import { nexusMkdtemp } from '../config/nexus-tmp-dir.js';",
      "const tempDir = await nexusMkdtemp('nexus-mcp-');",
      'const cleanup = async (): Promise<void> => {',
      '  await rm(tempDir, { recursive: true, force: true });',
      '};',
    ].join('\n');

    expect(checkTempDirCleanup(srcFile('cli-adapters/child-mcp-config.ts'), content)).toEqual([]);
  });

  it('does not flag the nexus-tmp-dir module that defines the helpers', () => {
    const content = [
      'export function nexusMkdtempSync(prefix: string): string {',
      '  return mkdtempSync(join(nexusTmpRoot(), prefix));',
      '}',
    ].join('\n');

    expect(checkTempDirCleanup(srcFile('config/nexus-tmp-dir.ts'), content)).toEqual([]);
  });

  it('does not flag test files, which clean up via their own fixtures', () => {
    const content = "const dir = nexusMkdtempSync('fixture-');";

    expect(checkTempDirCleanup(srcFile('mcp/tools/thing.test.ts'), content)).toEqual([]);
  });

  it('honours an explicit arch-lint-ignore escape hatch', () => {
    const content = [
      '// arch-lint-ignore tmpdir-cleanup -- caller owns teardown, see #4489',
      "const dir = nexusMkdtempSync('handed-off-');",
      'return dir;',
    ].join('\n');

    expect(checkTempDirCleanup(srcFile('mcp/tools/handoff.ts'), content)).toEqual([]);
  });

  it('ignores files that never touch the nexus tempdir helpers', () => {
    expect(checkTempDirCleanup(srcFile('core/thing.ts'), 'export const x = 1;')).toEqual([]);
  });
});

describe('collectLintTargets', () => {
  it('scans scripts/ as well as packages src (#4498)', () => {
    // The rule shipped scanning SRC_ROOT only, so a leaking tempdir in
    // scripts/ — review-pr.ts, which unlinked the file but never removed the
    // directory — went unreported by the very guard added to catch it. The
    // gap was in the file walk, not in the rule, so that is what is asserted.
    const targets = collectLintTargets();

    expect(targets.some((f) => f.includes(join('scripts', 'review-pr.ts')))).toBe(true);
    expect(targets.some((f) => f.startsWith(SRC_ROOT))).toBe(true);
  });

  it('does not scan its own test files for production-code rules', () => {
    const targets = collectLintTargets();

    expect(targets.every((f) => !f.endsWith('arch-lint.test.ts'))).toBe(true);
  });
});

describe('checkSecurity hardcoded-credential detection', () => {
  const hits = (rel: string, content: string): string[] =>
    checkSecurity(srcFile(rel), content)
      .filter((v) => v.severity === 'error')
      .map((v) => v.message);

  it('still flags a genuine hardcoded credential literal', () => {
    expect(hits('core/thing.ts', 'const api_key = "sk-live-abcdef123456";')).toEqual([
      'Hardcoded API key',
    ]);
  });

  it('does not flag a runtime interpolation into an export line', () => {
    expect(hits('cli/setup-custom-api.ts', 'export NEXUS_CUSTOM_API_KEY="${apiKey}"')).toEqual([]);
  });

  it('does not flag an {env:...} indirection placeholder', () => {
    expect(hits('cli/init-opencode.ts', "      apiKey: '{env:WORKSPACE_PROXY_KEY}',")).toEqual([]);
  });

  it('does not flag a credential pattern described in a comment', () => {
    expect(hits('mcp/tools/diff-secret-scan.ts', '  // Generic `api_key = "long-value"`')).toEqual(
      []
    );
  });

  it('honours an arch-lint-ignore escape hatch for intentional bad examples', () => {
    const content = [
      '// arch-lint-ignore security -- deliberate insecure example for the skill',
      'const bad = { code: \'const apiKey = "AKIAIOSFODNN7EXAMPLE";\' };',
    ].join('\n');

    expect(hits('agents/skills/bootstrap/security-standards.ts', content)).toEqual([]);
  });

  it('finds the escape hatch across a multi-line justification block', () => {
    const content = [
      '// arch-lint-ignore security -- deliberate insecure sample: this is the',
      "// *input* to a credential-scanning example. It is AWS's published",
      '// documentation placeholder, not a live credential.',
      'const bad = \'const apiKey = "AKIAIOSFODNN7EXAMPLE";\';',
    ].join('\n');

    expect(hits('agents/skills/bootstrap/security-standards.ts', content)).toEqual([]);
  });

  it('does not let a directive leak past intervening code to a later line', () => {
    const content = [
      '// arch-lint-ignore security -- applies to the next line only',
      'const allowed = "api_key = \\"literal-one\\"";',
      'const api_key = "sk-live-should-still-be-flagged";',
    ].join('\n');

    expect(hits('core/thing.ts', content)).toEqual(['Hardcoded API key']);
  });
});

describe('checkTestHygiene', () => {
  it('flags a genuine mock in production code', () => {
    const violations = checkTestHygiene(srcFile('core/thing.ts'), 'const spy = vi.fn();');

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe('test-hygiene');
  });

  it('does not flag a mock name appearing only in a line comment', () => {
    const content = [
      'function loadManifestFile(path: string): Result {',
      "  // Defensive: tests sometimes `vi.mock('node:fs', ...)` with a subset",
      '  return read(path);',
      '}',
    ].join('\n');

    expect(checkTestHygiene(srcFile('config/manifest-overlay.ts'), content)).toEqual([]);
  });

  it('does not flag mock guidance inside expert prompt text', () => {
    const content = [
      'export const TESTING_EXPERT_PROMPT = `',
      '### Vitest 4 Gotchas',
      '- Arrow functions in vi.fn() are NOT constructable',
      '`;',
    ].join('\n');

    expect(
      checkTestHygiene(srcFile('agents/experts/expert-prompts/testing-expert.ts'), content)
    ).toEqual([]);
  });
});

describe('lintVerdict — zero files scanned is not a pass (#4586)', () => {
  const noViolations: Violation[] = [];

  it('reports unmeasured, not passed, when nothing was scanned', () => {
    // `passed: errors.length === 0` is true over an empty file set, so a glob
    // that stops matching — a directory rename, a moved package, a broken
    // collectLintTargets — reported the architecture lint clean. Absence of
    // evidence is not evidence of compliance.
    const result = lintVerdict(noViolations, noViolations, 0);

    expect(result.unmeasured).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('passes normally when files were scanned and none errored', () => {
    // The pair: without it, "always unmeasured" would satisfy the test above.
    const result = lintVerdict(noViolations, noViolations, 42);

    expect(result.unmeasured).toBeUndefined();
    expect(result.passed).toBe(true);
  });

  it('still fails on real errors over a non-empty scan', () => {
    const errors: Violation[] = [
      { file: 'a.ts', line: 1, category: 'test', rule: 'test', message: 'boom', severity: 'error' },
    ];

    const result = lintVerdict(errors, errors, 42);

    expect(result.unmeasured).toBeUndefined();
    expect(result.passed).toBe(false);
  });
});
