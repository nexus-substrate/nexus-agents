/**
 * Tests for models.dev API client.
 * (Source: Issue #1125)
 */

import { describe, it, expect } from 'vitest';
import { findModelInCatalog, convertToPerMillion, MODEL_ID_MAP } from './models-dev-client.js';
import type { ModelsDevEntry } from './models-dev-client.js';

const SAMPLE_CATALOG: ModelsDevEntry[] = [
  {
    id: 'anthropic/claude-opus-4-6',
    name: 'Claude Opus 4.6',
    cost: { input: 5.0, output: 25.0 },
    limit: { context: 200000, output: 64000 },
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    cost: { input: 1.25, output: 10.0 },
    limit: { context: 1048576, output: 65536 },
  },
  {
    id: 'openai/gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    cost: { input: 1.75, output: 14.0 },
    limit: { context: 400000, output: 128000 },
  },
];

describe('findModelInCatalog', () => {
  it('finds model by exact ID', () => {
    const result = findModelInCatalog(SAMPLE_CATALOG, 'anthropic/claude-opus-4-6');
    expect(result).toBeDefined();
    expect(result?.name).toBe('Claude Opus 4.6');
  });

  it('finds model by suffix match via MODEL_ID_MAP', () => {
    const result = findModelInCatalog(SAMPLE_CATALOG, 'claude-opus-4-6');
    expect(result).toBeDefined();
    expect(result?.id).toBe('anthropic/claude-opus-4-6');
  });

  it('returns undefined for unknown model', () => {
    const result = findModelInCatalog(SAMPLE_CATALOG, 'unknown-model');
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty catalog', () => {
    const result = findModelInCatalog([], 'claude-opus-4-6');
    expect(result).toBeUndefined();
  });
});

describe('convertToPerMillion', () => {
  it('converts per-token to per-million', () => {
    expect(convertToPerMillion(0.000005)).toBe(5.0);
  });

  it('handles zero', () => {
    expect(convertToPerMillion(0)).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    expect(convertToPerMillion(0.0000033)).toBe(3.3);
  });
});

describe('MODEL_ID_MAP', () => {
  it('has entries for all core models', () => {
    expect(MODEL_ID_MAP).toHaveProperty('claude-opus-4-6');
    expect(MODEL_ID_MAP).toHaveProperty('claude-sonnet-4-6');
    expect(MODEL_ID_MAP).toHaveProperty('claude-haiku-4-5-20251001');
    expect(MODEL_ID_MAP).toHaveProperty('gemini-2.5-pro');
    expect(MODEL_ID_MAP).toHaveProperty('gemini-2.5-flash');
  });

  it('has at least 7 entries', () => {
    expect(Object.keys(MODEL_ID_MAP).length).toBeGreaterThanOrEqual(7);
  });
});
