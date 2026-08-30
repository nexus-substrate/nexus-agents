/**
 * Dedup ordering must not be a confidence comparison that isn't one (#5119).
 *
 * `pickBestFinding` used `candidate.confidence > existing.confidence`. For a
 * triangulated finding, `confidence` is `0.7 + priority(cli)` — a per-CLI
 * constant that never consults the model's output. So the comparison read as if
 * it weighed evidence while in fact it only compared CLI names, and a better
 * finding from a lower-priority CLI lost to a worse one, deterministically and
 * with nothing in the output saying so.
 *
 * The behaviour is deliberately unchanged. What these tests pin is that the
 * tiebreak reads the CLI priority DIRECTLY, so the two mechanisms cannot drift
 * into each other: if `confidence` ever becomes a real per-finding measurement,
 * dedup must not silently change meaning along with it.
 */
import { describe, it, expect } from 'vitest';

import { pickBestFinding, findingPriority } from './triangulated-review.js';
import type { ReviewFinding } from '../dogfooding/pr-review-types.js';

function finding(expertId: string, confidence: number, title = 'x'): ReviewFinding {
  return {
    id: `${expertId}-0`,
    category: 'security',
    severity: 'high',
    title,
    description: 'd',
    expertId,
    confidence,
  };
}

describe('dedup tiebreak is CLI priority, not confidence (#5119)', () => {
  it('prefers the higher-priority CLI', () => {
    // codex 0.15 > gemini 0.05, matching the documented specialization matrix.
    const survivor = pickBestFinding(finding('gemini', 0.75), finding('codex', 0.85));
    expect(survivor.expertId).toBe('codex');
  });

  it('ignores confidence entirely, even when it contradicts the priority', () => {
    // THE REGRESSION TEST. Under the old `candidate.confidence >
    // existing.confidence`, a gemini finding handed an artificially high
    // confidence would win. It must not: confidence is not what orders dedup.
    //
    // The two inputs differ from each other AND from the values the production
    // code would assign, so a rule that happened to read confidence cannot pass
    // this by coincidence.
    const survivor = pickBestFinding(finding('codex', 0.01), finding('gemini', 0.99));
    expect(survivor.expertId).toBe('codex');
  });

  it('keeps the incumbent on a tie, so the result does not depend on arrival order', () => {
    const a = finding('claude', 0.8, 'first');
    const b = finding('claude', 0.8, 'second');
    expect(pickBestFinding(a, b).title).toBe('first');
    expect(pickBestFinding(b, a).title).toBe('second');
  });

  it('names the empty case: an unrecognized source scores 0 and never displaces a known CLI', () => {
    // `expertId` is a plain string on ReviewFinding, so a finding from a
    // non-CLI producer is representable. It must not win by accident — an
    // undefined map lookup would otherwise make the comparison NaN-based and
    // silently keep the incumbent for the wrong reason.
    expect(findingPriority(finding('some-other-expert', 0.99))).toBe(0);
    const survivor = pickBestFinding(finding('gemini', 0.1), finding('some-other-expert', 0.99));
    expect(survivor.expertId).toBe('gemini');
  });

  it('scores every configured CLI, so no CLI silently falls back to 0', () => {
    // Guard the guard: if a CLI were missing from the priority map, every one of
    // its findings would score 0 and lose every tiebreak, which would look like
    // "that CLI never finds anything useful".
    for (const cli of ['codex', 'claude', 'gemini', 'opencode']) {
      expect(findingPriority(finding(cli, 0.5))).toBeGreaterThan(0);
    }
  });
});
