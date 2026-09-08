/**
 * Tests for the learning-persistence feature flag (#5464).
 *
 * `NEXUS_PERSIST_LEARNING` is registered in `config/env-schema.ts` and read by
 * `isPersistenceEnabled`. Wave 2 of the one-accept-set migration (#5155 panel,
 * 6-1) moves the read to `parseBoolEnv`, so every `NEXUS_*` boolean answers to
 * the same four spellings instead of each consumer's accident of history.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPersistenceEnabled } from './learning-persistence.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isPersistenceEnabled (#5464)', () => {
  it('defaults ON when the variable is unset', () => {
    vi.stubEnv('NEXUS_PERSIST_LEARNING', undefined);
    expect(isPersistenceEnabled()).toBe(true);
  });

  it.each(['false', 'FALSE', '0'])('treats %s as OFF', (value) => {
    vi.stubEnv('NEXUS_PERSIST_LEARNING', value);
    expect(isPersistenceEnabled()).toBe(false);
  });

  it.each(['true', 'TRUE', '1'])('treats %s as ON', (value) => {
    vi.stubEnv('NEXUS_PERSIST_LEARNING', value);
    expect(isPersistenceEnabled()).toBe(true);
  });

  // Outside the accept-set the fallback applies, and `env-schema.ts` reports
  // the value at startup — so the fallback is never the only signal.
  it('falls back to the default ON for a value outside the accept-set', () => {
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'no');
    expect(isPersistenceEnabled()).toBe(true);
  });
});
