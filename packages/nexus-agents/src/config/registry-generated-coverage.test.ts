/**
 * Coverage/parity tests for the generated-catalog breadth tier (#3293).
 *
 * Proves the "connect the 1071, don't drop it" step: after ingesting
 * `model-registry.generated.json` as a lowest-priority breadth tier, the
 * ModelRegistry covers every catalog id with its real (litellm) data — the
 * coverage the legacy CapabilityDiscovery T2 tier provided — WITHOUT regressing
 * the authoritative in-tree / models-dev tiers.
 */

import { describe, it, expect } from 'vitest';
import { ModelRegistry } from './model-registry.js';
import { loadGeneratedRegistryEntries } from './models-generated-loader.js';
import { buildInTreeEntries } from './in-tree-entries.js';

const generated = loadGeneratedRegistryEntries();

describe('loadGeneratedRegistryEntries (#3293)', () => {
  it('loads the full catalog as ModelEntry records tagged source=generated', () => {
    expect(generated.status).toBe('loaded');
    expect(generated.entries.length).toBeGreaterThan(1000); // ~1071
    for (const e of generated.entries.slice(0, 50)) {
      expect(e.source).toBe('generated');
      expect(typeof e.id).toBe('string');
      // behavior fields are present (derived), so it's a valid ModelEntry
      expect(typeof e.profileId).toBe('string');
    }
  });

  it('carries real context windows from the catalog (not bare defaults)', () => {
    const withCtx = generated.entries.filter((e) => typeof e.contextWindow === 'number');
    expect(withCtx.length).toBeGreaterThan(500);
  });
});

describe('registry breadth coverage (#3293)', () => {
  // A registry built exactly like the default, so the test is hermetic.
  const reg = new ModelRegistry({
    inTreeEntries: buildInTreeEntries(),
    generatedEntries: generated.entries,
  });

  it('resolves EVERY generated id to its catalog context window (coverage preserved)', () => {
    let mismatches = 0;
    for (const e of generated.entries) {
      if (typeof e.contextWindow !== 'number') continue;
      const resolved = reg.getEntry(e.id);
      if (resolved.contextWindow !== e.contextWindow) mismatches++;
    }
    // The breadth tier must surface the catalog's context window for every id
    // it has one for — zero mismatches = full parity with the old T2 coverage.
    expect(mismatches).toBe(0);
  });

  it('does NOT shadow authoritative in-tree entries', () => {
    // claude-opus is in-tree; the generated tier (lowest priority) must not win.
    const opus = reg.getEntry('claude-opus');
    expect(opus.source).toBe('in-tree');
  });

  it('still returns a usable derived entry for a completely unknown id (never throws)', () => {
    const unknown = reg.getEntry('totally-made-up-model-xyz');
    expect(unknown.source).toBe('derived');
    expect(typeof unknown.profileId).toBe('string'); // a complete ModelEntry
  });
});
