/**
 * Tests for CLI error helpers (#6691).
 *
 * @module cli-adapters/cli-error-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  isTimeoutReason,
  createAbortCliError,
  isCancelledCliError,
  isTimeoutText,
  createCliError,
  createCallerInputCliError,
  isCallerInputCliError,
  isRetryableErrorCode,
} from './cli-error-helpers.js';

describe('cli-error-helpers', () => {
  describe('isTimeoutReason (#6691)', () => {
    it('returns false for null and undefined', () => {
      expect(isTimeoutReason(null)).toBe(false);
      expect(isTimeoutReason(undefined)).toBe(false);
    });

    it('returns true for string containing timeout keywords', () => {
      expect(isTimeoutReason('execution timed out')).toBe(true);
      expect(isTimeoutReason('connection timeout after 5000ms')).toBe(true);
      expect(isTimeoutReason('ETIMEDOUT')).toBe(true);
    });

    it('returns false for unrelated strings', () => {
      expect(isTimeoutReason('cancelled via cancel_job')).toBe(false);
      expect(isTimeoutReason('user abort')).toBe(false);
    });

    it('returns true for error object with name TimeoutError or WatchdogTimeoutError', () => {
      const timeoutErr = new Error('aborted');
      timeoutErr.name = 'TimeoutError';
      expect(isTimeoutReason(timeoutErr)).toBe(true);

      const watchdogErr = new Error('stop');
      watchdogErr.name = 'WatchdogTimeoutError';
      expect(isTimeoutReason(watchdogErr)).toBe(true);
    });

    it('returns true for error object whose message contains timeout text', () => {
      const err = new Error('Worker timed out after 30000ms');
      expect(isTimeoutReason(err)).toBe(true);
    });

    it('returns false for error object without timeout name or message', () => {
      const cancelErr = new Error('Operation was aborted');
      cancelErr.name = 'AbortError';
      expect(isTimeoutReason(cancelErr)).toBe(false);
    });
  });

  describe('createAbortCliError (#6691)', () => {
    it('returns CANCELLED error with retryable: false for caller abort before spawn', () => {
      const error = createAbortCliError('claude', undefined, 'before_spawn');
      expect(error.code).toBe('CANCELLED');
      expect(error.message).toBe('Aborted before spawn');
      expect(error.cli).toBe('claude');
      expect(error.retryable).toBe(false);
    });

    it('returns CANCELLED error with retryable: false for caller abort mid-execution', () => {
      const cancelReason = new Error('cancelled via cancel_job');
      cancelReason.name = 'AbortError';
      const error = createAbortCliError('gemini', cancelReason, 'mid_execution');
      expect(error.code).toBe('CANCELLED');
      expect(error.message).toBe('Aborted by caller signal');
      expect(error.cli).toBe('gemini');
      expect(error.retryable).toBe(false);
    });

    it('returns TIMEOUT error when abort reason is a timeout (mid-execution)', () => {
      const timeoutReason = new Error('Worker timeout after 100ms');
      timeoutReason.name = 'TimeoutError';
      const error = createAbortCliError('codex', timeoutReason, 'mid_execution');
      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe('Execution timed out by watchdog');
      expect(error.cli).toBe('codex');
    });

    it('returns TIMEOUT error when abort reason is a timeout (before spawn)', () => {
      const error = createAbortCliError('opencode', 'timed out', 'before_spawn');
      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe('Execution timed out before spawn');
      expect(error.cli).toBe('opencode');
    });
  });

  describe('isCancelledCliError (#6691)', () => {
    it('returns true for CANCELLED code and false for other codes', () => {
      const cancelled = createCliError('CANCELLED', 'aborted', 'claude');
      const timeout = createCliError('TIMEOUT', 'timeout', 'claude');
      expect(isCancelledCliError(cancelled)).toBe(true);
      expect(isCancelledCliError(timeout)).toBe(false);
    });
  });

  describe('isTimeoutText', () => {
    it('detects timeout patterns case-insensitively', () => {
      expect(isTimeoutText('Operation timed out')).toBe(true);
      expect(isTimeoutText('GATEWAY TIMEOUT')).toBe(true);
      expect(isTimeoutText('etimedout in socket')).toBe(true);
      expect(isTimeoutText('unknown connection issue')).toBe(false);
    });
  });

  describe('createCallerInputCliError and isCallerInputCliError', () => {
    it('marks error with ValidationError cause and non-retryable', () => {
      const error = createCallerInputCliError('invalid model foo', 'claude');
      expect(error.code).toBe('EXECUTION_ERROR');
      expect(error.retryable).toBe(false);
      expect(isCallerInputCliError(error)).toBe(true);
    });

    it('returns false for ordinary CliError', () => {
      const error = createCliError('EXECUTION_ERROR', 'general error', 'claude');
      expect(isCallerInputCliError(error)).toBe(false);
    });
  });

  describe('isRetryableErrorCode', () => {
    it('identifies transient retryable codes', () => {
      expect(isRetryableErrorCode('TIMEOUT')).toBe(true);
      expect(isRetryableErrorCode('RATE_LIMITED')).toBe(true);
      expect(isRetryableErrorCode('CONNECTION_ERROR')).toBe(true);
      expect(isRetryableErrorCode('CANCELLED')).toBe(false);
      expect(isRetryableErrorCode('EXECUTION_ERROR')).toBe(false);
    });
  });
});
