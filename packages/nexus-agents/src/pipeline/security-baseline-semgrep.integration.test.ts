/** Real Semgrep and Git exercise partial-parse baseline coverage (#7238). */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';
import { checkSecurityScan } from './security-gate.js';

const probe = spawnSync('semgrep', ['--version'], {
  cwd: process.env['VITEST_SYSTEM_TMPDIR'] ?? tmpdir(),
  timeout: 10_000,
  encoding: 'utf8',
});
const scannerAbsent =
  probe.error !== undefined && 'code' in probe.error && probe.error.code === 'ENOENT';
const suiteName = scannerAbsent
  ? 'real Semgrep baseline coverage (#7238): skipped because semgrep executable is absent'
  : 'real Semgrep baseline coverage (#7238)';

// Deliberately malformed syntax keeps this fixture independent of a particular
// Semgrep TypeScript parser bug. The following eval forces Semgrep's prefilter
// to parse the file, while remaining a measurable finding outside the error.
const PARTIAL_SOURCE = "const broken = ;\neval('existing debt');\n";
const EVAL_RULE = [
  'rules:',
  '- id: fixture-eval',
  '  pattern: eval(...)',
  '  languages: [typescript]',
  '  message: unsafe eval',
  '  severity: ERROR',
  '',
].join('\n');

interface Fixture {
  readonly directory: string;
  readonly target: string;
  readonly rules: string;
  readonly sha: string;
}

/** Plumbing creates an immutable fixture base without checkout or git commit. */
async function createFixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'baseline-semgrep-'));
  const target = join(directory, 'source');
  const rules = join(directory, 'rule.yaml');
  await mkdir(target);
  await writeFile(rules, EVAL_RULE);
  const files = { 'app.ts': 'export const answer = 42;\n', 'partial.ts': PARTIAL_SOURCE };
  const env = {
    ...hermeticGitEnv(),
    GIT_AUTHOR_NAME: 'Security fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Security fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
  const git = (args: string[], input?: string): string =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: target,
      env,
      encoding: 'utf8',
      input,
    }).trim();
  git(['init', '--quiet']);
  const treeEntries: string[] = [];
  for (const [file, contents] of Object.entries(files)) {
    await writeFile(join(target, file), contents);
    const hash = git(['hash-object', '-w', '--stdin'], contents);
    treeEntries.push(`100644 blob ${hash}\t${file}\n`);
  }
  const tree = git(['mktree'], treeEntries.join(''));
  const sha = git(['commit-tree', tree], 'Pinned scanner fixture\n');
  // Populate only the fixture index so diff against the pinned SHA observes
  // subsequent edits; working files were written explicitly above.
  git(['read-tree', sha]);
  return { directory, target, rules, sha };
}

describe.skipIf(scannerAbsent)(suiteName, () => {
  let fixture: Fixture;

  beforeAll(() => {
    // An installed but broken scanner is a failure, not an integration skip.
    expect(probe.status, probe.error?.message ?? probe.stderr).toBe(0);
  });

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await rm(fixture.directory, { recursive: true, force: true });
  });

  function scan(): ReturnType<ReturnType<typeof checkSecurityScan>> {
    return checkSecurityScan(fixture.target, [fixture.rules], {
      root: fixture.target,
      enableOsv: false,
      baseline: { sha: fixture.sha, directory: fixture.target },
    })();
  }

  it('completes with unchanged partial coverage while a new eval in another file blocks', async () => {
    await writeFile(join(fixture.target, 'app.ts'), "eval('introduced');\n");

    const result = await scan();

    expect(result.verdict, JSON.stringify(result.comparison)).toBe('fail');
    expect(result.comparison).toMatchObject({
      complete: true,
      baseCount: 1,
      worktreeCount: 2,
      introducedBlockingCount: 1,
      unscannedCoverage: ['partial.ts'],
      scannerVersion: probe.stdout.trim(),
      errors: [],
    });
    expect(result.comparison?.blockingFindings).toEqual([
      expect.objectContaining({ rule: 'fixture-eval', file: 'app.ts', severity: 'high' }),
    ]);
  }, 60_000);

  it('blocks a newly unparsable file without claiming introduced findings were measured', async () => {
    await writeFile(join(fixture.target, 'new.ts'), PARTIAL_SOURCE);

    const result = await scan();

    expect(result.verdict).toBe('skip');
    expect(result.comparison).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      blockingFindings: [],
    });
    expect(result.comparison?.errors.join('\n')).toContain('new.ts');
  }, 60_000);

  it('blocks an edit to a partially parsed file even when its parse diagnostic is unchanged', async () => {
    await writeFile(join(fixture.target, 'partial.ts'), `${PARTIAL_SOURCE}// changed\n`);

    const result = await scan();

    expect(result.verdict).toBe('skip');
    expect(result.comparison).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      blockingFindings: [],
    });
    expect(result.comparison?.errors.join('\n')).toContain('partial.ts');
  }, 60_000);
});
