/** Same-id pricing inheritance at the canonical registry merge point (#7132). */
import { describe, expect, it } from 'vitest';
import {
  ModelRegistry,
  DEFAULT_ENTRY,
  pricingSourceOf,
  type ModelEntry,
} from './model-registry.js';

const lower: ModelEntry = {
  ...DEFAULT_ENTRY,
  id: 'overlay-model',
  vendor: 'anthropic',
  family: 'claude-opus',
  source: 'in-tree',
  profileId: 'overlay-test',
  contextWindow: 200_000,
  notes: 'Lower-tier metadata',
  pricing: { inputPer1M: 5, outputPer1M: 25, cacheReadPer1M: 0.5 },
  pricingProvenance: {
    source: 'anthropic',
    scope: 'project-glasswing-participants',
    upstreamUrl: 'https://www.anthropic.com/glasswing',
  },
};

const metadataOnly: ModelEntry = {
  ...DEFAULT_ENTRY,
  id: lower.id,
  vendor: lower.vendor,
  family: lower.family,
  source: 'manifest',
  profileId: 'overlay-test',
  contextWindow: 100_000,
};

describe('ModelRegistry overlay pricing inheritance (#7132)', () => {
  it('keeps the lower tier rate, provenance and list basis under a metadata-only overlay', () => {
    const entry = new ModelRegistry({
      inTreeEntries: [lower],
      manifestEntries: [metadataOnly],
    }).getEntry(lower.id);
    expect(entry.contextWindow).toBe(100_000);
    expect(entry.source).toBe('manifest');
    expect(entry.pricing).toEqual(lower.pricing);
    expect(entry.pricingProvenance).toEqual(lower.pricingProvenance);
    expect(pricingSourceOf(entry)).toBe('in-tree');
  });

  it('inherits pricing only: other omitted optional fields are still replaced', () => {
    const entry = new ModelRegistry({
      inTreeEntries: [lower],
      manifestEntries: [metadataOnly],
    }).getEntry(lower.id);
    expect(entry.notes).toBeUndefined();
  });

  it('replaces the whole rate and drops the lower billing scope when the overlay supplies pricing', () => {
    const overlay: ModelEntry = { ...metadataOnly, pricing: { inputPer1M: 0, outputPer1M: 0 } };
    const entry = new ModelRegistry({
      inTreeEntries: [lower],
      manifestEntries: [overlay],
    }).getEntry(lower.id);
    expect(entry.pricing).toEqual({ inputPer1M: 0, outputPer1M: 0 });
    expect(entry.pricingProvenance).toBeUndefined();
    expect(pricingSourceOf(entry)).toBe('manifest');
  });

  it('marks a supplied rate as manifest even when it reuses a lower-tier rate object', () => {
    const registry = new ModelRegistry({ inTreeEntries: [lower] });
    const inTree = registry.getEntry(lower.id);
    const entry = new ModelRegistry({
      inTreeEntries: [inTree],
      manifestEntries: [{ ...inTree, source: 'manifest' }],
    }).getEntry(lower.id);
    expect(pricingSourceOf(entry)).toBe('manifest');
  });

  it.each(['generated', 'models-dev'] as const)('inherits pricing from the %s tier', (source) => {
    const catalog = { ...lower, source };
    const entry = new ModelRegistry({
      generatedEntries: source === 'generated' ? [catalog] : [],
      modelsDevEntries: source === 'models-dev' ? [catalog] : [],
      manifestEntries: [metadataOnly],
    }).getEntry(lower.id);
    expect(entry.pricing).toEqual(lower.pricing);
    expect(pricingSourceOf(entry)).toBe(source);
  });

  it('does not invent pricing for a new manifest model or an empty registry', () => {
    expect(
      new ModelRegistry({ manifestEntries: [metadataOnly] }).getEntry(lower.id).pricing
    ).toBeUndefined();
    expect(new ModelRegistry().getEntry(lower.id).pricing).toBeUndefined();
  });
});
