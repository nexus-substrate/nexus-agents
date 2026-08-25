/**
 * Tests for system-review CLI
 *
 * (Source: Issue #249 - CLI test coverage)
 */

/* eslint-disable @typescript-eslint/no-unsafe-call */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runSystemReview,
  systemReviewCommand,
  printSystemReviewResult,
  type SystemReviewResult,
} from './system-review.js';

// Mock sandbox-exec module
vi.mock('./sandbox-exec.js', () => ({
  safeExecSandboxed: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock freshness-analyzer
vi.mock('../indexer/freshness-analyzer.js', () => ({
  analyzeFreshness: vi.fn(),
}));

import { safeExecSandboxed } from './sandbox-exec.js';
import * as fs from 'node:fs';
import { analyzeFreshness } from '../indexer/freshness-analyzer.js';

const mockExecSync = vi.mocked(safeExecSandboxed);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockAnalyzeFreshness = vi.mocked(analyzeFreshness);

describe('system-review', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutWriteSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Default mocks. CLAUDE.md must exist for #2760's wrong-CWD precondition
    // to pass; phase-1 file existence is overridden per-test via additional
    // `mockReturnValueOnce`/`mockImplementation` calls.
    mockExistsSync.mockImplementation((p: fs.PathLike) => String(p).endsWith('CLAUDE.md'));
    mockExecSync.mockReturnValue('');
    mockAnalyzeFreshness.mockReturnValue({
      documents: [],
      summary: { total: 0, fresh: 0, warning: 0, stale: 0, unknown: 0 },
      analyzedAt: '2026-01-14T10:00:00Z',
    });
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  describe('runSystemReview', () => {
    it('should run all 5 phases', () => {
      // Phase 1: techniques.yaml exists
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('techniques.yaml')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(
        'status: implemented\nstatus: implemented\nstatus: planned\nstatus: not-started'
      );

      // Phase 3: GitHub issues
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string') {
          if (cmd.includes('gh issue list')) return '[]';
          if (cmd.includes('pnpm audit')) return '{}';
          if (cmd.includes('pnpm typecheck')) return '';
          if (cmd.includes('pnpm lint')) return '';
        }
        return '';
      });

      const result = runSystemReview();

      expect(result.techniques).toBeDefined();
      expect(result.docs).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(result.security).toBeDefined();
      expect(result.quality).toBeDefined();
      expect(result.actionItems).toBeDefined();
    });

    it('should count techniques correctly', () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('techniques.yaml')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(
        'status: implemented\nstatus: implemented\nstatus: implemented\n' +
          'status: planned\nstatus: not-started\nstatus: rejected'
      );

      const result = runSystemReview();

      expect(result.techniques.implemented).toBe(3);
      expect(result.techniques.planned).toBe(1);
      expect(result.techniques.notStarted).toBe(1);
      expect(result.techniques.rejected).toBe(1);
    });

    it('should handle missing techniques.yaml', () => {
      mockExistsSync.mockReturnValue(false);

      const result = runSystemReview();

      expect(result.techniques.implemented).toBe(0);
      expect(result.techniques.planned).toBe(0);
    });

    it('should use freshness analyzer for docs', () => {
      mockAnalyzeFreshness.mockReturnValue({
        documents: [
          {
            path: 'ARCHITECTURE.md',
            lastModified: '2026-01-09T10:00:00Z',
            lastModifiedRelative: '5 days ago',
            daysSinceModified: 5,
            status: 'fresh',
            dependencies: ['src/core/index.ts'],
            newerDependencies: [],
          },
          {
            path: 'README.md',
            lastModified: '2025-11-30T10:00:00Z',
            lastModifiedRelative: '45 days ago',
            daysSinceModified: 45,
            status: 'stale',
            dependencies: [],
            newerDependencies: ['src/new-feature.ts'],
          },
        ],
        summary: { total: 2, fresh: 1, warning: 0, stale: 1, unknown: 0 },
        analyzedAt: '2026-01-14T10:00:00Z',
      });

      const result = runSystemReview();

      expect(result.docs).toHaveLength(2);
      expect(result.docs[0]?.status).toBe('current');
      expect(result.docs[1]?.status).toBe('stale');
    });

    it('should parse GitHub issues', () => {
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string') {
          if (cmd.includes('--state open --json number'))
            return JSON.stringify([{ number: 1 }, { number: 2 }, { number: 3 }]);
          if (cmd.includes('--label epic')) return JSON.stringify([{ number: 1 }]);
          if (cmd.includes('--label bug')) return JSON.stringify([{ number: 2 }]);
          if (cmd.includes('jq')) return '1';
        }
        return '[]';
      });

      const result = runSystemReview();

      expect(result.issues.openCount).toBe(3);
      expect(result.issues.byLabel['epic']).toBe(1);
    });

    it('should parse security audit', () => {
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('pnpm audit')) {
          return JSON.stringify({
            metadata: {
              vulnerabilities: {
                total: 5,
                high: 1,
                moderate: 2,
                low: 2,
              },
            },
          });
        }
        return '';
      });

      const result = runSystemReview();

      expect(result.security.totalVulns).toBe(5);
      expect(result.security.high).toBe(1);
      expect(result.security.moderate).toBe(2);
    });

    it('should check code quality', () => {
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string') {
          if (cmd.includes('pnpm typecheck')) return 'All checks passed';
          if (cmd.includes('pnpm lint')) return 'No issues found';
        }
        return '';
      });

      const result = runSystemReview();

      expect(result.quality.typecheckPass).toBe(true);
      expect(result.quality.lintPass).toBe(true);
    });

    it('should detect typecheck errors', () => {
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('pnpm typecheck')) {
          return 'error TS2345: Argument of type...';
        }
        return '';
      });

      const result = runSystemReview();

      expect(result.quality.typecheckPass).toBe(false);
    });

    it('should read coverage from file', () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('coverage-summary.json')) return true;
        return false;
      });
      mockReadFileSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('coverage-summary.json')) {
          return JSON.stringify({
            total: { lines: { pct: 85.5 } },
          });
        }
        return '';
      });

      const result = runSystemReview();

      expect(result.quality.coveragePercent).toBe(85.5);
    });

    it('should generate action items', () => {
      mockAnalyzeFreshness.mockReturnValue({
        documents: [
          {
            path: 'OLD_DOC.md',
            lastModified: '2025-10-06T10:00:00Z',
            lastModifiedRelative: '100 days ago',
            daysSinceModified: 100,
            status: 'stale',
            dependencies: [],
            newerDependencies: [],
          },
        ],
        summary: { total: 1, fresh: 0, warning: 0, stale: 1, unknown: 0 },
        analyzedAt: '2026-01-14T10:00:00Z',
      });
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string') {
          if (cmd.includes('jq')) return '5';
          if (cmd.includes('pnpm typecheck')) return 'error TS2345';
        }
        return '[]';
      });

      const result = runSystemReview();

      expect(result.actionItems.length).toBeGreaterThan(0);
      expect(result.actionItems.some((i) => i.includes('OLD_DOC.md'))).toBe(true);
    });

    it('should apply fixes when requested', () => {
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string') {
          if (cmd.includes('pnpm lint:fix')) return 'Fixed 5 issues';
          if (cmd.includes('pnpm lint') && !cmd.includes(':fix')) return 'error: something';
        }
        return '';
      });

      const result = runSystemReview({ fix: true });

      expect(result.fixesApplied.length).toBeGreaterThan(0);
    });
  });

  describe('printSystemReviewResult', () => {
    it('should print all phases', () => {
      const result: SystemReviewResult = {
        timestamp: new Date('2026-01-10T12:00:00Z'),
        techniques: { implemented: 10, planned: 5, notStarted: 2, rejected: 1 },
        docs: [
          {
            file: 'README.md',
            daysSinceUpdate: 10,
            status: 'current',
            dependencies: [],
            newerDependencies: [],
          },
        ],
        issues: { openCount: 15, staleCount: 2, byLabel: { bug: 3, enhancement: 5 } },
        security: { totalVulns: 0, high: 0, moderate: 0, low: 0 },
        quality: { typecheckPass: true, lintPass: true, coveragePercent: 85 },
        actionItems: ['Review stale issues'],
        fixesApplied: [],
      };

      printSystemReviewResult(result);

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Phase 1');
      expect(output).toContain('Phase 2');
      expect(output).toContain('Phase 3');
      expect(output).toContain('Phase 4');
      expect(output).toContain('Phase 5');
      expect(output).toContain('Health Score');
    });

    it('should show action items', () => {
      const result: SystemReviewResult = {
        timestamp: new Date(),
        techniques: { implemented: 0, planned: 0, notStarted: 0, rejected: 0 },
        docs: [],
        issues: { openCount: 0, staleCount: 0, byLabel: {} },
        security: { totalVulns: 0, high: 0, moderate: 0, low: 0 },
        quality: { typecheckPass: true, lintPass: true, coveragePercent: 90 },
        actionItems: ['Fix security issue', 'Update docs'],
        fixesApplied: [],
      };

      printSystemReviewResult(result);

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Action Items');
      expect(output).toContain('Fix security issue');
    });

    it('should show fixes applied', () => {
      const result: SystemReviewResult = {
        timestamp: new Date(),
        techniques: { implemented: 0, planned: 0, notStarted: 0, rejected: 0 },
        docs: [],
        issues: { openCount: 0, staleCount: 0, byLabel: {} },
        security: { totalVulns: 0, high: 0, moderate: 0, low: 0 },
        quality: { typecheckPass: true, lintPass: true, coveragePercent: 90 },
        actionItems: [],
        fixesApplied: ['Auto-fixed ESLint issues'],
      };

      printSystemReviewResult(result);

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Fixes Applied');
    });
  });

  describe('systemReviewCommand', () => {
    it('should return 0 for healthy codebase', () => {
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string') {
          if (cmd.includes('pnpm typecheck')) return 'All checks passed';
          if (cmd.includes('pnpm lint')) return 'No issues found';
          if (cmd.includes('pnpm audit'))
            return JSON.stringify({ metadata: { vulnerabilities: {} } });
          // jq command returns stale count as number
          if (cmd.includes('jq')) return '0';
          if (cmd.includes('gh issue list')) return '[]';
        }
        return '[]';
      });

      const exitCode = systemReviewCommand();

      expect(exitCode).toBe(0);
    });

    it('should return 1 for unhealthy codebase', () => {
      // Set up conditions that lower health score below 60
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string') {
          if (cmd.includes('pnpm typecheck')) return 'error TS2345';
          if (cmd.includes('pnpm lint')) return 'error: lint fail';
          if (cmd.includes('pnpm audit')) {
            return JSON.stringify({
              metadata: {
                vulnerabilities: { total: 5, high: 3, moderate: 0, low: 0 },
              },
            });
          }
        }
        return '[]';
      });

      const exitCode = systemReviewCommand();

      // High vulns (-60) + typecheck fail (-15) + lint fail (-15) = 10/100
      expect(exitCode).toBe(1);
    });

    it('should create GitHub issue when requested', () => {
      let issueCreated = false;
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string') {
          if (cmd.includes('gh issue create')) {
            issueCreated = true;
            return 'https://github.com/owner/repo/issues/123';
          }
        }
        return '[]';
      });

      systemReviewCommand({ createIssue: true });

      expect(issueCreated).toBe(true);
      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Issue created');
    });

    it('should handle issue creation failure', () => {
      // safeExecSandboxed returns null on failure (catches errors internally)
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('gh issue create')) {
          return null; // Simulate failure - safeExecSandboxed returns null on error
        }
        return '[]';
      });

      systemReviewCommand({ createIssue: true });

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Failed to create issue');
    });

    // #2760: pre-fix `system-review` from /tmp produced "Health Score: 35/100"
    // (every doc unknown → mapped to stale → 7× DOC_STALE_PENALTY) and exited
    // 0 anyway. Now: detect "CLAUDE.md missing from projectRoot" up-front and
    // return 1 with a clear message before running any phases. Same shape as
    // the closed #2716 + #2759 fixes.
    it('returns 1 with wrong-CWD message when CLAUDE.md missing from projectRoot', () => {
      // Override beforeEach default: pretend no file exists, including CLAUDE.md
      mockExistsSync.mockReturnValue(false);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const exitCode = systemReviewCommand({ projectRoot: '/tmp' });

      expect(exitCode).toBe(1);
      const stderr = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(stderr).toContain('system-review must run from the nexus-agents source repo');
      expect(stderr).toContain('/tmp/CLAUDE.md');
      // Phase output should NOT have been printed — the precondition aborts early
      const stdout = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(stdout).not.toContain('Phase 1: Registry Reconciliation');
      stderrSpy.mockRestore();
    });
  });

  describe('health score calculation', () => {
    it('should penalize stale docs', () => {
      mockAnalyzeFreshness.mockReturnValue({
        documents: [
          {
            path: 'doc1.md',
            lastModified: '2025-10-06T10:00:00Z',
            lastModifiedRelative: '100 days ago',
            daysSinceModified: 100,
            status: 'stale',
            dependencies: [],
            newerDependencies: [],
          },
          {
            path: 'doc2.md',
            lastModified: '2025-10-06T10:00:00Z',
            lastModifiedRelative: '100 days ago',
            daysSinceModified: 100,
            status: 'stale',
            dependencies: [],
            newerDependencies: [],
          },
        ],
        summary: { total: 2, fresh: 0, warning: 0, stale: 2, unknown: 0 },
        analyzedAt: '2026-01-14T10:00:00Z',
      });

      const result = runSystemReview();

      // Each stale doc costs 5 points
      // Expected: 100 - 10 = 90
      expect(result.actionItems.some((i) => i.includes('doc1.md'))).toBe(true);
    });

    it('should penalize high vulnerabilities', () => {
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('pnpm audit')) {
          return JSON.stringify({
            metadata: { vulnerabilities: { total: 1, high: 1, moderate: 0, low: 0 } },
          });
        }
        return '[]';
      });

      const result = runSystemReview();

      expect(result.actionItems.some((i) => i.includes('high-severity'))).toBe(true);
    });
  });
});

describe('phase 4 asks for output a non-zero audit still produced (#4838)', () => {
  // `pnpm audit --json` exits 1 *because* it found vulnerabilities. Without
  // allowNonZeroExit the JSON is discarded and a vulnerable repo is reported
  // clean — the failure path and the detection path are the same path.
  it('passes allowNonZeroExit for the pnpm audit call', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');

    runSystemReview();

    expect(mockExecSync).toHaveBeenCalledWith(
      'pnpm audit --json',
      expect.objectContaining({ allowNonZeroExit: true })
    );
  });

  it('counts vulnerabilities reported through a non-zero exit', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation((cmd: string) =>
      cmd === 'pnpm audit --json'
        ? JSON.stringify({
            metadata: { vulnerabilities: { total: 3, high: 2, moderate: 1, low: 0 } },
          })
        : ''
    );

    const result = runSystemReview();

    expect(result.security.high).toBe(2);
    expect(result.security.parseError).toBe(false);
  });

  it('marks the audit unmeasured when it produced nothing at all', () => {
    // The distinction that must survive: an audit that could not run is not
    // an audit that found nothing.
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation((cmd: string) => (cmd === 'pnpm audit --json' ? null : ''));

    expect(runSystemReview().security.parseError).toBe(true);
  });
});
