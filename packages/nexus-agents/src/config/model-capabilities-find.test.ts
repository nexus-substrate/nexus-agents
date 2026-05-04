/**
 * Tests for findModelsByCli — the missing-from-the-family helper added in #2342.
 *
 * Mirrors the shape of findModelsByProvider / findModelsByOutputModality etc.
 * Used by adapter alias-map builders so the "iterate models filtered by cliName"
 * boilerplate lives in one place.
 *
 * @module config/model-capabilities-find.test
 */

import { describe, it, expect } from 'vitest';
import { findModelsByCli, DEFAULT_MODEL_CAPABILITIES } from './model-capabilities.js';

describe('findModelsByCli', () => {
  it('returns only models whose cliName matches the query', () => {
    const result = findModelsByCli('claude');
    expect(result.length).toBeGreaterThan(0);
    for (const model of result) {
      expect(model.cliName).toBe('claude');
    }
  });

  it('partitions the registry: every model belongs to exactly one cliName bucket', () => {
    const buckets: Record<string, number> = {};
    for (const model of DEFAULT_MODEL_CAPABILITIES.models) {
      const key = model.cliName ?? '__null__';
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    let partitioned = 0;
    for (const cli of Object.keys(buckets)) {
      if (cli === '__null__') continue;
      partitioned += findModelsByCli(cli as 'claude').length;
    }
    expect(partitioned).toBe(
      DEFAULT_MODEL_CAPABILITIES.models.filter((m) => m.cliName !== undefined).length
    );
  });

  it('returns an empty array for a CLI with no models', () => {
    // Cast: the registry's CliName union doesn't include 'nonexistent', but
    // the runtime filter handles unknown values gracefully.
    const result = findModelsByCli('nonexistent' as 'claude');
    expect(result).toEqual([]);
  });
});
