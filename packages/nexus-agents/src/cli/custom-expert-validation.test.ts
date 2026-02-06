/**
 * Tests for custom-expert-validation.ts
 *
 * Covers path traversal prevention, Zod error formatting, and validation helpers.
 */

import { describe, it, expect } from 'vitest';
import { ZodError, ZodIssueCode } from 'zod';
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
  describe('happy path', () => {
    it('should accept a valid relative path within root', () => {
      const result = validateConfigPath('config.yaml', '/home/user/project');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(resolve('/home/user/project/config.yaml'));
      }
    });

    it('should accept a valid nested path within root', () => {
      const result = validateConfigPath('configs/experts.yaml', '/home/user/project');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(resolve('/home/user/project/configs/experts.yaml'));
      }
    });

    it('should accept the root path itself', () => {
      const result = validateConfigPath('.', '/home/user/project');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(resolve('/home/user/project'));
      }
    });

    it('should accept an empty string (resolves to root)', () => {
      const result = validateConfigPath('', '/home/user/project');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(resolve('/home/user/project'));
      }
    });

    it('should handle absolute paths within root', () => {
      const root = '/home/user/project';
      const validPath = resolve(root, 'config.yaml');
      const result = validateConfigPath(validPath, root);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(validPath);
      }
    });
  });

  describe('path traversal prevention', () => {
    it('should reject simple parent directory traversal', () => {
      const result = validateConfigPath('../etc/passwd', '/home/user/project');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(SecurityError);
        expect(result.error.message).toContain('Path traversal detected');
        expect(result.error.message).toContain('config path escapes allowed root directory');
      }
    });

    it('should reject multiple parent directory traversals', () => {
      const result = validateConfigPath('../../../etc/passwd', '/home/user/project');
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

    it('should reject path that escapes via symbolic link simulation', () => {
      // Path that would resolve outside root after normalization
      const result = validateConfigPath('config/../../../etc/passwd', '/home/user/project');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(SecurityError);
      }
    });

    it('should include context in security error', () => {
      const userPath = '../etc/passwd';
      const allowedRoot = '/home/user/project';
      const result = validateConfigPath(userPath, allowedRoot);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context).toEqual({
          userPath,
          allowedRoot: resolve(allowedRoot),
        });
      }
    });
  });

  describe('edge cases', () => {
    it('should handle Windows-style paths on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const result = validateConfigPath('config\\experts.yaml', 'C:\\Users\\test\\project');
      expect(result.ok).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should handle paths with special characters', () => {
      const result = validateConfigPath('config-[2024].yaml', '/home/user/project');
      expect(result.ok).toBe(true);
    });

    it('should handle paths with spaces', () => {
      const result = validateConfigPath('my config/expert.yaml', '/home/user/project');
      expect(result.ok).toBe(true);
    });

    it('should reject path starting with separator that escapes root', () => {
      const result = validateConfigPath(`${sep}etc${sep}passwd`, '/home/user/project');
      expect(result.ok).toBe(false);
    });
  });
});

describe('getSuggestion', () => {
  describe('tier field', () => {
    it('should suggest valid tiers when field is "tier"', () => {
      const suggestion = getSuggestion('tier', 'Invalid tier', 'invalid_enum_value');
      expect(suggestion).toBe(`Valid options: ${VALID_EXPERT_TIERS.join(', ')}`);
    });

    it('should suggest valid tiers when message contains "tier"', () => {
      const suggestion = getSuggestion('customTier', 'tier value is invalid', 'invalid_type');
      expect(suggestion).toBe(`Valid options: ${VALID_EXPERT_TIERS.join(', ')}`);
    });
  });

  describe('domain field', () => {
    it('should suggest valid domains when field is "domain"', () => {
      const suggestion = getSuggestion('domain', 'Invalid domain', 'invalid_enum_value');
      expect(suggestion).toBe(`Valid options: ${VALID_EXPERT_DOMAINS.join(', ')}`);
    });

    it('should suggest valid domains when message contains "domain"', () => {
      const suggestion = getSuggestion('expertDomain', 'domain is required', 'required');
      expect(suggestion).toBe(`Valid options: ${VALID_EXPERT_DOMAINS.join(', ')}`);
    });
  });

  describe('systemPrompt field', () => {
    it('should suggest max length when field is systemPrompt and code is too_big', () => {
      const suggestion = getSuggestion('systemPrompt', 'String too long', 'too_big');
      expect(suggestion).toBe(`Maximum length is ${String(MAX_SYSTEM_PROMPT_LENGTH)} characters`);
    });

    it('should return undefined when field is systemPrompt but code is not too_big', () => {
      const suggestion = getSuggestion('systemPrompt', 'Required', 'required');
      expect(suggestion).toBeUndefined();
    });
  });

  describe('capabilities field', () => {
    it('should suggest providing at least one capability', () => {
      const suggestion = getSuggestion('capabilities', 'Array too small', 'too_small');
      expect(suggestion).toBe(
        'Provide at least one capability (e.g., task_execution, code_generation)'
      );
    });
  });

  describe('temperature field', () => {
    it('should suggest value range for temperature', () => {
      const suggestion = getSuggestion('temperature', 'Number too large', 'too_big');
      expect(suggestion).toBe('Value must be between 0 and 1');
    });
  });

  describe('weight field', () => {
    it('should suggest value range for weight', () => {
      const suggestion = getSuggestion('weight', 'Number too small', 'too_small');
      expect(suggestion).toBe('Value must be between 0 and 1');
    });
  });

  describe('unknown fields', () => {
    it('should return undefined for unrecognized fields', () => {
      const suggestion = getSuggestion('unknownField', 'Some error', 'invalid_type');
      expect(suggestion).toBeUndefined();
    });

    it('should return undefined for empty field', () => {
      const suggestion = getSuggestion('', 'Some error', 'invalid_type');
      expect(suggestion).toBeUndefined();
    });
  });
});

describe('formatZodError', () => {
  const createZodError = (
    issues: Array<{ path: (string | number)[]; message: string; code: ZodIssueCode }>
  ): ZodError => {
    return new ZodError(issues);
  };

  describe('single error', () => {
    it('should format a simple validation error', () => {
      const zodError = createZodError([
        {
          path: ['tier'],
          message: 'Invalid enum value',
          code: 'invalid_enum_value',
        },
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

    it('should format error without suggestion', () => {
      const zodError = createZodError([
        {
          path: ['name'],
          message: 'Required',
          code: 'invalid_type',
        },
      ]);

      const errors = formatZodError('test-expert', zodError);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({
        expertId: 'test-expert',
        field: 'name',
        message: 'Required',
      });
    });
  });

  describe('multiple errors', () => {
    it('should format multiple validation errors', () => {
      const zodError = createZodError([
        {
          path: ['tier'],
          message: 'Invalid enum value',
          code: 'invalid_enum_value',
        },
        {
          path: ['temperature'],
          message: 'Number must be less than or equal to 1',
          code: 'too_big',
        },
      ]);

      const errors = formatZodError('test-expert', zodError);
      expect(errors).toHaveLength(2);
      expect(errors[0].field).toBe('tier');
      expect(errors[1].field).toBe('temperature');
      expect(errors[1].suggestion).toBe('Value must be between 0 and 1');
    });
  });

  describe('nested paths', () => {
    it('should format nested field paths', () => {
      const zodError = createZodError([
        {
          path: ['config', 'model', 'temperature'],
          message: 'Number too large',
          code: 'too_big',
        },
      ]);

      const errors = formatZodError('test-expert', zodError);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('config.model.temperature');
      // Nested paths don't get suggestions because getSuggestion checks field name exactly
      expect(errors[0].suggestion).toBeUndefined();
    });

    it('should handle array indices in paths', () => {
      const zodError = createZodError([
        {
          path: ['capabilities', 0],
          message: 'Invalid type',
          code: 'invalid_type',
        },
      ]);

      const errors = formatZodError('test-expert', zodError);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('capabilities.0');
    });
  });

  describe('edge cases', () => {
    it('should handle empty path as "unknown" field', () => {
      const zodError = createZodError([
        {
          path: [],
          message: 'Invalid input',
          code: 'invalid_type',
        },
      ]);

      const errors = formatZodError('test-expert', zodError);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('unknown');
    });

    it('should preserve expertId for all errors', () => {
      const zodError = createZodError([
        { path: ['tier'], message: 'Error 1', code: 'invalid_type' },
        { path: ['domain'], message: 'Error 2', code: 'invalid_type' },
      ]);

      const errors = formatZodError('my-expert-id', zodError);
      expect(errors.every((e) => e.expertId === 'my-expert-id')).toBe(true);
    });
  });
});

describe('formatValidationErrors', () => {
  const createError = (overrides: Partial<CustomExpertError> = {}): CustomExpertError => ({
    expertId: 'test-expert',
    field: 'tier',
    message: 'Invalid value',
    ...overrides,
  });

  describe('empty errors', () => {
    it('should return empty string for empty error array', () => {
      const output = formatValidationErrors([]);
      expect(output).toBe('');
    });
  });

  describe('single error', () => {
    it('should format error with all fields', () => {
      const errors = [createError({ suggestion: 'Use valid tier' })];
      const output = formatValidationErrors(errors);

      expect(output).toContain('Custom expert validation errors:');
      expect(output).toContain('Error: Invalid value');
      expect(output).toContain('Expert: test-expert');
      expect(output).toContain('Field: tier');
      expect(output).toContain('Suggestion: Use valid tier');
    });

    it('should omit expert line when expertId is "config"', () => {
      const errors = [createError({ expertId: 'config' })];
      const output = formatValidationErrors(errors);

      expect(output).toContain('Error: Invalid value');
      expect(output).not.toContain('Expert: config');
      expect(output).toContain('Field: tier');
    });

    it('should omit field line when field is "unknown"', () => {
      const errors = [createError({ field: 'unknown' })];
      const output = formatValidationErrors(errors);

      expect(output).toContain('Error: Invalid value');
      expect(output).toContain('Expert: test-expert');
      expect(output).not.toContain('Field: unknown');
    });

    it('should omit field line when field is "file"', () => {
      const errors = [createError({ field: 'file' })];
      const output = formatValidationErrors(errors);

      expect(output).not.toContain('Field: file');
    });

    it('should omit field line when field is "yaml"', () => {
      const errors = [createError({ field: 'yaml' })];
      const output = formatValidationErrors(errors);

      expect(output).not.toContain('Field: yaml');
    });

    it('should omit suggestion when undefined', () => {
      const errors = [createError({ suggestion: undefined })];
      const output = formatValidationErrors(errors);

      expect(output).toContain('Error: Invalid value');
      expect(output).not.toContain('Suggestion:');
    });
  });

  describe('multiple errors', () => {
    it('should format multiple errors with blank lines between them', () => {
      const errors = [
        createError({ field: 'tier', message: 'Invalid tier' }),
        createError({ field: 'domain', message: 'Invalid domain' }),
      ];
      const output = formatValidationErrors(errors);

      expect(output).toContain('Error: Invalid tier');
      expect(output).toContain('Error: Invalid domain');

      // Check for blank lines between errors
      const lines = output.split('\n');
      const errorLineIndices = lines
        .map((line, idx) => (line.includes('Error:') ? idx : -1))
        .filter((idx) => idx !== -1);

      // Between first and second error, there should be blank lines
      expect(errorLineIndices).toHaveLength(2);
    });

    it('should handle mixed error formats', () => {
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
  });

  describe('formatting structure', () => {
    it('should use consistent indentation', () => {
      const errors = [
        createError({
          message: 'Test error',
          suggestion: 'Test suggestion',
        }),
      ];
      const output = formatValidationErrors(errors);
      const lines = output.split('\n');

      // Title has no indentation
      expect(lines[0]).toBe('Custom expert validation errors:');

      // Error line has 2 spaces
      expect(lines[1]).toMatch(/^  Error:/);

      // Detail lines have 4 spaces
      expect(lines.filter((l) => l.match(/^    (Expert|Field|Suggestion):/))).not.toHaveLength(0);
    });

    it('should end with single blank line after last error', () => {
      const errors = [createError()];
      const output = formatValidationErrors(errors);

      // Format ends with a single blank line (one \n for last line content, one for blank)
      expect(output.endsWith('\n')).toBe(true);
      const lines = output.split('\n');
      expect(lines[lines.length - 1]).toBe('');
    });
  });

  describe('special characters', () => {
    it('should handle messages with newlines', () => {
      const errors = [createError({ message: 'Error\nwith\nnewlines' })];
      const output = formatValidationErrors(errors);

      expect(output).toContain('Error: Error\nwith\nnewlines');
    });

    it('should handle messages with special characters', () => {
      const errors = [createError({ message: 'Error: "value" is <invalid>' })];
      const output = formatValidationErrors(errors);

      expect(output).toContain('Error: Error: "value" is <invalid>');
    });
  });
});
