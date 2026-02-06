/**
 * Tests for Agentic Memory Primitives
 *
 * @module context/agentic-memory-primitives.test
 */

import { describe, it, expect } from 'vitest';
import {
  EntityType,
  EntityTypeSchema,
  EntityReferenceSchema,
  EvolutionType,
  EvolutionResultSchema,
  LinkSuggestionSchema,
} from './agentic-memory-primitives.js';

// ============================================================================
// EntityType constants
// ============================================================================

describe('EntityType', () => {
  it('has expected values', () => {
    expect(EntityType.PERSON).toBe('person');
    expect(EntityType.ORGANIZATION).toBe('organization');
    expect(EntityType.CONCEPT).toBe('concept');
    expect(EntityType.CODE).toBe('code');
    expect(EntityType.FILE).toBe('file');
    expect(EntityType.UNKNOWN).toBe('unknown');
  });
});

// ============================================================================
// EntityTypeSchema
// ============================================================================

describe('EntityTypeSchema', () => {
  it('accepts valid entity types', () => {
    expect(EntityTypeSchema.safeParse('person').success).toBe(true);
    expect(EntityTypeSchema.safeParse('code').success).toBe(true);
    expect(EntityTypeSchema.safeParse('file').success).toBe(true);
  });

  it('rejects invalid entity type', () => {
    expect(EntityTypeSchema.safeParse('invalid').success).toBe(false);
    expect(EntityTypeSchema.safeParse(42).success).toBe(false);
  });
});

// ============================================================================
// EntityReferenceSchema
// ============================================================================

describe('EntityReferenceSchema', () => {
  it('accepts valid entity reference', () => {
    const result = EntityReferenceSchema.safeParse({
      name: 'WaveScheduler',
      type: 'code',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = EntityReferenceSchema.safeParse({
      name: '',
      type: 'code',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name over 200 chars', () => {
    const result = EntityReferenceSchema.safeParse({
      name: 'x'.repeat(201),
      type: 'code',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid entity type', () => {
    const result = EntityReferenceSchema.safeParse({
      name: 'valid',
      type: 'bogus',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// EvolutionType constants
// ============================================================================

describe('EvolutionType', () => {
  it('has expected values', () => {
    expect(EvolutionType.REFINEMENT).toBe('refinement');
    expect(EvolutionType.CONTRADICTION).toBe('contradiction');
    expect(EvolutionType.EXTENSION).toBe('extension');
    expect(EvolutionType.SUPERSESSION).toBe('supersession');
  });
});

// ============================================================================
// EvolutionResultSchema
// ============================================================================

describe('EvolutionResultSchema', () => {
  it('accepts valid evolution result', () => {
    const result = EvolutionResultSchema.safeParse({
      type: 'refinement',
      affectedKey: 'mem-1',
      confidence: 0.85,
      description: 'Improved understanding',
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence out of range', () => {
    expect(
      EvolutionResultSchema.safeParse({
        type: 'refinement',
        affectedKey: 'mem-1',
        confidence: 1.5,
        description: 'Too high',
      }).success
    ).toBe(false);

    expect(
      EvolutionResultSchema.safeParse({
        type: 'refinement',
        affectedKey: 'mem-1',
        confidence: -0.1,
        description: 'Too low',
      }).success
    ).toBe(false);
  });

  it('rejects empty affectedKey', () => {
    const result = EvolutionResultSchema.safeParse({
      type: 'extension',
      affectedKey: '',
      confidence: 0.5,
      description: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects description over 500 chars', () => {
    const result = EvolutionResultSchema.safeParse({
      type: 'extension',
      affectedKey: 'key',
      confidence: 0.5,
      description: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// LinkSuggestionSchema
// ============================================================================

describe('LinkSuggestionSchema', () => {
  it('accepts valid link suggestion', () => {
    const result = LinkSuggestionSchema.safeParse({
      from: 'mem-1',
      to: 'mem-2',
      relationType: 'related_to',
      reason: 'Similar topics',
      confidence: 0.7,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty from', () => {
    const result = LinkSuggestionSchema.safeParse({
      from: '',
      to: 'mem-2',
      relationType: 'related_to',
      reason: 'test',
      confidence: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty to', () => {
    const result = LinkSuggestionSchema.safeParse({
      from: 'mem-1',
      to: '',
      relationType: 'related_to',
      reason: 'test',
      confidence: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects reason over 200 chars', () => {
    const result = LinkSuggestionSchema.safeParse({
      from: 'mem-1',
      to: 'mem-2',
      relationType: 'related_to',
      reason: 'x'.repeat(201),
      confidence: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const result = LinkSuggestionSchema.safeParse({
      from: 'mem-1',
      to: 'mem-2',
      relationType: 'related_to',
      reason: 'test',
      confidence: 2.0,
    });
    expect(result.success).toBe(false);
  });
});
