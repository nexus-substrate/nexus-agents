/**
 * Integration tests for `allowNonZeroExit` (#4838).
 *
 * These use the REAL `execSync`. The behaviour under test is a Node contract —
 * that a non-zero exit throws an error which still carries the child's stdout —
 * and a mocked `execSync` would be asserting my own assumption about that
 * contract rather than the contract itself.
 *
 * `ls` over one existing and one missing path is the vehicle: it exits non-zero
 * *and* writes real output, which is exactly the shape `pnpm audit --json` has
 * when it finds vulnerabilities.
 *
 * @module cli/sandbox-exec-nonzero.test
 */

import { describe, it, expect } from 'vitest';
import { safeExecSandboxed } from './sandbox-exec.js';

const PARTIAL_FAILURE = 'ls /tmp /nonexistent-nexus-4838';

describe('safeExecSandboxed allowNonZeroExit (#4838)', () => {
  it('discards output from a non-zero exit by default', () => {
    // The pre-existing contract, pinned so the new option cannot widen it:
    // callers that do not opt in still cannot mistake a failure for success.
    expect(safeExecSandboxed(PARTIAL_FAILURE, { context: 'read' })).toBeNull();
  });

  it('returns the output a non-zero exit still produced when opted in', () => {
    const result = safeExecSandboxed(PARTIAL_FAILURE, {
      context: 'read',
      allowNonZeroExit: true,
    });

    expect(result).not.toBeNull();
    expect(result).toContain('/tmp');
  });

  it('still returns null when the command produced no output at all', () => {
    // The distinction the option must preserve: "ran and reported something"
    // is not the same as "could not run". Only the former is measurable.
    const result = safeExecSandboxed('ls /nonexistent-nexus-4838-also', {
      context: 'read',
      allowNonZeroExit: true,
    });

    expect(result).toBeNull();
  });

  it('still returns null for a policy-denied command', () => {
    expect(safeExecSandboxed('rm -rf /', { context: 'read', allowNonZeroExit: true })).toBeNull();
  });
});
