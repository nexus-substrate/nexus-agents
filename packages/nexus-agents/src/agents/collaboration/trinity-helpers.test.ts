/**
 * Tests for TRINITY Coordinator Helpers
 * @module agents/collaboration/trinity-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../core/index.js';
import type { TrinityConfig } from './trinity-types.js';
import { DEFAULT_TRINITY_CONFIG } from './trinity-types.js';
import {
  buildRoleTask,
  extractSections,
  extractList,
  parseThinkerOutput,
  parseWorkerOutput,
  parseVerifierOutput,
  createDefaultWorkerOutput,
  createDefaultVerifierOutput,
  resolveConfig,
} from './trinity-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTask(id: string, description: string): Task {
  return { id, description, context: { source: 'test' } } as Task;
}

// ============================================================================
// buildRoleTask
// ============================================================================

describe('buildRoleTask', () => {
  it('creates task with role prefix in id', () => {
    const base = makeTask('task-1', 'Implement feature');
    const result = buildRoleTask(base, 'thinker', 'extra context');
    expect(result.id).toBe('task-1-thinker');
  });

  it('includes role prompt and original description', () => {
    const base = makeTask('task-1', 'Implement feature');
    const result = buildRoleTask(base, 'worker', '');
    expect(result.description).toContain('Worker');
    expect(result.description).toContain('Implement feature');
  });

  it('includes context string', () => {
    const base = makeTask('task-1', 'Implement feature');
    const result = buildRoleTask(base, 'verifier', 'Previous output here');
    expect(result.description).toContain('Previous output here');
  });

  it('preserves base task context', () => {
    const base = makeTask('task-1', 'Implement feature');
    const result = buildRoleTask(base, 'thinker', '');
    expect(result.context).toEqual({ source: 'test' });
  });
});

// ============================================================================
// extractSections
// ============================================================================

describe('extractSections', () => {
  it('extracts named sections', () => {
    const text =
      'Problem Analysis: This is a complex task\nMore details here\nApproach: Step by step';
    const sections = extractSections(text);
    expect(sections['problem analysis']).toContain('This is a complex task');
    expect(sections['approach']).toContain('Step by step');
  });

  it('handles multi-line section content', () => {
    const text = 'Analysis: Line one\nLine two\nLine three\nVerdict: Pass';
    const sections = extractSections(text);
    expect(sections['analysis']).toContain('Line one');
    expect(sections['analysis']).toContain('Line two');
    expect(sections['analysis']).toContain('Line three');
  });

  it('returns empty object for no sections', () => {
    const sections = extractSections('Just some plain text without sections');
    expect(Object.keys(sections)).toHaveLength(0);
  });

  it('handles markdown-prefixed sections', () => {
    const text = '## Problem Analysis: The issue\n# Approach: The plan';
    const sections = extractSections(text);
    expect(sections['problem analysis']).toBeDefined();
    expect(sections['approach']).toBeDefined();
  });

  it('handles bullet-prefixed sections', () => {
    const text = '- Verdict: Pass\n* Quality: Good';
    const sections = extractSections(text);
    expect(sections['verdict']).toContain('Pass');
    expect(sections['quality']).toContain('Good');
  });
});

// ============================================================================
// extractList
// ============================================================================

describe('extractList', () => {
  it('extracts bullet list items', () => {
    const text = '- First item\n- Second item\n- Third item';
    const items = extractList(text);
    expect(items).toHaveLength(3);
    expect(items[0]).toBe('First item');
  });

  it('extracts numbered list items', () => {
    const text = '1. First\n2. Second\n3. Third';
    const items = extractList(text);
    expect(items).toHaveLength(3);
    expect(items[0]).toBe('First');
  });

  it('extracts asterisk list items', () => {
    const text = '* Alpha\n* Beta';
    const items = extractList(text);
    expect(items).toHaveLength(2);
    expect(items[0]).toBe('Alpha');
  });

  it('returns empty array for empty string', () => {
    expect(extractList('')).toEqual([]);
  });

  it('falls back to non-empty lines when no list markers', () => {
    const text = 'Line one\nLine two\n\nLine three';
    const items = extractList(text);
    expect(items).toHaveLength(3);
  });
});

// ============================================================================
// parseThinkerOutput
// ============================================================================

describe('parseThinkerOutput', () => {
  it('parses full thinker output', () => {
    const output = [
      'Problem Analysis: Complex system needs refactoring',
      'Approach: Break into modules',
      'Considerations:',
      '- Performance impact',
      '- Backward compatibility',
      'Success Criteria:',
      '- All tests pass',
      '- No regressions',
    ].join('\n');

    const result = parseThinkerOutput(output);
    expect(result.problemAnalysis).toContain('Complex system needs refactoring');
    expect(result.approach).toContain('Break into modules');
    expect(result.considerations).toHaveLength(2);
    expect(result.successCriteria).toHaveLength(2);
  });

  it('falls back to analysis section', () => {
    const output = 'Analysis: Fallback analysis text';
    const result = parseThinkerOutput(output);
    expect(result.problemAnalysis).toContain('Fallback analysis text');
  });

  it('uses first 500 chars as fallback for analysis', () => {
    const output = 'No sections here, just raw text about the problem';
    const result = parseThinkerOutput(output);
    expect(result.problemAnalysis).toContain('No sections here');
  });

  it('returns empty arrays for missing list sections', () => {
    const output = 'Problem Analysis: Simple task';
    const result = parseThinkerOutput(output);
    expect(result.considerations).toEqual([]);
    expect(result.successCriteria).toEqual([]);
  });
});

// ============================================================================
// parseWorkerOutput
// ============================================================================

describe('parseWorkerOutput', () => {
  it('parses full worker output', () => {
    const output = [
      'Implementation: The code was written',
      'Steps Completed:',
      '- Created file',
      '- Added tests',
      'Deviations:',
      '- Changed API format',
      'Questions:',
      '- Should we add logging?',
    ].join('\n');

    const result = parseWorkerOutput(output);
    expect(result.implementation).toContain('The code was written');
    expect(result.stepsCompleted).toHaveLength(2);
    expect(result.deviations).toHaveLength(1);
    expect(result.questions).toHaveLength(1);
  });

  it('uses full output as implementation fallback', () => {
    const output = 'Just the implementation text';
    const result = parseWorkerOutput(output);
    expect(result.implementation).toBe('Just the implementation text');
  });
});

// ============================================================================
// parseVerifierOutput
// ============================================================================

describe('parseVerifierOutput', () => {
  it('parses pass verdict', () => {
    const output = [
      'Verdict: PASS',
      'Correctness Check: All requirements met',
      'Quality Check: Good code quality',
      'Issues Found:',
      '- Minor style issue',
      'Recommendations:',
      '- Add more comments',
    ].join('\n');

    const result = parseVerifierOutput(output);
    expect(result.verdict).toBe('pass');
    expect(result.correctnessCheck).toContain('All requirements met');
    expect(result.qualityCheck).toContain('Good code quality');
    expect(result.issuesFound).toHaveLength(1);
    expect(result.recommendations).toHaveLength(1);
  });

  it('parses fail verdict', () => {
    const output = 'Verdict: FAIL - major issues';
    const result = parseVerifierOutput(output);
    expect(result.verdict).toBe('fail');
  });

  it('defaults to fail when verdict is unclear', () => {
    const output = 'Verdict: needs improvement';
    const result = parseVerifierOutput(output);
    expect(result.verdict).toBe('fail');
  });

  it('uses correctness section fallback', () => {
    const output = 'Correctness: Works fine';
    const result = parseVerifierOutput(output);
    expect(result.correctnessCheck).toContain('Works fine');
  });
});

// ============================================================================
// createDefaultWorkerOutput
// ============================================================================

describe('createDefaultWorkerOutput', () => {
  it('returns empty default worker output', () => {
    const result = createDefaultWorkerOutput();
    expect(result.implementation).toBe('');
    expect(result.stepsCompleted).toEqual([]);
    expect(result.deviations).toEqual([]);
    expect(result.questions).toEqual([]);
  });
});

// ============================================================================
// createDefaultVerifierOutput
// ============================================================================

describe('createDefaultVerifierOutput', () => {
  it('returns fail verdict by default', () => {
    const result = createDefaultVerifierOutput();
    expect(result.verdict).toBe('fail');
    expect(result.correctnessCheck).toBe('');
    expect(result.qualityCheck).toBe('');
    expect(result.issuesFound).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  it('returns cancelled output when cancelled', () => {
    const result = createDefaultVerifierOutput(true);
    expect(result.verdict).toBe('fail');
    expect(result.correctnessCheck).toBe('Cancelled');
    expect(result.qualityCheck).toBe('Cancelled');
    expect(result.issuesFound).toEqual(['Coordination cancelled']);
  });
});

// ============================================================================
// resolveConfig
// ============================================================================

describe('resolveConfig', () => {
  it('returns defaults when config is undefined', () => {
    const result = resolveConfig(undefined);
    expect(result.maxIterations).toBe(DEFAULT_TRINITY_CONFIG.maxIterations);
    expect(result.timeoutMs).toBe(DEFAULT_TRINITY_CONFIG.timeoutMs);
    expect(result.includeHistory).toBe(DEFAULT_TRINITY_CONFIG.includeHistory);
  });

  it('applies partial overrides', () => {
    const config: TrinityConfig = { maxIterations: 5 };
    const result = resolveConfig(config);
    expect(result.maxIterations).toBe(5);
    expect(result.timeoutMs).toBe(DEFAULT_TRINITY_CONFIG.timeoutMs);
    expect(result.includeHistory).toBe(DEFAULT_TRINITY_CONFIG.includeHistory);
  });

  it('applies full overrides', () => {
    const config: TrinityConfig = {
      maxIterations: 10,
      timeoutMs: 60000,
      includeHistory: false,
    };
    const result = resolveConfig(config);
    expect(result.maxIterations).toBe(10);
    expect(result.timeoutMs).toBe(60000);
    expect(result.includeHistory).toBe(false);
  });
});
