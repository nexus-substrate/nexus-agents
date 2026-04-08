/**
 * Replay Executor Tests (#1688)
 */

import { describe, it, expect } from 'vitest';
import { extractDecisions, parseTraceJsonl, compareDecisions } from './replay-executor.js';
import type { TracedDecision } from './replay-executor.js';

describe('parseTraceJsonl', () => {
  it('parses valid JSONL lines', () => {
    const content = [
      '{"timestamp":1,"runId":"r1","eventType":"routing.decision","modelId":"claude"}',
      '{"timestamp":2,"runId":"r1","eventType":"tick"}',
    ].join('\n');
    const entries = parseTraceJsonl(content);
    expect(entries).toHaveLength(2);
  });

  it('skips malformed lines', () => {
    const content = '{"valid":true}\nnot json\n{"also":true}';
    const entries = parseTraceJsonl(content);
    expect(entries).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(parseTraceJsonl('')).toHaveLength(0);
    expect(parseTraceJsonl('\n\n')).toHaveLength(0);
  });
});

describe('extractDecisions', () => {
  it('extracts routing.decision entries', () => {
    const entries = [
      {
        timestamp: 1,
        runId: 'r1',
        eventType: 'routing.decision' as const,
        modelId: 'claude',
        reasoning: 'test',
        decisionPath: ['topsis'],
      },
      { timestamp: 2, runId: 'r1', eventType: 'tick' as const },
      { timestamp: 3, runId: 'r1', eventType: 'routing.decision' as const, modelId: 'gemini' },
    ];
    const decisions = extractDecisions(entries);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]?.selectedModel).toBe('claude');
    expect(decisions[1]?.selectedModel).toBe('gemini');
  });

  it('skips entries without modelId', () => {
    const entries = [{ timestamp: 1, runId: 'r1', eventType: 'routing.decision' as const }];
    expect(extractDecisions(entries)).toHaveLength(0);
  });
});

describe('compareDecisions', () => {
  const makeDecision = (model: string, tick: number): TracedDecision => ({
    tick,
    taskId: 'test',
    selectedModel: model,
    reasoning: '',
    decisionPath: [],
  });

  it('reports all matches when identical', () => {
    const original = [makeDecision('claude', 1), makeDecision('gemini', 2)];
    const replayed = [makeDecision('claude', 1), makeDecision('gemini', 2)];
    const summary = compareDecisions(original, replayed);
    expect(summary.matches).toBe(2);
    expect(summary.divergences).toBe(0);
  });

  it('detects model divergence', () => {
    const original = [makeDecision('claude', 1)];
    const replayed = [makeDecision('gemini', 1)];
    const summary = compareDecisions(original, replayed);
    expect(summary.divergences).toBe(1);
    expect(summary.comparisons[0]?.divergenceReason).toContain('claude');
    expect(summary.comparisons[0]?.divergenceReason).toContain('gemini');
  });

  it('handles missing replayed decisions', () => {
    const original = [makeDecision('claude', 1), makeDecision('gemini', 2)];
    const replayed = [makeDecision('claude', 1)];
    const summary = compareDecisions(original, replayed);
    expect(summary.matches).toBe(1);
    expect(summary.divergences).toBe(1);
  });

  it('handles empty inputs', () => {
    const summary = compareDecisions([], []);
    expect(summary.totalDecisions).toBe(0);
    expect(summary.matches).toBe(0);
  });
});
