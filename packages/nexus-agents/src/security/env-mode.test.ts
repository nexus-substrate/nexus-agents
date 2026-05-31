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
    expect(resolveEnvMode('ENFORCE', Schema, 'audit', VAR, logger)).toBe('enforce');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns the fallback for unset/empty WITHOUT warning (absence is normal)', () => {
    const logger = spyLogger();
    expect(resolveEnvMode(undefined, Schema, 'audit', VAR, logger)).toBe('audit');
    expect(resolveEnvMode('', Schema, 'audit', VAR, logger)).toBe('audit');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('coerces an invalid NON-EMPTY value to the fallback AND warns (#3130)', () => {
    const logger = spyLogger();
    expect(resolveEnvMode('enfroce', Schema, 'audit', VAR, logger)).toBe('audit');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(VAR),
      expect.objectContaining({ raw: 'enfroce', default: 'audit' })
    );
  });

  it('never throws on any input', () => {
    const logger = spyLogger();
    expect(() => resolveEnvMode('garbage', Schema, 'off', VAR, logger)).not.toThrow();
  });
});
