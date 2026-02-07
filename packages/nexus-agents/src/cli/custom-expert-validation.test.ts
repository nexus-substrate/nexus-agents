/**
 * Tests for custom-expert-validation.ts
 *
 * Covers path traversal prevention, Zod error formatting, and validation helpers.
 */

import { describe, it, expect } from 'vitest';
import { ZodError, type ZodIssue, type ZodIssueCode } from 'zod';
import { resolve, sep } from 'node:path';
import {
  validateConfigPath,
  getSuggestion,
  formatZodError,
  formatValidationErrors,
  type CustomExpertError,
} from './custom-expert-validation.js';
import { SecurityError } from '../core/index.js';
import {
  VALID_EXPERT_TIERS,
  VALID_EXPERT_DOMAINS,
  MAX_SYSTEM_PROMPT_LENGTH,
} from '../config/index.js';

describe('validateConfigPath', () => {
  it('should accept paths within allowed root', () => {
    const result = validateConfigPath('config.yaml', '/home/user/project');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(resolve('/home/user/project/config.yaml'));
    }
  });

  it('should accept nested paths within allowed root', () => {
    const result = validateConfigPath('configs/experts.yaml', '/home/user/project');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(resolve('/home/user/project/configs/experts.yaml'));
    }
  });

  it('should accept the root itself', () => {
    const result = validateConfigPath('.', '/home/user/project');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(resolve('/home/user/project'));
    }
  });

  it('should accept empty string resolving to root', () => {
    const result = validateConfigPath('', '/home/user/project');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(resolve('/home/user/project'));
    }
  });

  it('should reject path traversal with ../../../etc/passwd', () => {
    const result = validateConfigPath('../../../etc/passwd', '/home/user/project');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
      expect(result.error.message).toContain('Path traversal detected');
    }
  });

  it('should reject simple parent directory traversal', () => {
    const result = validateConfigPath('../etc/passwd', '/home/user/project');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
      expect(result.error.message).toContain('config path escapes allowed root directory');
    }
  });

  it('should reject paths escaping via symlink-like relative paths', () => {
    const result = validateConfigPath('config/../../../etc/passwd', '/home/user/project');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
    }
  });

  it('should reject mixed traversal with valid segments', () => {
    const result = validateConfigPath('configs/../../etc/passwd', '/home/user/project');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
    }
  });

  it('should reject absolute path outside root', () => {
    const result = validateConfigPath('/etc/passwd', '/home/user/project');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
    }
  });

  it('should return SecurityError with context on rejection', () => {
    const userPath = '../etc/passwd';
    const allowedRoot = '/home/user/project';
    const result = validateConfigPath(userPath, allowedRoot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
      expect(result.error.context).toEqual({
        userPath,
        allowedRoot: resolve(allowedRoot),
      });
    }
  });

  it('should reject path starting with separator that escapes root', () => {
    const result = validateConfigPath(`${sep}etc${sep}passwd`, '/home/user/project');
    expect(result.ok).toBe(false);
  });

  it('should handle paths with special characters', () => {
    const result = validateConfigPath('config-[2024].yaml', '/home/user/project');
    expect(result.ok).toBe(true);
  });

  it('should handle paths with spaces', () => {
    const result = validateConfigPath('my config/expert.yaml', '/home/user/project');
    expect(result.ok).toBe(true);
  });
});

describe('getSuggestion', () => {
  it('returns tier suggestion for tier field', () => {
    const suggestion = getSuggestion('tier', 'Invalid tier', 'invalid_enum_value');
    expect(suggestion).toBe(`Valid options: ${VALID_EXPERT_TIERS.join(', ')}`);
  });

  it('returns tier suggestion when message contains tier', () => {
    const suggestion = getSuggestion('customTier', 'tier value is invalid', 'invalid_type');
    expect(suggestion).toBe(`Valid options: ${VALID_EXPERT_TIERS.join(', ')}`);
  });

  it('returns domain suggestion for domain field', () => {
    const suggestion = getSuggestion('domain', 'Invalid domain', 'invalid_enum_value');
    expect(suggestion).toBe(`Valid options: ${VALID_EXPERT_DOMAINS.join(', ')}`);
  });

  it('returns domain suggestion when message contains domain', () => {
    const suggestion = getSuggestion('expertDomain', 'domain is required', 'required');
    expect(suggestion).toBe(`Valid options: ${VALID_EXPERT_DOMAINS.join(', ')}`);
  });

  it('returns systemPrompt max length for too_big code', () => {
    const suggestion = getSuggestion('systemPrompt', 'String too long', 'too_big');
    expect(suggestion).toBe(`Maximum length is ${String(MAX_SYSTEM_PROMPT_LENGTH)} characters`);
  });

  it('returns undefined for systemPrompt with non-too_big code', () => {
    const suggestion = getSuggestion('systemPrompt', 'Required', 'required');
    expect(suggestion).toBeUndefined();
  });

  it('returns capabilities suggestion', () => {
    const suggestion = getSuggestion('capabilities', 'Array too small', 'too_small');
    expect(suggestion).toBe(
      'Provide at least one capability (e.g., task_execution, code_generation)'
    );
  });

  it('returns temperature suggestion', () => {
    const suggestion = getSuggestion('temperature', 'Number too large', 'too_big');
    expect(suggestion).toBe('Value must be between 0 and 1');
  });

  it('returns weight suggestion', () => {
    const suggestion = getSuggestion('weight', 'Number too small', 'too_small');
    expect(suggestion).toBe('Value must be between 0 and 1');
  });

  it('returns undefined for unknown fields', () => {
    const suggestion = getSuggestion('unknownField', 'Some error', 'invalid_type');
    expect(suggestion).toBeUndefined();
  });

  it('returns undefined for empty field name', () => {
    const suggestion = getSuggestion('', 'Some error', 'invalid_type');
    expect(suggestion).toBeUndefined();
  });
});

describe('formatZodError', () => {
  const createZodError = (
    issues: Array<{ path: (string | number)[]; message: string; code: ZodIssueCode }>
  ): ZodError => {
    return new ZodError(issues as ZodIssue[]);
  };

  it('maps Zod issues to CustomExpertError array', () => {
    const zodError = createZodError([
      { path: ['tier'], message: 'Invalid enum value', code: 'invalid_enum_value' },
      { path: ['temperature'], message: 'Number too large', code: 'too_big' },
    ]);

    const errors = formatZodError('test-expert', zodError);
    expect(errors).toHaveLength(2);
    expect(errors[0]!.expertId).toBe('test-expert');
    expect(errors[0]!.field).toBe('tier');
    expect(errors[0]!.message).toBe('Invalid enum value');
    expect(errors[1]!.field).toBe('temperature');
    expect(errors[1]!.message).toBe('Number too large');
  });

  it('includes suggestion when available', () => {
    const zodError = createZodError([
      { path: ['tier'], message: 'Invalid enum value', code: 'invalid_enum_value' },
    ]);

    const errors = formatZodError('test-expert', zodError);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      expertId: 'test-expert',
      field: 'tier',
      message: 'Invalid enum value',
      suggestion: `Valid options: ${VALID_EXPERT_TIERS.join(', ')}`,
    });
  });

  it('omits suggestion when not available', () => {
    const zodError = createZodError([
      { path: ['name'], message: 'Required', code: 'invalid_type' },
    ]);

    const errors = formatZodError('test-expert', zodError);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      expertId: 'test-expert',
      field: 'name',
      message: 'Required',
    });
    expect(errors[0]!.suggestion).toBeUndefined();
  });

  it('uses "unknown" for empty path', () => {
    const zodError = createZodError([{ path: [], message: 'Invalid input', code: 'invalid_type' }]);

    const errors = formatZodError('test-expert', zodError);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('unknown');
  });

  it('joins nested paths with dots', () => {
    const zodError = createZodError([
      { path: ['config', 'model', 'temperature'], message: 'Too large', code: 'too_big' },
    ]);

    const errors = formatZodError('test-expert', zodError);
    expect(errors[0]!.field).toBe('config.model.temperature');
  });

  it('handles array indices in paths', () => {
    const zodError = createZodError([
      { path: ['capabilities', 0], message: 'Invalid type', code: 'invalid_type' },
    ]);

    const errors = formatZodError('test-expert', zodError);
    expect(errors[0]!.field).toBe('capabilities.0');
  });

  it('preserves expertId for all errors', () => {
    const zodError = createZodError([
      { path: ['tier'], message: 'Error 1', code: 'invalid_type' },
      { path: ['domain'], message: 'Error 2', code: 'invalid_type' },
    ]);

    const errors = formatZodError('my-expert-id', zodError);
    expect(errors.every((e) => e.expertId === 'my-expert-id')).toBe(true);
  });
});

describe('formatValidationErrors', () => {
  const createError = (overrides: Partial<CustomExpertError> = {}): CustomExpertError => ({
    expertId: 'test-expert',
    field: 'tier',
    message: 'Invalid value',
    ...overrides,
  });

  it('returns empty string for empty array', () => {
    const output = formatValidationErrors([]);
    expect(output).toBe('');
  });

  it('formats single error with header', () => {
    const errors = [createError()];
    const output = formatValidationErrors(errors);

    expect(output).toContain('Custom expert validation errors:');
    expect(output).toContain('Error: Invalid value');
  });

  it('includes expert ID when not "config"', () => {
    const errors = [createError({ expertId: 'my-expert' })];
    const output = formatValidationErrors(errors);

    expect(output).toContain('Expert: my-expert');
  });

  it('omits expert line when expertId is "config"', () => {
    const errors = [createError({ expertId: 'config' })];
    const output = formatValidationErrors(errors);

    expect(output).toContain('Error: Invalid value');
    expect(output).not.toContain('Expert: config');
  });

  it('includes field when not "unknown", "file", or "yaml"', () => {
    const errors = [createError({ field: 'tier' })];
    const output = formatValidationErrors(errors);

    expect(output).toContain('Field: tier');
  });

  it('omits field line when field is "unknown"', () => {
    const errors = [createError({ field: 'unknown' })];
    const output = formatValidationErrors(errors);

    expect(output).not.toContain('Field: unknown');
  });

  it('omits field line when field is "file"', () => {
    const errors = [createError({ field: 'file' })];
    const output = formatValidationErrors(errors);

    expect(output).not.toContain('Field: file');
  });

  it('omits field line when field is "yaml"', () => {
    const errors = [createError({ field: 'yaml' })];
    const output = formatValidationErrors(errors);

    expect(output).not.toContain('Field: yaml');
  });

  it('includes suggestion when present', () => {
    const errors = [createError({ suggestion: 'Use valid tier' })];
    const output = formatValidationErrors(errors);

    expect(output).toContain('Suggestion: Use valid tier');
  });

  it('omits suggestion when undefined', () => {
    const errors = [createError()];
    const output = formatValidationErrors(errors);

    expect(output).not.toContain('Suggestion:');
  });

  it('formats multiple errors', () => {
    const errors = [
      createError({ field: 'tier', message: 'Invalid tier' }),
      createError({ field: 'domain', message: 'Invalid domain' }),
    ];
    const output = formatValidationErrors(errors);

    expect(output).toContain('Error: Invalid tier');
    expect(output).toContain('Error: Invalid domain');
  });

  it('handles mixed error formats correctly', () => {
    const errors = [
      createError({
        expertId: 'config',
        field: 'file',
        message: 'File not found',
      }),
      createError({
        expertId: 'expert-1',
        field: 'tier',
        message: 'Invalid tier',
        suggestion: 'Use fast, balanced, or powerful',
      }),
    ];
    const output = formatValidationErrors(errors);

    expect(output).toContain('Error: File not found');
    expect(output).not.toContain('Expert: config');
    expect(output).not.toContain('Field: file');

    expect(output).toContain('Error: Invalid tier');
    expect(output).toContain('Expert: expert-1');
    expect(output).toContain('Field: tier');
    expect(output).toContain('Suggestion: Use fast, balanced, or powerful');
  });

  it('uses consistent indentation', () => {
    const errors = [
      createError({
        message: 'Test error',
        suggestion: 'Test suggestion',
      }),
    ];
    const output = formatValidationErrors(errors);
    const lines = output.split('\n');

    expect(lines[0]).toBe('Custom expert validation errors:');
    expect(lines[1]).toMatch(/^  Error:/);
    expect(lines.filter((l) => l.match(/^    (Expert|Field|Suggestion):/))).not.toHaveLength(0);
  });
});
