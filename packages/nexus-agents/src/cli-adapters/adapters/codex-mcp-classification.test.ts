/**
 * Tests for codex-mcp error classification (#4373, from the #4351 audit).
 *
 * Every other CLI adapter extends `SubprocessCliAdapter` and inherits the shared
 * classification pipeline, which checks `isRateLimitText` before falling back.
 * `CodexMcpAdapter` extends `BaseCliAdapter` instead and classifies on its own:
 * `determineErrorCode` only matched ENOENT / timeout / connection, and
 * `parseToolResult` hardcoded `EXECUTION_ERROR` for any `isError: true` result
 * without looking at the message at all.
 *
 * The consequence is not cosmetic. The voter serving-gate (#4330) excludes a CLI
 * whose circuit has opened, and the circuit only counts failures the breaker is
 * configured to count — `RATE_LIMITED` counts, `EXECUTION_ERROR` is generic. A
 * quota-dead codex-mcp therefore never looked like a serving failure.
 *
 * @module cli-adapters/adapters/codex-mcp-classification.test
 */

import { describe, it, expect } from 'vitest';
import { determineErrorCode } from './codex-mcp-adapter-helpers.js';

describe('codex-mcp error classification (#4373)', () => {
  describe('rate-limit and quota messages', () => {
    // The same corpus the shared `RATE_LIMIT_PATTERNS` recognises, so the two
    // paths agree rather than drifting.
    const rateLimited = [
      'Rate limit exceeded, please retry',
      'Key limit exceeded',
      '429 Too Many Requests',
      'quota exceeded for this key',
      'You have hit your usage limit',
      'Request throttled',
    ];

    for (const message of rateLimited) {
      it(`classifies "${message}" as RATE_LIMITED`, () => {
        expect(determineErrorCode(message)).toBe('RATE_LIMITED');
      });
    }
  });

  describe('existing classifications are unchanged', () => {
    it('still detects a missing binary', () => {
      expect(determineErrorCode('spawn codex ENOENT')).toBe('NOT_FOUND');
    });

    it('still detects a timeout', () => {
      expect(determineErrorCode('operation timeout after 30s')).toBe('TIMEOUT');
    });

    it('still detects a dropped connection', () => {
      expect(determineErrorCode('connection reset by peer')).toBe('CONNECTION_ERROR');
    });

    it('falls back to EXECUTION_ERROR for anything else', () => {
      expect(determineErrorCode('something went sideways')).toBe('EXECUTION_ERROR');
    });
  });

  describe('classification precedence', () => {
    it('prefers NOT_FOUND over rate-limit when both could match', () => {
      // A missing binary is actionable and terminal; a rate-limit reading would
      // send the caller down a retry path that can never succeed.
      expect(determineErrorCode('ENOENT: rate limit config not found')).toBe('NOT_FOUND');
    });

    it('prefers a timeout reading over rate-limit', () => {
      expect(determineErrorCode('timeout waiting for rate limit window')).toBe('TIMEOUT');
    });
  });
});
