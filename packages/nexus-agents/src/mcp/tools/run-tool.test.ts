/**
 * Tests for the `run` unified entry point tool (epic #3548, increment A).
 */

import { describe, it, expect } from 'vitest';
import {
  routeGoal,
  executeGoal,
  RunInputSchema,
  STRATEGY_ENTRYPOINT_TOOL,
  type RunResponse,
} from './run-tool.js';
import type { ExecutionStrategy } from '../../orchestration/meta-orchestrator.js';
import {
  createRecordingOutcomeSink,
  MetaDispatchError,
  type StrategyExecutorMap,
} from '../../orchestration/meta-dispatcher.js';

const ALL_STRATEGIES: ExecutionStrategy[] = [
  'single-shot',
  'dev-pipeline',
  'pipeline',
  'graph-workflow',
  'orchestrate',
  'consensus',
  'spec',
  'research',
];

describe('STRATEGY_ENTRYPOINT_TOOL', () => {
  it('maps every execution strategy to a recommended tool', () => {
    for (const s of ALL_STRATEGIES) {
      expect(STRATEGY_ENTRYPOINT_TOOL[s]).toBeTruthy();
    }
  });
});

describe('routeGoal', () => {
  it('routes a DAG dev goal to graph-workflow with the matching tool', () => {
    const r: RunResponse = routeGoal({ goal: 'implement the feature', dependencyStructure: 'dag' });
    expect(r.strategy).toBe('graph-workflow');
    expect(r.recommendedTool).toBe('run_graph_workflow');
    expect(r.decisionId).toBeTruthy();
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('routes a consensus goal to consensus_vote', () => {
    const r = routeGoal({ goal: 'should we adopt A or B', requiresConsensus: true });
    expect(r.strategy).toBe('consensus');
    expect(r.recommendedTool).toBe('consensus_vote');
  });

  it('honors forceStrategy', () => {
    const r = routeGoal({ goal: 'anything', forceStrategy: 'spec' });
    expect(r.strategy).toBe('spec');
    expect(r.recommendedTool).toBe('execute_spec');
  });

  it('always includes a recommendedTool consistent with the strategy', () => {
    const r = routeGoal({ goal: 'research and compare alternatives and evaluate the landscape' });
    expect(r.recommendedTool).toBe(STRATEGY_ENTRYPOINT_TOOL[r.strategy]);
  });
});

describe('RunInputSchema', () => {
  it('requires a non-empty goal', () => {
    expect(RunInputSchema.safeParse({}).success).toBe(false);
    expect(RunInputSchema.safeParse({ goal: '' }).success).toBe(false);
    expect(RunInputSchema.safeParse({ goal: 'do a thing' }).success).toBe(true);
  });

  it('rejects an unknown forceStrategy', () => {
    expect(RunInputSchema.safeParse({ goal: 'g', forceStrategy: 'nonsense' }).success).toBe(false);
  });

  it('accepts the execute flag', () => {
    expect(RunInputSchema.safeParse({ goal: 'g', execute: true }).success).toBe(true);
  });
});

describe('executeGoal (run increment B, #3575)', () => {
  it('dispatches the selected strategy to its executor and records an outcome', async () => {
    const sink = createRecordingOutcomeSink();
    const executors: StrategyExecutorMap = {
      'dev-pipeline': () => Promise.resolve({ completed: true }),
    };
    const res = await executeGoal(
      { goal: 'implement the feature', forceStrategy: 'dev-pipeline', execute: true },
      { executors, outcomeSink: sink }
    );
    expect(res.executed).toBe(true);
    expect(res.strategy).toBe('dev-pipeline');
    expect(res.result).toEqual({ completed: true });
    expect(res.decisionId).toBeTruthy();
    const outcomes = sink.getOutcomes();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.success).toBe(true);
    expect(outcomes[0]?.decisionId).toBe(res.decisionId);
  });

  it('fails closed for a strategy with no wired executor (records failure)', async () => {
    const sink = createRecordingOutcomeSink();
    await executeGoal(
      { goal: 'decide A or B', forceStrategy: 'consensus', execute: true },
      { executors: {}, outcomeSink: sink }
    ).then(
      () => expect.fail('should have thrown'),
      (err: unknown) => {
        expect(err).toBeInstanceOf(MetaDispatchError);
        expect((err as MetaDispatchError).code).toBe('no_executor');
      }
    );
    expect(sink.getOutcomes()[0]?.success).toBe(false);
  });

  it('propagates an executor failure as MetaDispatchError (recorded)', async () => {
    const sink = createRecordingOutcomeSink();
    const executors: StrategyExecutorMap = {
      'dev-pipeline': () => Promise.reject(new Error('pipeline blew up')),
    };
    await executeGoal(
      { goal: 'implement the feature', forceStrategy: 'dev-pipeline', execute: true },
      { executors, outcomeSink: sink }
    ).then(
      () => expect.fail('should have thrown'),
      (err: unknown) => {
        expect((err as MetaDispatchError).code).toBe('executor_failed');
      }
    );
    expect(sink.getOutcomes()[0]?.failureReason).toContain('pipeline blew up');
  });
});
