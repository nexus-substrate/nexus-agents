/**
 * Tests for Code Expert Helpers
 * @module agents/experts/code-expert-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  CODE_EXPERT_SYSTEM_PROMPT,
  buildCodeExpertBaseOptions,
  inferOperationType,
  generateHeuristicRecommendations,
  detectHeuristicWarnings,
  extractJsonFromText,
  parseCodeResult,
} from './code-expert-helpers.js';
import type { CodeExpertOptions } from './code-expert-helpers.js';
import type { BaseAgentOptions } from '../base-agent.js';

// ============================================================================
// CODE_EXPERT_SYSTEM_PROMPT
// ============================================================================

describe('CODE_EXPERT_SYSTEM_PROMPT', () => {
  it('contains SOLID principles reference', () => {
    expect(CODE_EXPERT_SYSTEM_PROMPT).toContain('SOLID');
  });

  it('contains JSON output format', () => {
    expect(CODE_EXPERT_SYSTEM_PROMPT).toContain('operationType');
    expect(CODE_EXPERT_SYSTEM_PROMPT).toContain('confidence');
  });
});

// ============================================================================
// buildCodeExpertBaseOptions
// ============================================================================

describe('buildCodeExpertBaseOptions', () => {
  it('builds with defaults', () => {
    const result = buildCodeExpertBaseOptions({}, {});
    expect(result.id).toBe('code-expert');
    expect(result.role).toBe('code_expert');
    expect(result.maxTokens).toBe(8192);
    expect(result.systemPrompt).toBe(CODE_EXPERT_SYSTEM_PROMPT);
  });

  it('uses custom id', () => {
    const result = buildCodeExpertBaseOptions({ id: 'my-expert' }, {});
    expect(result.id).toBe('my-expert');
  });

  it('uses custom temperature', () => {
    const result = buildCodeExpertBaseOptions({}, { temperature: 0.3 });
    expect(result.temperature).toBe(0.3);
  });

  it('uses systemPromptOverride', () => {
    const result = buildCodeExpertBaseOptions(
      {},
      {
        systemPromptOverride: 'Custom prompt',
      }
    );
    expect(result.systemPrompt).toBe('Custom prompt');
  });

  it('passes adapter when provided', () => {
    const adapter = { name: 'test' };
    const result = buildCodeExpertBaseOptions(
      { adapter } as unknown as Partial<BaseAgentOptions>,
      {}
    );
    expect(result.adapter).toBe(adapter);
  });

  it('includes additional capabilities', () => {
    const result = buildCodeExpertBaseOptions({}, {
      additionalCapabilities: ['custom-cap'],
    } as unknown as CodeExpertOptions);
    expect(result.capabilities).toContain('custom-cap');
  });
});

// ============================================================================
// inferOperationType
// ============================================================================

describe('inferOperationType', () => {
  it('returns debugging for "debug" keyword', () => {
    expect(inferOperationType('Debug this function')).toBe('debugging');
  });

  it('returns debugging for "fix bug"', () => {
    expect(inferOperationType('Fix bug in login')).toBe('debugging');
  });

  it('returns debugging for "error"', () => {
    expect(inferOperationType('Handle this error')).toBe('debugging');
  });

  it('returns optimization for "optimize"', () => {
    expect(inferOperationType('Optimize the query')).toBe('optimization');
  });

  it('returns optimization for "performance"', () => {
    expect(inferOperationType('Improve performance')).toBe('optimization');
  });

  it('returns optimization for "faster"', () => {
    expect(inferOperationType('Make it faster')).toBe('optimization');
  });

  it('returns refactoring for "refactor"', () => {
    expect(inferOperationType('Refactor the module')).toBe('refactoring');
  });

  it('returns refactoring for "clean"', () => {
    expect(inferOperationType('Clean up the code')).toBe('refactoring');
  });

  it('returns generation for unmatched input', () => {
    expect(inferOperationType('Create a new API endpoint')).toBe('generation');
  });
});

// ============================================================================
// generateHeuristicRecommendations
// ============================================================================

describe('generateHeuristicRecommendations', () => {
  it('includes base recommendations for generation', () => {
    const recs = generateHeuristicRecommendations('generation');
    expect(recs).toContain('Consider adding unit tests');
    expect(recs).toContain('Follow project coding standards');
  });

  it('includes refactoring-specific recommendations', () => {
    const recs = generateHeuristicRecommendations('refactoring');
    expect(recs).toContain('Ensure tests pass before and after');
  });

  it('includes optimization-specific recommendations', () => {
    const recs = generateHeuristicRecommendations('optimization');
    expect(recs).toContain('Benchmark before optimizing');
  });

  it('includes debugging-specific recommendations', () => {
    const recs = generateHeuristicRecommendations('debugging');
    expect(recs).toContain('Add regression test for the bug');
  });
});

// ============================================================================
// detectHeuristicWarnings
// ============================================================================

describe('detectHeuristicWarnings', () => {
  it('warns about database changes', () => {
    const warnings = detectHeuristicWarnings('Update the database schema');
    expect(warnings).toContain('Database changes may require migration');
  });

  it('warns about API changes', () => {
    const warnings = detectHeuristicWarnings('Create a new API endpoint');
    expect(warnings).toContain('API changes may be breaking');
  });

  it('warns about security changes', () => {
    const warnings = detectHeuristicWarnings('Update auth middleware');
    expect(warnings).toContain('Security-sensitive code requires careful review');
  });

  it('warns about concurrency', () => {
    const warnings = detectHeuristicWarnings('Handle concurrent requests');
    expect(warnings).toContain('Concurrency requires careful error handling');
  });

  it('returns empty for safe descriptions', () => {
    const warnings = detectHeuristicWarnings('Add a utility function');
    expect(warnings).toHaveLength(0);
  });

  it('returns multiple warnings', () => {
    const warnings = detectHeuristicWarnings('Update database API for auth');
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// extractJsonFromText
// ============================================================================

describe('extractJsonFromText', () => {
  it('extracts JSON from markdown code block', () => {
    const text = 'Some text\n```json\n{"key": "value"}\n```\nMore text';
    expect(extractJsonFromText(text)).toBe('{"key": "value"}');
  });

  it('extracts from untyped code block', () => {
    const text = '```\n{"key": "value"}\n```';
    expect(extractJsonFromText(text)).toBe('{"key": "value"}');
  });

  it('returns trimmed text when no code block', () => {
    expect(extractJsonFromText('  {"key": "value"}  ')).toBe('{"key": "value"}');
  });
});

// ============================================================================
// parseCodeResult
// ============================================================================

describe('parseCodeResult', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      content: 'Added feature',
      operationType: 'generation',
      confidence: 0.9,
      recommendations: ['Add tests'],
    });
    const result = parseCodeResult(json, 'debugging');
    expect(result.content).toBe('Added feature');
    expect(result.operationType).toBe('generation');
    expect(result.confidence).toBe(0.9);
    expect(result.recommendations).toEqual(['Add tests']);
  });

  it('uses defaults for missing fields', () => {
    const result = parseCodeResult('{}', 'refactoring');
    expect(result.content).toBe('Code analysis completed');
    expect(result.operationType).toBe('refactoring');
    expect(result.confidence).toBe(0.7);
  });

  it('falls back to plain text on invalid JSON', () => {
    const result = parseCodeResult('not valid json', 'generation');
    expect(result.content).toBe('not valid json');
    expect(result.operationType).toBe('generation');
    expect(result.confidence).toBe(0.5);
  });

  it('extracts JSON from code blocks', () => {
    const text = '```json\n{"content": "Done", "confidence": 0.8}\n```';
    const result = parseCodeResult(text, 'debugging');
    expect(result.content).toBe('Done');
    expect(result.confidence).toBe(0.8);
  });

  it('includes optional fields when present', () => {
    const json = JSON.stringify({
      content: 'Analysis',
      codeChanges: [{ file: 'a.ts', modified: 'new code', description: 'change' }],
      warnings: ['Check this'],
      affectedFiles: ['a.ts'],
    });
    const result = parseCodeResult(json, 'generation');
    expect(result.codeChanges).toHaveLength(1);
    expect(result.warnings).toEqual(['Check this']);
    expect(result.affectedFiles).toEqual(['a.ts']);
  });

  // Type-guard regression tests (#1913 Class A) — previously used
  // `as Partial<CodeAnalysisResult>` which let malformed fields slip
  // through the `?? fallback` (strings pass as truthy).

  it('ignores confidence when it is a string, falls back to 0.7', () => {
    const json = JSON.stringify({ content: 'x', confidence: 'high' });
    const result = parseCodeResult(json, 'debugging');
    expect(result.confidence).toBe(0.7);
  });

  it('ignores confidence outside [0,1], falls back to 0.7', () => {
    const json = JSON.stringify({ content: 'x', confidence: 42 });
    const result = parseCodeResult(json, 'debugging');
    expect(result.confidence).toBe(0.7);
  });

  it('ignores invalid operationType, falls back to default', () => {
    const json = JSON.stringify({ operationType: 'not-a-real-op' });
    const result = parseCodeResult(json, 'refactoring');
    expect(result.operationType).toBe('refactoring');
  });

  it('drops affectedFiles when array contains non-strings', () => {
    const json = JSON.stringify({ content: 'x', affectedFiles: ['a.ts', 42, true] });
    const result = parseCodeResult(json, 'generation');
    expect(result.affectedFiles).toBeUndefined();
  });

  it('drops recommendations when array contains non-strings', () => {
    const json = JSON.stringify({ content: 'x', recommendations: ['ok', null] });
    const result = parseCodeResult(json, 'generation');
    expect(result.recommendations).toBeUndefined();
  });

  it('treats JSON array (non-object) as invalid, falls back', () => {
    const result = parseCodeResult('[1,2,3]', 'debugging');
    expect(result.content).toBe('[1,2,3]');
    expect(result.confidence).toBe(0.5);
  });
});
