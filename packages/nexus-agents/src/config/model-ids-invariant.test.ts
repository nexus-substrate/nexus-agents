/**
 * Invariant test for the MODEL_IDS narrow-union enum (#2546 slice D).
 *
 * `MODEL_IDS` in `model-capabilities-types.ts` is a hand-maintained
 * tuple that drives the `ModelId` literal-union type and the
 * `z.enum(MODEL_IDS)` validation in `ModelCapabilitySchema`. This
 * test asserts the tuple stays in sync with the registry's in-tree
 * entries — if you add or remove an entry from
 * `DEFAULT_MODEL_CAPABILITIES.models`, you must also update
 * `MODEL_IDS` (and this test will fail until you do).
 *
 * The narrow type can't be auto-derived because TypeScript needs a
 * compile-time literal-tuple for `as const`; deriving from a runtime
 * `.map(e => e.id)` widens to `string[]`. Slice E (#2605) revisits
 * this when `model-capabilities.ts` is deleted.
 *
 * @module config/model-ids-invariant.test
 */

import { describe, expect, it } from 'vitest';

import { buildInTreeEntries } from './in-tree-entries.js';
import { MODEL_IDS } from './model-capabilities-types.js';

describe('MODEL_IDS invariant (#2546 slice D)', () => {
  it('matches the set of in-tree registry entry ids exactly', () => {
    const registryIds = new Set(buildInTreeEntries().map((e) => e.id));
    const enumIds = new Set<string>(MODEL_IDS);

    const inRegistryNotEnum = [...registryIds].filter((id) => !enumIds.has(id));
    const inEnumNotRegistry = [...enumIds].filter((id) => !registryIds.has(id));

    expect(
      inRegistryNotEnum,
      'Registry has model ids missing from MODEL_IDS — add them to model-capabilities-types.ts'
    ).toEqual([]);
    expect(
      inEnumNotRegistry,
      'MODEL_IDS has ids missing from the registry — remove them or add matching entries'
    ).toEqual([]);
  });

  it('enum length matches registry entry count', () => {
    expect(MODEL_IDS.length).toBe(buildInTreeEntries().length);
  });
});
