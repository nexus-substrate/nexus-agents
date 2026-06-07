/**
 * Tests for the `run` unified entry point tool (epic #3548, increment A).
 */

import { describe, it, expect } from 'vitest';
import {
  routeGoal,
  RunInputSchema,
  STRATEGY_ENTRYPOINT_TOOL,
  type RunResponse,
} from './run-tool.js';
import type { ExecutionStrategy } from '../../orchestration/meta-orchestrator.js';

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
});
