import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSecurityScan } from './security-gate.js';
import type { SecurityFinding, SarifParseResult } from '../security/sarif-types.js';

const mocks = vi.hoisted(() => ({ scan: vi.fn(), exec: vi.fn(), osv: vi.fn() }));
vi.mock('../mcp/tools/security-scan.js', () => ({
  executeSecurityScan: mocks.scan,
  prepareSecurityScan: vi.fn().mockResolvedValue({}),
}));
vi.mock('../security/osv-lookup.js', () => ({ queryOsvBatch: mocks.osv }));
vi.mock('../cli-adapters/exec-file-tree.js', () => ({ execFileTree: mocks.exec }));

const sha = 'a'.repeat(40);
const finding = (line = 10, severity: SecurityFinding['severity'] = 'high'): SecurityFinding => ({
  id: 'eval',
  scanner: 'semgrep',
  rule: 'eval',
  file: 'noisy.ts',
  startLine: line,
  severity,
  snippet: 'eval(input)',
  message: 'unsafe eval',
  cweIds: [],
  confidence: 1,
});
const scan = (findings: SecurityFinding[], errors: string[] = []): SarifParseResult => ({
  scanner: 'semgrep',
  coverageComplete: true,
  totalFindings: findings.length,
  findings,
  errors,
});
const gate = (): ReturnType<ReturnType<typeof checkSecurityScan>> =>
  checkSecurityScan('/tmp/change', ['p/default'], {
    enableOsv: false,
    baseline: { sha, directory: '/tmp/repo' },
  })();

describe('pinned baseline comparison (#7238)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exec.mockImplementation((_command: string, args: string[]) =>
      Promise.resolve({
        stdout: args.includes('--verify') ? `${sha}\n` : '',
        stderr: '',
      })
    );
  });

  it('keeps a non-baseline gate unmeasured when a target only partially parsed', async () => {
    mocks.scan.mockResolvedValue({
      ...scan([]),
      parseDiagnostics: [
        { file: 'partial.ts', kind: 'partial-parse', message: 'unsupported syntax' },
      ],
    });
    const result = await checkSecurityScan('/tmp/change', ['p/default'], { enableOsv: false })();
    expect(result.verdict).toBe('skip');
    expect(result.details).toContain('partial.ts');
    expect(mocks.osv).not.toHaveBeenCalled();
  });

  it('fails a non-baseline gate with blocking findings despite a partial parse', async () => {
    mocks.scan.mockResolvedValue({
      ...scan([finding()]),
      parseDiagnostics: [
        { file: 'partial.ts', kind: 'partial-parse', message: 'unsupported syntax' },
      ],
    });
    const result = await checkSecurityScan('/tmp/change', ['p/default'], { enableOsv: false })();
    expect(result.verdict).toBe('fail');
    expect(result).toHaveProperty('blockingFindings', [finding()]);
    expect(result.details).toContain('1 blocking');
  });

  it('passes unchanged debt and reports both complete counts', async () => {
    mocks.scan.mockResolvedValue(scan([finding()]));
    const result = await gate();
    expect(result.verdict).toBe('pass');
    expect(result.comparison).toMatchObject({
      baseSha: sha,
      baseCount: 1,
      worktreeCount: 1,
      introducedBlockingCount: 0,
      blockingFindings: [],
      complete: true,
    });
    expect(mocks.scan).toHaveBeenCalledTimes(2);
  });

  it('counts a duplicate added to a noisy file as introduced', async () => {
    mocks.scan
      .mockResolvedValueOnce(scan([finding()]))
      .mockResolvedValueOnce(scan([finding(), finding(20)]));
    const result = await gate();
    expect(result.verdict).toBe('fail');
    expect(result.comparison?.introducedBlockingCount).toBe(1);
    expect(result.comparison?.blockingFindings[0]).toEqual({
      rule: 'eval',
      file: 'noisy.ts',
      startLine: 20,
      severity: 'high',
    });
    expect(result.details).not.toContain('none blocking');
    const diffCall = mocks.exec.mock.calls.find((call) => (call[1] as string[]).includes('diff'));
    expect(diffCall?.[1]).toContain('--text');
    expect(diffCall?.[1]).toContain('--no-color');
  });

  it('blocks remove-one plus add-one even with equal multiset counts', async () => {
    mocks.scan.mockResolvedValueOnce(scan([finding()])).mockResolvedValueOnce(scan([finding(20)]));
    mocks.exec.mockImplementation((_command: string, args: string[]) =>
      Promise.resolve({
        stdout: args.includes('--verify')
          ? `${sha}\n`
          : args.includes('diff')
            ? '@@ -10 +10,0 @@\n-eval(input)\n@@ -20,0 +20 @@\n+eval(input)\n'
            : '',
        stderr: '',
      })
    );
    const result = await gate();
    expect(result.verdict).toBe('fail');
    expect(result.comparison?.introducedBlockingCount).toBe(1);
  });

  it('accepts line shifts in unchanged source', async () => {
    mocks.scan.mockResolvedValueOnce(scan([finding()])).mockResolvedValueOnce(scan([finding(11)]));
    mocks.exec.mockImplementation((_command: string, args: string[]) =>
      Promise.resolve({
        stdout: args.includes('--verify')
          ? `${sha}\n`
          : args.includes('diff')
            ? '@@ -1,0 +2 @@\n+// comment\n'
            : '',
        stderr: '',
      })
    );
    expect((await gate()).verdict).toBe('pass');
  });

  it('does not shift a finding when a line is inserted immediately after it', async () => {
    mocks.scan.mockResolvedValue(scan([finding()]));
    mocks.exec.mockImplementation((_command: string, args: string[]) =>
      Promise.resolve({
        stdout: args.includes('--verify')
          ? `${sha}\n`
          : args.includes('diff')
            ? '@@ -10,0 +11 @@\n+// comment\n'
            : '',
        stderr: '',
      })
    );
    expect((await gate()).verdict).toBe('pass');
  });

  it.each(['base', 'worktree'])('blocks missing snippets on %s', async (side) => {
    const missing = { ...finding(), snippet: undefined };
    mocks.scan
      .mockResolvedValueOnce(scan([side === 'base' ? missing : finding()]))
      .mockResolvedValueOnce(scan([side === 'worktree' ? missing : finding()]));
    expect((await gate()).verdict).toBe('skip');
  });

  it('blocks an explicitly truncated snippet', async () => {
    mocks.scan.mockResolvedValue(scan([{ ...finding(), snippetTruncated: true }]));
    const result = await gate();
    expect(result.verdict).toBe('skip');
    expect(result.comparison?.complete).toBe(false);
  });

  it('blocks severity escalation below high as an ambiguous comparison', async () => {
    mocks.scan
      .mockResolvedValueOnce(scan([finding(10, 'low')]))
      .mockResolvedValueOnce(scan([finding(10, 'medium')]));
    expect((await gate()).verdict).toBe('fail');
  });

  it('blocks severity escalation for the same key', async () => {
    mocks.scan
      .mockResolvedValueOnce(scan([finding(10, 'medium')]))
      .mockResolvedValueOnce(scan([finding()]));
    const result = await gate();
    expect(result.verdict).toBe('fail');
    expect(result.comparison?.introducedBlockingCount).toBe(1);
  });

  it.each(['base', 'worktree'])('fails closed on %s scan failure', async (side) => {
    mocks.scan
      .mockResolvedValueOnce(side === 'base' ? { error: 'scan failed' } : scan([]))
      .mockResolvedValueOnce(side === 'worktree' ? { error: 'scan failed' } : scan([]));
    const result = await gate();
    expect(result.verdict).toBe('skip');
    expect(result.comparison?.complete).toBe(false);
    expect(result.comparison?.introducedBlockingCount).toBeNull();
  });

  it('blocks truncated finding lists', async () => {
    mocks.scan.mockResolvedValue({ ...scan([finding()]), totalFindings: 100 });
    const result = await gate();
    expect(result.verdict).toBe('skip');
    expect(result.comparison?.complete).toBe(false);
  });

  describe('independent dependency evidence with incomplete SAST (#7293)', () => {
    let directory: string;
    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'incomplete-sast-dependencies-'));
      await writeFile(
        join(directory, 'package.json'),
        JSON.stringify({ dependencies: { vulnerable: '1.0.0', unavailable: '1.0.0' } })
      );
      mocks.scan.mockResolvedValue(scan([], ['Internal matching error: other-rule']));
      mocks.exec.mockImplementation((_command: string, args: string[]) =>
        Promise.resolve({
          stdout: args.includes('--verify')
            ? `${sha}\n`
            : args.includes('--name-only')
              ? 'package.json\0'
              : '',
          stderr: '',
        })
      );
    });
    afterEach(async () => {
      await rm(directory, { recursive: true, force: true });
    });

    function check(): ReturnType<ReturnType<typeof checkSecurityScan>> {
      return checkSecurityScan(directory, ['p/default'], {
        baseline: { sha, directory },
        dependencyCaptureRoot: directory,
      })();
    }

    it('blocks a critical advisory in a changed manifest and records partial coverage', async () => {
      mocks.osv.mockResolvedValue([
        {
          packageName: 'vulnerable',
          error: null,
          vulnerabilities: [{ id: 'OSV-1', severity: 'CRITICAL' }],
        },
        { packageName: 'unavailable', error: 'HTTP 503', vulnerabilities: [] },
      ]);
      const result = await check();
      expect(result.verdict).toBe('fail');
      expect(result.comparison).toMatchObject({ complete: false, introducedBlockingCount: null });
      expect(result.details).toContain('1 OSV dependency vulnerabilities');
      expect(result.details).toContain('Security comparison incomplete');
      expect(result.coverageNote).toContain('OSV not checked for 1 of 2 dependencies');
      expect(mocks.osv).toHaveBeenCalledWith(
        [
          { name: 'vulnerable', version: '1.0.0' },
          { name: 'unavailable', version: '1.0.0' },
        ],
        undefined,
        undefined
      );
    });

    it('blocks an invalid changed manifest and preserves its error and coverage note', async () => {
      await writeFile(join(directory, 'package.json'), '{invalid');
      const result = await check();
      expect(result.verdict).toBe('fail');
      expect(result.details).toContain('Changed manifest package.json could not be parsed');
      expect(result.details).toContain('Security comparison incomplete');
      expect(result.coverageNote).toContain('OSV check did not run');
    });

    it('keeps SAST unmeasured when dependencies are clean', async () => {
      mocks.osv.mockResolvedValue([
        { error: null, vulnerabilities: [] },
        { error: null, vulnerabilities: [] },
      ]);
      const result = await check();
      expect(result.verdict).toBe('skip');
      expect(result.comparison?.introducedBlockingCount).toBeNull();
      expect(mocks.osv).toHaveBeenCalledTimes(1);
    });

    it('records a lookup failure on the changed manifest while SAST is incomplete', async () => {
      mocks.osv.mockRejectedValue(new Error('OSV unavailable'));
      const result = await check();
      expect(result.verdict).toBe('fail');
      expect(result.details).toContain(
        'Dependency lookup failed for changed manifest package.json'
      );
      expect(result.coverageNote).toContain('OSV check did not run');
    });

    it.each([
      ['base', 'yaml.github-actions.security.gha-curl-pipe-shell.gha-curl-pipe-shell'],
      ['worktree', 'yaml.github-actions.security.curl-eval.curl-eval'],
      ['base', 'unrelated.security.rule'],
      ['worktree', 'unrelated.security.rule'],
    ])(
      'keeps the comparison unmeasured with clean OSV when %s errors on %s (#7293)',
      async (side, rule) => {
        const error = `Internal matching error: ${rule}`;
        mocks.scan
          .mockResolvedValueOnce(scan([], side === 'base' ? [error] : []))
          .mockResolvedValueOnce(scan([], side === 'worktree' ? [error] : []));
        mocks.osv.mockResolvedValue([
          { error: null, vulnerabilities: [] },
          { error: null, vulnerabilities: [] },
        ]);
        const result = await check();
        expect(result.verdict).toBe('skip');
        expect(result.comparison).toMatchObject({ complete: false, introducedBlockingCount: null });
        expect(result.comparison?.errors).toContain(`${side}: ${error}`);
        expect(result.details).toContain('Security comparison incomplete');
        expect(result.coverageNote).toBeUndefined();
        expect(mocks.osv).toHaveBeenCalledTimes(1);
      }
    );
  });

  it('preserves OSV critical dependency blocking beside the SAST comparison', async () => {
    mocks.scan.mockResolvedValue(scan([]));
    mocks.osv.mockResolvedValue([
      {
        packageName: 'dependency',
        error: null,
        vulnerabilities: [{ id: 'OSV-1', severity: 'CRITICAL' }],
      },
    ]);
    const result = await checkSecurityScan(process.cwd(), ['p/default'], {
      baseline: { sha, directory: process.cwd() },
      enableOsv: true,
    })();
    expect(result.verdict).toBe('fail');
    expect(result.details).toContain('OSV');
  });

  it('fails closed if the archive omitted a pinned tree file', async () => {
    mocks.scan.mockResolvedValue(scan([]));
    mocks.exec.mockImplementation((_command: string, args: string[]) =>
      Promise.resolve({
        stdout: args.includes('--verify')
          ? `${sha}\n`
          : args.includes('ls-tree')
            ? `100644 blob ${'b'.repeat(40)}\texported-away.ts\0`
            : '',
        stderr: '',
      })
    );
    const result = await gate();
    expect(result.verdict).toBe('skip');
    expect(result.comparison?.complete).toBe(false);
    expect(mocks.scan).not.toHaveBeenCalled();
  });

  it('rejects a scan without explicit completeness evidence', async () => {
    const unmeasured = { ...scan([]) };
    delete unmeasured.coverageComplete;
    mocks.scan.mockResolvedValue(unmeasured);
    const result = await gate();
    expect(result.verdict).toBe('skip');
    expect(result.comparison?.complete).toBe(false);
  });

  it('blocks parser errors even when there are no readable findings', async () => {
    mocks.scan.mockResolvedValue(scan([], ['Skipped invalid result']));
    const result = await gate();
    expect(result.verdict).toBe('skip');
    expect(result.comparison?.complete).toBe(false);
  });
});
