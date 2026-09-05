/**
 * Tests for Release Validate Helpers
 * @module cli/release-validate-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { ValidatorOptions } from './release-validate-helpers.js';
import {
  validateSecurity,
  validateArchitecture,
  validateDocumentation,
  validateDevOps,
} from './release-validate-helpers.js';

// Mock child_process and fs
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const mockExecSync = vi.mocked(execSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

const defaultOptions: ValidatorOptions = { version: '2.0.0', verbose: false };
const cleanAuditReport = JSON.stringify({
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
});

// ============================================================================
// validateSecurity
// ============================================================================

describe('validateSecurity', () => {
  it('passes when npm audit reports no vulnerabilities and no .env', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm audit')) return cleanAuditReport;
      return '';
    });
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      expect(result.expert).toBe('security');
      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(0.85);
      expect(result.findings.map((finding) => finding.title)).not.toContainEqual(
        expect.stringContaining('npm audit')
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'npm audit --json --audit-level=high',
        expect.objectContaining({
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      );
    });
  });

  it('fails when npm audit reports two high vulnerabilities', () => {
    const auditError = Object.assign(new Error('npm audit found vulnerabilities'), {
      status: 1,
      stdout: JSON.stringify({
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 },
        },
      }),
    });
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm audit')) throw auditError;
      return '';
    });
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      const auditFinding = result.findings.find((finding) => finding.title.includes('2 high'));
      expect(auditFinding).toBeDefined();
      expect(auditFinding!.severity).toBe('error');
      expect(result.passed).toBe(false);
    });
  });

  it('fails closed when npm audit is unavailable', () => {
    const unavailableError = Object.assign(new Error('spawnSync npm ENOENT'), {
      code: 'ENOENT',
      stdout: '',
    });
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm audit')) throw unavailableError;
      return '';
    });
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      const auditFinding = result.findings.find((finding) =>
        finding.title.includes('npm audit unavailable')
      );
      expect(auditFinding).toBeDefined();
      expect(auditFinding!.title).toContain('spawnSync npm ENOENT');
      expect(auditFinding!.severity).toBe('error');
      expect(result.passed).toBe(false);
    });
  });

  it('warns but passes when npm audit reports only moderate vulnerabilities', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm audit')) {
        return JSON.stringify({
          metadata: {
            vulnerabilities: { info: 0, low: 0, moderate: 3, high: 0, critical: 0, total: 3 },
          },
        });
      }
      return '';
    });
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      const auditFinding = result.findings.find((finding) => finding.title.includes('3 moderate'));
      expect(auditFinding).toBeDefined();
      expect(auditFinding!.severity).toBe('warning');
      expect(result.passed).toBe(true);
    });
  });

  it('adds error when .env exists', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm audit')) return cleanAuditReport;
      return '';
    });
    mockExistsSync.mockReturnValue(true);
    return validateSecurity(defaultOptions).then((result) => {
      const envFinding = result.findings.find((f) => f.title === '.env file present');
      expect(envFinding).toBeDefined();
      expect(envFinding!.severity).toBe('error');
      expect(result.passed).toBe(false);
    });
  });

  it('adds warning for potential secrets in commits', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm audit')) return cleanAuditReport;
      if (cmd.includes('git diff')) return 'const API_KEY = "secret"';
      return '';
    });
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      const secretFinding = result.findings.find((f) => f.title.includes('Potential secrets'));
      expect(secretFinding).toBeDefined();
    });
  });

  it('records a warning finding when the secret scan itself fails (#4581)', () => {
    // The scan pipeline ends in `head`, so grep matching nothing still exits
    // 0. Reaching the catch means the scan did not run (bad revision, no
    // history, timeout) — which used to be swallowed, leaving an empty
    // findings list that read as "scanned, clean".
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm audit')) return cleanAuditReport;
      if (cmd.includes('git diff')) {
        throw new Error('fatal: bad revision HEAD~10');
      }
      return '';
    });
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      const scanFinding = result.findings.find((f) => f.title === 'Secret scan did not run');
      expect(scanFinding).toBeDefined();
      expect(scanFinding!.severity).toBe('warning');
    });
  });

  it('does not record a scan-did-not-run finding when the scan runs clean (#4581)', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm audit')) return cleanAuditReport;
      return '';
    });
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      expect(result.findings.map((f) => f.title)).not.toContain('Secret scan did not run');
    });
  });

  it('includes durationMs', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm audit')) return cleanAuditReport;
      return '';
    });
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// validateArchitecture
// ============================================================================

describe('validateArchitecture', () => {
  it('passes when fitness score >= 90', () => {
    mockExecSync.mockReturnValue(JSON.stringify({ score: 97 }));
    return validateArchitecture(defaultOptions).then((result) => {
      expect(result.expert).toBe('architecture');
      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(0.9);
      const infoFinding = result.findings.find((f) => f.title.includes('97'));
      expect(infoFinding).toBeDefined();
    });
  });

  it('fails when fitness score < 90', () => {
    mockExecSync.mockReturnValue(JSON.stringify({ score: 75 }));
    return validateArchitecture(defaultOptions).then((result) => {
      expect(result.passed).toBe(false);
      const errorFinding = result.findings.find((f) => f.severity === 'error');
      expect(errorFinding).toBeDefined();
      expect(errorFinding!.title).toContain('75');
    });
  });

  it('handles fitness audit failure', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('command not found');
    });
    return validateArchitecture(defaultOptions).then((result) => {
      const warningFinding = result.findings.find((f) => f.title.includes('Fitness audit failed'));
      expect(warningFinding).toBeDefined();
      expect(warningFinding!.severity).toBe('warning');
    });
  });

  it('includes dimension findings from audit', () => {
    mockExecSync.mockReturnValue(
      JSON.stringify({
        score: 95,
        findings: [{ message: 'Good test coverage', suggestion: 'Keep it up' }],
      })
    );
    return validateArchitecture(defaultOptions).then((result) => {
      const dimensionFinding = result.findings.find((f) => f.title.includes('Good test coverage'));
      expect(dimensionFinding).toBeDefined();
    });
  });
});

// ============================================================================
// validateDocumentation
// ============================================================================

describe('validateDocumentation', () => {
  it('fails when CHANGELOG.md missing', () => {
    mockExistsSync.mockReturnValue(false);
    return validateDocumentation(defaultOptions).then((result) => {
      expect(result.expert).toBe('documentation');
      expect(result.passed).toBe(false);
      const finding = result.findings.find((f) => f.title === 'CHANGELOG.md missing');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('error');
    });
  });

  it('warns when CHANGELOG.md missing current version', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      if (p === 'CHANGELOG.md') return true;
      if (p === 'README.md') return true;
      return false;
    });
    mockReadFileSync.mockReturnValue('## [1.0.0] - 2025-01-01');
    return validateDocumentation(defaultOptions).then((result) => {
      const finding = result.findings.find((f) => f.title.includes('missing version 2.0.0'));
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
    });
  });

  it('passes when all docs present with current version', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      if (p === 'CHANGELOG.md') return true;
      if (p === 'README.md') return true;
      if (p === 'CLAUDE.md') return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === 'CHANGELOG.md') return '## [2.0.0] - 2026-01-15';
      if (p === 'CLAUDE.md') return 'Governance Version: 2026-02-01';
      return '';
    });
    return validateDocumentation(defaultOptions).then((result) => {
      expect(result.passed).toBe(true);
    });
  });

  it('warns about stale governance version', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      if (p === 'CHANGELOG.md') return true;
      if (p === 'README.md') return true;
      if (p === 'CLAUDE.md') return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === 'CHANGELOG.md') return '## [2.0.0]';
      if (p === 'CLAUDE.md') return 'Governance Version: 2024-01-01';
      return '';
    });
    return validateDocumentation(defaultOptions).then((result) => {
      const finding = result.findings.find((f) => f.title.includes('governance version stale'));
      expect(finding).toBeDefined();
    });
  });

  it('fails when README.md missing', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      if (p === 'CHANGELOG.md') return true;
      if (p === 'README.md') return false;
      return false;
    });
    mockReadFileSync.mockReturnValue('## [2.0.0]');
    return validateDocumentation(defaultOptions).then((result) => {
      expect(result.passed).toBe(false);
      const finding = result.findings.find((f) => f.title === 'README.md missing');
      expect(finding).toBeDefined();
    });
  });
});

// ============================================================================
// validateDevOps
// ============================================================================

describe('validateDevOps', () => {
  it('passes when all checks succeed', () => {
    mockExecSync.mockReturnValue('');
    return validateDevOps(defaultOptions).then((result) => {
      expect(result.expert).toBe('devops');
      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.findings.filter((f) => f.severity === 'info')).toHaveLength(3);
    });
  });

  it('fails when build fails', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('pnpm build')) {
        throw new Error('build failed');
      }
      return '';
    });
    return validateDevOps(defaultOptions).then((result) => {
      expect(result.passed).toBe(false);
      const finding = result.findings.find((f) => f.title === 'Build failed');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('error');
    });
  });

  it('fails when lint fails', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('pnpm lint')) {
        throw new Error('lint failed');
      }
      return '';
    });
    return validateDevOps(defaultOptions).then((result) => {
      expect(result.passed).toBe(false);
      const finding = result.findings.find((f) => f.title === 'Lint failed');
      expect(finding).toBeDefined();
    });
  });

  it('fails when typecheck fails', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('pnpm typecheck')) {
        throw new Error('typecheck failed');
      }
      return '';
    });
    return validateDevOps(defaultOptions).then((result) => {
      expect(result.passed).toBe(false);
      const finding = result.findings.find((f) => f.title === 'Type check failed');
      expect(finding).toBeDefined();
    });
  });

  it('reports multiple failures', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('all failed');
    });
    return validateDevOps(defaultOptions).then((result) => {
      expect(result.passed).toBe(false);
      const errors = result.findings.filter((f) => f.severity === 'error');
      expect(errors).toHaveLength(3);
    });
  });
});
