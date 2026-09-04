/**
 * Tests for the shared security-mode env resolver (#3130).
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { ILogger } from '../core/index.js';
import { resolveEnvMode } from './env-mode.js';

const Schema = z.enum(['off', 'audit', 'enforce']);
const VAR = 'NEXUS_TEST_MODE';

/** Minimal logger spy. */
function spyLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: ILogger) {
      return this;
    }),
    setLevel: vi.fn(),
  };
}

describe('resolveEnvMode (#3130)', () => {
  it('returns the parsed value for a valid (case-insensitive) input — no warning', () => {
    const logger = spyLogger();
    expect(resolveEnvMode('ENFORCE', Schema, 'audit', VAR, { logger })).toBe('enforce');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns the fallback for unset/empty WITHOUT warning (absence is normal)', () => {
    const logger = spyLogger();
    expect(resolveEnvMode(undefined, Schema, 'audit', VAR, { logger })).toBe('audit');
    expect(resolveEnvMode('', Schema, 'audit', VAR, { logger })).toBe('audit');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('coerces an invalid NON-EMPTY value to the fallback AND warns (#3130)', () => {
    const logger = spyLogger();
    expect(resolveEnvMode('enfroce', Schema, 'audit', VAR, { logger })).toBe('audit');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(VAR),
      expect.objectContaining({ raw: 'enfroce', default: 'audit' })
    );
  });

  it('never throws on any input', () => {
    const logger = spyLogger();
    expect(() => resolveEnvMode('garbage', Schema, 'off', VAR, { logger })).not.toThrow();
  });
});

describe('invalidFallback - a typo may tighten the gate, never loosen it', () => {
  it('omitting it leaves the invalid path on `fallback`, exactly as before', () => {
    const logger = spyLogger();
    // Regression guard for the other two callers: neither passes
    // invalidFallback, so neither may change behaviour.
    expect(resolveEnvMode('enfroce', Schema, 'off', VAR, { logger })).toBe('off');
    expect(resolveEnvMode('enfroce', Schema, 'enforce', VAR, { logger })).toBe('enforce');
  });

  it('routes ONLY the invalid path to it - unset and empty still use `fallback`', () => {
    const logger = spyLogger();
    const opts = { logger, invalidFallback: 'audit' as const };
    // The distinction the whole change rests on: absence and a typo are
    // different states, and now resolve differently.
    expect(resolveEnvMode(undefined, Schema, 'off', VAR, opts)).toBe('off');
    expect(resolveEnvMode('', Schema, 'off', VAR, opts)).toBe('off');
    expect(resolveEnvMode('enfroce', Schema, 'off', VAR, opts)).toBe('audit');
    // Unset/empty stay silent - they are not operator errors.
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('never diverts a VALID value', () => {
    const logger = spyLogger();
    const opts = { logger, invalidFallback: 'audit' as const };
    expect(resolveEnvMode('off', Schema, 'enforce', VAR, opts)).toBe('off');
    expect(resolveEnvMode('enforce', Schema, 'off', VAR, opts)).toBe('enforce');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns with the mode actually applied, not just the unset default', () => {
    const logger = spyLogger();
    resolveEnvMode('enfroce', Schema, 'off', VAR, { logger, invalidFallback: 'audit' });
    // A line reading "coercing to default" would name `off`, a value the
    // process did not use. The log and the runtime have to agree.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('audit'),
      expect.objectContaining({ raw: 'enfroce', default: 'off', applied: 'audit' })
    );
  });
});
