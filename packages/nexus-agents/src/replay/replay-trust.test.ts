/**
 * Replay trace trust-boundary tests (#5328).
 *
 * `trace.jsonl` is written by `pipeline/trace-writer.ts`, but it is plain
 * on-disk JSONL read back by path — hand-editable, and the path is supplied at
 * read time. `parseTraceJsonl` used `JSON.parse(line) as ExecutionTraceEntry`
 * while `ExecutionTraceEntrySchema` sat unused in the module it imports its
 * type from.
 *
 * @module replay/replay-trust.test
 */

import { describe, it, expect } from 'vitest';
import { extractDecisions, parseTraceJsonl, compareDecisions } from './replay-executor.js';

/** One well-formed routing decision, so only the field under test varies. */
function decisionLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: 1,
    runId: 'r1',
    eventType: 'routing.decision',
    executionId: 'e1',
    modelId: 'claude-opus',
    ...overrides,
  });
}

describe('trace entries that do not match the schema', () => {
  it('rejects a line missing the required envelope fields', () => {
    // The previous test suite used `{"valid":true}` as an example of a line
    // that SURVIVES parsing. It has no timestamp, runId or eventType, so it is
    // not a trace entry at all — the cast was what made it look like one.
    expect(parseTraceJsonl('{"valid":true}')).toHaveLength(0);
  });

  it('rejects a non-string modelId rather than carrying it into a decision', () => {
    const entries = parseTraceJsonl(decisionLine({ modelId: { nested: 'object' } }));
    expect(entries).toHaveLength(0);
  });

  it('rejects a non-numeric timestamp', () => {
    expect(parseTraceJsonl(decisionLine({ timestamp: 'not-a-number' }))).toHaveLength(0);
  });

  it('keeps the well-formed lines around a rejected one', () => {
    const content = [decisionLine(), '{"valid":true}', decisionLine({ timestamp: 2 })].join('\n');
    expect(parseTraceJsonl(content)).toHaveLength(2);
  });

  it('still accepts a valid entry with only the required fields', () => {
    expect(parseTraceJsonl('{"timestamp":1,"runId":"r1","eventType":"tick"}')).toHaveLength(1);
  });
});

describe('divergence verdicts rest on a real comparison', () => {
  // The failure this pins: a non-string modelId used to reach
  // `TracedDecision.selectedModel`, and `compareDecisions` compares with
  // `===`. Two structurally identical objects are not reference-equal, so an
  // unchanged model was certified as a divergence reading
  // "Model changed: [object Object] → [object Object]".
  it('does not report a divergence between two identical object modelIds', () => {
    const line = decisionLine({ modelId: { name: 'claude-opus' } });
    const decisions = extractDecisions(parseTraceJsonl(line));

    // Either the entry is rejected outright, or — if it ever were admitted —
    // it must not compare unequal to an identical copy of itself.
    const replayed = extractDecisions(parseTraceJsonl(line));
    const summary = compareDecisions(decisions, replayed);
    expect(summary.divergences).toBe(0);
  });

  it('every selectedModel reaching a comparison is a string', () => {
    const content = [
      decisionLine({ modelId: 'claude-opus' }),
      decisionLine({ modelId: 42 }),
      decisionLine({ modelId: ['a'] }),
    ].join('\n');

    for (const decision of extractDecisions(parseTraceJsonl(content))) {
      expect(typeof decision.selectedModel).toBe('string');
    }
  });
});
