/**
 * Tests for newline and control character injection defense in sandbox-exec.ts.
 *
 * @module cli/sandbox-exec-newline.test
 */

import { describe, it, expect } from 'vitest';
import { validateCommandWithPolicy, safeExecSandboxed } from './sandbox-exec.js';

describe('Sandbox Exec - Newline and Control Character Injection Prevention', () => {
  it('blocks commands with newline argument splitting', () => {
    const result = validateCommandWithPolicy('git status\nrm -rf /');
    expect(result).not.toBeNull();
  });

  it('blocks commands with CRLF argument splitting', () => {
    const result = validateCommandWithPolicy('git status\r\nrm -rf /');
    expect(result).not.toBeNull();
  });

  it('blocks commands with unquoted newline between command and args', () => {
    const result = validateCommandWithPolicy('echo\nwhoami');
    expect(result).not.toBeNull();
  });

  it('blocks commands with newline in quoted arguments', () => {
    const result = validateCommandWithPolicy('echo "hello\nwhoami"');
    expect(result).not.toBeNull();
  });

  it('blocks commands with null bytes', () => {
    const result = validateCommandWithPolicy('git status\0whoami');
    expect(result).not.toBeNull();
  });

  it('safeExecSandboxed returns null for newline injection', () => {
    const result = safeExecSandboxed('echo hello\nwhoami', { context: 'read' });
    expect(result).toBeNull();
  });
});
