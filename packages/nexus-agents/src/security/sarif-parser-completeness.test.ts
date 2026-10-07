import { describe, expect, it } from 'vitest';
import { parseSarif } from './sarif-parser.js';

function finding(line: number): Record<string, unknown> {
  return {
    ruleId: 'R1',
    level: 'error',
    message: { text: 'unsafe' },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: 'a.ts' },
          region: { startLine: line, snippet: { text: 'unsafe()' } },
        },
      },
    ],
  };
}

function run(results: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { tool: { driver: { name: 'semgrep', rules: [{ id: 'R1' }] } }, results, ...extra };
}

describe('SARIF coverage completeness (#7238)', () => {
  it.each([{}, { results: [] }, { tool: { driver: { name: 'semgrep' } } }])(
    'rejects a run without measured scanner or results: %j',
    (incomplete) => {
      const result = parseSarif(JSON.stringify({ runs: [incomplete] }));
      expect(result.coverageComplete).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  );
  it('marks an explicit findings cap as incomplete', () => {
    const result = parseSarif(JSON.stringify({ runs: [run([finding(1), finding(2)])] }), 1);
    expect(result.coverageComplete).toBe(false);
    expect(result.errors.join(' ')).toMatch(/truncat/i);
  });

  it('supports complete results beyond the previous parser cap', () => {
    const result = parseSarif(
      JSON.stringify({
        runs: [run(Array.from({ length: 250 }, (_, i) => finding(i + 1)))],
      }),
      Infinity
    );
    expect(result.findings).toHaveLength(250);
    expect(result.coverageComplete).toBe(true);
  });

  it('collects every run rather than silently omitting later findings', () => {
    const result = parseSarif(JSON.stringify({ runs: [run([]), run([finding(3)])] }), Infinity);
    expect(result.findings).toHaveLength(1);
    expect(result.coverageComplete).toBe(true);
  });

  it.each([
    { executionSuccessful: false },
    {
      executionSuccessful: true,
      toolExecutionNotifications: [{ level: 'error', message: { text: 'parse failed' } }],
    },
    {
      executionSuccessful: true,
      toolExecutionNotifications: [{ level: 'warning', message: { text: 'partial scan' } }],
    },
    {
      executionSuccessful: true,
      toolConfigurationNotifications: [{ level: 'error', message: { text: 'bad rule' } }],
    },
  ])('marks scanner invocation failures as incomplete: %j', (invocation) => {
    const result = parseSarif(JSON.stringify({ runs: [run([], { invocations: [invocation] })] }));
    expect(result.coverageComplete).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it.each(['warning', 'note', 'none'])(
    'collects attributable Semgrep parse diagnostics at level %s separately from scanner failures',
    (level) => {
      const message = 'Syntax error at line src/valid.ts:44:\n `readonly import` was unexpected';
      const result = parseSarif(
        JSON.stringify({
          runs: [
            run([], {
              invocations: [
                {
                  executionSuccessful: true,
                  toolExecutionNotifications: [
                    {
                      descriptor: { id: 'Syntax error' },
                      level,
                      message: { text: message },
                    },
                  ],
                },
              ],
            }),
          ],
        })
      );
      expect(result.coverageComplete).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.parseDiagnostics).toEqual([{ file: 'src/valid.ts', kind: 'parse', message }]);
    }
  );

  it('collects Semgrep Other syntax error notifications as attributable parse diagnostics', () => {
    const message =
      'Other syntax error at line src/circuit-breaker-types.ts:1:\n Parsing_error.Ast_builder_error (wrong type assert expr, src/circuit-breaker-types.ts:143:49 "<")';
    const result = parseSarif(
      JSON.stringify({
        runs: [
          run([], {
            invocations: [
              {
                executionSuccessful: true,
                toolExecutionNotifications: [
                  {
                    descriptor: { id: 'Other syntax error' },
                    level: 'warning',
                    message: { text: message },
                  },
                ],
              },
            ],
          }),
        ],
      })
    );
    expect(result.coverageComplete).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.parseDiagnostics).toEqual([
      { file: 'src/circuit-breaker-types.ts', kind: 'parse', message },
    ]);
  });

  it.each([
    { descriptor: { id: 'Syntax error' }, message: { text: 'unattributable error' } },
    { descriptor: { id: 'Timeout' }, message: { text: 'Syntax error at line src/valid.ts:44:' } },
  ])(
    'does not classify an unknown or unattributable notification as parse coverage: %j',
    (notification) => {
      const result = parseSarif(
        JSON.stringify({
          runs: [
            run([], {
              invocations: [
                {
                  executionSuccessful: true,
                  toolExecutionNotifications: [{ ...notification, level: 'warning' }],
                },
              ],
            }),
          ],
        })
      );
      expect(result.coverageComplete).toBe(false);
      expect(result.parseDiagnostics ?? []).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  );

  it('does not excuse a failed scanner invocation or non-parse error beside parse coverage', () => {
    const result = parseSarif(
      JSON.stringify({
        runs: [
          run([], {
            invocations: [
              {
                executionSuccessful: false,
                toolExecutionNotifications: [
                  {
                    descriptor: { id: 'Syntax error' },
                    level: 'warning',
                    message: { text: 'Syntax error at line src/a.ts:1:' },
                  },
                  {
                    descriptor: { id: 'Timeout' },
                    level: 'warning',
                    message: { text: 'analysis timed out' },
                  },
                ],
              },
            ],
          }),
        ],
      })
    );
    expect(result.coverageComplete).toBe(false);
    expect(result.parseDiagnostics).toHaveLength(1);
    expect(result.errors).toContain('Scanner invocation failed');
    expect(result.errors.join(' ')).toContain('timed out');
  });

  it('does not call a malformed result complete', () => {
    const result = parseSarif(JSON.stringify({ runs: [run([null])] }));
    expect(result.coverageComplete).toBe(false);
  });

  it('preserves an explicit scanner snippet truncation marker', () => {
    const raw = finding(1);
    raw.locations = [
      {
        physicalLocation: {
          artifactLocation: { uri: 'a.ts' },
          region: { startLine: 1, snippet: { text: 'unsafe...', truncated: true } },
        },
      },
    ];
    const result = parseSarif(JSON.stringify({ runs: [run([raw])] }));
    expect(result.findings[0]?.snippetTruncated).toBe(true);
  });

  it.each([{ truncated: 'true' }, { truncated: null }, { truncated: [] }, { truncated: {} }])(
    'treats malformed truncation marker %j as ambiguous',
    ({ truncated }) => {
      const raw = finding(1);
      raw.locations = [
        {
          physicalLocation: {
            artifactLocation: { uri: 'a.ts' },
            region: { startLine: 1, snippet: { text: 'unsafe()', truncated } },
          },
        },
      ];
      const result = parseSarif(JSON.stringify({ runs: [run([raw])] }));
      expect(result.findings[0]?.snippetTruncated).toBe(true);
    }
  );
});
