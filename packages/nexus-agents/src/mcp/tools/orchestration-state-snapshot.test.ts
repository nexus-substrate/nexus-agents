import { describe, it, expect } from 'vitest';
import type { RoutingInfo } from './orchestrate-types.js';
import type { OrchestrateOutput } from './orchestrate-types.js';
import {
  createOrchestrationStateSnapshot,
  setStage,
  setRouting,
  setAnalysis,
  incrementStepsCompleted,
} from './orchestration-state-snapshot.js';

function makeRouting(): RoutingInfo {
  return {
    pattern: 'sequential',
    reasoning: 'simple workflow',
    confidence: 0.9,
    orchestratorType: 'tech_lead',
  };
}

function makeAnalysis(): OrchestrateOutput['analysis'] {
  return {
    taskId: 't1',
    complexity: 5,
    taskType: 'code_generation',
    requirements: ['a'],
    risks: [],
    needsDecomposition: false,
    approach: 'direct implementation',
    estimatedEffort: 3,
  };
}

describe('orchestration-state-snapshot', () => {
  it('starts in the `init` stage with no populated fields', () => {
    const snap = createOrchestrationStateSnapshot(1000);
    expect(snap.stage).toBe('init');
    expect(snap.routing).toBeUndefined();
    expect(snap.analysis).toBeUndefined();
    expect(snap.stepsCompleted).toBe(0);
    expect(snap.createdAt).toBe(1000);
  });

  it('setStage advances the stage independently of other fields', () => {
    const snap = createOrchestrationStateSnapshot(0);
    setStage(snap, 'executing');
    expect(snap.stage).toBe('executing');
    expect(snap.analysis).toBeUndefined();
    expect(snap.routing).toBeUndefined();
  });

  it('setRouting populates routing and moves stage to `routing_decided`', () => {
    const snap = createOrchestrationStateSnapshot(0);
    const routing = makeRouting();
    setRouting(snap, routing);
    expect(snap.routing).toEqual(routing);
    expect(snap.stage).toBe('routing_decided');
  });

  it('setAnalysis populates analysis and moves stage to `analysis_done`', () => {
    const snap = createOrchestrationStateSnapshot(0);
    const analysis = makeAnalysis();
    setAnalysis(snap, analysis);
    expect(snap.analysis).toEqual(analysis);
    expect(snap.stage).toBe('analysis_done');
  });

  it('incrementStepsCompleted advances counter and marks stage as `executing`', () => {
    const snap = createOrchestrationStateSnapshot(0);
    incrementStepsCompleted(snap);
    incrementStepsCompleted(snap);
    expect(snap.stepsCompleted).toBe(2);
    expect(snap.stage).toBe('executing');
  });

  it('preserves earlier writes when later helpers fire (routing survives analysis)', () => {
    const snap = createOrchestrationStateSnapshot(0);
    const routing = makeRouting();
    const analysis = makeAnalysis();
    setRouting(snap, routing);
    setAnalysis(snap, analysis);
    // routing should still be there after analysis moves the stage
    expect(snap.routing).toEqual(routing);
    expect(snap.analysis).toEqual(analysis);
    expect(snap.stage).toBe('analysis_done');
  });

  it('is a mutable single-reference handle (no copy semantics)', () => {
    const snap = createOrchestrationStateSnapshot(0);
    const alias = snap;
    setStage(alias, 'completed');
    expect(snap.stage).toBe('completed');
  });
});
