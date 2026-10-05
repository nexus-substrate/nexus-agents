/**
 * Tests for model-drift issue drafting and filing (#6625). `gh` is faked.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: execFileMock,
  }),
}));

import { detectModelDrift, type ModelDriftReport, type NewModel } from '../config/model-drift.js';
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
  readonly fileIssue: Mock<NonNullable<ModelDriftIssueDeps['fileIssue']>>;
  readonly deps: ModelDriftIssueDeps;
} {
  const fileIssue = vi.fn<NonNullable<ModelDriftIssueDeps['fileIssue']>>((opts) =>
    Promise.resolve({ ok: true as const, url: `https://example.invalid/${opts.title}` })
  );
  return {
    fileIssue,
    deps: {
      ghAvailable: () => Promise.resolve(true),
      listProposalIssueTitles: () => Promise.resolve([] as readonly string[]),
      fileIssue,
      ...overrides,
    },
  };
}

beforeEach(() => {
  execFileMock.mockReset();
});

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
  it('skips a model whose discovered proposal issue is CLOSED', async () => {
    const issues = [
      {
        title: 'models: propose a registry entry for `claude-opus-4-9`',
        state: 'CLOSED',
        labels: ['discovered'],
      },
    ];
    execFileMock.mockImplementation((_command: string, args: readonly string[]) => {
      const state = args[args.indexOf('--state') + 1];
      const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : undefined;
      const rows = issues.filter(
        (issue) =>
          (state === 'all' || issue.state.toLowerCase() === state) &&
          (label === undefined || issue.labels.includes(label))
      );
      return Promise.resolve({ stdout: JSON.stringify(rows), stderr: '' });
    });
    const { fileIssue } = fakeDeps();
    const result = await fileNewModelIssues(report(['claude-opus-4-9']), {
      ghAvailable: () => Promise.resolve(true),
      fileIssue,
    });

    expect(result.skipped).toEqual([{ id: 'claude-opus-4-9', reason: 'duplicate' }]);
    expect(fileIssue).not.toHaveBeenCalled();
    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--state', 'all', '--label', 'discovered', '--limit', '1000']),
      expect.anything()
    );
  });

  it('asks the injected lister for all discovered proposal issues', async () => {
    const listProposalIssueTitles = vi.fn(() => Promise.resolve([]));
    const { deps } = fakeDeps({ listProposalIssueTitles });
    await fileNewModelIssues(report(['gpt-7']), deps);
    expect(listProposalIssueTitles).toHaveBeenCalledWith({ state: 'all', label: 'discovered' });
  });

  it('caps seven proposals at five while including both vendors', async () => {
    const ids = ['gpt-7', 'gpt-8', 'gpt-9', 'gpt-10', 'gpt-11', 'claude-opus-5', 'claude-opus-6'];
    const drift = await detectModelDrift({
      sources: [
        {
          name: 'gateway',
          probe: () =>
            Promise.resolve({
              status: 'measured',
              models: ids.map((id) => ({ id })),
            }),
        },
      ],
      registry: [{ id: 'gpt-5.5' }, { id: 'claude-sonnet-4-6' }],
      nowMs: Date.UTC(2026, 8, 23),
    });
    const { deps, fileIssue } = fakeDeps();
    const result = await fileNewModelIssues(drift, deps);
    expect(fileIssue).toHaveBeenCalledTimes(5);
    expect(result.filed.map((f) => f.id)).toEqual([
      'claude-opus-6',
      'gpt-11',
      'claude-opus-5',
      'gpt-10',
      'gpt-9',
    ]);
    expect(result.skipped.filter((s) => s.reason === 'rate-limit')).toHaveLength(2);
  });

  it('files one issue per new model', async () => {
    const { deps, fileIssue } = fakeDeps();
    const result = await fileNewModelIssues(report(['claude-opus-4-9']), deps);

    expect(result.status).toBe('ran');
    expect(fileIssue).toHaveBeenCalledTimes(1);
    expect(result.filed.map((f) => f.id)).toEqual(['claude-opus-4-9']);
  });

  it('skips a model that already has an open issue naming its id', async () => {
    const { deps, fileIssue } = fakeDeps({
      listProposalIssueTitles: () =>
        Promise.resolve(['models: propose a registry entry for `claude-opus-4-9`']),
    });
    const result = await fileNewModelIssues(report(['claude-opus-4-9', 'gpt-7']), deps);

    expect(fileIssue).toHaveBeenCalledTimes(1);
    expect(result.filed.map((f) => f.id)).toEqual(['gpt-7']);
    expect(result.skipped).toEqual([{ id: 'claude-opus-4-9', reason: 'duplicate' }]);
  });

  it('does not treat an issue for a longer id as a duplicate', async () => {
    const { deps } = fakeDeps({
      listProposalIssueTitles: () =>
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
