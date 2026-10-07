/**
 * Tests for the agy invocation helpers shared by the gemini adapter and the
 * `pnpm review` script (#4389, #6277).
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_GEMINI_CLI_MODEL, agyPrintTimeoutArgs } from './agy-invocation.js';
import { getCliModelName, getDefaultModelForCli } from '../../config/model-config-helpers.js';

describe('agyPrintTimeoutArgs', () => {
  it('gives agy the budget minus 5 s of headroom, in whole seconds', () => {
    expect(agyPrintTimeoutArgs(60_000)).toEqual(['--print-timeout', '55s']);
  });

  it('never goes below the 30 s floor', () => {
    expect(agyPrintTimeoutArgs(10_000)).toEqual(['--print-timeout', '30s']);
  });

  it('omits the flag when there is no budget', () => {
    expect(agyPrintTimeoutArgs(undefined)).toEqual([]);
  });
});

describe('DEFAULT_GEMINI_CLI_MODEL', () => {
  it('is the registry default for the gemini arm', () => {
    expect(DEFAULT_GEMINI_CLI_MODEL).toBe(getCliModelName(getDefaultModelForCli('gemini')));
  });
});
