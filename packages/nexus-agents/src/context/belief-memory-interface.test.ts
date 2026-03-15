/**
 * Tests for Belief Memory Interface schemas and config
 *
 * @module context/belief-memory-interface.test
 */

import { describe, it, expect } from 'vitest';
import {
  BeliefMemoryStatsSchema,
  BeliefMemoryConfigSchema,
  DEFAULT_BELIEF_CONFIG,
} from './belief-memory-interface.js';

// ============================================================================
// DEFAULT_BELIEF_CONFIG
// ============================================================================

describe('DEFAULT_BELIEF_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_BELIEF_CONFIG.maxBeliefsPerSubject).toBe(100);
    expect(DEFAULT_BELIEF_CONFIG.enableInference).toBe(true);
    expect(DEFAULT_BELIEF_CONFIG.defaultConfidence).toBe('medium');
    expect(DEFAULT_BELIEF_CONFIG.maxInferenceDepth).toBe(5);
  });

  it('autoPruneAge is 30 days in ms', () => {
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(DEFAULT_BELIEF_CONFIG.autoPruneAge).toBe(thirtyDaysMs);
  });
});

// ============================================================================
// BeliefMemoryConfigSchema
// ============================================================================

describe('BeliefMemoryConfigSchema', () => {
  it('accepts empty config', () => {
    const result = BeliefMemoryConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts full config', () => {
    const result = BeliefMemoryConfigSchema.safeParse({
      maxBeliefsPerSubject: 50,
      autoPruneAge: 86400000,
      enableInference: false,
      defaultConfidence: 'high',
      maxInferenceDepth: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-positive maxBeliefsPerSubject', () => {
    const result = BeliefMemoryConfigSchema.safeParse({
      maxBeliefsPerSubject: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative autoPruneAge', () => {
    const result = BeliefMemoryConfigSchema.safeParse({
      autoPruneAge: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxInferenceDepth over 10', () => {
    const result = BeliefMemoryConfigSchema.safeParse({
      maxInferenceDepth: 11,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid confidence', () => {
    const result = BeliefMemoryConfigSchema.safeParse({
      defaultConfidence: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// BeliefMemoryStatsSchema
// ============================================================================

describe('BeliefMemoryStatsSchema', () => {
  it('accepts valid stats', () => {
    const result = BeliefMemoryStatsSchema.safeParse({
      totalBeliefs: 10,
      activeBeliefs: 8,
      supersededBeliefs: 2,
      beliefsByConfidence: { high: 5, medium: 3, low: 2, speculative: 0 },
      beliefsBySource: {
        observation: 7,
        inference: 3,
        external: 0,
        user_input: 0,
        hindsight: 0,
        prior: 0,
      },
      totalUpdates: 15,
      totalCounterfactuals: 2,
      totalHindsightRecords: 4,
    });
    expect(result.success).toBe(true);
  });

  it('accepts stats with optional dates', () => {
    const result = BeliefMemoryStatsSchema.safeParse({
      totalBeliefs: 1,
      activeBeliefs: 1,
      supersededBeliefs: 0,
      beliefsByConfidence: { high: 0, medium: 0, low: 0, speculative: 0 },
      beliefsBySource: {
        observation: 0,
        inference: 0,
        external: 0,
        user_input: 0,
        hindsight: 0,
        prior: 0,
      },
      totalUpdates: 0,
      totalCounterfactuals: 0,
      totalHindsightRecords: 0,
      oldestBelief: new Date(),
      newestBelief: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative counts', () => {
    const result = BeliefMemoryStatsSchema.safeParse({
      totalBeliefs: -1,
      activeBeliefs: 0,
      supersededBeliefs: 0,
      beliefsByConfidence: {},
      beliefsBySource: {},
      totalUpdates: 0,
      totalCounterfactuals: 0,
      totalHindsightRecords: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer counts', () => {
    const result = BeliefMemoryStatsSchema.safeParse({
      totalBeliefs: 1.5,
      activeBeliefs: 0,
      supersededBeliefs: 0,
      beliefsByConfidence: {},
      beliefsBySource: {},
      totalUpdates: 0,
      totalCounterfactuals: 0,
      totalHindsightRecords: 0,
    });
    expect(result.success).toBe(false);
  });
});
