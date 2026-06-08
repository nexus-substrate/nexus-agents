/**
 * Tests for the MetaDispatcher (#3559).
 *
 * Uses fake executors and a recording outcome sink — deterministic, no live
 * adapters. Decisions come from the real MetaOrchestrator so the join key
 * (`decisionId`) is exercised end to end.
 */

import { describe, it, expect } from 'vitest';
import {
  createMetaDispatcher,
  createRecordingOutcomeSink,
  MetaDispatchError,
  type StrategyExecutorMap,
} from './meta-dispatcher.js';
import { createMetaOrchestrator, type MetaDecision } from './meta-orchestrator.js';

function decisionFor(
  goal: string,
  signals?: Parameters<ReturnType<typeof createMetaOrchestrator>['select']>[0]['signals']
): MetaDecision {
  return createMetaOrchestrator().select({ goal, ...(signals ? { signals } : {}) });
}

describe('MetaDispatcher.dispatch', () => {
  it('runs the matching executor and returns its result', async () => {
    const decision = decisionFor('implement the feature', { dependencyStructure: 'dag' });
    const executors: StrategyExecutorMap = {
      [decision.strategy]: () => Promise.resolve({ ok: true }),
    };
    const sink = createRecordingOutcomeSink();
    const dispatcher = createMetaDispatcher({ executors, outcomeSink: sink });

    const result = await dispatcher.dispatch(decision, { goal: 'implement the feature' });
    expect(result.result).toEqual({ ok: true });
    expect(result.strategy).toBe(decision.strategy);
    expect(result.decisionId).toBe(decision.decisionId);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records exactly one success outcome keyed by decisionId', async () => {
    const decision = decisionFor('implement the feature', { dependencyStructure: 'dag' });
    const executors: StrategyExecutorMap = { [decision.strategy]: () => Promise.resolve('done') };
    const sink = createRecordingOutcomeSink();
    const dispatcher = createMetaDispatcher({ executors, outcomeSink: sink });

    await dispatcher.dispatch(decision, { goal: 'implement the feature' });
    const outcomes = sink.getOutcomes();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.decisionId).toBe(decision.decisionId);
    expect(outcomes[0]?.success).toBe(true);
    expect(outcomes[0]?.strategy).toBe(decision.strategy);
    expect(outcomes[0]?.failureReason).toBeUndefined();
  });

  it('fails closed with a typed error when no executor is registered', async () => {
    const decision = decisionFor('implement the feature', { dependencyStructure: 'dag' });
    const sink = createRecordingOutcomeSink();
    const dispatcher = createMetaDispatcher({ executors: {}, outcomeSink: sink });

    await expect(
      dispatcher.dispatch(decision, { goal: 'implement the feature' })
    ).rejects.toBeInstanceOf(MetaDispatchError);
    const outcomes = sink.getOutcomes();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.success).toBe(false);
    expect(outcomes[0]?.failureReason).toContain('No executor');
  });

  it('sets the no_executor error code', async () => {
    const decision = decisionFor('implement the feature', { dependencyStructure: 'dag' });
    const dispatcher = createMetaDispatcher({ executors: {} });
    await dispatcher.dispatch(decision, { goal: 'implement the feature' }).then(
      () => expect.fail('should have thrown'),
      (err: unknown) => {
        expect(err).toBeInstanceOf(MetaDispatchError);
        expect((err as MetaDispatchError).code).toBe('no_executor');
        expect((err as MetaDispatchError).decisionId).toBe(decision.decisionId);
      }
    );
  });

  it('records a failure outcome and rethrows when the executor throws', async () => {
    const decision = decisionFor('implement the feature', { dependencyStructure: 'dag' });
    const executors: StrategyExecutorMap = {
      [decision.strategy]: () => Promise.reject(new Error('engine exploded')),
    };
    const sink = createRecordingOutcomeSink();
    const dispatcher = createMetaDispatcher({ executors, outcomeSink: sink });

    await dispatcher.dispatch(decision, { goal: 'implement the feature' }).then(
      () => expect.fail('should have thrown'),
      (err: unknown) => {
        expect(err).toBeInstanceOf(MetaDispatchError);
        expect((err as MetaDispatchError).code).toBe('executor_failed');
      }
    );
    const outcomes = sink.getOutcomes();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.success).toBe(false);
    expect(outcomes[0]?.failureReason).toContain('engine exploded');
  });

  it('bounds the recording outcome buffer', async () => {
    const sink = createRecordingOutcomeSink(2);
    const decision = decisionFor('implement the feature', { dependencyStructure: 'dag' });
    const executors: StrategyExecutorMap = { [decision.strategy]: () => Promise.resolve(1) };
    const dispatcher = createMetaDispatcher({ executors, outcomeSink: sink });

    for (let i = 0; i < 4; i++)
      await dispatcher.dispatch(decision, { goal: 'implement the feature' });
    expect(sink.getOutcomes()).toHaveLength(2);
  });
});

describe('MetaDispatcher onOutcome callback (#3593)', () => {
  it('fires onOutcome with (record, decision) on a successful dispatch', async () => {
    const decision = decisionFor('implement the feature', { dependencyStructure: 'dag' });
    const executors: StrategyExecutorMap = { [decision.strategy]: () => Promise.resolve('ok') };
    const seen: Array<{ success: boolean; decisionId: string }> = [];
    const dispatcher = createMetaDispatcher({
      executors,
      onOutcome: (record, d) => {
        seen.push({ success: record.success, decisionId: d.decisionId });
        expect(record.decisionId).toBe(d.decisionId);
        expect(record.strategy).toBe(d.strategy);
      },
    });

    await dispatcher.dispatch(decision, { goal: 'implement the feature' });
    expect(seen).toEqual([{ success: true, decisionId: decision.decisionId }]);
  });

  it('fires onOutcome with success=false when the executor throws', async () => {
    const decision = decisionFor('implement the feature', { dependencyStructure: 'dag' });
    const executors: StrategyExecutorMap = {
      [decision.strategy]: () => Promise.reject(new Error('boom')),
    };
    let captured: { success: boolean; decisionId: string } | undefined;
    const dispatcher = createMetaDispatcher({
      executors,
      onOutcome: (record, d) => {
        captured = { success: record.success, decisionId: d.decisionId };
      },
    });

    await dispatcher.dispatch(decision, { goal: 'implement the feature' }).catch(() => undefined);
    expect(captured).toEqual({ success: false, decisionId: decision.decisionId });
  });

  it('fires onOutcome with success=false when no executor is registered', async () => {
    const decision = decisionFor('implement the feature', { dependencyStructure: 'dag' });
    let captured: boolean | undefined;
    const dispatcher = createMetaDispatcher({
      executors: {},
      onOutcome: (record) => {
        captured = record.success;
      },
    });

    await dispatcher.dispatch(decision, { goal: 'implement the feature' }).catch(() => undefined);
    expect(captured).toBe(false);
  });

  it('swallows errors thrown by onOutcome (observability is best-effort)', async () => {
    const decision = decisionFor('implement the feature', { dependencyStructure: 'dag' });
    const executors: StrategyExecutorMap = { [decision.strategy]: () => Promise.resolve('ok') };
    const dispatcher = createMetaDispatcher({
      executors,
      onOutcome: () => {
        throw new Error('callback exploded');
      },
    });

    await expect(
      dispatcher.dispatch(decision, { goal: 'implement the feature' })
    ).resolves.toMatchObject({ strategy: decision.strategy });
  });
});
