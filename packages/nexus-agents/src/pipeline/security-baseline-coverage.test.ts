import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compareSecurityBaseline } from './security-baseline.js';
import type { SecurityScanInput } from '../mcp/tools/security-scan-types.js';
import type { ScannerParseDiagnostic, SarifParseResult } from '../security/sarif-types.js';

const mocks = vi.hoisted(() => ({ scan: vi.fn(), changedPath: '' }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) =>
      args[0] === mocks.changedPath ? Buffer.from('changed source') : actual.readFile(...args),
  };
});
vi.mock('../mcp/tools/security-scan.js', () => ({
  executeSecurityScan: mocks.scan,
  prepareSecurityScan: vi.fn().mockResolvedValue({ version: '1.128.1' }),
}));

describe('baseline parse coverage (#7238)', () => {
  const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const target = join(repository, 'packages/nexus-agents');
  const compare = (): ReturnType<typeof compareSecurityBaseline> =>
    compareSecurityBaseline(target, ['p/default'], {
      root: target,
      baseline: { sha, directory: repository },
    });
  const diagnostics = (
    input: SecurityScanInput,
    file = 'package.json',
    message = 'syntax'
  ): ScannerParseDiagnostic[] => [
    { file: join(input.target, file), kind: 'partial-parse', message },
  ];
  const scan = (parseDiagnostics: ReturnType<typeof diagnostics> = []): SarifParseResult => ({
    scanner: 'semgrep',
    scannerVersion: '1.128.1',
    coverageComplete: true,
    totalFindings: 0,
    findings: [],
    errors: [],
    parseDiagnostics,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scan.mockReset();
    mocks.changedPath = '';
  });

  it('reports identical untouched partial parses and the measured scanner version', async () => {
    mocks.scan.mockImplementation((input: SecurityScanInput) =>
      scan(
        diagnostics(
          input,
          'package.json',
          `Syntax error at line ${join(input.target, 'package.json')}:1:\n syntax`
        )
      )
    );
    expect(await compare()).toMatchObject({
      complete: true,
      introducedBlockingCount: 0,
      blockingFindings: [],
      unscannedCoverage: ['package.json'],
      scannerVersion: '1.128.1',
      errors: [],
    });
  });

  it('retains known unscanned coverage when a separate scanner error blocks measurement', async () => {
    mocks.scan.mockImplementation((input: SecurityScanInput) => ({
      ...scan(diagnostics(input)),
      coverageComplete: false,
      errors: ['scanner timeout: other.ts'],
    }));
    const result = await compare();
    expect(result.complete).toBe(false);
    expect(result.errors.join(';')).toContain('scanner timeout: other.ts');
    expect(result.unscannedCoverage).toEqual(['package.json']);
    expect(result.blockingFindings).toEqual([]);
  });

  it('blocks a newly unparsable file and names it in errors', async () => {
    mocks.scan.mockImplementation((input: SecurityScanInput) =>
      scan(input.target === target ? diagnostics(input) : [])
    );
    const result = await compare();
    expect(result.complete).toBe(false);
    expect(result.errors.join(';')).toContain('package.json');
    expect(result.blockingFindings).toEqual([]);
  });

  it('blocks changed diagnostic identities even for identical file bytes', async () => {
    mocks.scan.mockImplementation((input: SecurityScanInput) =>
      scan(diagnostics(input, 'package.json', input.target === target ? 'new syntax' : 'syntax'))
    );
    const result = await compare();
    expect(result.complete).toBe(false);
    expect(result.errors.join(';')).toContain('package.json');
  });

  it('blocks a change touching a file with stable partial parsing', async () => {
    mocks.changedPath = join(target, 'package.json');
    mocks.scan.mockImplementation((input: SecurityScanInput) => scan(diagnostics(input)));
    const result = await compare();
    expect(result.complete).toBe(false);
    expect(result.errors.join(';')).toContain('package.json');
  });

  it('does not label worktree findings as introductions if the base scan failed', async () => {
    mocks.scan.mockResolvedValueOnce({ error: 'scanner unavailable' }).mockResolvedValueOnce({
      ...scan(),
      totalFindings: 1,
      findings: [
        {
          id: 'eval',
          scanner: 'semgrep',
          rule: 'eval',
          severity: 'high',
          file: 'package.json',
          startLine: 1,
          snippet: '{',
          message: 'unsafe',
          cweIds: [],
          confidence: 1,
        },
      ],
    });
    expect(await compare()).toMatchObject({
      complete: false,
      introducedBlockingCount: null,
      blockingFindings: [],
    });
  });
});
