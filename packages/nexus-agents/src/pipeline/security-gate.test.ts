/**
 * Security Gate Tests (#1681, #1684)
 */

import { describe, it, expect, vi } from 'vitest';
import { checkSecurityScan } from './security-gate.js';

// Mock the security scan to avoid needing semgrep
vi.mock('../mcp/tools/security-scan.js', () => ({
  executeSecurityScan: vi.fn(),
}));

import { executeSecurityScan } from '../mcp/tools/security-scan.js';

const mockScan = vi.mocked(executeSecurityScan);

describe('checkSecurityScan', () => {
  it('passes when no blocking findings', async () => {
    mockScan.mockResolvedValue({
      scanner: 'semgrep',
      totalFindings: 3,
      findings: [
        {
          id: '1',
          scanner: 'semgrep',
          rule: 'r1',
          severity: 'low',
          message: 'test',
          file: 'a.ts',
          startLine: 1,
          cweIds: [],
          confidence: 0.5,
        },
        {
          id: '2',
          scanner: 'semgrep',
          rule: 'r2',
          severity: 'medium',
          message: 'test',
          file: 'b.ts',
          startLine: 2,
          cweIds: [],
          confidence: 0.5,
        },
      ],
      errors: [],
    });
    const check = checkSecurityScan('/tmp/test');
    const result = await check();
    expect(result.verdict).toBe('pass');
    expect(result.details).toContain('none blocking');
  });

  it('fails on critical findings', async () => {
    mockScan.mockResolvedValue({
      scanner: 'semgrep',
      totalFindings: 1,
      findings: [
        {
          id: '1',
          scanner: 'semgrep',
          rule: 'sql-injection',
          severity: 'critical',
          message: 'SQLi',
          file: 'db.ts',
          startLine: 42,
          cweIds: ['CWE-89'],
          confidence: 0.9,
        },
      ],
      errors: [],
    });
    const check = checkSecurityScan('/tmp/test');
    const result = await check();
    expect(result.verdict).toBe('fail');
    expect(result.details).toContain('confirmed blocking');
  });

  it('skips when scanner unavailable', async () => {
    mockScan.mockResolvedValue({ error: 'semgrep not installed' });
    const check = checkSecurityScan('/tmp/test');
    const result = await check();
    expect(result.verdict).toBe('skip');
  });

  // #2933 regression: triageFindings sorts by severity and may skip
  // parse-failed verdicts, so the returned list does not align positionally
  // with `findings.filter(BLOCKING)`. Pre-fix, getConfirmedBlockingFindings
  // indexed verdicts as `verdicts[i]` against blocking — a high-severity
  // finding whose triage parse failed would match against a downstream
  // verdict (often a low's `confirmed: false`) and be silently dropped.
  it('keeps a high-severity finding when its triage verdict fails to parse (#2933)', async () => {
    mockScan.mockResolvedValue({
      scanner: 'semgrep',
      totalFindings: 3,
      // Order matters — `blocking` iterates in original order, so blocking[0]
      // is high_a and blocking[1] is high_b. Pre-fix, high_b would be matched
      // against verdicts[1] = the low's confirmed:false → silently dropped.
      findings: [
        {
          id: 'high_a',
          scanner: 'semgrep',
          rule: 'sqli',
          severity: 'high',
          message: 'SQLi A',
          file: 'a.ts',
          startLine: 1,
          cweIds: ['CWE-89'],
          confidence: 0.9,
        },
        {
          id: 'high_b',
          scanner: 'semgrep',
          rule: 'sqli',
          severity: 'high',
          message: 'SQLi B',
          file: 'b.ts',
          startLine: 2,
          cweIds: ['CWE-89'],
          confidence: 0.9,
        },
        {
          id: 'low_1',
          scanner: 'semgrep',
          rule: 'r1',
          severity: 'low',
          message: 'low',
          file: 'c.ts',
          startLine: 3,
          cweIds: [],
          confidence: 0.4,
        },
      ],
      errors: [],
    });

    // triageFindings sorts ascending by severity → [high_a, high_b, low_1].
    // We confirm high_a, fail-to-parse high_b, and reject low_1.
    const triageFn = vi
      .fn<(p: string) => Promise<string>>()
      .mockResolvedValueOnce(
        JSON.stringify({
          confirmed: true,
          confidence: 0.9,
          reasoning: 'tainted user input',
          suggestedSeverity: 'high',
        })
      )
      .mockResolvedValueOnce('NOT JSON — parse fails, triageFinding returns null')
      .mockResolvedValueOnce(
        JSON.stringify({
          confirmed: false,
          confidence: 0.8,
          reasoning: 'false positive',
          suggestedSeverity: 'info',
        })
      );

    const check = checkSecurityScan('/tmp/test', ['p/default'], { triageFn, enableOsv: false });
    const result = await check();

    // BOTH highs must survive — high_a because triage confirmed it, high_b
    // because its verdict went missing (fail-safe). Pre-#2933 the count was 1.
    expect(result.verdict).toBe('fail');
    expect(result.details).toContain('2 confirmed blocking');
  });
});
