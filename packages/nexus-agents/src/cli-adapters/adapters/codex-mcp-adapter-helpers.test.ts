/**
 * Tests for Codex MCP Adapter Helpers
 *
 * Model info lookup functions consolidated into config/model-config-helpers.ts (#886).
 * Tests here cover CLI-specific helpers only.
 *
 * @module cli-adapters/adapters/codex-mcp-adapter-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type {} from '../types.js';
import {
  DEFAULT_CODEX_MCP_OPTIONS,
  CODEX_LEGACY_DEFAULTS,
  extractTextFromContent,
  isRetryableErrorCode,
  createCliError,
  determineErrorCode,
  parseVersionFromOutput,
} from './codex-mcp-adapter-helpers.js';

// ============================================================================
// DEFAULT_CODEX_MCP_OPTIONS
// ============================================================================

describe('DEFAULT_CODEX_MCP_OPTIONS', () => {
  it('has correct defaults', () => {
    expect(DEFAULT_CODEX_MCP_OPTIONS.timeoutMs).toBe(120_000);
    expect(DEFAULT_CODEX_MCP_OPTIONS.allowRetry).toBe(true);
    expect(DEFAULT_CODEX_MCP_OPTIONS.maxRetries).toBe(2);
    expect(DEFAULT_CODEX_MCP_OPTIONS.trackUsage).toBe(true);
  });
});

// ============================================================================
// CODEX_LEGACY_DEFAULTS (re-exported from codex-adapter-helpers)
// ============================================================================

describe('CODEX_LEGACY_DEFAULTS', () => {
  it('is re-exported from codex-adapter-helpers', () => {
    expect(CODEX_LEGACY_DEFAULTS).toBeDefined();
    expect(CODEX_LEGACY_DEFAULTS.displayNames['o3']).toBe('O3');
  });
});

// ============================================================================
// extractTextFromContent
// ============================================================================

describe('extractTextFromContent', () => {
  it('extracts text from content array', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' },
    ];
    expect(extractTextFromContent(content)).toBe('Hello\nWorld');
  });

  it('filters non-text content', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'image' },
      { type: 'text', text: 'World' },
    ];
    expect(extractTextFromContent(content)).toBe('Hello\nWorld');
  });

  it('returns null for undefined content', () => {
    expect(extractTextFromContent(undefined)).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(extractTextFromContent([])).toBeNull();
  });

  it('returns null when no text entries', () => {
    expect(extractTextFromContent([{ type: 'image' }])).toBeNull();
  });

  it('skips entries with undefined text', () => {
    const content = [{ type: 'text' }, { type: 'text', text: 'Valid' }];
    expect(extractTextFromContent(content)).toBe('Valid');
  });
});

// ============================================================================
// isRetryableErrorCode
// ============================================================================

describe('isRetryableErrorCode', () => {
  it('returns true for retryable codes', () => {
    expect(isRetryableErrorCode('RATE_LIMITED')).toBe(true);
    expect(isRetryableErrorCode('TIMEOUT')).toBe(true);
    expect(isRetryableErrorCode('CONNECTION_ERROR')).toBe(true);
  });

  it('returns false for non-retryable codes', () => {
    expect(isRetryableErrorCode('NOT_FOUND')).toBe(false);
    expect(isRetryableErrorCode('PARSE_ERROR')).toBe(false);
    expect(isRetryableErrorCode('EXECUTION_ERROR')).toBe(false);
    expect(isRetryableErrorCode('BUDGET_EXCEEDED')).toBe(false);
  });
});

// ============================================================================
// createCliError
// ============================================================================

describe('createCliError', () => {
  it('creates error with correct fields', () => {
    const error = createCliError('TIMEOUT', 'Request timed out', 'codex');
    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toBe('Request timed out');
    expect(error.cli).toBe('codex');
    expect(error.retryable).toBe(true);
  });

  it('marks non-retryable errors correctly', () => {
    const error = createCliError('NOT_FOUND', 'CLI not found', 'codex');
    expect(error.retryable).toBe(false);
  });

  it('includes cause when provided', () => {
    const cause = new Error('underlying error');
    const error = createCliError('EXECUTION_ERROR', 'Failed', 'codex', cause);
    expect(error.cause).toBe(cause);
  });

  it('omits cause when not provided', () => {
    const error = createCliError('PARSE_ERROR', 'Bad parse', 'codex');
    expect(error.cause).toBeUndefined();
  });
});

// ============================================================================
// determineErrorCode
// ============================================================================

describe('determineErrorCode', () => {
  it('returns NOT_FOUND for ENOENT', () => {
    expect(determineErrorCode('ENOENT: no such file')).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND for "not found"', () => {
    expect(determineErrorCode('codex not found in PATH')).toBe('NOT_FOUND');
  });

  it('returns TIMEOUT for timeout messages', () => {
    expect(determineErrorCode('request timeout exceeded')).toBe('TIMEOUT');
  });

  it('returns TIMEOUT for ETIMEDOUT', () => {
    expect(determineErrorCode('connect ETIMEDOUT')).toBe('TIMEOUT');
  });

  it('returns CONNECTION_ERROR for connection messages', () => {
    expect(determineErrorCode('connection refused')).toBe('CONNECTION_ERROR');
  });

  it('returns CONNECTION_ERROR for disconnect', () => {
    expect(determineErrorCode('server disconnect')).toBe('CONNECTION_ERROR');
  });

  it('returns EXECUTION_ERROR as default', () => {
    expect(determineErrorCode('some unknown error')).toBe('EXECUTION_ERROR');
  });
});

// ============================================================================
// parseVersionFromOutput
// ============================================================================

describe('parseVersionFromOutput', () => {
  it('parses version from output', () => {
    expect(parseVersionFromOutput('codex 1.2.3')).toBe('1.2.3');
  });

  it('parses version with surrounding text', () => {
    expect(parseVersionFromOutput('OpenAI Codex CLI v2.0.1-beta')).toBe('2.0.1');
  });

  it('returns 0.0.0 for no version found', () => {
    expect(parseVersionFromOutput('no version here')).toBe('0.0.0');
  });

  it('handles whitespace', () => {
    expect(parseVersionFromOutput('  3.1.4  ')).toBe('3.1.4');
  });
});
