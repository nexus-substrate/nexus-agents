/**
 * Tests for SICA Agent Helpers
 * @module agents/self-improving/sica-agent-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { TaskResult } from '../../core/index.js';
import type { AgentConfiguration, VersionMetrics } from './sica-types.js';
import {
  estimateQuality,
  improvePromptGeneral,
  improvePromptForErrors,
  improvePromptForConciseness,
  applyChanges,
  generateHypothesis,
  generateChanges,
} from './sica-agent-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeResult(output: unknown): TaskResult {
  return { taskId: 't1', output, success: true, agentId: 'a1' } as unknown as TaskResult;
}

function makeConfig(overrides: Partial<AgentConfiguration> = {}): AgentConfiguration {
  return {
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 2000,
    ...overrides,
  } as AgentConfiguration;
}

function makeMetrics(overrides: Partial<VersionMetrics> = {}): VersionMetrics {
  return {
    successRate: 0.8,
    avgDurationMs: 5000,
    avgTokensUsed: 1000,
    avgQualityScore: 0.7,
    totalExecutions: 10,
    ...overrides,
  } as VersionMetrics;
}

// ============================================================================
// estimateQuality
// ============================================================================

describe('estimateQuality', () => {
  it('returns 0.5 for non-string output', () => {
    expect(estimateQuality(makeResult({ key: 'value' }))).toBe(0.5);
  });

  it('returns 0.6 for short output with no error keywords', () => {
    // 0.5 base + 0.1 (no error/Error) = 0.6
    expect(estimateQuality(makeResult('hi'))).toBeCloseTo(0.6);
  });

  it('adds 0.1 for length > 100', () => {
    const output = 'x'.repeat(150);
    expect(estimateQuality(makeResult(output))).toBeCloseTo(0.7);
    // 0.5 + 0.1 (>100) + 0.1 (no error) = 0.7
  });

  it('adds 0.1 for length > 500', () => {
    const output = 'x'.repeat(600);
    expect(estimateQuality(makeResult(output))).toBeCloseTo(0.8);
    // 0.5 + 0.1 (>100) + 0.1 (>500) + 0.1 (no error) = 0.8
  });

  it('penalizes for error mentions', () => {
    const output = 'x'.repeat(200) + ' error occurred';
    expect(estimateQuality(makeResult(output))).toBeCloseTo(0.6);
    // 0.5 + 0.1 (>100) = 0.6 (no +0.1 for no error)
  });

  it('adds 0.1 for code blocks', () => {
    const output = 'x'.repeat(200) + ' ```code here```';
    expect(estimateQuality(makeResult(output))).toBeCloseTo(0.8);
    // 0.5 + 0.1 (>100) + 0.1 (no error) + 0.1 (code block) = 0.8
  });

  it('caps at 1.0', () => {
    const output = 'x'.repeat(600) + ' ```code```';
    expect(estimateQuality(makeResult(output))).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Prompt Improvement
// ============================================================================

describe('improvePromptGeneral', () => {
  it('appends clarity instructions', () => {
    const result = improvePromptGeneral('Hello');
    expect(result).toContain('Hello');
    expect(result).toContain('clarity');
  });
});

describe('improvePromptForErrors', () => {
  it('appends error handling instructions', () => {
    const result = improvePromptForErrors('Hello');
    expect(result).toContain('edge cases');
  });
});

describe('improvePromptForConciseness', () => {
  it('appends conciseness instructions', () => {
    const result = improvePromptForConciseness('Hello');
    expect(result).toContain('concise');
  });
});

// ============================================================================
// applyChanges
// ============================================================================

describe('applyChanges', () => {
  it('applies systemPrompt change', () => {
    const config = makeConfig({ systemPrompt: 'old' });
    const result = applyChanges(config, [
      { field: 'systemPrompt', oldValue: 'old', newValue: 'new', reason: 'test' },
    ]);
    expect(result.systemPrompt).toBe('new');
  });

  it('applies temperature change', () => {
    const config = makeConfig({ temperature: 0.7 });
    const result = applyChanges(config, [
      { field: 'temperature', oldValue: 0.7, newValue: 0.5, reason: 'test' },
    ]);
    expect(result.temperature).toBe(0.5);
  });

  it('applies maxTokens change', () => {
    const config = makeConfig({ maxTokens: 2000 });
    const result = applyChanges(config, [
      { field: 'maxTokens', oldValue: 2000, newValue: 1500, reason: 'test' },
    ]);
    expect(result.maxTokens).toBe(1500);
  });

  it('applies multiple changes', () => {
    const config = makeConfig();
    const result = applyChanges(config, [
      { field: 'temperature', oldValue: 0.7, newValue: 0.3, reason: 'test' },
      { field: 'maxTokens', oldValue: 2000, newValue: 1000, reason: 'test' },
    ]);
    expect(result.temperature).toBe(0.3);
    expect(result.maxTokens).toBe(1000);
  });
});

// ============================================================================
// generateHypothesis
// ============================================================================

describe('generateHypothesis', () => {
  it('suggests error handling for low success rate', () => {
    const metrics = makeMetrics({ successRate: 0.3 });
    expect(generateHypothesis(metrics, { focusArea: 'reliability' })).toContain('error handling');
  });

  it('suggests faster execution for speed focus', () => {
    const metrics = makeMetrics({ successRate: 0.8, avgDurationMs: 15000 });
    expect(generateHypothesis(metrics, { focusArea: 'speed' })).toContain('faster');
  });

  it('suggests quality enhancement for quality focus', () => {
    const metrics = makeMetrics({ successRate: 0.8, avgQualityScore: 0.4 });
    expect(generateHypothesis(metrics, { focusArea: 'quality' })).toContain('quality');
  });

  it('suggests token reduction for cost focus', () => {
    const metrics = makeMetrics({ successRate: 0.8, avgTokensUsed: 5000 });
    expect(generateHypothesis(metrics, { focusArea: 'cost' })).toContain('token usage');
  });

  it('defaults to general improvement', () => {
    const metrics = makeMetrics({ successRate: 0.8 });
    expect(generateHypothesis(metrics, {})).toContain('General');
  });
});

// ============================================================================
// generateChanges
// ============================================================================

describe('generateChanges', () => {
  it('generates error handling changes', () => {
    const changes = generateChanges(makeConfig(), 'Improve error handling and robustness');
    expect(changes.some((c) => c.field === 'systemPrompt')).toBe(true);
    expect(changes.some((c) => (c.newValue as string).includes('edge cases'))).toBe(true);
  });

  it('generates speed changes', () => {
    const changes = generateChanges(makeConfig(), 'Optimize for faster execution');
    expect(changes.some((c) => c.field === 'maxTokens')).toBe(true);
  });

  it('generates quality changes', () => {
    const changes = generateChanges(makeConfig(), 'Enhance output quality and completeness');
    expect(changes.some((c) => c.field === 'temperature')).toBe(true);
  });

  it('generates cost changes', () => {
    const changes = generateChanges(makeConfig(), 'Reduce token usage while maintaining quality');
    // "token usage" triggers systemPrompt change with conciseness; "quality" also triggers temperature change
    expect(
      changes.some((c) => c.field === 'systemPrompt' && (c.newValue as string).includes('concise'))
    ).toBe(true);
    expect(changes.some((c) => c.field === 'temperature')).toBe(true);
  });

  it('generates general changes', () => {
    const changes = generateChanges(makeConfig(), 'General improvement to prompt clarity');
    expect(changes.some((c) => (c.newValue as string).includes('clarity'))).toBe(true);
  });
});
