/**
 * Tests for the model-drift detector (#6625, layer 3: detect and propose).
 *
 * Every source here is a fake; nothing touches the network.
 */
import { describe, expect, it } from 'vitest';

import {
  detectModelDrift,
  type DriftRegistryEntry,
  type DriftSource,
  type ListedModel,
} from './model-drift.js';

const NOW_MS = Date.UTC(2026, 8, 23);
const DAY_S = 86_400;
const nowS = Math.floor(NOW_MS / 1000);

const REGISTRY: readonly DriftRegistryEntry[] = [
  {
    id: 'claude-sonnet',
    cliModelName: 'claude-sonnet-4-6',
    aliases: ['claude-sonnet-4-6'],
  },
  { id: 'gemini-flash', cliModelName: 'gemini-2.5-flash', aliases: ['gemini-2.5-flash'] },
  { id: 'gpt-5.5', cliModelName: 'gpt-5.5' },
];

function measured(name: string, models: readonly ListedModel[]): DriftSource {
  return { name, probe: () => Promise.resolve({ status: 'measured', models }) };
}

function noCredentials(name: string): DriftSource {
  return {
    name,
    probe: () => Promise.resolve({ status: 'unmeasured', reason: 'no credentials' }),
  };
}

/** Every registry model listed, so nothing reads as retired. */
const ALL_KNOWN: readonly ListedModel[] = [
  { id: 'claude-sonnet-4-6' },
  { id: 'gemini-2.5-flash' },
  { id: 'gpt-5.5' },
];

describe('detectModelDrift', () => {
  it('reports a model no registry entry names, with a drafted entry', async () => {
    const report = await detectModelDrift({
      sources: [
        measured('vendor-a', [
          ...ALL_KNOWN,
          {
            id: 'claude-opus-4-9',
            createdAt: nowS - 3 * DAY_S,
            contextLength: 1_000_000,
            pricing: { inputPer1M: 5, outputPer1M: 25 },
          },
        ]),
      ],
      registry: REGISTRY,
      nowMs: NOW_MS,
    });

    expect(report.verdict).toBe('drift');
    expect(report.newModels.map((m) => m.draft.id)).toEqual(['claude-opus-4-9']);
    expect(report.newModels[0]?.draft).toMatchObject({
      vendor: 'anthropic',
      family: 'claude-opus',
      tier: 'flagship',
      contextWindow: 1_000_000,
      pricing: { inputPer1M: 5, outputPer1M: 25 },
    });
    expect(report.newModels[0]?.sources).toEqual(['vendor-a']);
  });

  it('marks metadata the source does not publish as unknown', async () => {
    const report = await detectModelDrift({
      sources: [measured('vendor-a', [...ALL_KNOWN, { id: 'claude-haiku-5' }])],
      registry: REGISTRY,
      nowMs: NOW_MS,
    });

    expect(report.newModels[0]?.draft).toMatchObject({
      id: 'claude-haiku-5',
      tier: 'small',
      contextWindow: 'unknown',
      pricing: 'unknown',
      releasedAt: 'unknown',
    });
  });

  it('does not report a dot/dash respelling of a known model as new', async () => {
    const report = await detectModelDrift({
      sources: [
        measured('vendor-a', [
          { id: 'claude-sonnet-4.6' },
          { id: 'gemini-2-5-flash' },
          { id: 'gpt-5-5' },
        ]),
      ],
      registry: REGISTRY,
      nowMs: NOW_MS,
    });

    expect(report.newModels).toEqual([]);
    expect(report.possiblyRetired).toEqual([]);
    expect(report.verdict).toBe('no-drift');
  });

  it('does not report a vendor-prefixed or dated known model as new', async () => {
    const report = await detectModelDrift({
      sources: [
        measured('vendor-a', [
          { id: 'anthropic/claude-sonnet-4-6' },
          { id: 'claude-sonnet-4-6-20260101' },
          { id: 'google/gemini-2.5-flash' },
          { id: 'openai/gpt-5.5' },
        ]),
      ],
      registry: REGISTRY,
      nowMs: NOW_MS,
    });

    expect(report.newModels).toEqual([]);
    expect(report.verdict).toBe('no-drift');
  });

  it('reports a registry model no measured source lists any more', async () => {
    const report = await detectModelDrift({
      // A google model is listed, so the source covers google and the missing
      // gemini-flash entry is a retirement candidate rather than unmeasured.
      sources: [
        measured('vendor-a', [
          { id: 'claude-sonnet-4-6' },
          { id: 'gpt-5.5' },
          { id: 'gemini-9-flash-lite' },
        ]),
      ],
      registry: REGISTRY,
      nowMs: NOW_MS,
    });

    expect(report.possiblyRetired.map((r) => r.id)).toEqual(['gemini-flash']);
    expect(report.retirementUnmeasured).toEqual([]);
    expect(report.verdict).toBe('drift');
  });

  it('does not call a model retired when no measured source covers its vendor', async () => {
    const report = await detectModelDrift({
      sources: [measured('vendor-a', [{ id: 'claude-sonnet-4-6' }])],
      registry: REGISTRY,
      nowMs: NOW_MS,
    });

    expect(report.possiblyRetired).toEqual([]);
    expect(report.retirementUnmeasured).toEqual(['gemini-flash', 'gpt-5.5']);
  });

  it('counts a source without credentials as unmeasured, not as "no new models"', async () => {
    const report = await detectModelDrift({
      sources: [noCredentials('vendor-b')],
      registry: REGISTRY,
      nowMs: NOW_MS,
    });

    expect(report.verdict).toBe('unmeasured');
    expect(report.measuredSources).toBe(0);
    expect(report.coverage).toEqual([
      { source: 'vendor-b', status: 'unmeasured', modelCount: 0, reason: 'no credentials' },
    ]);
    expect(report.possiblyRetired).toEqual([]);
  });

  it('names zero sources unmeasured, never up to date', async () => {
    const report = await detectModelDrift({ sources: [], registry: REGISTRY, nowMs: NOW_MS });
    expect(report.verdict).toBe('unmeasured');
  });

  it('records a throwing probe as failed and keeps the other sources', async () => {
    const report = await detectModelDrift({
      sources: [
        { name: 'broken', probe: () => Promise.reject(new Error('HTTP 503')) },
        measured('vendor-a', ALL_KNOWN),
      ],
      registry: REGISTRY,
      nowMs: NOW_MS,
    });

    expect(report.coverage[0]).toEqual({
      source: 'broken',
      status: 'failed',
      modelCount: 0,
      reason: 'HTTP 503',
    });
    expect(report.measuredSources).toBe(1);
    expect(report.partialCoverage).toBe(true);
    expect(report.verdict).toBe('no-drift');
  });

  it('leaves out non-chat models, other vendors and models older than the window', async () => {
    const report = await detectModelDrift({
      sources: [
        measured('vendor-a', [
          ...ALL_KNOWN,
          { id: 'text-embedding-9-large' },
          { id: 'someorg/unrelated-model-7b' },
          { id: 'claude-opus-3', createdAt: nowS - 900 * DAY_S },
          { id: 'anthropic/claude-opus-latest', createdAt: nowS - DAY_S },
        ]),
      ],
      registry: REGISTRY,
      nowMs: NOW_MS,
    });

    expect(report.newModels).toEqual([]);
    expect(report.excluded).toEqual({
      nonChat: 1,
      untrackedVendor: 1,
      olderThanWindow: 1,
      latestAlias: 1,
    });
  });

  it('merges one model listed by two sources into one proposal', async () => {
    const report = await detectModelDrift({
      sources: [
        measured('vendor-a', [...ALL_KNOWN, { id: 'claude-opus-4-9' }]),
        measured('catalog', [{ id: 'anthropic/claude-opus-4.9', contextLength: 500_000 }]),
      ],
      registry: REGISTRY,
      nowMs: NOW_MS,
    });

    expect(report.newModels).toHaveLength(1);
    expect(report.newModels[0]?.sources).toEqual(['vendor-a', 'catalog']);
    expect(report.newModels[0]?.draft.contextWindow).toBe(500_000);
  });
});
