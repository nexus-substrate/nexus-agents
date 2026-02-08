/**
 * Tests for Task Analysis Advocate Extensions (Issue #903)
 *
 * Tests ambiguity scoring, constraint extraction, and
 * required capabilities inference.
 */

import { describe, it, expect } from 'vitest';
import {
  computeAmbiguityScore,
  extractConstraints,
  inferRequiredCapabilities,
} from './task-analysis-advocate.js';

// ============================================================================
// computeAmbiguityScore
// ============================================================================

describe('computeAmbiguityScore', () => {
  it('returns 1.0 for empty string', () => {
    const signals: string[] = [];
    expect(computeAmbiguityScore('', signals)).toBe(1.0);
  });

  it('returns high score for very short vague input', () => {
    const signals: string[] = [];
    const score = computeAmbiguityScore('fix it', signals);
    expect(score).toBeGreaterThan(0.5);
    expect(signals).toContain('ambiguity:very-short');
    expect(signals.some((s) => s.startsWith('ambiguity:vague-verbs'))).toBe(true);
  });

  it('returns low score for specific task with file references', () => {
    const signals: string[] = [];
    const score = computeAmbiguityScore(
      'implement the validateInput function in src/utils/validator.ts with Zod schema validation for PR #123',
      signals
    );
    expect(score).toBeLessThan(0.3);
  });

  it('increases score for vague verbs', () => {
    const signals: string[] = [];
    const score = computeAmbiguityScore('improve and fix and help with the code', signals);
    expect(signals.some((s) => s.startsWith('ambiguity:vague-verbs'))).toBe(true);
    expect(score).toBeGreaterThan(0.2);
  });

  it('increases score when no scope references found', () => {
    const signals: string[] = [];
    computeAmbiguityScore('make the application faster', signals);
    expect(signals).toContain('ambiguity:no-scope');
  });

  it('does not add no-scope signal when file refs present', () => {
    const signals: string[] = [];
    computeAmbiguityScore('optimize queries in database.ts', signals);
    expect(signals).not.toContain('ambiguity:no-scope');
  });

  it('scores between 0 and 1', () => {
    const signals: string[] = [];
    const score = computeAmbiguityScore('moderate task description here', signals);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('caps score at 1.0', () => {
    const signals: string[] = [];
    const score = computeAmbiguityScore('fix', signals);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('treats whitespace-only as empty', () => {
    const signals: string[] = [];
    expect(computeAmbiguityScore('   ', signals)).toBe(1.0);
  });
});

// ============================================================================
// extractConstraints
// ============================================================================

describe('extractConstraints', () => {
  it('returns empty constraints for generic task', () => {
    const signals: string[] = [];
    const result = extractConstraints('implement a new feature', signals);
    expect(result.time).toBeUndefined();
    expect(result.quality).toBeUndefined();
    expect(result.scope).toHaveLength(0);
  });

  it('extracts time constraint - urgent', () => {
    const signals: string[] = [];
    const result = extractConstraints('fix this bug ASAP', signals);
    expect(result.time).toBeDefined();
    expect(signals.some((s) => s.startsWith('constraint:time'))).toBe(true);
  });

  it('extracts time constraint - deadline day', () => {
    const signals: string[] = [];
    const result = extractConstraints('need this by Friday please', signals);
    expect(result.time).toMatch(/by Friday/i);
  });

  it('extracts time constraint - relative deadline', () => {
    const signals: string[] = [];
    const result = extractConstraints('complete by end of day', signals);
    expect(result.time).toBeDefined();
  });

  it('extracts quality constraint - production', () => {
    const signals: string[] = [];
    const result = extractConstraints('make this production-ready', signals);
    expect(result.quality).toMatch(/production-ready/i);
    expect(signals.some((s) => s.startsWith('constraint:quality'))).toBe(true);
  });

  it('extracts quality constraint - prototype', () => {
    const signals: string[] = [];
    const result = extractConstraints('build a proof of concept', signals);
    expect(result.quality).toMatch(/proof of concept/i);
  });

  it('extracts quality constraint - mvp', () => {
    const signals: string[] = [];
    const result = extractConstraints('just give me the MVP', signals);
    expect(result.quality).toMatch(/MVP/i);
  });

  it('extracts scope - file paths', () => {
    const signals: string[] = [];
    const result = extractConstraints('fix the bug in validator.ts and utils.js', signals);
    expect(result.scope.length).toBeGreaterThanOrEqual(1);
    expect(result.scope.some((s) => s.includes('validator.ts'))).toBe(true);
    expect(signals.some((s) => s.startsWith('constraint:scope'))).toBe(true);
  });

  it('extracts scope - directory paths', () => {
    const signals: string[] = [];
    const result = extractConstraints('refactor src/core/types', signals);
    expect(result.scope.some((s) => s.includes('src/core/'))).toBe(true);
  });

  it('extracts scope - PR references', () => {
    const signals: string[] = [];
    const result = extractConstraints('review PR #456', signals);
    expect(result.scope.some((s) => s.includes('PR #456'))).toBe(true);
  });

  it('deduplicates scope entries', () => {
    const signals: string[] = [];
    const result = extractConstraints('fix test.ts and also test.ts needs updating', signals);
    const testTsCount = result.scope.filter((s) => s === 'test.ts').length;
    expect(testTsCount).toBeLessThanOrEqual(1);
  });

  it('picks highest-weight time constraint', () => {
    const signals: string[] = [];
    const result = extractConstraints('quick fix needed ASAP', signals);
    // ASAP (weight 1.0) should win over quick (weight 0.6)
    expect(result.time).toMatch(/ASAP/i);
  });
});

// ============================================================================
// inferRequiredCapabilities
// ============================================================================

describe('inferRequiredCapabilities', () => {
  it('maps architecture tasks to orchestrate + consensus_vote', () => {
    const signals: string[] = [];
    const result = inferRequiredCapabilities(
      'architecture',
      {
        parallelizable: false,
        multimodal: false,
        codeGeneration: false,
        budgetSensitive: false,
        highContext: false,
      },
      signals
    );
    expect(result.tools).toContain('orchestrate');
    expect(result.tools).toContain('consensus_vote');
    expect(result.experts).toContain('architecture_expert');
  });

  it('maps code_implementation to create/execute expert', () => {
    const signals: string[] = [];
    const result = inferRequiredCapabilities(
      'code_implementation',
      {
        parallelizable: false,
        multimodal: false,
        codeGeneration: true,
        budgetSensitive: false,
        highContext: false,
      },
      signals
    );
    expect(result.tools).toContain('create_expert');
    expect(result.experts).toContain('code_expert');
    expect(result.experts).toContain('testing_expert');
  });

  it('adds research expert for high-context tasks', () => {
    const signals: string[] = [];
    const result = inferRequiredCapabilities(
      'general',
      {
        parallelizable: false,
        multimodal: false,
        codeGeneration: false,
        budgetSensitive: false,
        highContext: true,
      },
      signals
    );
    expect(result.experts).toContain('research_expert');
    expect(result.tools).toContain('orchestrate');
    expect(signals).toContain('capability:needs-research');
  });

  it('maps code_review to run_workflow + code/security experts', () => {
    const signals: string[] = [];
    const result = inferRequiredCapabilities(
      'code_review',
      {
        parallelizable: false,
        multimodal: false,
        codeGeneration: false,
        budgetSensitive: false,
        highContext: false,
      },
      signals
    );
    expect(result.tools).toContain('run_workflow');
    expect(result.experts).toContain('code_expert');
    expect(result.experts).toContain('security_expert');
  });

  it('maps test_generation to testing expert', () => {
    const signals: string[] = [];
    const result = inferRequiredCapabilities(
      'test_generation',
      {
        parallelizable: false,
        multimodal: false,
        codeGeneration: false,
        budgetSensitive: false,
        highContext: false,
      },
      signals
    );
    expect(result.experts).toContain('testing_expert');
  });

  it('maps documentation to documentation expert', () => {
    const signals: string[] = [];
    const result = inferRequiredCapabilities(
      'documentation',
      {
        parallelizable: false,
        multimodal: false,
        codeGeneration: false,
        budgetSensitive: false,
        highContext: false,
      },
      signals
    );
    expect(result.experts).toContain('documentation_expert');
  });

  it('maps bulk_operations to graph workflow + devops', () => {
    const signals: string[] = [];
    const result = inferRequiredCapabilities(
      'bulk_operations',
      {
        parallelizable: true,
        multimodal: false,
        codeGeneration: false,
        budgetSensitive: false,
        highContext: false,
      },
      signals
    );
    expect(result.tools).toContain('run_graph_workflow');
    expect(result.experts).toContain('devops_expert');
  });

  it('adds required:tools and required:experts signals', () => {
    const signals: string[] = [];
    inferRequiredCapabilities(
      'general',
      {
        parallelizable: false,
        multimodal: false,
        codeGeneration: false,
        budgetSensitive: false,
        highContext: false,
      },
      signals
    );
    expect(signals.some((s) => s.startsWith('required:tools'))).toBe(true);
    expect(signals.some((s) => s.startsWith('required:experts'))).toBe(true);
  });
});
