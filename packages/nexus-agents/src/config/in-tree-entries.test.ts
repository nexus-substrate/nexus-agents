/**
 * Tests for the in-tree-entries converter (#2546 slice A).
 *
 * @module config/in-tree-entries.test
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_MODEL_CAPABILITIES } from './in-tree-data.js';
import { buildInTreeEntries } from './in-tree-entries.js';
import { getDefaultRegistry, setDefaultRegistry } from './model-registry.js';

describe('buildInTreeEntries', () => {
  it('emits one entry per matrix model', () => {
    const entries = buildInTreeEntries();
    expect(entries.length).toBe(DEFAULT_MODEL_CAPABILITIES.models.length);
  });

  it('every entry has source=in-tree', () => {
    const entries = buildInTreeEntries();
    for (const entry of entries) {
      expect(entry.source).toBe('in-tree');
    }
  });

  it('carries matrix capability fields onto the entry', () => {
    const entries = buildInTreeEntries();
    const opus = entries.find((e) => e.id === 'claude-opus');
    expect(opus).toBeDefined();
    expect(opus?.contextWindow).toBe(1_000_000);
    expect(opus?.maxOutputTokens).toBe(128_000);
    expect(opus?.pricing?.inputPer1M).toBe(5.0);
    expect(opus?.qualityScores?.reasoning).toBe(10);
    expect(opus?.displayName).toBe('Claude Opus 4.6');
  });

  it('derives behaviour fields from vendor/family identity', () => {
    const entries = buildInTreeEntries();
    const opus = entries.find((e) => e.id === 'claude-opus');
    expect(opus?.vendor).toBe('anthropic');
    expect(opus?.family).toBe('claude-opus');
    expect(opus?.parallelToolCalls).toBe(true);
    expect(opus?.promptCaching).toBe('ephemeral');
  });

  it('promotes cliModelName into aliases when distinct from id', () => {
    const entries = buildInTreeEntries();
    const opus = entries.find((e) => e.id === 'claude-opus');
    expect(opus?.aliases).toContain('claude-opus-4-6');
  });

  it('preserves matrix aliases', () => {
    const entries = buildInTreeEntries();
    const opus = entries.find((e) => e.id === 'claude-opus');
    expect(opus?.aliases).toContain('claude-opus-4');
  });

  it('maps gateway providers (openrouter, custom-openai) to unknown vendor', () => {
    const entries = buildInTreeEntries();
    const openrouter = entries.find((e) => e.id === 'openrouter-nemotron-super');
    if (openrouter !== undefined) {
      expect(openrouter.vendor).toBe('unknown');
    }
  });
});

describe('buildDefaultRegistry picks up in-tree entries (#2546 slice A)', () => {
  beforeEach(() => {
    setDefaultRegistry(undefined);
  });

  it('claude-opus resolves to source=in-tree with authoritative data', () => {
    const reg = getDefaultRegistry();
    const entry = reg.getEntry('claude-opus');
    expect(entry.source).toBe('in-tree');
    expect(entry.contextWindow).toBe(1_000_000);
    expect(entry.pricing?.outputPer1M).toBe(25.0);
  });

  it('all matrix model ids resolve to in-tree entries', () => {
    const reg = getDefaultRegistry();
    const allIds = DEFAULT_MODEL_CAPABILITIES.models.map((m) => m.id);
    for (const id of allIds) {
      const entry = reg.getEntry(id);
      expect(entry.source, `expected ${id} source=in-tree`).toBe('in-tree');
    }
  });
});
