/**
 * SARIF Parser Tests (#1682)
 *
 * @module security/sarif-parser.test
 */

import { describe, it, expect } from 'vitest';
import { parseSarif } from './sarif-parser.js';
import type { SecurityFinding } from './sarif-types.js';

/** Get first finding from SARIF parse result (asserts exists). */
function firstFinding(sarifJson: string): SecurityFinding {
  const result = parseSarif(sarifJson);
  expect(result.findings.length).toBeGreaterThan(0);
  return result.findings[0] as SecurityFinding;
}

/** Minimal valid SARIF with one finding. */
function makeSarif(overrides?: {
  level?: string;
  ruleId?: string;
  securitySeverity?: string;
  precision?: string;
  tags?: string[];
  file?: string;
  startLine?: number;
}): string {
  const o = {
    level: 'error',
    ruleId: 'javascript.lang.security.detect-eval',
    file: 'src/app.ts',
    startLine: 42,
    ...overrides,
  };
  const rule: Record<string, unknown> = {
    id: o.ruleId,
    shortDescription: { text: 'Use of eval detected' },
    properties: {
      precision: overrides?.precision ?? 'high',
      tags: overrides?.tags ?? ['CWE-95'],
    },
  };
  if (overrides?.securitySeverity !== undefined) {
    (rule.properties as Record<string, unknown>)['security-severity'] = overrides.securitySeverity;
  }
  return JSON.stringify({
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'semgrep', rules: [rule] } },
        results: [
          {
            ruleId: o.ruleId,
            level: o.level,
            message: { text: 'Avoid eval()' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: o.file },
                  region: {
                    startLine: o.startLine,
                    endLine: o.startLine + 2,
                    snippet: { text: 'eval(userInput)' },
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  });
}

describe('parseSarif', () => {
  it('parses a minimal SARIF file', () => {
    const result = parseSarif(makeSarif());
    expect(result.scanner).toBe('semgrep');
    expect(result.totalFindings).toBe(1);
    expect(result.findings).toHaveLength(1);
    expect(result.errors).toHaveLength(0);

    const f = firstFinding(makeSarif());
    expect(f.rule).toBe('javascript.lang.security.detect-eval');
    expect(f.file).toBe('src/app.ts');
    expect(f.startLine).toBe(42);
    expect(f.endLine).toBe(44);
    expect(f.message).toBe('Avoid eval()');
    expect(f.snippet).toBe('eval(userInput)');
    expect(f.cweIds).toEqual(['CWE-95']);
    expect(f.confidence).toBe(0.8);
  });

  it('maps SARIF levels to severity', () => {
    expect(firstFinding(makeSarif({ level: 'error' })).severity).toBe('high');
    expect(firstFinding(makeSarif({ level: 'warning' })).severity).toBe('medium');
    expect(firstFinding(makeSarif({ level: 'note' })).severity).toBe('low');
    expect(firstFinding(makeSarif({ level: 'none' })).severity).toBe('info');
  });

  it('prefers security-severity over level', () => {
    expect(firstFinding(makeSarif({ level: 'warning', securitySeverity: '9.5' })).severity).toBe(
      'critical'
    );
  });

  it('maps security-severity scores to severity tiers', () => {
    expect(firstFinding(makeSarif({ securitySeverity: '9.0' })).severity).toBe('critical');
    expect(firstFinding(makeSarif({ securitySeverity: '7.5' })).severity).toBe('high');
    expect(firstFinding(makeSarif({ securitySeverity: '5.0' })).severity).toBe('medium');
    expect(firstFinding(makeSarif({ securitySeverity: '2.0' })).severity).toBe('low');
  });

  it('maps precision to confidence', () => {
    expect(firstFinding(makeSarif({ precision: 'very-high' })).confidence).toBe(0.95);
    expect(firstFinding(makeSarif({ precision: 'high' })).confidence).toBe(0.8);
    expect(firstFinding(makeSarif({ precision: 'medium' })).confidence).toBe(0.6);
    expect(firstFinding(makeSarif({ precision: 'low' })).confidence).toBe(0.3);
  });

  it('extracts CWE IDs from tags', () => {
    expect(
      firstFinding(makeSarif({ tags: ['CWE-79', 'external/cwe/cwe-89', 'security'] })).cweIds
    ).toEqual(['CWE-79', 'CWE-89']);
  });

  it('handles invalid JSON gracefully', () => {
    const result = parseSarif('not json');
    expect(result.scanner).toBe('unknown');
    expect(result.totalFindings).toBe(0);
    expect(result.errors).toContain('Invalid JSON');
  });

  it('handles empty runs array', () => {
    const result = parseSarif(JSON.stringify({ version: '2.1.0', runs: [] }));
    expect(result.totalFindings).toBe(0);
    expect(result.errors).toContain('No runs in SARIF');
  });

  it('skips findings without location', () => {
    const sarif = JSON.stringify({
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'test', rules: [] } },
          results: [{ ruleId: 'test-rule', message: { text: 'test' } }],
        },
      ],
    });
    const result = parseSarif(sarif);
    expect(result.totalFindings).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('sorts findings by severity', () => {
    const sarif = JSON.stringify({
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'test', rules: [] } },
          results: [
            {
              ruleId: 'low-rule',
              level: 'note',
              message: { text: 'low' },
              locations: [
                {
                  physicalLocation: { artifactLocation: { uri: 'a.ts' }, region: { startLine: 1 } },
                },
              ],
            },
            {
              ruleId: 'high-rule',
              level: 'error',
              message: { text: 'high' },
              locations: [
                {
                  physicalLocation: { artifactLocation: { uri: 'b.ts' }, region: { startLine: 1 } },
                },
              ],
            },
          ],
        },
      ],
    });
    const result = parseSarif(sarif);
    expect(result.findings).toHaveLength(2);
    const [first, second] = result.findings as [SecurityFinding, SecurityFinding];
    expect(first.severity).toBe('high');
    expect(second.severity).toBe('low');
  });

  it('respects maxFindings cap', () => {
    const result = parseSarif(makeSarif(), 0);
    expect(result.totalFindings).toBe(1);
    expect(result.findings).toHaveLength(0);
  });
});
