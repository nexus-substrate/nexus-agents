/** Regression coverage for release readiness without measurements (#7444). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runReleaseValidate } from './release-validate-command.js';
import {
  validateSecurity,
  validateArchitecture,
  validateDocumentation,
  validateDevOps,
} from './release-validate-helpers.js';

vi.mock('./release-validate-helpers.js', () => ({
  validateSecurity: vi.fn(),
  validateArchitecture: vi.fn(),
  validateDocumentation: vi.fn(),
  validateDevOps: vi.fn(),
}));

const ALL_VALIDATORS = ['security', 'architecture', 'docs', 'devops'];
const validators = [validateSecurity, validateArchitecture, validateDocumentation, validateDevOps];

beforeEach(() => {
  vi.clearAllMocks();
  for (const [index, validator] of validators.entries()) {
    vi.mocked(validator).mockResolvedValue({
      expert: ALL_VALIDATORS[index] ?? 'unknown',
      passed: true,
      confidence: 1,
      findings: [],
      durationMs: 1,
    });
  }
});

describe('release readiness requires an actual measurement', () => {
  it.each([false, true])(
    'does not pass when every validator is skipped (strict=%s)',
    async (strict) => {
      const result = await runReleaseValidate({ version: '11.7.0', skip: ALL_VALIDATORS, strict });

      expect(result).toMatchObject({
        success: true,
        passed: false,
        experts: [],
        summary: { errors: 0, warnings: 0, infos: 0 },
      });
      for (const validator of validators) expect(validator).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])('passes one measured clean validator (strict=%s)', async (strict) => {
    const result = await runReleaseValidate({
      version: '11.7.0',
      skip: ['architecture', 'docs', 'devops'],
      strict,
    });

    expect(result.passed).toBe(true);
    expect(result.experts).toHaveLength(1);
    expect(result.experts[0]?.expert).toBe('security');
    expect(validateSecurity).toHaveBeenCalledOnce();
    expect(validateArchitecture).not.toHaveBeenCalled();
    expect(validateDocumentation).not.toHaveBeenCalled();
    expect(validateDevOps).not.toHaveBeenCalled();
  });

  it('passes the default four measured clean validators', async () => {
    const result = await runReleaseValidate({ version: '11.7.0' });

    expect(result.passed).toBe(true);
    expect(result.experts).toHaveLength(4);
    for (const validator of validators) expect(validator).toHaveBeenCalledOnce();
  });

  it.each([
    { severity: 'warning' as const, strict: false, passed: true },
    { severity: 'warning' as const, strict: true, passed: false },
    { severity: 'error' as const, strict: false, passed: false },
    { severity: 'error' as const, strict: true, passed: false },
  ])('preserves $severity verdict with strict=$strict', async ({ severity, strict, passed }) => {
    vi.mocked(validateSecurity).mockResolvedValue({
      expert: 'security',
      passed: severity !== 'error',
      confidence: 1,
      findings: [{ severity, title: 'Measured finding', category: 'security', description: '' }],
      durationMs: 1,
    });

    const result = await runReleaseValidate({ version: '11.7.0', strict });

    expect(result.passed).toBe(passed);
    expect(result.experts).toHaveLength(4);
    expect(result.summary).toEqual({
      errors: severity === 'error' ? 1 : 0,
      warnings: severity === 'warning' ? 1 : 0,
      infos: 0,
    });
  });

  it.each([
    { skip: ['security'], measured: 3 },
    { skip: ['security', 'security', 'unknown'], measured: 3 },
    { skip: ['unknown'], measured: 4 },
  ])('preserves partial, duplicate and unknown skips: $skip', async ({ skip, measured }) => {
    const result = await runReleaseValidate({ version: '11.7.0', skip });

    expect(result.passed).toBe(true);
    expect(result.experts).toHaveLength(measured);
    expect(validateSecurity).toHaveBeenCalledTimes(skip.includes('security') ? 0 : 1);
    expect(validateArchitecture).toHaveBeenCalledOnce();
    expect(validateDocumentation).toHaveBeenCalledOnce();
    expect(validateDevOps).toHaveBeenCalledOnce();
  });
});
