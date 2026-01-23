/**
 * nexus-agents custom expert validation
 *
 * Validation helpers for custom expert definitions.
 *
 * (Source: Issue #300)
 */

import { resolve, sep } from 'node:path';
import type { ZodError } from 'zod';
import type { Result } from '../core/index.js';
import { ok, err, SecurityError } from '../core/index.js';
import {
  VALID_EXPERT_TIERS,
  VALID_EXPERT_DOMAINS,
  MAX_SYSTEM_PROMPT_LENGTH,
} from '../config/index.js';

/**
 * Error details for custom expert validation failures.
 */
export interface CustomExpertError {
  /** Expert ID that failed validation */
  expertId: string;
  /** Field that caused the error */
  field: string;
  /** Error message */
  message: string;
  /** Suggestion for fixing the error */
  suggestion?: string;
}

/**
 * Validates that a file path is within the allowed root directory.
 * Prevents path traversal attacks (e.g., ../../../etc/passwd).
 * @param userPath - The user-provided file path
 * @param allowedRoot - The root directory that paths must be within
 * @returns Result with validated absolute path or SecurityError
 */
export function validateConfigPath(
  userPath: string,
  allowedRoot: string
): Result<string, SecurityError> {
  const resolvedRoot = resolve(allowedRoot);
  const resolved = resolve(allowedRoot, userPath);

  if (!resolved.startsWith(resolvedRoot + sep) && resolved !== resolvedRoot) {
    return err(
      new SecurityError('Path traversal detected: config path escapes allowed root directory', {
        context: { userPath, allowedRoot: resolvedRoot },
      })
    );
  }
  return ok(resolved);
}

/**
 * Gets an actionable suggestion for a validation error field.
 */
export function getSuggestion(
  field: string,
  issueMessage: string,
  issueCode: string
): string | undefined {
  if (field === 'tier' || issueMessage.includes('tier')) {
    return `Valid options: ${VALID_EXPERT_TIERS.join(', ')}`;
  }
  if (field === 'domain' || issueMessage.includes('domain')) {
    return `Valid options: ${VALID_EXPERT_DOMAINS.join(', ')}`;
  }
  if (field === 'systemPrompt' && issueCode === 'too_big') {
    return `Maximum length is ${String(MAX_SYSTEM_PROMPT_LENGTH)} characters`;
  }
  if (field === 'capabilities') {
    return 'Provide at least one capability (e.g., task_execution, code_generation)';
  }
  if (field === 'temperature') {
    return 'Value must be between 0 and 1';
  }
  if (field === 'weight') {
    return 'Value must be between 0 and 1';
  }
  return undefined;
}

/**
 * Formats a Zod validation error into a user-friendly message.
 */
export function formatZodError(expertId: string, zodError: ZodError): CustomExpertError[] {
  return zodError.issues.map((issue) => {
    const field = issue.path.join('.') || 'unknown';
    const suggestion = getSuggestion(field, issue.message, issue.code);

    const error: CustomExpertError = {
      expertId,
      field,
      message: issue.message,
    };

    if (suggestion !== undefined) {
      error.suggestion = suggestion;
    }

    return error;
  });
}

/**
 * Formats validation errors for CLI output.
 */
export function formatValidationErrors(errors: readonly CustomExpertError[]): string {
  if (errors.length === 0) {
    return '';
  }

  const lines: string[] = ['Custom expert validation errors:'];

  for (const error of errors) {
    lines.push(`  Error: ${error.message}`);
    if (error.expertId !== 'config') {
      lines.push(`    Expert: ${error.expertId}`);
    }
    if (error.field !== 'unknown' && error.field !== 'file' && error.field !== 'yaml') {
      lines.push(`    Field: ${error.field}`);
    }
    if (error.suggestion !== undefined) {
      lines.push(`    Suggestion: ${error.suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
