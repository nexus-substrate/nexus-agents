/**
 * Tests for runExpert's budget short-circuit (#3395) — the safety-critical
 * property is that an exhausted guard must NOT call executeExpert (no more spend).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./expert-bridge.js', () => ({
  executeExpert: vi.fn(() =>
    Promise.resolve({
      success: true,
      text: 'ok',
      expertType: 'architecture',
      durationMs: 5,
      tokensUsed: 10,
    })
  ),
}));

const { emitMock } = vi.hoisted(() => ({ emitMock: vi.fn() }));
vi.mock('./pipeline-observability.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pipeline-observability.js')>();
  return { ...actual, emitPipelineStageEvent: emitMock };
});

import { runExpert } from './agent-executor.js';
import { createBudgetGuard } from './budget-guard.js';
import { executeExpert } from './expert-bridge.js';

beforeEach(() => {
  vi.mocked(executeExpert).mockClear();
  emitMock.mockClear();
});

describe('runExpert budget short-circuit (#3395)', () => {
  it('executes and records usage when the guard is not exhausted', async () => {
    const guard = createBudgetGuard({ maxTokens: 1000 });
    const r = await runExpert(guard, 'architecture', 'prompt');
    expect(r.success).toBe(true);
    expect(executeExpert).toHaveBeenCalledOnce();
  });

  it('passes through transparently with the default (no-budget) guard', async () => {
    const guard = createBudgetGuard(); // default-off
    await runExpert(guard, 'architecture', 'prompt');
    expect(executeExpert).toHaveBeenCalledOnce();
  });

  it('skips executeExpert once the budget is exhausted — no further spend', async () => {
    const guard = createBudgetGuard({ maxTokens: 10, criticalThreshold: 0.5 });
    guard.record(10); // crosses 50% of 10 → circuit opens
    expect(guard.isExhausted()).toBe(true);

    const r = await runExpert(guard, 'architecture', 'prompt');
    expect(r.success).toBe(false);
    expect(r.error).toContain('Budget exhausted');
    expect(executeExpert).not.toHaveBeenCalled();
  });

  it('emits an observable budget_exceeded event on the short-circuit (#3262)', async () => {
    const guard = createBudgetGuard({ maxTokens: 10, criticalThreshold: 0.5 });
    guard.record(10);
    await runExpert(guard, 'architecture', 'prompt', 'exec-1');

    expect(emitMock).toHaveBeenCalledWith(
      'dev-pipeline',
      'budget',
      'failed',
      expect.objectContaining({ reason: 'budget_exceeded', expertType: 'architecture' })
    );
  });
});
