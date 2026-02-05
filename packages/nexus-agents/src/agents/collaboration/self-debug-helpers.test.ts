/* eslint-disable @typescript-eslint/explicit-function-return-type -- test factory helpers */
/**
 * Tests for Self-Debug Protocol Helpers
 * @module agents/collaboration/self-debug-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  ParsedError,
  ErrorExplanation,
  CodeFix,
  ErrorPattern,
  ExecutionResult,
} from './self-debug-types.js';
import {
  SyntheticDebugError,
  extractGroup,
  extractGroupNum,
  extractSection,
  extractList,
  createParsedError,
  buildExplanationPrompt,
  buildFixPrompt,
  parseExplanation,
  parseFix,
  applyFix,
  createSyntheticError,
  executeCode,
  parseErrorsFromOutput,
} from './self-debug-helpers.js';

vi.mock('../../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000000000 }),
  };
});

// ============================================================================
// SyntheticDebugError
// ============================================================================

describe('SyntheticDebugError', () => {
  it('includes reason in message', () => {
    const error = new SyntheticDebugError('no patterns matched');
    expect(error.message).toContain('no patterns matched');
    expect(error.name).toBe('SyntheticDebugError');
  });

  it('extends Error', () => {
    expect(new SyntheticDebugError('test')).toBeInstanceOf(Error);
  });
});

// ============================================================================
// extractGroup / extractGroupNum
// ============================================================================

describe('extractGroup', () => {
  it('returns group at index', () => {
    const match = 'foo bar'.match(/(foo) (bar)/)!;
    expect(extractGroup(match, 1)).toBe('foo');
    expect(extractGroup(match, 2)).toBe('bar');
  });

  it('returns undefined for no index', () => {
    const match = 'test'.match(/test/)!;
    expect(extractGroup(match)).toBeUndefined();
  });
});

describe('extractGroupNum', () => {
  it('parses numeric group', () => {
    const match = 'line 42'.match(/line (\d+)/)!;
    expect(extractGroupNum(match, 1)).toBe(42);
  });

  it('returns undefined for no index', () => {
    const match = 'test'.match(/test/)!;
    expect(extractGroupNum(match)).toBeUndefined();
  });
});

// ============================================================================
// extractSection
// ============================================================================

describe('extractSection', () => {
  it('extracts section value', () => {
    const text = 'Root Cause: memory leak in handler';
    expect(extractSection(text, 'Root Cause')).toBe('memory leak in handler');
  });

  it('returns undefined for missing section', () => {
    expect(extractSection('hello world', 'Root Cause')).toBeUndefined();
  });

  it('is case insensitive', () => {
    const text = 'root cause: some issue';
    expect(extractSection(text, 'Root Cause')).toBe('some issue');
  });
});

// ============================================================================
// extractList
// ============================================================================

describe('extractList', () => {
  it('extracts numbered list', () => {
    const text = '1. First item\n2. Second item\n3. Third item';
    const list = extractList(text);
    expect(list).toHaveLength(3);
    expect(list[0]).toBe('First item');
  });

  it('returns empty for no list', () => {
    expect(extractList('no list here')).toEqual([]);
  });
});

// ============================================================================
// createParsedError
// ============================================================================

describe('createParsedError', () => {
  it('creates error from regex match', () => {
    const pattern: ErrorPattern = {
      name: 'test',
      pattern: /(\w+) error at (\S+):(\d+)/,
      category: 'type',
      groups: { message: 1, file: 2, line: 3 },
    };
    const match = 'Type error at src/index.ts:42'.match(pattern.pattern)!;
    const error = createParsedError(match, pattern, 1);
    expect(error.id).toBe('error-1');
    expect(error.category).toBe('type');
    expect(error.message).toBe('Type');
    expect(error.location?.file).toBe('src/index.ts');
    expect(error.location?.line).toBe(42);
  });

  it('uses full match when message group is empty', () => {
    const pattern: ErrorPattern = {
      name: 'test',
      pattern: /(error)/,
      category: 'runtime',
      groups: { message: 2 }, // Non-existent group
    };
    const match = 'error'.match(pattern.pattern)!;
    const error = createParsedError(match, pattern, 5);
    expect(error.message).toBe('error');
    expect(error.rawError).toBe('error');
  });
});

// ============================================================================
// buildExplanationPrompt / buildFixPrompt
// ============================================================================

describe('buildExplanationPrompt', () => {
  it('includes error and code', () => {
    const error: ParsedError = {
      id: 'e1',
      category: 'type',
      severity: 'error',
      message: 'Type mismatch',
      rawError: 'Type mismatch',
      location: { line: 10 },
    };
    const prompt = buildExplanationPrompt('const x = 1', error);
    expect(prompt).toContain('type');
    expect(prompt).toContain('line 10');
    expect(prompt).toContain('Type mismatch');
    expect(prompt).toContain('const x = 1');
  });

  it('omits line when no location', () => {
    const error: ParsedError = {
      id: 'e1',
      category: 'runtime',
      severity: 'error',
      message: 'fail',
      rawError: 'fail',
    };
    const prompt = buildExplanationPrompt('code', error);
    expect(prompt).not.toContain('line');
  });
});

describe('buildFixPrompt', () => {
  it('includes error and code', () => {
    const error: ParsedError = {
      id: 'e1',
      category: 'type',
      severity: 'error',
      message: 'missing return',
      rawError: 'missing return',
    };
    const prompt = buildFixPrompt('function f() {}', error);
    expect(prompt).toContain('missing return');
    expect(prompt).toContain('function f()');
  });

  it('includes explanation when provided', () => {
    const error: ParsedError = {
      id: 'e1',
      category: 'type',
      severity: 'error',
      message: 'err',
      rawError: 'err',
    };
    const explanation: ErrorExplanation = {
      errorId: 'e1',
      summary: 'Type issue',
      details: 'full details',
      rootCause: 'Missing type annotation',
      fixStrategies: [],
      confidence: 0.8,
    };
    const prompt = buildFixPrompt('code', error, explanation);
    expect(prompt).toContain('Type issue');
    expect(prompt).toContain('Missing type annotation');
  });
});

// ============================================================================
// parseExplanation / parseFix
// ============================================================================

describe('parseExplanation', () => {
  it('extracts root cause', () => {
    const output = 'Summary here\nRoot Cause: undefined variable\n1. Fix A\n2. Fix B';
    const result = parseExplanation('e1', output);
    expect(result.errorId).toBe('e1');
    expect(result.rootCause).toBe('undefined variable');
    expect(result.fixStrategies).toHaveLength(2);
    expect(result.confidence).toBe(0.7);
  });

  it('defaults root cause to Unknown', () => {
    // Text must NOT contain "root cause" as extractSection matches it case-insensitively
    const result = parseExplanation('e1', 'Something went wrong');
    expect(result.rootCause).toBe('Unknown');
  });

  it('truncates summary to 200 chars', () => {
    const longText = 'a'.repeat(300);
    const result = parseExplanation('e1', longText);
    expect(result.summary).toHaveLength(200);
  });
});

describe('parseFix', () => {
  it('extracts code from markdown code block', () => {
    const output = 'Here is the fix:\n```typescript\nconst x: number = 1;\n```\n';
    const result = parseFix('e1', 'const x = 1', output);
    expect(result.fixedCode).toBe('const x: number = 1;');
    expect(result.originalCode).toBe('const x = 1');
  });

  it('uses full output when no code block', () => {
    const result = parseFix('e1', 'old', 'const x = 2;');
    expect(result.fixedCode).toBe('const x = 2;');
  });
});

// ============================================================================
// applyFix
// ============================================================================

describe('applyFix', () => {
  it('replaces original with fixed code', () => {
    const fix: CodeFix = {
      errorId: 'e1',
      originalCode: 'const x = 1',
      fixedCode: 'const x: number = 1',
      explanation: 'Added type',
      confidence: 0.8,
      location: { line: 1 },
    };
    const result = applyFix('const x = 1;\nconst y = 2;', fix);
    expect(result).toContain('const x: number = 1');
    expect(result).toContain('const y = 2');
  });

  it('returns fixed code when no location match', () => {
    const fix: CodeFix = {
      errorId: 'e1',
      originalCode: '',
      fixedCode: 'new code',
      explanation: 'full replace',
      confidence: 0.7,
    };
    expect(applyFix('old code', fix)).toBe('new code');
  });
});

// ============================================================================
// createSyntheticError
// ============================================================================

describe('createSyntheticError', () => {
  it('creates error from stderr', () => {
    const execution: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'segfault',
      durationMs: 100,
      errors: [],
    };
    const error = createSyntheticError(execution, 3);
    expect(error.id).toBe('error-synthetic-3');
    expect(error.category).toBe('unknown');
    expect(error.message).toBe('segfault');
  });

  it('falls back to stdout when no stderr', () => {
    const execution: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: 'output error',
      stderr: '',
      durationMs: 100,
      errors: [],
    };
    expect(createSyntheticError(execution, 1).message).toBe('output error');
  });

  it('uses Unknown error when both empty', () => {
    const execution: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      durationMs: 100,
      errors: [],
    };
    expect(createSyntheticError(execution, 1).message).toBe('Unknown error');
  });

  it('truncates long messages', () => {
    const execution: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'x'.repeat(600),
      durationMs: 100,
      errors: [],
    };
    expect(createSyntheticError(execution, 1).message.length).toBe(500);
  });
});

// ============================================================================
// executeCode
// ============================================================================

describe('executeCode', () => {
  it('returns executor result on success', async () => {
    const executor = () =>
      Promise.resolve<ExecutionResult>({
        success: true,
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        durationMs: 50,
        errors: [],
      });
    const result = await executeCode(executor, 'code');
    expect(result.success).toBe(true);
    expect(result.stdout).toBe('ok');
  });

  it('catches executor errors', async () => {
    const executor = () => Promise.reject(new Error('crash'));
    const result = await executeCode(executor, 'code');
    expect(result.success).toBe(false);
    expect(result.stderr).toBe('crash');
  });
});

// ============================================================================
// parseErrorsFromOutput
// ============================================================================

describe('parseErrorsFromOutput', () => {
  it('returns existing errors from result', () => {
    const existing: ParsedError = {
      id: 'e1',
      category: 'unknown',
      severity: 'error',
      message: 'pre-parsed',
      rawError: 'pre-parsed',
    };
    const result: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'other stuff',
      durationMs: 100,
      errors: [existing],
    };
    const errors = parseErrorsFromOutput(result, []);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('pre-parsed');
  });

  it('parses errors from stderr using patterns', () => {
    const pattern: ErrorPattern = {
      name: 'test',
      pattern: /ERROR: (.+)/,
      category: 'runtime',
      groups: { message: 1 },
    };
    const result: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'ERROR: something broke',
      durationMs: 100,
      errors: [],
    };
    const errors = parseErrorsFromOutput(result, [pattern]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('something broke');
  });

  it('falls back to stdout when stderr empty', () => {
    const pattern: ErrorPattern = {
      name: 'test',
      pattern: /FAIL: (.+)/,
      category: 'unknown',
      groups: { message: 1 },
    };
    const result: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: 'FAIL: test failed',
      stderr: '',
      durationMs: 100,
      errors: [],
    };
    const errors = parseErrorsFromOutput(result, [pattern]);
    expect(errors).toHaveLength(1);
  });
});
