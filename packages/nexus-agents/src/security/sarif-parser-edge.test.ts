/**
 * SARIF Parser — Adversarial & Edge Cases
 *
 * Surfaces parser bugs on hostile or malformed input:
 * - Prototype pollution attempts
 * - Multiple runs
 * - Missing/null fields
 * - Unicode + control characters
 * - Extreme sizes
 * - Snippet truncation
 *
 * Run: pnpm vitest run src/security/sarif-parser-edge.test.ts
 */

import { describe, it, expect } from 'vitest';
import { parseSarif } from './sarif-parser.js';

function sarif(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'semgrep', rules: [] } },
        results: [],
        ...overrides,
      },
    ],
  });
}

describe('SARIF Parser — Adversarial Inputs', () => {
  it('rejects prototype pollution via __proto__ in JSON', () => {
    const malicious = '{"__proto__":{"polluted":true},"version":"2.1.0","runs":[]}';
    const result = parseSarif(malicious);
    // Parser should not crash; ensure no prototype leakage
    expect(result.totalFindings).toBe(0);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('handles deeply nested JSON without stack overflow', () => {
    let nested: unknown = { version: '2.1.0', runs: [] };
    for (let i = 0; i < 100; i++) nested = { nested };
    const result = parseSarif(JSON.stringify(nested));
    // Should not crash; returns empty since runs is not at top level
    expect(result.findings).toEqual([]);
  });

  it('handles empty string input', () => {
    const result = parseSarif('');
    expect(result.errors).toContain('Invalid JSON');
  });

  it('handles null input as JSON literal', () => {
    const result = parseSarif('null');
    expect(result.totalFindings).toBe(0);
  });

  it('handles array at top level (not an object)', () => {
    const result = parseSarif('[]');
    expect(result.totalFindings).toBe(0);
  });

  it('handles only the first run when multiple runs exist', () => {
    const multi = JSON.stringify({
      version: '2.1.0',
      runs: [
        { tool: { driver: { name: 'semgrep' } }, results: [{ ruleId: 'r1' }] },
        { tool: { driver: { name: 'codeql' } }, results: [{ ruleId: 'r2' }] },
      ],
    });
    const result = parseSarif(multi);
    expect(result.scanner).toBe('semgrep');
  });

  it('survives results with null fields', () => {
    const result = parseSarif(
      sarif({
        results: [{ ruleId: null, level: null, message: null, locations: null }] as unknown,
      })
    );
    // Parser should skip or normalize — must not crash
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it('preserves unicode in message and snippet', () => {
    const result = parseSarif(
      sarif({
        tool: { driver: { name: 'semgrep', rules: [{ id: 'R1' }] } },
        results: [
          {
            ruleId: 'R1',
            level: 'error',
            message: { text: '日本語 — café — 🚀' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'src/中文.ts' },
                  region: { startLine: 1, snippet: { text: 'const x = "🔥";' } },
                },
              },
            ],
          },
        ],
      })
    );
    expect(result.findings[0]?.message).toContain('日本語');
    expect(result.findings[0]?.file).toBe('src/中文.ts');
  });

  it('truncates snippets longer than 500 chars', () => {
    const longSnippet = 'x'.repeat(5000);
    const result = parseSarif(
      sarif({
        tool: { driver: { name: 'semgrep', rules: [{ id: 'R1' }] } },
        results: [
          {
            ruleId: 'R1',
            level: 'error',
            message: { text: 'bad' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'a.ts' },
                  region: { startLine: 1, snippet: { text: longSnippet } },
                },
              },
            ],
          },
        ],
      })
    );
    const snippet = result.findings[0]?.snippet ?? '';
    expect(snippet.length).toBeLessThanOrEqual(500);
  });

  it('respects maxFindings even with very large result arrays', () => {
    const results = Array.from({ length: 500 }, (_, i) => ({
      ruleId: `R${String(i)}`,
      level: 'warning',
      message: { text: `finding ${String(i)}` },
      locations: [
        { physicalLocation: { artifactLocation: { uri: 'a.ts' }, region: { startLine: 1 } } },
      ],
    }));
    const result = parseSarif(
      sarif({
        tool: {
          driver: {
            name: 'semgrep',
            rules: Array.from({ length: 500 }, (_, i) => ({ id: `R${String(i)}` })),
          },
        },
        results,
      }),
      50
    );
    expect(result.findings.length).toBe(50);
    expect(result.totalFindings).toBe(500);
  });

  it('handles extreme line numbers without overflow', () => {
    const result = parseSarif(
      sarif({
        tool: { driver: { name: 'semgrep', rules: [{ id: 'R1' }] } },
        results: [
          {
            ruleId: 'R1',
            level: 'error',
            message: { text: 'x' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'a.ts' },
                  region: { startLine: Number.MAX_SAFE_INTEGER },
                },
              },
            ],
          },
        ],
      })
    );
    expect(result.findings[0]?.startLine).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('defaults scanner name to unknown when driver is absent', () => {
    const result = parseSarif(
      JSON.stringify({
        version: '2.1.0',
        runs: [{ tool: {}, results: [] }],
      })
    );
    expect(result.scanner).toBe('unknown');
  });

  it('treats missing version as parseable (SARIF flexibility)', () => {
    const result = parseSarif(JSON.stringify({ runs: [] }));
    expect(result.errors).toContain('No runs in SARIF');
  });
});
