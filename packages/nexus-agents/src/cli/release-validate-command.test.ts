/**
 * nexus-agents/cli - Release Validate Command Tests
 * (Source: Issue #697 - Add test coverage for untested CLI commands)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReleaseValidateResult } from './release-validate-types.js';

vi.mock('./release-validate-helpers.js', () => ({
  validateSecurity: vi.fn().mockResolvedValue({
    expert: 'security',
    passed: true,
    confidence: 0.95,
    findings: [],
    durationMs: 10,
  }),
  validateArchitecture: vi.fn().mockResolvedValue({
    expert: 'architecture',
    passed: true,
    confidence: 0.92,
    findings: [
      {
        title: 'Fitness score: 92/100',
        severity: 'info',
        category: 'architecture',
        description: 'Fitness score meets threshold',
      },
    ],
    durationMs: 10,
  }),
  validateDocumentation: vi.fn().mockResolvedValue({
    expert: 'documentation',
    passed: true,
    confidence: 0.9,
    findings: [],
    durationMs: 10,
  }),
  validateDevOps: vi.fn().mockResolvedValue({
    expert: 'devops',
    passed: true,
    confidence: 0.88,
    findings: [],
    durationMs: 10,
  }),
}));

vi.mock('./ansi-output.js', () => ({
  colors: {
    reset: '',
    bold: '',
    dim: '',
    green: '',
    yellow: '',
    red: '',
    cyan: '',
  },
}));

import {
  runReleaseValidate,
  printReleaseValidateResult,
  releaseValidateCommand,
} from './release-validate-command.js';
import {
  validateSecurity,
  validateArchitecture,
  validateDocumentation,
  validateDevOps,
} from './release-validate-helpers.js';

function resetValidatorMocks(): void {
  vi.mocked(validateSecurity).mockResolvedValue({
    expert: 'security',
    passed: true,
    confidence: 0.95,
    findings: [],
    durationMs: 10,
  });
  vi.mocked(validateArchitecture).mockResolvedValue({
    expert: 'architecture',
    passed: true,
    confidence: 0.92,
    findings: [
      {
        title: 'Fitness score: 92/100',
        severity: 'info' as const,
        category: 'architecture',
        description: 'Fitness score meets threshold',
      },
    ],
    durationMs: 10,
  });
  vi.mocked(validateDocumentation).mockResolvedValue({
    expert: 'documentation',
    passed: true,
    confidence: 0.9,
    findings: [],
    durationMs: 10,
  });
  vi.mocked(validateDevOps).mockResolvedValue({
    expert: 'devops',
    passed: true,
    confidence: 0.88,
    findings: [],
    durationMs: 10,
  });
}

describe('runReleaseValidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetValidatorMocks();
  });

  it('should run all validators and return passed result', async () => {
    const result = await runReleaseValidate({ version: '2.6.0' });

    expect(result.passed).toBe(true);
    expect(result.version).toBe('2.6.0');
    expect(result.experts).toHaveLength(4);
    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
  });

  it('should fail when validators report errors', async () => {
    vi.mocked(validateSecurity).mockResolvedValue({
      expert: 'security',
      passed: false,
      confidence: 0.95,
      findings: [
        {
          title: 'Critical vuln',
          severity: 'error' as const,
          category: 'security',
          description: 'Critical vulnerability found',
        },
      ],
      durationMs: 10,
    });

    const result = await runReleaseValidate({ version: '2.6.0' });

    expect(result.passed).toBe(false);
    expect(result.summary.errors).toBe(1);
  });

  it('should fail in strict mode when warnings exist', async () => {
    vi.mocked(validateSecurity).mockResolvedValue({
      expert: 'security',
      passed: true,
      confidence: 0.85,
      findings: [
        {
          title: 'Weak cipher',
          severity: 'warning' as const,
          category: 'security',
          description: 'Weak cipher detected',
        },
      ],
      durationMs: 10,
    });

    const result = await runReleaseValidate({ version: '2.6.0', strict: true });

    expect(result.passed).toBe(false);
    expect(result.summary.warnings).toBe(1);
  });

  it('should skip validators when skip option is provided', async () => {
    await runReleaseValidate({ version: '2.6.0', skip: ['security', 'devops'] });

    expect(validateSecurity).not.toHaveBeenCalled();
    expect(validateDevOps).not.toHaveBeenCalled();
    expect(validateArchitecture).toHaveBeenCalled();
    expect(validateDocumentation).toHaveBeenCalled();
  });

  it('should extract fitness score from architecture findings', async () => {
    const result = await runReleaseValidate({ version: '2.6.0' });

    expect(result.fitnessScore).toBe(92);
  });

  it('should include durationMs in result', async () => {
    const result = await runReleaseValidate({ version: '2.6.0' });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('printReleaseValidateResult', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should print passed result', () => {
    const result: ReleaseValidateResult = {
      success: true,
      version: '2.6.0',
      passed: true,
      experts: [
        { expert: 'security', passed: true, confidence: 0.95, findings: [], durationMs: 10 },
      ],
      summary: { errors: 0, warnings: 0, infos: 0 },
      durationMs: 100,
    };

    printReleaseValidateResult(result);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('Release Validation Report');
    expect(output).toContain('PASS');
    expect(output).toContain('0 errors');
    consoleSpy.mockRestore();
  });

  it('should print failed result with findings', () => {
    const result: ReleaseValidateResult = {
      success: true,
      version: '2.6.0',
      passed: false,
      experts: [
        {
          expert: 'security',
          passed: false,
          confidence: 0.95,
          findings: [
            {
              title: 'Critical issue',
              severity: 'error' as const,
              category: 'security',
              description: 'Critical issue found',
            },
          ],
          durationMs: 10,
        },
      ],
      summary: { errors: 1, warnings: 0, infos: 0 },
      durationMs: 100,
    };

    printReleaseValidateResult(result);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('FAIL');
    expect(output).toContain('1 errors');
    expect(output).toContain('Critical issue');
    consoleSpy.mockRestore();
  });
});

describe('releaseValidateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetValidatorMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should return 0 when validation passes', async () => {
    const exitCode = await releaseValidateCommand({
      positionals: ['release-validate'],
      options: { version: '2.6.0' },
    });

    expect(exitCode).toBe(0);
  });

  it('should return 1 when validation fails', async () => {
    vi.mocked(validateSecurity).mockResolvedValue({
      expert: 'security',
      passed: false,
      confidence: 0.95,
      findings: [
        {
          title: 'Error',
          severity: 'error' as const,
          category: 'security',
          description: 'Validation error',
        },
      ],
      durationMs: 10,
    });

    const exitCode = await releaseValidateCommand({
      positionals: ['release-validate'],
      options: { version: '2.6.0' },
    });

    expect(exitCode).toBe(1);
  });

  it('should pass skip option through', async () => {
    await releaseValidateCommand({
      positionals: ['release-validate'],
      options: { version: '2.6.0', skip: ['security'] },
    });

    expect(validateSecurity).not.toHaveBeenCalled();
  });
});
