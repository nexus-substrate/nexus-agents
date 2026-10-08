/** File-local scanner failures require two-sided unchanged coverage (#7294). */
import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSarif } from '../security/sarif-parser.js';
import type { SecurityScanInput } from '../mcp/tools/security-scan-types.js';
import { checkSecurityScan } from './security-gate.js';

const mocks = vi.hoisted(() => ({
  scan: vi.fn(),
  changedPath: '',
  modePath: '',
  escapePath: '',
  unreadablePath: '',
  // A base-side read of this name is served from the base's package.json bytes.
  aliasName: '',
  target: '',
}));
/** Redirect a base-tree path named `aliasName` to that tree's package.json. */
function baseAlias(path: unknown): string | undefined {
  if (typeof path !== 'string' || mocks.aliasName === '') return undefined;
  if (!path.endsWith(`/${mocks.aliasName}`) || path.startsWith(`${mocks.target}/`))
    return undefined;
  return `${path.slice(0, -mocks.aliasName.length)}package.json`;
}
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      if (args[0] === mocks.unreadablePath) throw new Error('EACCES: unreadable file');
      const alias = baseAlias(args[0]);
      if (alias !== undefined) return actual.readFile(alias);
      return args[0] === mocks.changedPath
        ? Buffer.from('changed source')
        : actual.readFile(...args);
    },
    realpath: async (...args: Parameters<typeof actual.realpath>) => {
      if (args[0] === mocks.escapePath) return '/outside/escape.yml';
      const alias = baseAlias(args[0]);
      if (alias !== undefined)
        return join(await actual.realpath(alias.slice(0, -'package.json'.length)), mocks.aliasName);
      return actual.realpath(...args);
    },
    lstat: async (...args: Parameters<typeof actual.lstat>) => {
      const alias = baseAlias(args[0]);
      const result = await (alias === undefined ? actual.lstat(...args) : actual.lstat(alias));
      if (args[0] === mocks.modePath)
        result.mode = typeof result.mode === 'bigint' ? result.mode | 0o111n : result.mode | 0o111;
      return result;
    },
  };
});
vi.mock('../mcp/tools/security-scan.js', () => ({
  executeSecurityScan: mocks.scan,
  prepareSecurityScan: vi.fn().mockResolvedValue({ version: '1.128.1' }),
}));

const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const target = join(repository, 'packages/nexus-agents');
const rule = 'yaml.github-actions.security.gha-curl-pipe-shell.gha-curl-pipe-shell';
const gate = (): ReturnType<ReturnType<typeof checkSecurityScan>> =>
  checkSecurityScan(target, ['p/default'], {
    root: target,
    enableOsv: false,
    baseline: { sha, directory: repository },
  })();

/** Semgrep's file-local header, or a pathless message when `file` is ''. */
function notificationText(
  input: SecurityScanInput,
  kind: string,
  options: { file?: string; rule?: string; body?: string }
): string {
  if (options.file === '') return `${kind}:\n no path`;
  const file = join(input.target, options.file ?? 'package.json');
  return `${kind} when running ${options.rule ?? rule} on ${file}:\n${options.body ?? ' matcher failed'}`;
}

function result(
  input: SecurityScanInput,
  options: {
    file?: string;
    kind?: string;
    rule?: string;
    side?: string;
    config?: boolean;
    failed?: boolean;
    body?: string;
  } = {}
): ReturnType<typeof parseSarif> {
  const kind = options.kind ?? 'Internal matching error';
  const message = notificationText(input, kind, options);
  const notifications =
    options.side !== undefined && (input.target === target) !== (options.side === 'worktree')
      ? []
      : [{ descriptor: { id: kind }, level: 'warning', message: { text: message } }];
  return parseSarif(
    JSON.stringify({
      runs: [
        {
          tool: { driver: { name: 'semgrep' } },
          results: [],
          invocations: [
            {
              executionSuccessful: options.failed !== true,
              [options.config === true
                ? 'toolConfigurationNotifications'
                : 'toolExecutionNotifications']: notifications,
            },
          ],
        },
      ],
    })
  );
}

describe('two-sided file-local scanner errors (#7294)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scan.mockReset();
    mocks.changedPath = '';
    mocks.modePath = '';
    mocks.escapePath = '';
    mocks.unreadablePath = '';
    mocks.aliasName = '';
    mocks.target = target;
  });

  it.each(['Internal matching error', 'Timeout'])(
    'completes an unchanged-file %s with unscanned reason and provenance',
    async (kind) => {
      mocks.scan.mockImplementation((input: SecurityScanInput) => result(input, { kind }));
      const measured = await gate();
      expect(measured.verdict, JSON.stringify(measured.comparison)).toBe('pass');
      expect(measured.comparison).toMatchObject({
        complete: true,
        introducedBlockingCount: 0,
        errors: [],
      });
      expect(measured.comparison?.unscannedCoverage).toEqual([
        expect.stringContaining(`package.json: semgrep ${rule}`),
      ]);
      expect(measured.comparison?.unscannedCoverage?.[0]).toContain(kind);
      expect(measured.comparison?.unscannedCoverage?.[0]).toContain('matcher failed');
      expect(measured.details).toContain('unscanned');
      expect(measured.coverageNote).toContain('package.json');
      expect(measured.coverageNote).toContain(rule);
    }
  );

  it('bounds and sanitizes untrusted scanner text in the unscanned note', async () => {
    const body = `\u001b[31m${'x'.repeat(10_000)}\r\n\u0007\u0000tail`;
    mocks.scan.mockImplementation((input: SecurityScanInput) => result(input, { body }));
    const measured = await gate();
    expect(measured.verdict).toBe('pass');
    for (const text of [measured.coverageNote ?? '', measured.details]) {
      expect(text).toContain('package.json');
      expect(text).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    }
    // Note: 500 chars; details: the 500-char summary cap plus "; " plus the note.
    expect(measured.coverageNote?.length).toBeLessThanOrEqual(500);
    expect(measured.details.length).toBeLessThanOrEqual(1_002);
    expect(measured.coverageNote).not.toContain('x'.repeat(250));
  });

  it('keeps a changed-file error unmeasured', async () => {
    mocks.changedPath = join(target, 'package.json');
    mocks.scan.mockImplementation((input: SecurityScanInput) => result(input));
    const measured = await gate();
    expect(measured.verdict).toBe('skip');
    expect(measured.comparison).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      unscannedCoverage: [],
    });
  });

  it('keeps an added-file error unmeasured even when both scans report it', async () => {
    mocks.scan.mockImplementation((input: SecurityScanInput) =>
      result(input, { file: 'not-in-pinned-base.yml' })
    );
    expect((await gate()).comparison).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      unscannedCoverage: [],
    });
  });

  it('keeps a new path unmeasured when its bytes equal a base blob at a different path', async () => {
    // Guard (#7294 review): the worktree path exists and its bytes, mode and the
    // base-side read all match package.json's pinned blob. Only the pinned tree
    // entry for THIS path can refuse it, and it must.
    mocks.aliasName = 'copied-package.json';
    const copy = join(target, mocks.aliasName);
    copyFileSync(join(target, 'package.json'), copy);
    try {
      mocks.scan.mockImplementation((input: SecurityScanInput) =>
        result(input, { file: mocks.aliasName })
      );
      const measured = await gate();
      expect(measured.comparison).toMatchObject({
        complete: false,
        introducedBlockingCount: null,
        unscannedCoverage: [],
      });
      // The refusal can come from the pinned-tree lookup ("Change touches
      // unscanned file") or, where the base path cannot be resolved at all, from
      // the base-side realpath ("Cannot verify unscanned file"). Either keeps it
      // unmeasured; what matters is that this path is named and not tolerated.
      const errors = measured.comparison?.errors ?? [];
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(
        new RegExp(`(Change touches|Cannot verify) unscanned file:? ${mocks.aliasName}`)
      );
    } finally {
      rmSync(copy, { force: true });
    }
  });

  it.each(['base', 'worktree'])('keeps a one-sided %s error unmeasured', async (side) => {
    mocks.scan.mockImplementation((input: SecurityScanInput) => result(input, { side }));
    expect((await gate()).comparison).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      unscannedCoverage: [],
    });
  });

  it('keeps a pathless error unmeasured', async () => {
    mocks.scan.mockImplementation((input: SecurityScanInput) => result(input, { file: '' }));
    expect((await gate()).comparison).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      unscannedCoverage: [],
    });
  });

  it('names the empty tolerated set when clean measured scans complete', async () => {
    mocks.scan.mockReturnValue({
      scanner: 'semgrep',
      totalFindings: 0,
      findings: [],
      errors: [],
      coverageComplete: true,
    });
    const measured = await gate();
    expect(measured.comparison).toMatchObject({
      complete: true,
      introducedBlockingCount: 0,
      unscannedCoverage: [],
    });
    expect(measured.coverageNote).toBeUndefined();
  });

  it('keeps mode-changed files unmeasured', async () => {
    mocks.modePath = join(target, 'package.json');
    mocks.scan.mockImplementation((input: SecurityScanInput) => result(input));
    expect((await gate()).comparison).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      unscannedCoverage: [],
    });
  });

  it.each(['escapePath', 'unreadablePath'] as const)('fails closed on %s', async (fault) => {
    mocks[fault] = join(target, 'package.json');
    mocks.scan.mockImplementation((input: SecurityScanInput) => result(input));
    expect((await gate()).comparison).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      unscannedCoverage: [],
    });
  });

  it('keeps file-local errors unmeasured without a baseline', async () => {
    mocks.scan.mockImplementation((input: SecurityScanInput) => result(input));
    const measured = await checkSecurityScan(target, ['p/default'], {
      root: target,
      enableOsv: false,
    })();
    expect(measured.verdict).toBe('skip');
    expect(measured.details).toContain('unscanned');
  });

  it('keeps a different rule on the same file unmeasured', async () => {
    mocks.scan.mockImplementation((input: SecurityScanInput) =>
      result(input, { rule: input.target === target ? 'different-rule' : rule })
    );
    expect((await gate()).comparison).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      unscannedCoverage: [],
    });
  });

  it.each([
    { file: '../../outside.yml' },
    { kind: 'Timeout during interfile analysis' },
    { kind: 'Fatal error' },
    { config: true },
    { failed: true },
  ])('keeps unsafe or global failures unmeasured: %j', async (options) => {
    mocks.scan.mockImplementation((input: SecurityScanInput) => result(input, options));
    expect((await gate()).comparison).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      unscannedCoverage: [],
    });
  });
});
