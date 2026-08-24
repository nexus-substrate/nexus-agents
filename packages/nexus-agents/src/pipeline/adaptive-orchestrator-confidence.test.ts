/**
 * Confidence must be able to say "no evidence" (#4677).
 *
 * `classifyTask` floored its own confidence at 1/3 via `Math.max(...scores, 1)`
 * — a guard against a `0/3` division that was never harmful. The low-confidence
 * enrichment gate is `< 0.2`, so it could never open: `tryIssueTriage` and the
 * LLM refinement (#1779/#1798) were unreachable from the day they were written.
 *
 * These tests pin the floor's removal from both directions — a task with no
 * keyword evidence must report 0, and a task with evidence must not.
 *
 * @module pipeline/adaptive-orchestrator-confidence.test
 */

import { describe, expect, it } from 'vitest';

import { classifyTask } from './adaptive-orchestrator.js';

/** The gate in runAdaptiveOrchestrator. Duplicated deliberately: if the source
 *  constant moves, this test should fail rather than silently follow it. */
const ENRICHMENT_GATE = 0.2;

describe('classifyTask confidence (#4677)', () => {
  it('reports 0 for input matching no keywords', () => {
    // The floor made this 0.3333 — a third of confidence in a pure default.
    expect(classifyTask('qwertyuiop asdfghjkl').confidence).toBe(0);
  });

  it('reports 0 for empty input', () => {
    expect(classifyTask('').confidence).toBe(0);
  });

  it('crosses the enrichment gate when there is no evidence', () => {
    // The property that matters: the gate must be reachable. Before #4677 no
    // input in existence could satisfy this.
    expect(classifyTask('zzz').confidence).toBeLessThan(ENRICHMENT_GATE);
  });

  it('does NOT cross the gate when keywords match', () => {
    // The floor removal must not make everything look unclassifiable.
    expect(classifyTask('fix the failing test').confidence).toBeGreaterThanOrEqual(ENRICHMENT_GATE);
    expect(classifyTask('review this PR for security issues').confidence).toBeGreaterThanOrEqual(
      ENRICHMENT_GATE
    );
  });

  it('never returns a negative or non-finite confidence', () => {
    // `Math.max()` over an empty spread yields -Infinity. The score record
    // always has five keys so that cannot happen — asserted rather than assumed.
    for (const t of ['', ' ', '!!!', '中文', 'a'.repeat(300)]) {
      const c = classifyTask(t).confidence;
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
    }
  });
});
