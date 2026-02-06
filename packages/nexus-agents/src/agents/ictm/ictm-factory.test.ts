/**
 * Tests for ICTM Factory — ictmToExpertConfig, inferICTM, validateICTM, getRecommendedRole
 */
import { describe, it, expect } from 'vitest';

import type { SubTask, TaskAnalysis } from '../tech-lead-types.js';
import type { ICTMConfig } from './ictm-types.js';
import { ictmToExpertConfig, inferICTM, validateICTM, getRecommendedRole } from './ictm-factory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'sub-1',
    parentTaskId: 'task-1',
    description: 'Implement auth module',
    expectedOutput: 'Working auth module with tests',
    dependencies: [],
    priority: 'high',
    status: 'pending',
    complexity: 5,
    requiredCapabilities: ['code_generation'],
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<TaskAnalysis> = {}): TaskAnalysis {
  return {
    taskId: 'task-1',
    complexity: 5,
    taskType: 'implementation',
    requirements: ['Must support OAuth2', 'Must have error handling'],
    risks: ['Token expiry edge case'],
    needsDecomposition: true,
    approach: 'Build incrementally with TDD approach for safety',
    estimatedEffort: 8,
    ...overrides,
  };
}

function makeICTMConfig(overrides: Partial<ICTMConfig> = {}): ICTMConfig {
  return {
    instructions: 'Do the thing',
    context: {
      maxTokens: 8000,
      relevanceThreshold: 0.3,
      includeHistory: false,
      pruneStrategy: 'recency',
    },
    tools: { capabilities: ['task_execution'] },
    model: { temperature: 0.3, reasoning: 'standard' },
    ...overrides,
  };
}

// ===========================================================================
// ictmToExpertConfig
// ===========================================================================

describe('ictmToExpertConfig', () => {
  it('sets role to custom', () => {
    const cfg = ictmToExpertConfig(makeICTMConfig(), 'abc');
    expect(cfg.role).toBe('custom');
  });

  it('generates id and name from subtaskId', () => {
    const cfg = ictmToExpertConfig(makeICTMConfig(), 'xyz-42');
    expect(cfg.id).toBe('ictm-xyz-42');
    expect(cfg.name).toBe('ICTM Agent (xyz-42)');
  });

  it('uses instructions as systemPrompt', () => {
    const ictm = makeICTMConfig({ instructions: 'Review SQL queries' });
    const cfg = ictmToExpertConfig(ictm, 's1');
    expect(cfg.systemPrompt).toBe('Review SQL queries');
  });

  it('propagates temperature and maxTokens', () => {
    const ictm = makeICTMConfig({
      model: { temperature: 0.7, maxTokens: 4096 },
    });
    const cfg = ictmToExpertConfig(ictm, 's1');
    expect(cfg.modelPreference?.temperature).toBe(0.7);
    expect(cfg.modelPreference?.maxTokens).toBe(4096);
  });

  it('propagates provider and modelId', () => {
    const ictm = makeICTMConfig({
      model: { provider: 'anthropic', modelId: 'claude-3-opus' },
    });
    const cfg = ictmToExpertConfig(ictm, 's1');
    expect(cfg.modelPreference?.provider).toBe('anthropic');
    expect(cfg.modelPreference?.modelId).toBe('claude-3-opus');
  });

  it('handles undefined provider and modelId gracefully', () => {
    const ictm = makeICTMConfig({ model: { temperature: 0.5 } });
    const cfg = ictmToExpertConfig(ictm, 's1');
    expect(cfg.modelPreference?.provider).toBeUndefined();
    expect(cfg.modelPreference?.modelId).toBeUndefined();
  });

  it('stores ICTM metadata (contextFilter, toolRestrictions, reasoningDepth)', () => {
    const ictm = makeICTMConfig({
      context: {
        maxTokens: 16000,
        relevanceThreshold: 0.6,
        includeHistory: true,
        pruneStrategy: 'importance',
      },
      tools: {
        capabilities: ['code_review'],
        restrictions: ['code_generation'],
      },
      model: { reasoning: 'extended' },
    });
    const cfg = ictmToExpertConfig(ictm, 's1');
    expect(cfg.metadata?.ictm).toBe(true);
    expect(cfg.metadata?.contextFilter).toEqual(ictm.context);
    expect(cfg.metadata?.toolRestrictions).toEqual(['code_generation']);
    expect(cfg.metadata?.reasoningDepth).toBe('extended');
  });

  it('merges existing metadata from ICTM config', () => {
    const ictm = makeICTMConfig({ metadata: { source: 'test' } });
    const cfg = ictmToExpertConfig(ictm, 's1');
    expect(cfg.metadata?.source).toBe('test');
    expect(cfg.metadata?.ictm).toBe(true);
  });

  it('maps capabilities from tools', () => {
    const ictm = makeICTMConfig({
      tools: { capabilities: ['code_review', 'research'] },
    });
    const cfg = ictmToExpertConfig(ictm, 's1');
    expect(cfg.capabilities).toEqual(['code_review', 'research']);
  });
});

// ===========================================================================
// inferICTM
// ===========================================================================

describe('inferICTM', () => {
  it('low complexity → minimal reasoning, higher temperature, lower maxTokens', () => {
    const sub = makeSubTask({ complexity: 2 });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.model.reasoning).toBe('minimal');
    expect(result.config.model.temperature).toBe(0.5);
    expect(result.config.model.maxTokens).toBe(2048);
  });

  it('high complexity → extended reasoning, lower temperature, higher maxTokens', () => {
    const sub = makeSubTask({ complexity: 9 });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.model.reasoning).toBe('extended');
    expect(result.config.model.temperature).toBe(0.1);
    expect(result.config.model.maxTokens).toBe(8192);
  });

  it('medium complexity → standard reasoning', () => {
    const sub = makeSubTask({ complexity: 5 });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.model.reasoning).toBe('standard');
    expect(result.config.model.temperature).toBe(0.3);
    expect(result.config.model.maxTokens).toBe(4096);
  });

  it('subtask with dependencies → includeHistory=true', () => {
    const sub = makeSubTask({ dependencies: ['sub-0'] });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.context.includeHistory).toBe(true);
  });

  it('subtask without dependencies → includeHistory=false', () => {
    const sub = makeSubTask({ dependencies: [] });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.context.includeHistory).toBe(false);
  });

  it('high-risk analysis (>2 risks) → relevanceThreshold 0.6', () => {
    const analysis = makeAnalysis({ risks: ['r1', 'r2', 'r3'] });
    const result = inferICTM(makeSubTask(), analysis);
    expect(result.config.context.relevanceThreshold).toBe(0.6);
  });

  it('low-risk analysis (<=2 risks) → relevanceThreshold 0.3', () => {
    const analysis = makeAnalysis({ risks: ['r1'] });
    const result = inferICTM(makeSubTask(), analysis);
    expect(result.config.context.relevanceThreshold).toBe(0.3);
  });

  it('subtask with assignedRole merges role capabilities', () => {
    const sub = makeSubTask({
      assignedRole: 'security_expert',
      requiredCapabilities: ['code_review'],
    });
    const result = inferICTM(sub, makeAnalysis());
    const caps = result.config.tools.capabilities;
    // security_expert has: task_execution, code_review, research
    expect(caps).toContain('task_execution');
    expect(caps).toContain('code_review');
    expect(caps).toContain('research');
  });

  it('always includes task_execution capability', () => {
    const sub = makeSubTask({ requiredCapabilities: ['research'] });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.tools.capabilities).toContain('task_execution');
  });

  it('does not duplicate task_execution if already present', () => {
    const sub = makeSubTask({
      requiredCapabilities: ['task_execution', 'research'],
    });
    const result = inferICTM(sub, makeAnalysis());
    const count = result.config.tools.capabilities.filter((c) => c === 'task_execution').length;
    expect(count).toBe(1);
  });

  it('confidence increases with more info', () => {
    const minimal = makeSubTask({
      requiredCapabilities: [],
    });
    const rich = makeSubTask({
      requiredCapabilities: ['code_review'],
      assignedRole: 'code_expert',
    });
    const analysis = makeAnalysis({
      requirements: ['req1'],
      approach: 'A detailed approach that exceeds twenty characters easily',
    });
    const confMin = inferICTM(
      minimal,
      makeAnalysis({ requirements: [], approach: 'short' })
    ).confidence;
    const confRich = inferICTM(rich, analysis).confidence;
    expect(confRich).toBeGreaterThan(confMin);
  });

  it('confidence decreases with many risks', () => {
    const lowRisk = makeAnalysis({ risks: [] });
    const highRisk = makeAnalysis({ risks: ['r1', 'r2', 'r3', 'r4'] });
    const sub = makeSubTask();
    expect(inferICTM(sub, highRisk).confidence).toBeLessThan(inferICTM(sub, lowRisk).confidence);
  });

  it('confidence is clamped to [0, 1]', () => {
    const sub = makeSubTask({
      requiredCapabilities: ['a'],
      assignedRole: 'code_expert',
    });
    const analysis = makeAnalysis({
      requirements: ['r'],
      approach: 'This approach is longer than twenty characters for boost',
    });
    const result = inferICTM(sub, analysis);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('instructions contain subtask description, requirements, and risks', () => {
    const sub = makeSubTask({ description: 'Fix XSS vulnerability' });
    const analysis = makeAnalysis({
      requirements: ['Sanitize inputs'],
      risks: ['Bypass via encoding'],
    });
    const result = inferICTM(sub, analysis);
    expect(result.config.instructions).toContain('Fix XSS vulnerability');
    expect(result.config.instructions).toContain('Sanitize inputs');
    expect(result.config.instructions).toContain('Bypass via encoding');
  });

  it('instructions include dependencies section when present', () => {
    const sub = makeSubTask({ dependencies: ['sub-0', 'sub-2'] });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.instructions).toContain('sub-0, sub-2');
    expect(result.config.instructions).toContain('Dependencies');
  });

  it('high complexity → importance pruneStrategy', () => {
    const sub = makeSubTask({ complexity: 8 });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.context.pruneStrategy).toBe('importance');
  });

  it('low complexity with dependencies → hybrid pruneStrategy', () => {
    const sub = makeSubTask({ complexity: 2, dependencies: ['dep-1'] });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.context.pruneStrategy).toBe('hybrid');
  });

  it('low complexity without dependencies → recency pruneStrategy', () => {
    const sub = makeSubTask({ complexity: 2, dependencies: [] });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.context.pruneStrategy).toBe('recency');
  });

  it('high complexity gets doubled context tokens', () => {
    const sub = makeSubTask({ complexity: 8 });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.context.maxTokens).toBe(16000);
  });

  it('low complexity gets base context tokens', () => {
    const sub = makeSubTask({ complexity: 2 });
    const result = inferICTM(sub, makeAnalysis());
    expect(result.config.context.maxTokens).toBe(8000);
  });

  it('returns reasoning strings for all ICTM components', () => {
    const result = inferICTM(makeSubTask(), makeAnalysis());
    expect(result.reasoning.instructions).toBeTruthy();
    expect(result.reasoning.context).toBeTruthy();
    expect(result.reasoning.tools).toBeTruthy();
    expect(result.reasoning.model).toBeTruthy();
  });
});

// ===========================================================================
// validateICTM
// ===========================================================================

describe('validateICTM', () => {
  it('returns config for a valid ICTM config', () => {
    const config = makeICTMConfig();
    const result = validateICTM(config);
    expect(result).not.toBeNull();
    expect(result?.instructions).toBe(config.instructions);
  });

  it('returns null for invalid config (empty instructions)', () => {
    const bad = { ...makeICTMConfig(), instructions: '' };
    expect(validateICTM(bad)).toBeNull();
  });

  it('returns null for completely invalid input', () => {
    expect(validateICTM(42)).toBeNull();
    expect(validateICTM(null)).toBeNull();
    expect(validateICTM(undefined)).toBeNull();
  });

  it('returns null when capabilities array is empty', () => {
    const bad = makeICTMConfig({ tools: { capabilities: [] } });
    expect(validateICTM(bad)).toBeNull();
  });

  it('returns null when maxTokens is out of range', () => {
    const bad = makeICTMConfig({
      context: {
        maxTokens: 0,
        relevanceThreshold: 0.3,
        includeHistory: false,
        pruneStrategy: 'recency',
      },
    });
    expect(validateICTM(bad)).toBeNull();
  });
});

// ===========================================================================
// getRecommendedRole
// ===========================================================================

describe('getRecommendedRole', () => {
  it('returns code_expert for implementation', () => {
    expect(getRecommendedRole('implementation')).toBe('code_expert');
  });

  it('returns architecture_expert for architecture', () => {
    expect(getRecommendedRole('architecture')).toBe('architecture_expert');
  });

  it('returns security_expert for security_audit', () => {
    expect(getRecommendedRole('security_audit')).toBe('security_expert');
  });

  it('returns documentation_expert for documentation', () => {
    expect(getRecommendedRole('documentation')).toBe('documentation_expert');
  });

  it('returns testing_expert for testing', () => {
    expect(getRecommendedRole('testing')).toBe('testing_expert');
  });

  it('falls back to code_expert for unknown task type', () => {
    expect(getRecommendedRole('something_unknown')).toBe('code_expert');
  });
});
