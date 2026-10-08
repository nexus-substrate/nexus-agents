import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { executeSecurityScan, prepareSecurityScan } from './security-scan.js';

const mockExec = vi.hoisted(() => vi.fn());
vi.mock('../../cli-adapters/exec-file-tree.js', () => ({ execFileTree: mockExec }));

function sarif(count = 150): string {
  return JSON.stringify({
    runs: [
      {
        tool: { driver: { name: 'semgrep', rules: [] } },
        results: Array.from({ length: count }, (_, index) => ({
          ruleId: 'R1',
          level: 'error',
          message: { text: 'unsafe' },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: 'a.ts' },
                region: { startLine: index + 1, snippet: { text: 'unsafe()' } },
              },
            },
          ],
        })),
      },
    ],
  });
}

function failureNotification(scenario: string): {
  descriptor: { id: string };
  level: string;
  message: { text: string };
} {
  const kind = scenario === 'matcher-only' ? 'Internal matching error' : 'Timeout';
  return scenario === 'matcher-only' || scenario === 'timeout-only'
    ? {
        descriptor: { id: kind },
        level: 'warning',
        message: { text: `${kind} when running R1 on src/app.ts:\n file-local failure` },
      }
    : {
        descriptor: { id: 'Syntax error' },
        level: 'warning',
        message: { text: 'Syntax error at line src/app.ts:7: unexpected token' },
      };
}

function expectRecoveredScan(
  result: Awaited<ReturnType<typeof executeSecurityScan>>,
  scenario: string
): void {
  expect('error' in result).toBe(false);
  if ('error' in result) return;
  expect(result.coverageComplete).toBe(true);
  if (scenario === 'parse-only') expect(result.parseDiagnostics).toHaveLength(1);
  else expect(result.scannerDiagnostics).toHaveLength(1);
  expect(result.scannerVersion).toBe('1.0.0');
}

describe('complete security scan configuration (#7238)', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-scan-complete-'));
    mockExec.mockReset();
    mockExec.mockImplementation((_binary: string, args: string[]) =>
      Promise.resolve({
        stdout: args.includes('--version') ? '1.0.0\n' : sarif(),
        stderr: '',
      })
    );
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it('returns complete results beyond the MCP display cap', async () => {
    const result = await executeSecurityScan(
      { target: directory, scanner: 'auto', rulesets: ['p/default'], maxFindings: 50 },
      { root: directory, completeResults: true }
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.findings).toHaveLength(150);
    expect(result.coverageComplete).toBe(true);
    expect(result.scannerVersion).toBe('1.0.0');
    expect(mockExec.mock.calls[0]?.[2]).toMatchObject({ cwd: '/' });
    expect(mockExec.mock.calls[1]?.[1]).not.toContain('--strict');
    expect(mockExec.mock.calls[1]?.[1]).toContain('--disable-nosem');
    expect(mockExec.mock.calls[1]?.[1]).toContain('--exclude=node_modules');
    expect(mockExec.mock.calls[1]?.[2]).toMatchObject({ cwd: '/' });
  });

  it('resolves relative local rules from the server cwd when scanning from a neutral cwd', async () => {
    await executeSecurityScan(
      { target: directory, scanner: 'auto', rulesets: ['rules.yaml'], maxFindings: 50 },
      { root: directory }
    );
    expect(mockExec.mock.calls[1]?.[1]).toContain(resolve('rules.yaml'));
    expect(mockExec.mock.calls[1]?.[1]).not.toContain(join(directory, 'rules.yaml'));
    expect(mockExec.mock.calls[1]?.[1]).toContain(directory);
  });

  it('uses the same trusted relative ruleset in ordinary and baseline scans', async () => {
    const trusted = await mkdtemp(join(process.cwd(), 'trusted-rules-'));
    try {
      const ruleset = relative(process.cwd(), join(trusted, 'rules.yaml'));
      const contents = 'rules: []\n# trusted server rules\n';
      await writeFile(resolve(ruleset), contents);
      await mkdir(join(directory, relative(process.cwd(), trusted)), { recursive: true });
      await writeFile(join(directory, ruleset), 'rules: []\n# target-controlled rules\n');
      await writeFile(join(directory, 'semgrep'), '#!/bin/sh\n', { mode: 0o700 });
      const input = {
        target: directory,
        scanner: 'auto' as const,
        rulesets: [ruleset],
        maxFindings: 50,
      };
      const result = await executeSecurityScan(input, { root: directory });
      expect('error' in result).toBe(false);
      expect(mockExec.mock.calls[1]?.[1]).toContain(resolve(ruleset));
      expect(mockExec.mock.calls[1]?.[1]).not.toContain(join(directory, ruleset));
      const prepared = await prepareSecurityScan([ruleset], {
        directory,
        env: { PATH: directory },
      });
      expect('error' in prepared).toBe(false);
      if ('error' in prepared) return;
      expect(await readFile(prepared.rulesets[0] ?? '', 'utf8')).toBe(contents);
    } finally {
      await rm(trusted, { recursive: true, force: true });
    }
  });

  it('freezes a registry configuration and scanner path once for both scans', async () => {
    const binary = join(directory, 'semgrep');
    await writeFile(binary, '#!/bin/sh\n', { mode: 0o700 });
    const rules = {
      rules: [
        {
          id: 'R1',
          pattern: 'unsafe()',
          languages: ['javascript'],
          severity: 'ERROR',
          message: 'unsafe',
        },
      ],
    };
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(rules))));
    vi.stubGlobal('fetch', fetchMock);
    const prepared = await prepareSecurityScan(['p/default'], {
      directory,
      env: { PATH: directory },
    });
    expect('error' in prepared).toBe(false);
    if ('error' in prepared) return;
    expect(prepared.binary).toBe(binary);
    expect(prepared.version).toBe('1.0.0');
    expect(prepared.flags).not.toContain('--strict');
    expect(prepared.flags).toContain('--x-ignore-semgrepignore-files');
    expect(prepared.flags.some((flag) => flag.startsWith('--x-semgrepignore-filename'))).toBe(
      false
    );
    expect(prepared.rulesets).toHaveLength(1);
    expect(JSON.parse(await readFile(prepared.rulesets[0] ?? '', 'utf8'))).toEqual(rules);
    for (let index = 0; index < 2; index++) {
      const result = await executeSecurityScan(
        { target: directory, scanner: 'auto', rulesets: ['p/default'], maxFindings: 50 },
        { root: directory, completeResults: true, preparedScan: prepared }
      );
      expect('error' in result).toBe(false);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const scans = mockExec.mock.calls.filter(
      (call) => !(call[1] as string[]).includes('--version')
    );
    expect(scans).toHaveLength(2);
    expect(scans[0]?.[0]).toBe(binary);
    expect(scans[0]?.[1]).toEqual(scans[1]?.[1]);
  });

  it('fails closed when the scanner version changes after preparation', async () => {
    const result = await executeSecurityScan(
      { target: directory, scanner: 'auto', rulesets: ['p/default'], maxFindings: 50 },
      {
        root: directory,
        preparedScan: { binary: '/pinned/semgrep', version: '2.0.0', rulesets: [], flags: [] },
      }
    );
    expect('error' in result && result.error).toMatch(/version.*changed/i);
  });

  it('fails closed on a rule download error', async () => {
    await writeFile(join(directory, 'semgrep'), '#!/bin/sh\n', { mode: 0o700 });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('unavailable', { status: 503 })))
    );
    const result = await prepareSecurityScan(['p/default'], {
      directory,
      env: { PATH: directory },
    });
    expect('error' in result && result.error).toContain('503');
  });

  it.each([
    'parse-only',
    'matcher-only',
    'timeout-only',
    'missing-parse',
    'mixed-errors',
    'failed-invocation',
    'missing-success',
    'wrong-exit',
  ])('classifies usable nonzero scanner output precisely: %s', async (scenario) => {
    const notification = failureNotification(scenario);
    const output = JSON.stringify({
      runs: [
        {
          tool: { driver: { name: 'semgrep', rules: [] } },
          results: [],
          invocations: [
            {
              ...(scenario === 'missing-success'
                ? {}
                : { executionSuccessful: scenario !== 'failed-invocation' }),
              toolExecutionNotifications:
                scenario === 'missing-parse'
                  ? []
                  : [
                      notification,
                      ...(scenario === 'mixed-errors'
                        ? [{ level: 'error', message: { text: 'bad ruleset' } }]
                        : []),
                    ],
            },
          ],
        },
      ],
    });
    mockExec.mockImplementation((_binary: string, args: string[]) => {
      if (args.includes('--version')) return Promise.resolve({ stdout: '1.0.0', stderr: '' });
      return Promise.reject(
        Object.assign(new Error('Command failed: semgrep'), {
          code: scenario === 'wrong-exit' ? 2 : 3,
          stdout: output,
          stderr: '',
        })
      );
    });
    const result = await executeSecurityScan(
      { target: directory, scanner: 'auto', rulesets: ['p/default'], maxFindings: 50 },
      { root: directory, completeResults: true }
    );
    if (['parse-only', 'matcher-only', 'timeout-only'].includes(scenario)) {
      expectRecoveredScan(result, scenario);
    } else {
      expect('error' in result).toBe(true);
      if (!('error' in result)) return;
      expect(result.error).toContain(scenario === 'wrong-exit' ? 'exit 2' : 'exit 3');
      if (scenario !== 'missing-parse') expect(result.error).toContain('src/app.ts');
      if (scenario === 'mixed-errors') expect(result.error).toContain('bad ruleset');
    }
  });

  it('retains the actionable diagnostic before removing known stderr noise', async () => {
    mockExec.mockImplementation((_binary: string, args: string[]) => {
      if (args.includes('--version')) return Promise.resolve({ stdout: '1.0.0', stderr: '' });
      return Promise.reject(
        Object.assign(
          new Error(
            [
              'Command failed: semgrep',
              'Syntax error at line src/app.ts:7: unexpected token',
              '/usr/lib/opentelemetry/instrumentation/dependencies.py:4: UserWarning: pkg_resources is deprecated',
              '  from pkg_resources import (',
              'pyenv: cannot rehash: ' + 'shim '.repeat(200),
            ].join('\n')
          ),
          { code: 3 }
        )
      );
    });
    const result = await executeSecurityScan(
      { target: directory, scanner: 'auto', rulesets: ['p/default'], maxFindings: 50 },
      { root: directory, completeResults: true }
    );
    expect('error' in result && result.error).toContain('src/app.ts:7');
    expect('error' in result && result.error).not.toContain('opentelemetry');
    expect('error' in result && result.error).not.toContain('pyenv');
  });

  it('keeps every affected parse file visible when the diagnostic is truncated', async () => {
    mockExec.mockImplementation((_binary: string, args: string[]) => {
      if (args.includes('--version')) return Promise.resolve({ stdout: '1.0.0', stderr: '' });
      return Promise.reject(
        Object.assign(
          new Error(
            [
              'Command failed: semgrep',
              'Syntax error at line src/first.ts:7: unexpected token',
              'x'.repeat(600),
              'Syntax error at line src/last.ts:8: unexpected token',
            ].join('\n')
          ),
          { code: 3 }
        )
      );
    });
    const result = await executeSecurityScan(
      { target: directory, scanner: 'auto', rulesets: ['p/default'], maxFindings: 50 },
      { root: directory, completeResults: true }
    );
    expect('error' in result && result.error).toContain('src/first.ts');
    expect('error' in result && result.error).toContain('src/last.ts');
  });

  it('reports a scanner exit code and diagnostic instead of a long command prefix', async () => {
    mockExec.mockImplementation((_binary: string, args: string[]) => {
      if (args.includes('--version')) return Promise.resolve({ stdout: '1.0.0', stderr: '' });
      return Promise.reject(
        Object.assign(
          new Error(`Command failed: ${'flags '.repeat(100)}\nParsing error in src/app.ts`),
          { code: 3 }
        )
      );
    });
    const result = await executeSecurityScan(
      { target: directory, scanner: 'auto', rulesets: ['p/default'], maxFindings: 50 },
      { root: directory, completeResults: true }
    );
    expect('error' in result && result.error).toContain('exit 3');
    expect('error' in result && result.error).toContain('Parsing error in src/app.ts');
  });
});
