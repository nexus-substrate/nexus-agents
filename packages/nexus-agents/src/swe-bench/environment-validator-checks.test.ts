/**
 * Tests for environment-validator-checks.ts
 *
 * Covers pure functions: parseVersion, isPythonVersionCompatible,
 * bytesToGB, collectErrors, collectWarnings.
 */

import { describe, it, expect } from 'vitest';
import {
  parseVersion,
  isPythonVersionCompatible,
  bytesToGB,
  collectErrors,
  collectWarnings,
} from './environment-validator-checks.js';
import type {
  PythonValidation,
  SwebenchValidation,
  DockerValidation,
  DiskSpaceValidation,
} from './environment-validator-types.js';

// ============================================================================
// parseVersion
// ============================================================================

describe('parseVersion', () => {
  it('parses full semver version', () => {
    expect(parseVersion('3.10.5')).toEqual([3, 10, 5]);
  });

  it('parses major.minor without patch', () => {
    expect(parseVersion('3.11')).toEqual([3, 11, 0]);
  });

  it('parses version embedded in text', () => {
    expect(parseVersion('Python 3.10.12')).toEqual([3, 10, 12]);
  });

  it('returns null for empty string', () => {
    expect(parseVersion('')).toBeNull();
  });

  it('returns null for non-version string', () => {
    expect(parseVersion('not a version')).toBeNull();
  });

  it('handles single digit version', () => {
    expect(parseVersion('1.0.0')).toEqual([1, 0, 0]);
  });
});

// ============================================================================
// isPythonVersionCompatible
// ============================================================================

describe('isPythonVersionCompatible', () => {
  it('accepts Python 3.10.x', () => {
    expect(isPythonVersionCompatible('3.10.0')).toBe(true);
    expect(isPythonVersionCompatible('3.10.12')).toBe(true);
  });

  it('accepts Python 3.11.x', () => {
    expect(isPythonVersionCompatible('3.11.0')).toBe(true);
    expect(isPythonVersionCompatible('3.11.8')).toBe(true);
  });

  it('rejects Python 3.12+', () => {
    expect(isPythonVersionCompatible('3.12.0')).toBe(false);
    expect(isPythonVersionCompatible('3.13.0')).toBe(false);
  });

  it('rejects Python 3.9 and below', () => {
    expect(isPythonVersionCompatible('3.9.0')).toBe(false);
    expect(isPythonVersionCompatible('3.8.0')).toBe(false);
    expect(isPythonVersionCompatible('2.7.0')).toBe(false);
  });

  it('rejects Python 4.x', () => {
    expect(isPythonVersionCompatible('4.0.0')).toBe(false);
  });

  it('returns false for invalid version string', () => {
    expect(isPythonVersionCompatible('not-a-version')).toBe(false);
  });
});

// ============================================================================
// bytesToGB
// ============================================================================

describe('bytesToGB', () => {
  it('converts bytes to GB with one decimal', () => {
    // 1 GB = 1073741824 bytes
    expect(bytesToGB(1073741824)).toBe('1.0');
  });

  it('converts zero bytes', () => {
    expect(bytesToGB(0)).toBe('0.0');
  });

  it('converts large values', () => {
    // 120 GB
    expect(bytesToGB(128849018880)).toBe('120.0');
  });

  it('rounds correctly', () => {
    // ~1.5 GB
    expect(bytesToGB(1610612736)).toBe('1.5');
  });
});

// ============================================================================
// collectErrors
// ============================================================================

describe('collectErrors', () => {
  it('returns empty array when all checks pass', () => {
    const python: PythonValidation = { available: true, version: '3.10.0' };
    const swebench: SwebenchValidation = { installed: true, version: '1.0' };
    const docker: DockerValidation = { running: true, version: '24.0.0' };
    expect(collectErrors(python, swebench, docker)).toEqual([]);
  });

  it('includes Python error when unavailable', () => {
    const python: PythonValidation = { available: false };
    const swebench: SwebenchValidation = { installed: true, version: '1.0' };
    const docker: DockerValidation = { running: true, version: '24.0.0' };
    const errors = collectErrors(python, swebench, docker);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('Python');
  });

  it('includes swebench error when not installed', () => {
    const python: PythonValidation = { available: true, version: '3.10.0' };
    const swebench: SwebenchValidation = { installed: false };
    const docker: DockerValidation = { running: true, version: '24.0.0' };
    const errors = collectErrors(python, swebench, docker);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('swebench');
  });

  it('includes Docker error when not running', () => {
    const python: PythonValidation = { available: true, version: '3.10.0' };
    const swebench: SwebenchValidation = { installed: true, version: '1.0' };
    const docker: DockerValidation = { running: false };
    const errors = collectErrors(python, swebench, docker);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('Docker');
  });

  it('includes all errors when all fail', () => {
    const python: PythonValidation = { available: false };
    const swebench: SwebenchValidation = { installed: false };
    const docker: DockerValidation = { running: false };
    const errors = collectErrors(python, swebench, docker);
    expect(errors.length).toBe(3);
  });
});

// ============================================================================
// collectWarnings
// ============================================================================

describe('collectWarnings', () => {
  it('returns empty for sufficient disk space', () => {
    const disk: DiskSpaceValidation = { available: 200000000000, sufficient: true };
    expect(collectWarnings(disk)).toEqual([]);
  });

  it('warns for insufficient disk space', () => {
    const disk: DiskSpaceValidation = { available: 50000000000, sufficient: false };
    const warnings = collectWarnings(disk);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('disk space');
  });

  it('does not warn when available is 0', () => {
    const disk: DiskSpaceValidation = { available: 0, sufficient: false };
    expect(collectWarnings(disk)).toEqual([]);
  });
});
