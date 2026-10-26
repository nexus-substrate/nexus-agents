/** System Review must preserve pnpm measurement and execution provenance. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSystemReview } from './system-review.js';
import { calculateHealthScore, createIssueBody, printPhase4 } from './system-review-helpers.js';
import { SYSTEM_REVIEW_CONSTANTS } from './system-review-types.js';
import { execSandboxed } from './sandbox-exec.js';

vi.mock('./sandbox-exec.js', () => ({
  safeExecSandboxed: vi.fn((command: string) => (command.includes('length') ? '0' : '[]')),
  execSandboxed: vi.fn(),
}));
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false), readFileSync: vi.fn() }));
vi.mock('../indexer/freshness-analyzer.js', () => ({
  analyzeFreshness: vi.fn(() => ({ documents: [], summary: {}, analyzedAt: '' })),
}));
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../core/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/index.js')>()),
  createLogger: () => ({ warn }),
}));

const ZERO = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const report = (counts = ZERO): string => JSON.stringify({ metadata: { vulnerabilities: counts } });
const exec = vi.mocked(execSandboxed);
function terminal(security: ReturnType<typeof runSystemReview>['security']): string {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  try {
    printPhase4(security);
  } finally {
    spy.mockRestore();
  }
  return lines.join('');
}

beforeEach(() => {
  vi.clearAllMocks();
  exec.mockReturnValue(report());
});

describe('System Review audit consumers', () => {
  it('uses the throwing sandbox API to retain execution metadata', () => {
    runSystemReview({ projectRoot: '/project' });
    expect(exec).toHaveBeenCalledWith('pnpm audit --json', { context: 'write', cwd: '/project' });
  });

  it('measures a complete zero report without a producer total', () => {
    const result = runSystemReview();
    expect(result.security).toMatchObject({
      totalVulns: 0,
      info: 0,
      critical: 0,
      parseError: false,
    });
    expect(terminal(result.security)).toContain('No vulnerabilities found');
    expect(createIssueBody(result)).not.toContain('Unmeasured');
    expect(result.actionItems.some((item) => item.includes('audit'))).toBe(false);
  });

  it('preserves critical-only findings from a normal exit 1 in every consumer', () => {
    const clean = runSystemReview();
    exec.mockImplementation(() => {
      throw Object.assign(new Error('audit findings'), {
        status: 1,
        signal: null,
        stdout: report({ ...ZERO, critical: 2 }),
      });
    });
    const result = runSystemReview();
    expect(result.security).toMatchObject({ totalVulns: 2, critical: 2, parseError: false });
    expect(terminal(result.security)).toContain('Critical: 2');
    expect(terminal(result.security)).not.toContain('No vulnerabilities found');
    expect(createIssueBody(result)).toContain('- Critical: 2');
    expect(result.actionItems).toContain('Address 2 critical-severity vulnerabilities');
    expect(calculateHealthScore(clean) - calculateHealthScore(result)).toBe(
      2 * SYSTEM_REVIEW_CONSTANTS.SECURITY_HIGH_PENALTY
    );
  });

  it('shows informational findings without claiming clean', () => {
    exec.mockReturnValue(report({ ...ZERO, info: 3 }));
    const result = runSystemReview();
    expect(result.security.totalVulns).toBe(3);
    expect(terminal(result.security)).toContain('Info: 3');
    expect(terminal(result.security)).not.toContain('No vulnerabilities found');
    expect(createIssueBody(result)).toContain('- Info: 3');
  });

  it.each([
    ['empty', ''],
    [
      'error JSON',
      JSON.stringify({ error: { code: 'REGISTRY_DOWN', message: 'UNTRUSTED_AUDIT_MARKER' } }),
    ],
    ['missing metadata', '{}'],
    ['partial counts', JSON.stringify({ metadata: { vulnerabilities: { high: 0 } } })],
    ['invalid JSON', 'UNTRUSTED_AUDIT_MARKER'],
  ])('retains %s as unmeasured through all consumers', (_name, output) => {
    const clean = runSystemReview();
    exec.mockReturnValue(output);
    const result = runSystemReview();
    expect(result.security.parseError).toBe(true);
    expect(terminal(result.security)).toContain('Unmeasured');
    expect(terminal(result.security)).not.toContain('No vulnerabilities found');
    expect(createIssueBody(result)).toContain('Unmeasured');
    expect(result.actionItems.some((item) => item.includes('verify pnpm audit manually'))).toBe(
      true
    );
    expect(calculateHealthScore(result)).toBeLessThan(calculateHealthScore(clean));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('UNTRUSTED_AUDIT_MARKER');
  });

  it.each([
    { status: 2, signal: null },
    { status: 1, signal: 'SIGTERM' },
    { status: 1, code: 'ETIMEDOUT' },
    { status: 1, code: 'ENOBUFS' },
  ])('rejects failed execution despite plausible captured JSON: %j', (failure) => {
    exec.mockImplementation(() => {
      throw Object.assign(new Error('audit execution failed'), {
        ...failure,
        stdout: report({ ...ZERO, critical: 2 }),
      });
    });
    const result = runSystemReview();
    expect(result.security.parseError).toBe(true);
    expect(terminal(result.security)).toContain('Unmeasured');
    expect(createIssueBody(result)).toContain('Unmeasured');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('metadata');
  });
});
