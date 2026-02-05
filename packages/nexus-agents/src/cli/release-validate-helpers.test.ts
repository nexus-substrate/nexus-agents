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

// ============================================================================
// validateSecurity
// ============================================================================

describe('validateSecurity', () => {
  it('passes when no audit issues and no .env', () => {
    mockExecSync.mockReturnValue('');
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      expect(result.expert).toBe('security');
      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(0.85);
    });
  });

  it('adds warning when npm audit fails', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('npm audit')) {
        throw new Error('audit failed');
      }
      // Secret check - no matches
      throw new Error('no match');
    });
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      const auditFinding = result.findings.find((f) => f.title === 'npm audit has findings');
      expect(auditFinding).toBeDefined();
      expect(auditFinding!.severity).toBe('warning');
      // Warnings don't fail, only errors do
      expect(result.passed).toBe(true);
    });
  });

  it('adds error when .env exists', () => {
    mockExecSync.mockReturnValue('');
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
      if (typeof cmd === 'string' && cmd.includes('npm audit')) return '';
      if (typeof cmd === 'string' && cmd.includes('git diff')) return 'const API_KEY = "secret"';
      return '';
    });
    mockExistsSync.mockReturnValue(false);
    return validateSecurity(defaultOptions).then((result) => {
      const secretFinding = result.findings.find((f) => f.title.includes('Potential secrets'));
      expect(secretFinding).toBeDefined();
    });
  });

  it('includes durationMs', () => {
    mockExecSync.mockReturnValue('');
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
