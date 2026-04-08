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
    expect(result.details).toContain('sql-injection');
  });

  it('skips when scanner unavailable', async () => {
    mockScan.mockResolvedValue({ error: 'semgrep not installed' });
    const check = checkSecurityScan('/tmp/test');
    const result = await check();
    expect(result.verdict).toBe('skip');
  });
});
