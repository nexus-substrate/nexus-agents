/** Regression tests for unpublished changelog entries (#4863). */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markUnpublishedChangelog } from './mark-unpublished-changelog.js';

let directory: string;
let changelogPath: string;
const CHANGELOG =
  '# Package\n\n## 4.2.1\n\nPending.\n\n## 4.2.0\n\nPublished.\n\n## 4.1.2\n\nSkipped.\n\n## 4.1.1\n\nPublished.\n';
const MARKER =
  '> **Not published to npm.** This version was superseded before release; its changes shipped in 4.2.0.';
const NOW = 1_790_856_000_000; // 2026-10-01T12:00:00.000Z
const OLD = '2026-09-30T00:00:00.000Z';
const lookup = (): string => JSON.stringify({ '4.2.0': OLD, '4.1.1': OLD });
const mark = (path: string, name: string, fetch: (name: string) => string): readonly string[] =>
  markUnpublishedChangelog(path, name, fetch, () => NOW);

function runCli(
  args: readonly string[],
  npmBody: string,
  env: NodeJS.ProcessEnv = {}
): SpawnSyncReturns<string> {
  const npmPath = join(directory, 'npm');
  writeFileSync(npmPath, `#!${process.execPath}\n${npmBody}\n`);
  chmodSync(npmPath, 0o755);
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', resolve('scripts/mark-unpublished-changelog.ts'), ...args],
    {
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${directory}:${process.env['PATH'] ?? ''}`, ...env },
    }
  );
}
// publishEnv discovers npm's supported config before the registry lookup.
const CONFIG = `if (process.argv[2] === 'config') {
  process.stdout.write(JSON.stringify({registry: '', userconfig: '', cache: '', provenance: false}));
  process.exit(0);
}`;

beforeEach(() => {
  directory = mkdtempSync(join(process.cwd(), 'scripts/.mark-changelog-test-'));
  changelogPath = join(directory, 'CHANGELOG.md');
  writeFileSync(changelogPath, CHANGELOG);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('markUnpublishedChangelog', () => {
  it('marks a skipped version directly below its heading with the next published version', () => {
    expect(mark(changelogPath, 'example-package', lookup)).toEqual(['4.1.2']);
    expect(readFileSync(changelogPath, 'utf-8')).toBe(
      CHANGELOG.replace('## 4.1.2\n', `## 4.1.2\n${MARKER}\n`)
    );
  });

  it('leaves published versions unchanged', () => {
    const published = '# Package\n\n## 4.2.0\n\nReleased.\n\n## 4.1.1\n';
    writeFileSync(changelogPath, published);
    expect(mark(changelogPath, 'example-package', lookup)).toEqual([]);
    expect(readFileSync(changelogPath, 'utf-8')).toBe(published);
  });

  it('does not mark versions at or above the highest published version', () => {
    const pending = '## 5.0.0\n\nPending.\n\n## 4.2.1\n\nPending.\n\n## 4.2.0\n';
    writeFileSync(changelogPath, pending);
    expect(mark(changelogPath, 'example-package', lookup)).toEqual([]);
    expect(readFileSync(changelogPath, 'utf-8')).toBe(pending);
  });

  it('is idempotent on the second run', () => {
    mark(changelogPath, 'example-package', lookup);
    const first = readFileSync(changelogPath, 'utf-8');
    expect(mark(changelogPath, 'example-package', lookup)).toEqual([]);
    expect(readFileSync(changelogPath, 'utf-8')).toBe(first);
    expect(first.match(/Not published to npm/g)).toHaveLength(1);
  });

  it('preserves an existing marker separated from its heading by a blank line', () => {
    const marked = CHANGELOG.replace('## 4.1.2\n', `## 4.1.2\n\n${MARKER}\n`);
    writeFileSync(changelogPath, marked);
    expect(mark(changelogPath, 'example-package', lookup)).toEqual([]);
    expect(readFileSync(changelogPath, 'utf-8')).toBe(marked);
  });

  it('orders versions numerically and crosses major and minor boundaries', () => {
    writeFileSync(changelogPath, '## 9.9.9\n\nSkipped.\n\n## 9.10.0\n\nSkipped.\n');
    expect(
      mark(changelogPath, 'example-package', () =>
        JSON.stringify({ '10.0.0': OLD, '9.10.1': OLD, '9.9.8': OLD })
      )
    ).toEqual(['9.9.9', '9.10.0']);
    expect(readFileSync(changelogPath, 'utf-8').match(/changes shipped in 9.10.1\./g)).toHaveLength(
      2
    );
  });

  it('accepts npm output for a package with exactly one published version', () => {
    expect(mark(changelogPath, 'example-package', () => JSON.stringify({ '4.2.0': OLD }))).toEqual([
      '4.1.2',
      '4.1.1',
    ]);
  });

  it.each([
    ['10 minutes', '2026-10-01T11:50:00.000Z', []],
    ['just under six hours', '2026-10-01T06:00:00.001Z', []],
    ['exactly six hours', '2026-10-01T06:00:00.000Z', ['8.126.0']],
    ['seven hours', '2026-10-01T05:00:00.000Z', ['8.126.0']],
    ['future timestamp', '2026-10-01T13:00:00.000Z', []],
  ])(
    'guards out-of-order visibility when the higher version is %s old',
    (_age, timestamp, expected) => {
      const original = '## 8.127.0\n\nPublished.\n\n## 8.126.0\n\nStaging.\n';
      writeFileSync(changelogPath, original);
      const times = JSON.stringify({ '8.127.0': timestamp, created: OLD, modified: OLD });
      expect(mark(changelogPath, 'example-package', () => times)).toEqual(expected);
      if (expected.length === 0) expect(readFileSync(changelogPath, 'utf-8')).toBe(original);
      else expect(readFileSync(changelogPath, 'utf-8')).toContain('changes shipped in 8.127.0.');
    }
  );

  it('retains recently published versions in the published set', () => {
    writeFileSync(changelogPath, '## 4.1.2\n\nPublished recently.\n');
    const times = JSON.stringify({ '4.2.0': OLD, '4.1.2': '2026-10-01T11:50:00.000Z' });
    expect(mark(changelogPath, 'example-package', () => times)).toEqual([]);
  });

  it('accepts the single-document wrapper returned by npm 12', () => {
    expect(mark(changelogPath, 'example-package', () => `[${lookup()}]`)).toEqual(['4.1.2']);
    expect(readFileSync(changelogPath, 'utf-8')).toContain(MARKER);
  });

  it('preserves CRLF line endings', () => {
    writeFileSync(changelogPath, CHANGELOG.replaceAll('\n', '\r\n'));
    mark(changelogPath, 'example-package', lookup);
    expect(readFileSync(changelogPath, 'utf-8')).toContain(`## 4.1.2\r\n${MARKER}\r\n`);
  });

  it('leaves a changelog without release headings unchanged', () => {
    const pointer = '# Changelog\n\nSee the package changelog.\n';
    writeFileSync(changelogPath, pointer);
    expect(mark(changelogPath, 'example-package', lookup)).toEqual([]);
    expect(readFileSync(changelogPath, 'utf-8')).toBe(pointer);
  });

  it('does not mistake prerelease headings or subheadings for stable releases', () => {
    const otherHeadings = '## 4.1.0-beta.1\n\n### 4.1.0\n';
    writeFileSync(changelogPath, otherHeadings);
    expect(mark(changelogPath, 'example-package', lookup)).toEqual([]);
    expect(readFileSync(changelogPath, 'utf-8')).toBe(otherHeadings);
  });

  it.each(['```', '~~~~'])('ignores version headings inside a %s code fence', (fence) => {
    const example = `## 4.2.0\n\n${fence}markdown\n## 4.1.2\nExample only.\n${fence}\n\n`;
    writeFileSync(changelogPath, `${example}## 4.1.2\n\nSkipped.\n`);
    expect(mark(changelogPath, 'example-package', lookup)).toEqual(['4.1.2']);
    expect(readFileSync(changelogPath, 'utf-8')).toBe(
      `${example}## 4.1.2\n${MARKER}\n\nSkipped.\n`
    );
  });

  it('fails without changing the file when the npm lookup fails', () => {
    expect(() =>
      mark(changelogPath, 'example-package', () => {
        throw new Error('registry unavailable');
      })
    ).toThrow(/unmeasured.*registry unavailable/i);
    expect(readFileSync(changelogPath, 'utf-8')).toBe(CHANGELOG);
  });

  it.each([
    ['empty time document', '{}'],
    ['invalid JSON', 'not json'],
    ['array', '[]'],
    ['null', 'null'],
    ['null wrapped document', '[null]'],
    ['nested array', '[[]]'],
    ['multiple time documents', `[${lookup()},${lookup()}]`],
    ['version string', '"4.2.0"'],
    ['metadata only', JSON.stringify({ created: OLD, modified: OLD })],
    ['non-string timestamp', JSON.stringify({ '4.2.0': 42 })],
    ['invalid timestamp', JSON.stringify({ '4.2.0': 'not a date' })],
    ['non-ISO timestamp', JSON.stringify({ '4.2.0': '2026-09-30' })],
    ['impossible timestamp', JSON.stringify({ '4.2.0': '2026-02-30T00:00:00.000Z' })],
    ['invalid metadata timestamp', JSON.stringify({ '4.2.0': OLD, modified: 'invalid' })],
    ['invalid semver entry', JSON.stringify({ '4.2.0': OLD, invalid: OLD })],
  ])('fails without changing the file for an %s (unmeasured)', (_name, raw) => {
    expect(() => mark(changelogPath, 'example-package', () => raw)).toThrow(/unmeasured/i);
    expect(readFileSync(changelogPath, 'utf-8')).toBe(CHANGELOG);
  });
});

describe('CLI and release wiring', () => {
  it.each([
    ['registry unavailable', 'process.stderr.write("registry unavailable"); process.exit(1);'],
    ['empty time document', 'process.stdout.write("{}");'],
    ['invalid time document', 'process.stdout.write("not json");'],
  ])('warns and exits zero without edits for %s', (_name, npmBody) => {
    const result = runCli(['example-package', changelogPath], `${CONFIG}\n${npmBody}`);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(
      /^::warning::mark-unpublished-changelog: example-package unmeasured \(.*\); CHANGELOG left unchanged, the next version-PR regeneration retries\n$/
    );
    expect(readFileSync(changelogPath, 'utf-8')).toBe(CHANGELOG);
  });

  it('queries npm time under the cleaned publish environment', () => {
    const result = runCli(
      ['example-package', changelogPath],
      `${CONFIG}
      if (process.env.npm_config_verify_deps_before_run !== undefined) {
        process.stderr.write('pnpm config leaked'); process.exit(1);
      }
      if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['view', 'example-package', 'time', '--json'])) {
        process.stderr.write('expected npm time lookup'); process.exit(1);
      }
      process.stdout.write(${JSON.stringify(`[${lookup()}]`)});`,
      { npm_config_verify_deps_before_run: 'false' }
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('marked 1 version(s) (4.1.2)');
    expect(readFileSync(changelogPath, 'utf-8')).toContain(MARKER);
  });

  it.each([
    { args: [] },
    { args: ['example-package'] },
    { args: ['example-package', 'unused', 'extra'] },
  ])('exits one for usage errors: %j', ({ args }) => {
    const result = runCli(args, 'process.exit(99);');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('usage:');
    expect(readFileSync(changelogPath, 'utf-8')).toBe(CHANGELOG);
  });

  it('keeps filesystem errors fatal after a measured lookup', () => {
    const result = runCli(
      ['example-package', join(directory, 'missing.md')],
      `${CONFIG}\nprocess.stdout.write(${JSON.stringify(lookup())});`
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ENOENT');
    expect(result.stderr).not.toContain('::warning::');
  });

  it('runs both package markers after changeset version in the action version script', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf-8')) as {
      scripts: Record<string, string>;
    };
    const commands = manifest.scripts['changeset:version']?.split(' && ');
    expect(commands?.[0]).toBe('pnpm exec tsx scripts/changeset-version-with-retry.ts');
    expect(commands?.slice(1, 3)).toEqual([
      'pnpm exec tsx scripts/mark-unpublished-changelog.ts nexus-agents packages/nexus-agents/CHANGELOG.md',
      'pnpm exec tsx scripts/mark-unpublished-changelog.ts nexus-memory packages/nexus-memory/CHANGELOG.md',
    ]);
    expect(readFileSync('.github/workflows/release.yml', 'utf-8')).toContain(
      'version-script: pnpm changeset:version'
    );
  });
});
