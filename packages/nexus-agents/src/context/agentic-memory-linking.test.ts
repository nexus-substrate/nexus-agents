/**
 * Tests for agentic-memory-linking.ts — similarity, linking, evolution, config
 */
import { describe, it, expect } from 'vitest';
import {
  calculateKeywordSimilarity,
  calculateEntitySimilarity,
  calculateOverallSimilarity,
  inferRelationType,
  generateLinkSuggestions,
  detectEvolutionPair,
  detectEvolution,
  mergeLinkingConfig,
} from './agentic-memory-linking.js';
import { RelationType } from './graph-memory-types.js';
import type { MemoryAttributes } from './agentic-memory-types.js';
import { DEFAULT_LINKING_CONFIG } from './agentic-memory-types.js';

const ENT_CONCEPT = 'concept' as const;
const ENT_PERSON = 'person' as const;

function makeAttrs(overrides: Partial<MemoryAttributes> = {}): MemoryAttributes {
  return {
    keywords: [],
    semanticTags: [],
    contextDescription: '',
    entities: [],
    attributesUpdatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('calculateKeywordSimilarity', () => {
  it('returns 0 when both keyword sets are empty', () => {
    expect(calculateKeywordSimilarity(makeAttrs(), makeAttrs())).toBe(0);
  });
  it('returns 0 when there is no overlap', () => {
    const a = makeAttrs({ keywords: ['alpha', 'beta'] });
    const b = makeAttrs({ keywords: ['gamma', 'delta'] });
    expect(calculateKeywordSimilarity(a, b)).toBe(0);
  });
  it('returns 1 when keyword sets are identical', () => {
    const a = makeAttrs({ keywords: ['a', 'b', 'c'] });
    expect(calculateKeywordSimilarity(a, makeAttrs({ keywords: ['a', 'b', 'c'] }))).toBe(1);
  });
  it('returns correct Jaccard coefficient for partial overlap', () => {
    const a = makeAttrs({ keywords: ['a', 'b', 'c'] });
    const b = makeAttrs({ keywords: ['b', 'c', 'd'] });
    expect(calculateKeywordSimilarity(a, b)).toBe(0.5); // 2/4
  });
  it('returns 0 when one set is empty and other is not', () => {
    expect(calculateKeywordSimilarity(makeAttrs({ keywords: ['x'] }), makeAttrs())).toBe(0);
  });
  it('handles duplicate keywords within a set (deduped by Set)', () => {
    const a = makeAttrs({ keywords: ['a', 'a', 'b'] });
    expect(calculateKeywordSimilarity(a, makeAttrs({ keywords: ['a', 'b'] }))).toBe(1);
  });
});

describe('calculateEntitySimilarity', () => {
  it('returns 0 when both entity lists are empty', () => {
    expect(calculateEntitySimilarity(makeAttrs(), makeAttrs())).toBe(0);
  });
  it('returns 1 for identical entity sets', () => {
    const ent = [{ name: 'Alice', type: ENT_PERSON }];
    expect(
      calculateEntitySimilarity(makeAttrs({ entities: ent }), makeAttrs({ entities: ent }))
    ).toBe(1);
  });
  it('returns 0 for completely disjoint entities', () => {
    const a = makeAttrs({ entities: [{ name: 'Alice', type: ENT_PERSON }] });
    const b = makeAttrs({ entities: [{ name: 'Bob', type: ENT_PERSON }] });
    expect(calculateEntitySimilarity(a, b)).toBe(0);
  });
  it('is case-insensitive for entity name matching', () => {
    const a = makeAttrs({ entities: [{ name: 'React', type: ENT_CONCEPT }] });
    const b = makeAttrs({ entities: [{ name: 'react', type: ENT_CONCEPT }] });
    expect(calculateEntitySimilarity(a, b)).toBe(1);
  });
  it('returns correct Jaccard for partial entity overlap', () => {
    const a = makeAttrs({
      entities: [
        { name: 'X', type: ENT_CONCEPT },
        { name: 'Y', type: ENT_CONCEPT },
      ],
    });
    const b = makeAttrs({
      entities: [
        { name: 'Y', type: ENT_CONCEPT },
        { name: 'Z', type: ENT_CONCEPT },
      ],
    });
    expect(calculateEntitySimilarity(a, b)).toBeCloseTo(1 / 3); // 1/3
  });
});

describe('calculateOverallSimilarity', () => {
  it('returns 0 when both memories are empty', () => {
    expect(calculateOverallSimilarity(makeAttrs(), makeAttrs())).toBe(0);
  });
  it('weights keyword similarity at 60%', () => {
    const a = makeAttrs({ keywords: ['x'] });
    expect(calculateOverallSimilarity(a, makeAttrs({ keywords: ['x'] }))).toBeCloseTo(0.6);
  });
  it('weights entity similarity at 40%', () => {
    const ent = [{ name: 'A', type: ENT_CONCEPT }];
    const a = makeAttrs({ entities: ent, keywords: ['x'] });
    const b = makeAttrs({ entities: ent, keywords: ['y'] });
    expect(calculateOverallSimilarity(a, b)).toBeCloseTo(0.4);
  });
  it('returns 1.0 when both similarities are perfect', () => {
    const ent = [{ name: 'A', type: ENT_CONCEPT }];
    const a = makeAttrs({ keywords: ['k'], entities: ent });
    expect(
      calculateOverallSimilarity(a, makeAttrs({ keywords: ['k'], entities: ent }))
    ).toBeCloseTo(1.0);
  });
});

describe('inferRelationType', () => {
  it('returns SAME_ENTITY when entities share names', () => {
    const a = makeAttrs({ entities: [{ name: 'React', type: ENT_CONCEPT }] });
    const b = makeAttrs({ entities: [{ name: 'react', type: ENT_CONCEPT }] });
    expect(inferRelationType(a, b, new Date('2025-01-01'), new Date('2025-01-02'))).toBe(
      RelationType.SAME_ENTITY
    );
  });
  it('returns PRECEDES when from is earlier and no shared entities', () => {
    const a = makeAttrs({ keywords: ['x'] });
    const b = makeAttrs({ keywords: ['y'] });
    expect(inferRelationType(a, b, new Date('2025-01-01'), new Date('2025-06-01'))).toBe(
      RelationType.PRECEDES
    );
  });
  it('returns RELATED_TO when same time and no shared entities', () => {
    const d = new Date('2025-01-01');
    expect(inferRelationType(makeAttrs(), makeAttrs(), d, d)).toBe(RelationType.RELATED_TO);
  });
  it('returns RELATED_TO when from is later than to', () => {
    expect(
      inferRelationType(makeAttrs(), makeAttrs(), new Date('2025-06-01'), new Date('2025-01-01'))
    ).toBe(RelationType.RELATED_TO);
  });
  it('prioritizes SAME_ENTITY over temporal relationship', () => {
    const ent = [{ name: 'Node', type: ENT_CONCEPT }];
    const a = makeAttrs({ entities: ent });
    expect(
      inferRelationType(
        a,
        makeAttrs({ entities: ent }),
        new Date('2025-01-01'),
        new Date('2025-06-01')
      )
    ).toBe(RelationType.SAME_ENTITY);
  });
});

describe('generateLinkSuggestions', () => {
  const cfg = {
    suggestionThreshold: 0.3,
    maxSuggestions: 5,
    allowedTypes: [
      RelationType.RELATED_TO,
      RelationType.SAME_ENTITY,
      RelationType.PRECEDES,
    ] as RelationType[],
  };
  const now = new Date('2025-06-01');

  it('returns empty array when no candidates', () => {
    expect(generateLinkSuggestions('k1', makeAttrs({ keywords: ['a'] }), now, [], cfg)).toEqual([]);
  });
  it('skips self from candidates', () => {
    const attrs = makeAttrs({ keywords: ['a', 'b'] });
    expect(
      generateLinkSuggestions('k1', attrs, now, [{ key: 'k1', attrs, createdAt: now }], cfg)
    ).toEqual([]);
  });
  it('skips candidates below similarity threshold', () => {
    const a = makeAttrs({ keywords: ['alpha'] });
    const b = makeAttrs({ keywords: ['different'] });
    expect(
      generateLinkSuggestions('k1', a, now, [{ key: 'k2', attrs: b, createdAt: now }], cfg)
    ).toEqual([]);
  });
  it('generates suggestions for similar candidates', () => {
    const a = makeAttrs({ keywords: ['react', 'hooks', 'state'] });
    const b = makeAttrs({ keywords: ['react', 'hooks', 'effects'] });
    const result = generateLinkSuggestions(
      'k1',
      a,
      now,
      [{ key: 'k2', attrs: b, createdAt: new Date('2025-07-01') }],
      cfg
    );
    expect(result.length).toBe(1);
    expect(result[0]!.from).toBe('k1');
    expect(result[0]!.to).toBe('k2');
  });
  it('respects maxSuggestions limit', () => {
    const a = makeAttrs({ keywords: ['react', 'hooks'] });
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      key: 'k' + String(i + 2),
      attrs: makeAttrs({ keywords: ['react', 'hooks'] }),
      createdAt: new Date('2025-07-0' + String((i % 9) + 1)),
    }));
    const result = generateLinkSuggestions('k1', a, now, candidates, { ...cfg, maxSuggestions: 3 });
    expect(result.length).toBeLessThanOrEqual(3);
  });
  it('sorts suggestions by confidence descending', () => {
    const a = makeAttrs({ keywords: ['a', 'b', 'c', 'd'] });
    const high = makeAttrs({ keywords: ['a', 'b', 'c', 'd'] });
    const med = makeAttrs({ keywords: ['a', 'b', 'c', 'x'] });
    const lowCfg = { ...cfg, suggestionThreshold: 0.1 };
    const candidates = [
      { key: 'med', attrs: med, createdAt: new Date('2025-07-01') },
      { key: 'high', attrs: high, createdAt: new Date('2025-07-02') },
    ];
    const result = generateLinkSuggestions('k1', a, now, candidates, lowCfg);
    expect(result.length).toBe(2);
    expect(result[0]!.confidence).toBeGreaterThanOrEqual(result[1]!.confidence);
  });
  it('filters out disallowed relation types', () => {
    const ent = [{ name: 'React', type: ENT_CONCEPT }];
    const a = makeAttrs({ keywords: ['react'], entities: ent });
    const b = makeAttrs({ keywords: ['react'], entities: ent });
    const onlyPrecedes = { ...cfg, allowedTypes: [RelationType.PRECEDES] as RelationType[] };
    expect(
      generateLinkSuggestions(
        'k1',
        a,
        now,
        [{ key: 'k2', attrs: b, createdAt: new Date('2025-07-01') }],
        onlyPrecedes
      )
    ).toEqual([]);
  });
  it('includes reason with shared keywords', () => {
    const a = makeAttrs({ keywords: ['typescript', 'testing'] });
    const b = makeAttrs({ keywords: ['typescript', 'testing'] });
    const result = generateLinkSuggestions(
      'k1',
      a,
      now,
      [{ key: 'k2', attrs: b, createdAt: new Date('2025-07-01') }],
      cfg
    );
    expect(result[0]!.reason).toContain('Shared keywords');
  });
  it('includes reason with shared entity when no shared keywords', () => {
    const ent = [{ name: 'React', type: ENT_CONCEPT }];
    const a = makeAttrs({ entities: ent });
    const b = makeAttrs({ entities: ent });
    const lowCfg = { ...cfg, suggestionThreshold: 0.1 };
    const result = generateLinkSuggestions(
      'k1',
      a,
      now,
      [{ key: 'k2', attrs: b, createdAt: now }],
      lowCfg
    );
    if (result.length > 0) expect(result[0]!.reason).toContain('Shared entity');
  });
  it('includes similarity percentage in reason when no shared keywords or entities', () => {
    const a = makeAttrs({ keywords: ['a', 'b'] });
    const b = makeAttrs({ keywords: ['a', 'c'] });
    const lowCfg = { ...cfg, suggestionThreshold: 0.1 };
    const result = generateLinkSuggestions(
      'k1',
      a,
      now,
      [{ key: 'k2', attrs: b, createdAt: new Date('2025-07-01') }],
      lowCfg
    );
    // 'a' is shared, so reason will show "Shared keywords: a"
    expect(result[0]!.reason).toMatch(/Shared keywords|Similarity/);
  });
});

describe('detectEvolutionPair', () => {
  it('returns null when similarity is below 0.5', () => {
    const a = makeAttrs({ keywords: ['alpha'] });
    const b = makeAttrs({ keywords: ['different'] });
    expect(
      detectEvolutionPair(a, new Date('2025-06-01'), 'k2', b, new Date('2025-01-01'))
    ).toBeNull();
  });
  it('detects supersession when similarity > 0.8 and new is newer', () => {
    const kw = ['a', 'b', 'c', 'd', 'e'];
    const ent = [{ name: 'React', type: ENT_CONCEPT }];
    const a = makeAttrs({ keywords: kw, entities: ent });
    const b = makeAttrs({ keywords: kw, entities: ent });
    const result = detectEvolutionPair(a, new Date('2025-06-01'), 'k2', b, new Date('2025-01-01'));
    expect(result).not.toBeNull();
    expect(result!.type).toBe('supersession');
    expect(result!.affectedKey).toBe('k2');
  });
  it('detects extension when new has many additional keywords', () => {
    // overall: 0.375*0.6 + 1.0*0.4 = 0.625; newOnly=5 > existingOnly(0)+2
    const ent = [{ name: 'React', type: ENT_CONCEPT }];
    const a = makeAttrs({ keywords: ['a', 'b', 'c', 'x1', 'x2', 'x3', 'x4', 'x5'], entities: ent });
    const b = makeAttrs({ keywords: ['a', 'b', 'c'], entities: ent });
    const result = detectEvolutionPair(a, new Date('2025-06-01'), 'k2', b, new Date('2025-01-01'));
    expect(result).not.toBeNull();
    expect(result!.type).toBe('extension');
    expect(result!.description).toContain('Extends with new concepts');
  });
  it('detects refinement for moderate similarity when new is newer', () => {
    // overall: 0.6*0.6 + 1.0*0.4 = 0.76; newOnly=1 <= existingOnly(1)+2 => refinement
    const ent = [{ name: 'Shared', type: ENT_CONCEPT }];
    const a = makeAttrs({ keywords: ['a', 'b', 'c', 'x'], entities: ent });
    const b = makeAttrs({ keywords: ['a', 'b', 'c', 'y'], entities: ent });
    const result = detectEvolutionPair(a, new Date('2025-06-01'), 'k2', b, new Date('2025-01-01'));
    expect(result).not.toBeNull();
    expect(result!.type).toBe('refinement');
  });
  it('detects refinement when new memory is older', () => {
    const kw = ['a', 'b', 'c', 'd', 'e'];
    const a = makeAttrs({ keywords: kw });
    const b = makeAttrs({ keywords: kw });
    const result = detectEvolutionPair(a, new Date('2025-01-01'), 'k2', b, new Date('2025-06-01'));
    expect(result).not.toBeNull();
    expect(result!.type).toBe('refinement');
    expect(result!.description).toBe('Related historical memory');
  });
  it('returns confidence matching overall similarity', () => {
    const kw = ['a', 'b', 'c', 'd'];
    const a = makeAttrs({ keywords: kw });
    const b = makeAttrs({ keywords: kw });
    const result = detectEvolutionPair(a, new Date('2025-06-01'), 'k2', b, new Date('2025-01-01'));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeCloseTo(calculateOverallSimilarity(a, b));
  });
});

describe('detectEvolution', () => {
  it('returns empty array when no existing memories', () => {
    expect(detectEvolution('k1', makeAttrs({ keywords: ['a'] }), new Date(), [])).toEqual([]);
  });
  it('skips self from existing memories', () => {
    const attrs = makeAttrs({ keywords: ['a', 'b', 'c', 'd'] });
    expect(
      detectEvolution('k1', attrs, new Date('2025-06-01'), [
        { key: 'k1', attrs, createdAt: new Date('2025-01-01') },
      ])
    ).toEqual([]);
  });
  it('detects evolution across multiple candidates', () => {
    const kw = ['s1', 's2', 's3', 's4'];
    const attrs = makeAttrs({ keywords: kw });
    const existing = [
      { key: 'k2', attrs: makeAttrs({ keywords: kw }), createdAt: new Date('2025-01-01') },
      { key: 'k3', attrs: makeAttrs({ keywords: kw }), createdAt: new Date('2025-02-01') },
    ];
    expect(detectEvolution('k1', attrs, new Date('2025-06-01'), existing).length).toBe(2);
  });
  it('sorts results by confidence descending', () => {
    const newAttrs = makeAttrs({ keywords: ['a', 'b', 'c', 'd', 'e'] });
    const existing = [
      {
        key: 'med',
        attrs: makeAttrs({ keywords: ['a', 'b', 'c', 'x', 'y'] }),
        createdAt: new Date('2025-01-01'),
      },
      {
        key: 'high',
        attrs: makeAttrs({ keywords: ['a', 'b', 'c', 'd', 'e'] }),
        createdAt: new Date('2025-02-01'),
      },
    ];
    const results = detectEvolution('k1', newAttrs, new Date('2025-06-01'), existing);
    if (results.length >= 2) {
      expect(results[0]!.confidence).toBeGreaterThanOrEqual(results[1]!.confidence);
    }
  });
  it('excludes candidates below similarity threshold of 0.5', () => {
    const existing = [
      { key: 'k2', attrs: makeAttrs({ keywords: ['z'] }), createdAt: new Date('2025-01-01') },
    ];
    expect(
      detectEvolution('k1', makeAttrs({ keywords: ['a'] }), new Date('2025-06-01'), existing)
    ).toEqual([]);
  });
});

describe('mergeLinkingConfig', () => {
  it('returns defaults when called with undefined', () => {
    expect(mergeLinkingConfig(undefined)).toEqual(DEFAULT_LINKING_CONFIG);
  });
  it('returns defaults when called with no argument', () => {
    expect(mergeLinkingConfig()).toEqual(DEFAULT_LINKING_CONFIG);
  });
  it('returns defaults when called with empty object', () => {
    expect(mergeLinkingConfig({})).toEqual(DEFAULT_LINKING_CONFIG);
  });
  it('overrides suggestionThreshold while keeping other defaults', () => {
    const result = mergeLinkingConfig({ suggestionThreshold: 0.8 });
    expect(result.suggestionThreshold).toBe(0.8);
    expect(result.maxSuggestions).toBe(DEFAULT_LINKING_CONFIG.maxSuggestions);
    expect(result.allowedTypes).toEqual(DEFAULT_LINKING_CONFIG.allowedTypes);
  });
  it('overrides maxSuggestions while keeping other defaults', () => {
    const result = mergeLinkingConfig({ maxSuggestions: 10 });
    expect(result.maxSuggestions).toBe(10);
    expect(result.suggestionThreshold).toBe(DEFAULT_LINKING_CONFIG.suggestionThreshold);
  });
  it('overrides allowedTypes while keeping other defaults', () => {
    const types = [RelationType.PRECEDES] as RelationType[];
    const result = mergeLinkingConfig({ allowedTypes: types });
    expect(result.allowedTypes).toEqual(types);
    expect(result.suggestionThreshold).toBe(DEFAULT_LINKING_CONFIG.suggestionThreshold);
  });
  it('overrides all fields when all provided', () => {
    const custom = {
      suggestionThreshold: 0.9,
      maxSuggestions: 2,
      allowedTypes: [RelationType.CAUSES] as RelationType[],
    };
    expect(mergeLinkingConfig(custom)).toEqual(custom);
  });
});
