/**
 * Unit tests for the CLI exit-result helpers (#3210).
 *
 * `cliExit` / `cliExitFromStatus` centralize the exit-code → CliExitResult
 * mapping that was previously inlined as `exitCode === 0 ? SUCCESS : ...`
 * ternaries across every CLI handler. These tests pin the mapping so the
 * behavior-preserving guarantee of the migration holds.
 */

import { describe, it, expect } from 'vitest';
import { EXIT_CODES, cliExit, cliExitFromStatus } from './cli-types.js';

describe('cliExit (#3210)', () => {
  it('derives success=true for exit code 0', () => {
    expect(cliExit(EXIT_CODES.SUCCESS)).toEqual({ success: true, exitCode: 0 });
  });

  it('derives success=false for any non-zero exit code', () => {
    expect(cliExit(EXIT_CODES.INVALID_ARGS)).toEqual({ success: false, exitCode: 3 });
    expect(cliExit(EXIT_CODES.NOT_IMPLEMENTED)).toEqual({ success: false, exitCode: 4 });
  });

  it('preserves a provided message', () => {
    expect(cliExit(EXIT_CODES.SERVER_START_FAILED, 'boom')).toEqual({
      success: false,
      exitCode: 1,
      message: 'boom',
    });
  });

  it('omits the message field entirely when none is given', () => {
    expect(cliExit(EXIT_CODES.SUCCESS)).not.toHaveProperty('message');
  });
});

describe('cliExitFromStatus (#3210)', () => {
  it('maps status 0 to SUCCESS', () => {
    expect(cliExitFromStatus(0)).toEqual({ success: true, exitCode: EXIT_CODES.SUCCESS });
  });

  it('maps any non-zero status to SERVER_START_FAILED', () => {
    // This is the exact binary mapping the bulk of handlers used pre-#3210:
    // `exitCode === 0 ? SUCCESS : SERVER_START_FAILED`.
    expect(cliExitFromStatus(1)).toEqual({
      success: false,
      exitCode: EXIT_CODES.SERVER_START_FAILED,
    });
    expect(cliExitFromStatus(2)).toEqual({
      success: false,
      exitCode: EXIT_CODES.SERVER_START_FAILED,
    });
    expect(cliExitFromStatus(99)).toEqual({
      success: false,
      exitCode: EXIT_CODES.SERVER_START_FAILED,
    });
  });

  it('preserves a provided message', () => {
    expect(cliExitFromStatus(0, 'done')).toEqual({
      success: true,
      exitCode: 0,
      message: 'done',
    });
  });
});
