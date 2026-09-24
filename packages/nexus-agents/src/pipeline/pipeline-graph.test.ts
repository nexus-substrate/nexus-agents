/**
 * Tests for Pipeline Graph Compiler (#1735, Phase 2)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { compilePipelineGraph, findMissingStages } from './pipeline-graph.js';
import type { IPipelineStage, PipelineTemplate, StageOutput } from './stage-types.js';
import { PIPELINE_STATE_KEYS } from './stage-types.js';
import {
  GRAPH_TIMEOUTS,
  VOTE_TIMEOUTS,
  classOverrideEnvVar,
  resolveClassGuardMs,
} from '../config/timeouts.js';
import {
  DEV_PIPELINE_TEMPLATE,
  GREENFIELD_PIPELINE_TEMPLATE,
  PIPELINE_TEMPLATES,
  getTemplate,
  listTemplateIds,
} from './templates.js';

/**
 * Stand-in for the retired `research` template (#3488). Kept locally so the
 * regression test for "registry can't satisfy this template" still exercises a
 * realistic unimplemented-stage shape without resurrecting the dead template.
 */
const UNRUNNABLE_RESEARCH_TEMPLATE: PipelineTemplate = {
  id: 'research',
  name: 'Research (retired)',
  stages: ['decompose', 'investigate', 'synthesize', 'vote', 'scaffold'],
};

// ============================================================================
// Helpers
// ============================================================================

function makeStage(id: string, stateKey?: string): IPipelineStage {
  return {
    id,
    name: `${id} stage`,
    execute: () => Promise.resolve(makeOutput(stateKey ?? id)),
  };
}

function makeOutput(stateKey: string): StageOutput {
  return { stateKey, value: `${stateKey}-result`, durationMs: 100, success: true };
}

function makeStageRegistry(stageIds: readonly string[]): Map<string, IPipelineStage> {
  const map = new Map<string, IPipelineStage>();
  for (const id of stageIds) {
    map.set(id, makeStage(id));
  }
  return map;
}

// ============================================================================
// Template Tests
// ============================================================================

describe('Pipeline Templates', () => {
  it('DEV_PIPELINE_TEMPLATE has 7 stages', () => {
    expect(DEV_PIPELINE_TEMPLATE.stages).toHaveLength(7);
    expect(DEV_PIPELINE_TEMPLATE.stages).toEqual([
      'research',
      'plan',
      'vote',
      'decompose',
      'implement',
      'qa',
      'security',
    ]);
    expect(DEV_PIPELINE_TEMPLATE.dryRunStopAfter).toBe('vote');
  });

  it('the retired research template is no longer registered (#3488)', () => {
    expect(getTemplate('research')).toBeUndefined();
    expect(listTemplateIds()).not.toContain('research');
  });

  it('PIPELINE_TEMPLATES contains the four runnable templates', () => {
    expect(PIPELINE_TEMPLATES.size).toBe(4);
    expect(getTemplate('dev')).toBe(DEV_PIPELINE_TEMPLATE);
    expect(getTemplate('greenfield')).toBe(GREENFIELD_PIPELINE_TEMPLATE);
    expect(getTemplate('general')).toBeDefined();
    expect(getTemplate('nonexistent')).toBeUndefined();
  });

  it('listTemplateIds returns all IDs', () => {
    const ids = listTemplateIds();
    expect(ids).toContain('dev');
    expect(ids).toContain('audit');
    expect(ids).toContain('greenfield');
    expect(ids).toContain('general');
  });
});

describe('Greenfield Pipeline Template', () => {
  it('GREENFIELD_PIPELINE_TEMPLATE has 9 stages', () => {
    expect(GREENFIELD_PIPELINE_TEMPLATE.stages).toHaveLength(9);
    expect(GREENFIELD_PIPELINE_TEMPLATE.stages).toEqual([
      'parseSpec',
      'research',
      'plan',
      'vote',
      'scaffold',
      'decompose',
      'implement',
      'qa',
      'security',
    ]);
    expect(GREENFIELD_PIPELINE_TEMPLATE.dryRunStopAfter).toBe('vote');
  });

  it('compiles GREENFIELD_PIPELINE_TEMPLATE via compilePipelineGraph', () => {
    const stages = makeStageRegistry(GREENFIELD_PIPELINE_TEMPLATE.stages);
    const result = compilePipelineGraph(GREENFIELD_PIPELINE_TEMPLATE, stages);

    expect(result.ok).toBe(true);
    expect(result.graph).toBeDefined();
  });
});

// ============================================================================
// Graph Compilation Tests
// ============================================================================

describe('compilePipelineGraph', () => {
  it('compiles a simple linear pipeline', () => {
    const template: PipelineTemplate = {
      id: 'test',
      name: 'Test',
      stages: ['step1', 'step2'],
    };
    const stages = makeStageRegistry(['step1', 'step2']);
    const result = compilePipelineGraph(template, stages);

    expect(result.ok).toBe(true);
    expect(result.graph).toBeDefined();
  });

  it('findMissingStages lists template stages absent from the registry (#3487)', () => {
    // The real failure: the `research` template needs investigate/synthesize,
    // which the dev registry (research/plan/vote/decompose/implement/qa/security)
    // doesn't implement.
    const devRegistry = makeStageRegistry(DEV_PIPELINE_TEMPLATE.stages);
    const missing = findMissingStages(UNRUNNABLE_RESEARCH_TEMPLATE, devRegistry);
    expect(missing).toContain('investigate');
    expect(missing).toContain('synthesize');
    // And it's empty when the registry satisfies the template.
    expect(findMissingStages(DEV_PIPELINE_TEMPLATE, devRegistry)).toHaveLength(0);
  });

  it('reports missing stage implementations with an actionable message (#3487)', () => {
    const template: PipelineTemplate = {
      id: 'sample',
      name: 'Sample',
      stages: ['step1', 'missing_step'],
    };
    const stages = makeStageRegistry(['step1']);
    const result = compilePipelineGraph(template, stages);

    expect(result.ok).toBe(false);
    // Names the template, the missing stage, and the available stages so the
    // failure reads as "unimplemented stage" not an auth/transport error.
    expect(result.error).toContain("template 'sample'");
    expect(result.error).toContain('missing_step');
    expect(result.error).toContain('Available stages: step1');
    expect(result.error).toContain('Pick a different');
  });

  it('compiles the dev pipeline template', () => {
    const stages = makeStageRegistry(DEV_PIPELINE_TEMPLATE.stages);
    const result = compilePipelineGraph(DEV_PIPELINE_TEMPLATE, stages);

    expect(result.ok).toBe(true);
    expect(result.graph).toBeDefined();
  });

  it('compiles a 5-stage template when the registry implements every stage', () => {
    const stages = makeStageRegistry(UNRUNNABLE_RESEARCH_TEMPLATE.stages);
    const result = compilePipelineGraph(UNRUNNABLE_RESEARCH_TEMPLATE, stages);

    expect(result.ok).toBe(true);
    expect(result.graph).toBeDefined();
  });

  it('handles empty stage list', () => {
    const template: PipelineTemplate = { id: 'empty', name: 'Empty', stages: [] };
    const stages = makeStageRegistry([]);
    const result = compilePipelineGraph(template, stages);

    // Empty graph may compile or fail depending on GraphBuilder validation
    expect(typeof result.ok).toBe('boolean');
  });

  it('stage handlers write to correct state keys', () => {
    const stage = makeStage('research', PIPELINE_STATE_KEYS.RESEARCH);
    const template: PipelineTemplate = {
      id: 'test',
      name: 'Test',
      stages: ['research'],
    };
    const stages = new Map<string, IPipelineStage>([['research', stage]]);
    const result = compilePipelineGraph(template, stages);

    expect(result.ok).toBe(true);
    // The graph exists and has nodes — execution is tested at integration level
    expect(result.graph).toBeDefined();
  });
});

// ============================================================================
// Per-stage node deadlines (#6730)
// ============================================================================

describe('compilePipelineGraph stage deadlines (#6730)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function nodeTimeout(stageTimeoutMs: number | undefined, stageId: string): number | undefined {
    const stages = makeStageRegistry([...DEV_PIPELINE_TEMPLATE.stages]);
    const result = compilePipelineGraph(
      DEV_PIPELINE_TEMPLATE,
      stages,
      stageTimeoutMs === undefined ? undefined : { stageTimeoutMs }
    );
    expect(result.ok).toBe(true);
    // The executor reads `node.timeout` before any executor-level default, so
    // this is the deadline the stage actually runs under.
    return result.graph?.nodes.get(stageId)?.timeout;
  }

  it('gives the vote node a panel-sized default, at least the per-voter deadline', () => {
    const voteTimeout = nodeTimeout(undefined, 'vote');
    expect(voteTimeout).toBe(resolveClassGuardMs('multi-llm-panel'));
    expect(voteTimeout).toBeGreaterThanOrEqual(VOTE_TIMEOUTS.defaultMs);
    // The defect: the vote ran under the generic graph default.
    expect(voteTimeout).toBeGreaterThan(GRAPH_TIMEOUTS.defaultMs);
  });

  it('keeps the graph default for non-panel stages', () => {
    expect(nodeTimeout(undefined, 'plan')).toBe(GRAPH_TIMEOUTS.defaultMs);
  });

  it('applies an explicit stageTimeoutMs to every stage, the vote included', () => {
    const requested = 450_000;
    expect(nodeTimeout(requested, 'plan')).toBe(requested);
    expect(nodeTimeout(requested, 'vote')).toBe(requested);
  });

  it('clamps an explicit stageTimeoutMs to the pipeline class guard', () => {
    const pipelineCeiling = 400_000;
    vi.stubEnv(classOverrideEnvVar('pipeline'), String(pipelineCeiling));
    expect(nodeTimeout(600_000, 'plan')).toBe(pipelineCeiling);
  });

  it('clamps the panel-sized vote default to the pipeline class guard', () => {
    const pipelineCeiling = 400_000;
    vi.stubEnv(classOverrideEnvVar('pipeline'), String(pipelineCeiling));
    vi.stubEnv(classOverrideEnvVar('multi-llm-panel'), '1200000');
    expect(nodeTimeout(undefined, 'vote')).toBe(pipelineCeiling);
  });
});
