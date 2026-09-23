/**
 * Tests for model-drift issue drafting and filing (#6625). `gh` is faked.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ModelDriftReport, NewModel } from '../config/model-drift.js';
import {
  MODEL_DRIFT_MAX_ISSUES_PER_RUN,
  draftNewModelIssue,
  fileNewModelIssues,
  type ModelDriftIssueDeps,
} from './model-drift-issues.js';

function newModel(id: string): NewModel {
  return {
    listedAs: [id],
    sources: ['vendor-a'],
    draft: {
      id,
      vendor: 'anthropic',
      family: 'claude-opus',
      tier: 'flagship',
      contextWindow: 'unknown',
      pricing: 'unknown',
      releasedAt: 'unknown',
    },
  };
}

function report(ids: readonly string[]): ModelDriftReport {
  return {
    generatedAt: '2026-09-23T00:00:00.000Z',
    verdict: ids.length > 0 ? 'drift' : 'no-drift',
    measuredSources: 1,
    partialCoverage: false,
    coverage: [{ source: 'vendor-a', status: 'measured', modelCount: ids.length }],
    newModels: ids.map(newModel),
    possiblyRetired: [],
    retirementUnmeasured: [],
    excluded: { nonChat: 0, untrackedVendor: 0, olderThanWindow: 0, latestAlias: 0 },
    recencyWindowDays: 180,
  };
}

function fakeDeps(overrides: Partial<ModelDriftIssueDeps> = {}): {
  readonly fileIssue: ReturnType<typeof vi.fn>;
  readonly deps: ModelDriftIssueDeps;
} {
  const fileIssue = vi.fn((opts: { title: string }) =>
    Promise.resolve({ ok: true as const, url: `https://example.invalid/${opts.title}` })
  );
  return {
    fileIssue,
    deps: {
      ghAvailable: () => Promise.resolve(true),
      listOpenIssueTitles: () => Promise.resolve([] as readonly string[]),
      fileIssue,
      ...overrides,
    },
  };
}

describe('draftNewModelIssue', () => {
  it('names the model id in the title and carries the drafted entry', () => {
    const draft = draftNewModelIssue(newModel('claude-opus-4-9'));
    expect(draft.title).toContain('claude-opus-4-9');
    expect(draft.body).toContain('"tier": "flagship"');
    expect(draft.body).toContain('"contextWindow": "unknown"');
    expect(draft.body).toMatch(/owner approval/i);
  });
});

describe('fileNewModelIssues', () => {
  it('files one issue per new model', async () => {
    const { deps, fileIssue } = fakeDeps();
    const result = await fileNewModelIssues(report(['claude-opus-4-9']), deps);

    expect(result.status).toBe('ran');
    expect(fileIssue).toHaveBeenCalledTimes(1);
    expect(result.filed.map((f) => f.id)).toEqual(['claude-opus-4-9']);
  });

  it('skips a model that already has an open issue naming its id', async () => {
    const { deps, fileIssue } = fakeDeps({
      listOpenIssueTitles: () =>
        Promise.resolve(['models: propose a registry entry for `claude-opus-4-9`']),
    });
    const result = await fileNewModelIssues(report(['claude-opus-4-9', 'gpt-7']), deps);

    expect(fileIssue).toHaveBeenCalledTimes(1);
    expect(result.filed.map((f) => f.id)).toEqual(['gpt-7']);
    expect(result.skipped).toEqual([{ id: 'claude-opus-4-9', reason: 'duplicate' }]);
  });

  it('does not treat an issue for a longer id as a duplicate', async () => {
    const { deps } = fakeDeps({
      listOpenIssueTitles: () =>
        Promise.resolve(['models: propose a registry entry for `gpt-7-mini`']),
    });
    const result = await fileNewModelIssues(report(['gpt-7']), deps);
    expect(result.filed.map((f) => f.id)).toEqual(['gpt-7']);
  });

  it(`files at most ${String(MODEL_DRIFT_MAX_ISSUES_PER_RUN)} issues per run`, async () => {
    const { deps, fileIssue } = fakeDeps();
    const ids = Array.from({ length: 8 }, (_, i) => `claude-opus-9-${String(i)}`);
    const result = await fileNewModelIssues(report(ids), deps);

    expect(fileIssue).toHaveBeenCalledTimes(MODEL_DRIFT_MAX_ISSUES_PER_RUN);
    expect(result.skipped.filter((s) => s.reason === 'rate-limit')).toHaveLength(3);
  });

  it('files nothing and keeps the drafts when gh is unavailable', async () => {
    const { deps, fileIssue } = fakeDeps({ ghAvailable: () => Promise.resolve(false) });
    const result = await fileNewModelIssues(report(['claude-opus-4-9']), deps);

    expect(result.status).toBe('gh-unavailable');
    expect(fileIssue).not.toHaveBeenCalled();
    expect(result.drafts.map((d) => d.modelId)).toEqual(['claude-opus-4-9']);
  });

  it('files nothing when the report is unmeasured', async () => {
    const { deps, fileIssue } = fakeDeps();
    const result = await fileNewModelIssues({ ...report([]), verdict: 'unmeasured' }, deps);
    expect(result.status).toBe('nothing-to-file');
    expect(fileIssue).not.toHaveBeenCalled();
  });
});
