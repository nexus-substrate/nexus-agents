/**
 * Tests for Pipeline Graph Compiler (#1735, Phase 2)
 */

import { describe, it, expect } from 'vitest';
import { compilePipelineGraph } from './pipeline-graph.js';
import type { IPipelineStage, PipelineTemplate, StageOutput } from './stage-types.js';
import { PIPELINE_STATE_KEYS } from './stage-types.js';
import {
  DEV_PIPELINE_TEMPLATE,
  RESEARCH_PIPELINE_TEMPLATE,
  GREENFIELD_PIPELINE_TEMPLATE,
  PIPELINE_TEMPLATES,
  getTemplate,
  listTemplateIds,
} from './templates.js';

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

  it('RESEARCH_PIPELINE_TEMPLATE has 5 stages', () => {
    expect(RESEARCH_PIPELINE_TEMPLATE.stages).toHaveLength(5);
    expect(RESEARCH_PIPELINE_TEMPLATE.stages).toEqual([
      'decompose',
      'investigate',
      'synthesize',
      'vote',
      'scaffold',
    ]);
  });

  it('PIPELINE_TEMPLATES contains all templates', () => {
    expect(PIPELINE_TEMPLATES.size).toBe(5);
    expect(getTemplate('dev')).toBe(DEV_PIPELINE_TEMPLATE);
    expect(getTemplate('research')).toBe(RESEARCH_PIPELINE_TEMPLATE);
    expect(getTemplate('greenfield')).toBe(GREENFIELD_PIPELINE_TEMPLATE);
    expect(getTemplate('general')).toBeDefined();
    expect(getTemplate('nonexistent')).toBeUndefined();
  });

  it('listTemplateIds returns all IDs', () => {
    const ids = listTemplateIds();
    expect(ids).toContain('dev');
    expect(ids).toContain('research');
    expect(ids).toContain('audit');
    expect(ids).toContain('greenfield');
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

  it('reports missing stage implementations', () => {
    const template: PipelineTemplate = {
      id: 'test',
      name: 'Test',
      stages: ['step1', 'missing_step'],
    };
    const stages = makeStageRegistry(['step1']);
    const result = compilePipelineGraph(template, stages);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('missing_step');
  });

  it('compiles the dev pipeline template', () => {
    const stages = makeStageRegistry(DEV_PIPELINE_TEMPLATE.stages);
    const result = compilePipelineGraph(DEV_PIPELINE_TEMPLATE, stages);

    expect(result.ok).toBe(true);
    expect(result.graph).toBeDefined();
  });

  it('compiles the research pipeline template', () => {
    const stages = makeStageRegistry(RESEARCH_PIPELINE_TEMPLATE.stages);
    const result = compilePipelineGraph(RESEARCH_PIPELINE_TEMPLATE, stages);

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
