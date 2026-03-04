/**
 * Tests for post-task reflection loop (Issue #1392).
 *
 * Covers buildReflectionPrompt, parseLearnings, and generateReflection.
 *
 * @module mcp/tools/orchestrate-reflection.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildReflectionPrompt,
  parseLearnings,
  generateReflection,
} from './orchestrate-reflection.js';
import type { WorkerResult } from '../../orchestration/aorchestra/index.js';
import type { IModelAdapter } from '../../core/index.js';
import { ok, err } from '../../core/result.js';

vi.mock('./reflective-retriever.js', () => ({
  isReflectiveMemoryEnabled: vi.fn(() => false),
}));

vi.mock('../../context/session-memory.js', () => ({
  createSessionMemory: vi.fn(() => ({
    startSession: vi.fn(() => ({ ok: true })),
    recordLearning: vi.fn(() => ({ ok: true })),
    endSession: vi.fn(),
  })),
}));

// ============================================================================
// Helpers
// ============================================================================

function makeWorkerResult(overrides: Partial<WorkerResult>): WorkerResult {
  return {
    role: 'code',
    status: 'success',
    output: 'Done',
    durationMs: 100,
    ...overrides,
  } as WorkerResult;
}

function makeMockAdapter(responseText: string): IModelAdapter {
  return {
    complete: vi.fn(() =>
      Promise.resolve(
        ok({
          content: [{ type: 'text' as const, text: responseText }],
          model: 'test',
          usage: { inputTokens: 10, outputTokens: 20 },
          stopReason: 'end_turn' as const,
        })
      )
    ),
  } as unknown as IModelAdapter;
}

// ============================================================================
// buildReflectionPrompt
// ============================================================================

describe('buildReflectionPrompt', () => {
  it('includes task description', () => {
    const prompt = buildReflectionPrompt('Implement auth', [
      makeWorkerResult({ role: 'code', status: 'success' }),
    ]);
    expect(prompt).toContain('Implement auth');
  });

  it('counts successes and errors', () => {
    const results = [
      makeWorkerResult({ role: 'code', status: 'success' }),
      makeWorkerResult({ role: 'testing', status: 'error', error: 'timeout' }),
    ];
    const prompt = buildReflectionPrompt('Task', results);
    expect(prompt).toContain('1 succeeded, 1 failed');
  });

  it('truncates long task descriptions', () => {
    const longTask = 'x'.repeat(500);
    const prompt = buildReflectionPrompt(longTask, [makeWorkerResult({})]);
    expect(prompt).toContain('x'.repeat(300));
    expect(prompt).not.toContain('x'.repeat(301));
  });

  it('limits to 3 successes and 3 errors in output', () => {
    const results = [
      makeWorkerResult({ role: 'code', status: 'success' }),
      makeWorkerResult({ role: 'testing', status: 'success' }),
      makeWorkerResult({ role: 'security', status: 'success' }),
      makeWorkerResult({ role: 'architecture', status: 'success' }),
      makeWorkerResult({ role: 'documentation', status: 'error', error: 'fail1' }),
      makeWorkerResult({ role: 'code', status: 'error', error: 'fail2' }),
      makeWorkerResult({ role: 'testing', status: 'error', error: 'fail3' }),
      makeWorkerResult({ role: 'security', status: 'error', error: 'fail4' }),
    ];
    const prompt = buildReflectionPrompt('Task', results);
    expect(prompt).toContain('4 succeeded, 4 failed');
    // Only first 3 of each shown in detail
    expect(prompt).toContain('fail1');
    expect(prompt).toContain('fail3');
    expect(prompt).not.toContain('fail4');
  });

  it('requests JSON array output format', () => {
    const prompt = buildReflectionPrompt('Task', [makeWorkerResult({})]);
    expect(prompt).toContain('Return ONLY valid JSON array');
  });
});

// ============================================================================
// parseLearnings
// ============================================================================

describe('parseLearnings', () => {
  it('parses valid JSON array', () => {
    const text = '[{"pattern":"Use caching","context":"API calls","confidence":0.9}]';
    const result = parseLearnings(text);
    expect(result).toHaveLength(1);
    expect(result[0]?.pattern).toBe('Use caching');
    expect(result[0]?.context).toBe('API calls');
    expect(result[0]?.confidence).toBe(0.9);
  });

  it('extracts JSON from surrounding text', () => {
    const text = 'Here are learnings:\n[{"pattern":"P","context":"C","confidence":0.5}]\nDone.';
    const result = parseLearnings(text);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for no JSON', () => {
    expect(parseLearnings('No JSON here')).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseLearnings('[{invalid json}]')).toEqual([]);
  });

  it('skips items missing required fields', () => {
    const text = '[{"pattern":"P"},{"pattern":"P2","context":"C2","confidence":0.7}]';
    const result = parseLearnings(text);
    expect(result).toHaveLength(1);
    expect(result[0]?.pattern).toBe('P2');
  });

  it('defaults confidence to 0.5 for non-number', () => {
    const text = '[{"pattern":"P","context":"C","confidence":"high"}]';
    const result = parseLearnings(text);
    expect(result[0]?.confidence).toBe(0.5);
  });

  it('clamps confidence to 0-1 range', () => {
    const text = '[{"pattern":"P","context":"C","confidence":5.0}]';
    const result = parseLearnings(text);
    expect(result[0]?.confidence).toBe(1);
  });

  it('truncates long pattern and context to 200 chars', () => {
    const long = 'x'.repeat(300);
    const text = `[{"pattern":"${long}","context":"${long}","confidence":0.5}]`;
    const result = parseLearnings(text);
    expect(result[0]?.pattern).toHaveLength(200);
    expect(result[0]?.context).toHaveLength(200);
  });

  it('limits to 3 learnings max', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      pattern: `P${String(i)}`,
      context: `C${String(i)}`,
      confidence: 0.5,
    }));
    const text = JSON.stringify(items);
    const result = parseLearnings(text);
    expect(result).toHaveLength(3);
  });

  it('returns empty array for non-array JSON', () => {
    expect(parseLearnings('{"pattern":"P"}')).toEqual([]);
  });
});

// ============================================================================
// generateReflection
// ============================================================================

describe('generateReflection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when reflective memory disabled', async () => {
    const { isReflectiveMemoryEnabled } = await import('./reflective-retriever.js');
    vi.mocked(isReflectiveMemoryEnabled).mockReturnValue(false);

    const result = await generateReflection('Task', [makeWorkerResult({})], makeMockAdapter('[]'));
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty results', async () => {
    const { isReflectiveMemoryEnabled } = await import('./reflective-retriever.js');
    vi.mocked(isReflectiveMemoryEnabled).mockReturnValue(true);

    const result = await generateReflection('Task', [], makeMockAdapter('[]'));
    expect(result).toBeUndefined();
  });

  it('extracts learnings from LLM response when enabled', async () => {
    const { isReflectiveMemoryEnabled } = await import('./reflective-retriever.js');
    vi.mocked(isReflectiveMemoryEnabled).mockReturnValue(true);

    const llmResponse = JSON.stringify([
      { pattern: 'Cache API responses', context: 'Slow external calls', confidence: 0.85 },
    ]);
    const adapter = makeMockAdapter(llmResponse);
    const result = await generateReflection('Build API', [makeWorkerResult({})], adapter);

    expect(result).toBeDefined();
    expect(result?.learnings).toHaveLength(1);
    expect(result?.learnings[0]?.pattern).toBe('Cache API responses');
    expect(result?.written).toBe(1);
  });

  it('returns empty learnings on LLM failure', async () => {
    const { isReflectiveMemoryEnabled } = await import('./reflective-retriever.js');
    vi.mocked(isReflectiveMemoryEnabled).mockReturnValue(true);

    const adapter = {
      complete: vi.fn(() => Promise.resolve(err({ message: 'Rate limited', code: 'model_error' }))),
    } as unknown as IModelAdapter;

    const result = await generateReflection('Task', [makeWorkerResult({})], adapter);
    expect(result?.learnings).toEqual([]);
    expect(result?.written).toBe(0);
  });

  it('never throws on unexpected errors', async () => {
    const { isReflectiveMemoryEnabled } = await import('./reflective-retriever.js');
    vi.mocked(isReflectiveMemoryEnabled).mockReturnValue(true);

    const adapter = {
      complete: vi.fn(() => Promise.reject(new Error('Unexpected crash'))),
    } as unknown as IModelAdapter;

    const result = await generateReflection('Task', [makeWorkerResult({})], adapter);
    expect(result?.learnings).toEqual([]);
    expect(result?.written).toBe(0);
  });
});
