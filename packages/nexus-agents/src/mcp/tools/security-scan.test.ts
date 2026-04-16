/**
 * Security Scan Tool Tests (#1683)
 *
 * @module mcp/tools/security-scan.test
 */

import { describe, it, expect, vi } from 'vitest';
import { executeSecurityScan } from './security-scan.js';
import { SecurityScanInputSchema } from './security-scan-types.js';
import type { SecurityScanInput } from './security-scan-types.js';

// Mock child_process to avoid needing semgrep installed
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: vi.fn().mockReturnValue(vi.fn().mockRejectedValue(new Error('not found'))),
}));

describe('executeSecurityScan', () => {
  it('returns error when semgrep is not available', async () => {
    const input: SecurityScanInput = {
      target: '/tmp/test-project',
      scanner: 'auto',
      rulesets: ['p/default'],
      maxFindings: 50,
    };

    const result = await executeSecurityScan(input);
    expect('error' in result).toBe(true);
  });

  it('validates target path', async () => {
    const input: SecurityScanInput = {
      target: '/valid/path',
      scanner: 'auto',
      rulesets: ['p/default'],
      maxFindings: 10,
    };

    const result = await executeSecurityScan(input);
    expect('error' in result).toBe(true);
  });

  it('rejects target outside cwd (path traversal guard #1913)', async () => {
    // An absolute path outside cwd must be rejected, not silently accepted.
    // Prior check `resolved.startsWith(path.resolve('/'))` was a no-op.
    const input: SecurityScanInput = {
      target: '/etc/passwd',
      scanner: 'auto',
      rulesets: ['p/default'],
      maxFindings: 10,
    };
    const result = await executeSecurityScan(input);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/Invalid target path/);
    }
  });

  it('rejects ../ traversal', async () => {
    const input: SecurityScanInput = {
      target: '../../../etc',
      scanner: 'auto',
      rulesets: ['p/default'],
      maxFindings: 10,
    };
    const result = await executeSecurityScan(input);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/Invalid target path/);
    }
  });
});

describe('SecurityScanInputSchema', () => {
  it('accepts valid input with defaults', () => {
    const parsed = SecurityScanInputSchema.parse({ target: '/tmp/project' });
    expect(parsed.scanner).toBe('auto');
    expect(parsed.rulesets).toEqual(['p/default']);
    expect(parsed.maxFindings).toBe(50);
  });

  it('rejects empty target', () => {
    expect(() => SecurityScanInputSchema.parse({ target: '' })).toThrow();
  });

  it('accepts custom rulesets', () => {
    const parsed = SecurityScanInputSchema.parse({
      target: '/tmp/project',
      rulesets: ['p/typescript', 'p/owasp-top-ten'],
      maxFindings: 100,
    });
    expect(parsed.rulesets).toEqual(['p/typescript', 'p/owasp-top-ten']);
    expect(parsed.maxFindings).toBe(100);
  });
});
