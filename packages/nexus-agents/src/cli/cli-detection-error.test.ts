/**
 * Tests for cli-detection-error (#2152).
 *
 * Verifies that execFileSync-style errors are classified into a stable
 * `DetectionError` enum so doctor/verify can tell "not installed" from
 * "hung PATH" from "binary not executable".
 */

import { describe, it, expect } from 'vitest';
import {
  classifyExecError,
  DETECTION_ERROR_MESSAGES,
  DETECTION_ERROR_SOLUTIONS,
  detectionRecoveryHint,
  type DetectionError,
} from './cli-detection-error.js';

describe('classifyExecError (#2152)', () => {
  it('maps ENOENT to not-found (binary missing from PATH)', () => {
    expect(classifyExecError({ code: 'ENOENT' })).toBe('not-found');
  });

  it('maps ETIMEDOUT to timeout', () => {
    expect(classifyExecError({ code: 'ETIMEDOUT' })).toBe('timeout');
  });

  it('maps execFileSync timeout shape (killed + SIGTERM) to timeout', () => {
    // This is the shape Node actually throws when execFileSync's own timeout
    // fires — the child is killed but .code is undefined.
    expect(classifyExecError({ killed: true, signal: 'SIGTERM' })).toBe('timeout');
  });

  it('maps SIGKILL to timeout (some platforms use it)', () => {
    expect(classifyExecError({ signal: 'SIGKILL' })).toBe('timeout');
  });

  it('maps EACCES to permission', () => {
    expect(classifyExecError({ code: 'EACCES' })).toBe('permission');
  });

  it('maps EPERM to permission', () => {
    expect(classifyExecError({ code: 'EPERM' })).toBe('permission');
  });

  it('falls through to "other" for anything unclassified', () => {
    expect(classifyExecError({ code: 'EXYZ' })).toBe('other');
    expect(classifyExecError(new Error('mystery'))).toBe('other');
  });

  it('returns "other" for non-object inputs without crashing', () => {
    expect(classifyExecError(null)).toBe('other');
    expect(classifyExecError(undefined)).toBe('other');
    expect(classifyExecError('string error')).toBe('other');
    expect(classifyExecError(42)).toBe('other');
  });

  it('classification priority: ENOENT wins over signal (defensive)', () => {
    // If an error somehow has both, the OS-level code is the more specific
    // signal — we want "not-found" to take precedence so the user sees the
    // most actionable message.
    expect(classifyExecError({ code: 'ENOENT', signal: 'SIGTERM' })).toBe('not-found');
  });

  it('every DetectionError value has a message', () => {
    // Future-proofing: if someone adds a DetectionError variant, the message
    // map must be updated too. This test prevents silent drift.
    const allErrors: DetectionError[] = ['not-found', 'timeout', 'permission', 'other'];
    for (const err of allErrors) {
      expect(DETECTION_ERROR_MESSAGES[err]).toBeDefined();
      expect(DETECTION_ERROR_MESSAGES[err].length).toBeGreaterThan(0);
    }
  });
});

describe('detectionRecoveryHint (#3213)', () => {
  const all: DetectionError[] = ['not-found', 'timeout', 'permission', 'other'];

  it('has an actionable solution for every detection-error class', () => {
    for (const err of all) {
      expect(typeof DETECTION_ERROR_SOLUTIONS[err]).toBe('function');
      expect(DETECTION_ERROR_SOLUTIONS[err]('opencode').length).toBeGreaterThan(10);
    }
  });

  it('embeds the binary name in a runnable command for the permission case', () => {
    const hint = detectionRecoveryHint('claude', 'permission');
    expect(hint).toContain('chmod +x');
    expect(hint).toContain('command -v claude');
    expect(hint).toContain('TROUBLESHOOTING.md');
  });

  it('defaults to not-found guidance when the class is undefined', () => {
    const hint = detectionRecoveryHint('gemini');
    expect(hint).toContain('Install gemini');
    expect(hint).toContain('INSTALLATION.md');
  });

  it('gives a verbose-logs next step for timeout', () => {
    expect(detectionRecoveryHint('codex', 'timeout')).toContain('--verbose');
  });
});
