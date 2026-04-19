/**
 * Tests for the ATBench LLM scorer (#1981 follow-up).
 *
 * Mocked IModelAdapter — no network. Covers happy path, all LLM
 * failure modes, and the stub-fallback contract.
 */

import { describe, it, expect, vi } from 'vitest';
import type { IModelAdapter } from '../../core/types/model.js';
import { formatTrajectoryPrompt, scoreTrajectoryViaLlm } from './llm-scorer.js';
import type { ATBenchTrajectory } from './types.js';

function mkTrajectory(overrides: Partial<ATBenchTrajectory> = {}): ATBenchTrajectory {
  return {
    id: 't-001',
    scenario: 'tool-injection',
    userRequest: 'summarize the README',
    sessionTranscript: ['user: summarize the README', 'agent: reading...'],
    toolEvents: [
      { tool: 'read_file', args: { path: 'README.md' } },
      { tool: 'memory_write', args: { key: 'summary' } },
    ],
    safetyLabel: 'safe',
    taxonomy: { riskSource: 'user', failureMode: 'ok', harm: 'none' },
    ...overrides,
  };
}

function makeAdapter(
  behavior:
    | { kind: 'success'; label: 'safe' | 'unsafe'; reasoning?: string }
    | { kind: 'error' }
    | { kind: 'timeout' }
    | { kind: 'garbage' }
    | { kind: 'empty' }
): IModelAdapter {
  const complete = vi.fn(async (_req: unknown) => {
    if (behavior.kind === 'error') {
      return {
        ok: false as const,
        error: { code: 'MODEL_ERROR', message: 'boom' } as never,
      };
    }
    if (behavior.kind === 'timeout') {
      await new Promise((r) => setTimeout(r, 1500));
      return { ok: true as const, value: { text: '{}' } as never };
    }
    if (behavior.kind === 'garbage') {
      return { ok: true as const, value: { text: 'I cannot classify' } as never };
    }
    if (behavior.kind === 'empty') {
      return { ok: true as const, value: { text: '' } as never };
    }
    const json = JSON.stringify({
      label: behavior.label,
      reasoning: behavior.reasoning ?? 'looks fine',
    });
    return { ok: true as const, value: { text: json } as never };
  });

  return {
    providerId: 'mock',
    modelId: 'mock-haiku',
    capabilities: [],
    complete,
    stream: (() => (async function* () {})()) as never,
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ({ ok: true as const, value: undefined }),
  } as IModelAdapter;
}

describe('formatTrajectoryPrompt', () => {
  it('includes the user request', () => {
    const t = mkTrajectory({ userRequest: 'do the thing' });
    const prompt = formatTrajectoryPrompt(t);
    expect(prompt).toContain('do the thing');
  });

  it('lists the tool events', () => {
    const t = mkTrajectory({
      toolEvents: [{ tool: 'gh_issue_view' }, { tool: 'memory_query' }],
    });
    const prompt = formatTrajectoryPrompt(t);
    expect(prompt).toContain('gh_issue_view');
    expect(prompt).toContain('memory_query');
  });

  it('caps event listing at 20 entries', () => {
    const events = Array.from({ length: 30 }, (_, i) => ({ tool: `tool_${String(i)}` }));
    const t = mkTrajectory({ toolEvents: events });
    const prompt = formatTrajectoryPrompt(t);
    expect(prompt).toContain('tool_0');
    expect(prompt).toContain('tool_19');
    expect(prompt).not.toContain('tool_20');
  });

  it('truncates very long user requests', () => {
    const t = mkTrajectory({ userRequest: 'a'.repeat(800) });
    const prompt = formatTrajectoryPrompt(t);
    // Should clip to 500 chars + the surrounding template
    expect(prompt.includes('a'.repeat(800))).toBe(false);
    expect(prompt).toContain('a'.repeat(500));
  });
});

describe('scoreTrajectoryViaLlm — happy path', () => {
  it('returns LLM-derived prediction on successful classify', async () => {
    const adapter = makeAdapter({
      kind: 'success',
      label: 'unsafe',
      reasoning: 'cross-tool chaining detected',
    });
    const t = mkTrajectory({ id: 't-x', safetyLabel: 'unsafe' });
    const result = await scoreTrajectoryViaLlm(adapter, t);
    expect(result.ok).toBe(true);
    expect(result.prediction.trajectoryId).toBe('t-x');
    expect(result.prediction.predictedLabel).toBe('unsafe');
    expect(result.prediction.reasoning).toBe('cross-tool chaining detected');
    if (result.ok) expect(result.source).toBe('llm');
  });

  it('handles JSON wrapped in markdown code fences', async () => {
    const adapter = {
      providerId: 'mock',
      modelId: 'mock',
      capabilities: [],
      complete: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            text: '```json\n{"label":"safe","reasoning":"clean"}\n```',
          } as never,
        })
      ),
      stream: (() => (async function* () {})()) as never,
      countTokens: () => Promise.resolve(0),
      validateConfig: () => ({ ok: true as const, value: undefined }),
    } as IModelAdapter;
    const result = await scoreTrajectoryViaLlm(adapter, mkTrajectory());
    expect(result.ok).toBe(true);
    expect(result.prediction.predictedLabel).toBe('safe');
  });

  it('records non-negative latency', async () => {
    const adapter = makeAdapter({ kind: 'success', label: 'safe' });
    const result = await scoreTrajectoryViaLlm(adapter, mkTrajectory());
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreTrajectoryViaLlm — failure modes fall back to stub', () => {
  it('falls back on adapter error', async () => {
    const adapter = makeAdapter({ kind: 'error' });
    const t = mkTrajectory({ safetyLabel: 'unsafe' });
    const result = await scoreTrajectoryViaLlm(adapter, t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.source).toBe('stub-fallback');
      expect(result.fallbackReason).toContain('llm-error');
    }
    // Stub returns ground truth → 'unsafe'
    expect(result.prediction.predictedLabel).toBe('unsafe');
  });

  it('falls back on timeout', async () => {
    const adapter = makeAdapter({ kind: 'timeout' });
    const result = await scoreTrajectoryViaLlm(adapter, mkTrajectory(), 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallbackReason).toBe('llm-timeout');
      expect(result.latencyMs).toBeLessThan(1000);
    }
  });

  it('falls back on garbage (non-JSON) response', async () => {
    const adapter = makeAdapter({ kind: 'garbage' });
    const result = await scoreTrajectoryViaLlm(adapter, mkTrajectory());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fallbackReason).toBe('llm-parse-error');
  });

  it('falls back on empty response', async () => {
    const adapter = makeAdapter({ kind: 'empty' });
    const result = await scoreTrajectoryViaLlm(adapter, mkTrajectory());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fallbackReason).toBe('llm-empty-response');
  });

  it('falls back when LLM returns invalid label value', async () => {
    const adapter = {
      providerId: 'mock',
      modelId: 'mock',
      capabilities: [],
      complete: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            text: '{"label":"maybe","reasoning":"unsure"}',
          } as never,
        })
      ),
      stream: (() => (async function* () {})()) as never,
      countTokens: () => Promise.resolve(0),
      validateConfig: () => ({ ok: true as const, value: undefined }),
    } as IModelAdapter;
    const result = await scoreTrajectoryViaLlm(adapter, mkTrajectory());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fallbackReason).toBe('llm-parse-error');
  });
});
