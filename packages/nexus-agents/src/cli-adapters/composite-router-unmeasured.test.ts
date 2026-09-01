/**
 * Routing-input coverage tests (#5329).
 *
 * Two scoring inputs read the outcome store inside a try/catch that returned
 * the same empty Map a healthy-but-empty store returns. The router then ranked
 * on "no adjustment" when the truth was "no reading", and `stagesExecuted` —
 * the field that becomes `RoutingDecision.decisionPath` — was byte-identical
 * either way.
 *
 * @module cli-adapters/composite-router-unmeasured.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ICliAdapter, CliName, CliTask } from './types.js';

vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
  getModelSelectionShadowFile: vi.fn(() => '/dev/null'),
}));

const summarizeMock = vi.fn();
// Mock the module `composite-router-stages.ts` actually imports from
// (`outcome-store.js`), not the barrel. Mocking the barrel with an
// `importOriginal` spread does not intercept a transitive import of the
// underlying module — the spread re-exports the real binding.
vi.mock('../orchestration/outcomes/outcome-store.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getOutcomeStore: () => ({ summarize: summarizeMock }) };
});

const { CompositeRouter } = await import('./composite-router.js');

function mockAdapter(name: CliName): ICliAdapter {
  return {
    name,
    transport: 'subprocess',
    capabilities: { reasoning: 8, contextWindow: 200000, codeGeneration: 9, speed: 7, cost: 5 },
    execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'ok' } }),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, version: '1.0.0' }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getCapacity: vi.fn().mockResolvedValue({ remainingTokens: 100000 }),
    getModelInfo: vi.fn().mockReturnValue({ id: name, name }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICliAdapter;
}

function adapters(): Map<CliName, ICliAdapter> {
  return new Map<CliName, ICliAdapter>([
    ['claude', mockAdapter('claude')],
    ['gemini', mockAdapter('gemini')],
  ]);
}

/** A task whose content detects a category, so the store is actually consulted. */
const task: CliTask = { content: 'Write a function to parse a CSV file and add unit tests' };

describe('an unreadable outcome store is recorded, not treated as an empty one', () => {
  beforeEach(() => {
    summarizeMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks the performance floor unmeasured when the store read throws', async () => {
    summarizeMock.mockImplementation(() => {
      throw new Error('database is locked');
    });

    const result = await new CompositeRouter(adapters()).route(task);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Without this marker the decision is indistinguishable from one where the
    // floor ran and found nothing to penalize — so a chronically failing CLI
    // keeps winning and the record cannot say why.
    expect(result.value.stagesExecuted).toContain('perf-floor-unmeasured');
  });

  it('does not mark it unmeasured when the store simply has no history', async () => {
    summarizeMock.mockReturnValue({ byCli: new Map() });

    const result = await new CompositeRouter(adapters()).route(task);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The read succeeded and found nothing. That is a measurement, and it must
    // not be reported as an absence of one.
    expect(result.value.stagesExecuted).not.toContain('perf-floor-unmeasured');
  });

  it('does not mark it unmeasured when no category applies', async () => {
    // The store is never consulted here, because no category was detected.
    // Nothing failed, so nothing may be reported as unmeasured — over-reporting
    // is the mirror-image defect: a decision labelled "no reading" when the
    // reading was simply not applicable teaches a reader to ignore the label.
    summarizeMock.mockImplementation(() => {
      throw new Error('should not be reached');
    });

    const result = await new CompositeRouter(adapters()).route({ content: 'x' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(summarizeMock).not.toHaveBeenCalled();
    expect(result.value.stagesExecuted).not.toContain('perf-floor-unmeasured');
  });

  it('still produces a routing decision when the store is unreadable', async () => {
    summarizeMock.mockImplementation(() => {
      throw new Error('database is locked');
    });

    const result = await new CompositeRouter(adapters()).route(task);

    // Disclosure, not refusal: an unavailable scoring input degrades the
    // decision's basis but must not fail routing outright.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(['claude', 'gemini']).toContain(result.value.cliName);
  });
});
