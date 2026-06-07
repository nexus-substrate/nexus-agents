/**
 * Severity-vocabulary consistency guard (#3570, evergreen DRY epic #3568).
 *
 * The 5-value "finding severity" vocabulary (`critical|high|medium|low|info`)
 * is declared in several places. This test pins `FindingSeveritySchema`
 * (security/sarif-types.ts) as the canonical source and asserts the other
 * independently-declared members of that SAME family stay in lockstep — so a
 * severity added to one but not another fails CI instead of drifting silently.
 *
 * Deliberately OUT of scope (distinct vocabularies — do NOT fold in):
 * - 4-value severity without `info` (voter-response, consensus/types-core).
 * - `critical|major|minor|suggestion` review-comment severity (voting-protocol).
 * - failure / error / audit / hazard severities (different domains + values).
 *
 * Inline `z.enum([...])` copies (severity-consensus, finding-triage,
 * output-schemas, triangulated-review, cli severity arrays) are not separately
 * importable, so they can only be unified by the vote-gated extract-and-derive
 * follow-up; this guard covers every member that IS importable today.
 *
 * Mirrors the gold-standard `config/model-ids-invariant.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { FindingSeveritySchema, SEVERITY_ORDER as SARIF_SEVERITY_ORDER } from './sarif-types.js';
import { SEVERITY_ORDER as PR_REVIEW_SEVERITY_ORDER } from '../dogfooding/pr-review-types.js';
import { VulnerabilitySeveritySchema } from '../agents/experts/expert-types.js';

const CANONICAL = [...FindingSeveritySchema.options].sort();

describe('finding-severity vocabulary consistency (#3570)', () => {
  it('canonical FindingSeveritySchema is the 5-value finding family', () => {
    expect(CANONICAL).toEqual(['critical', 'high', 'info', 'low', 'medium']);
  });

  it('VulnerabilitySeveritySchema stays in lockstep with the canonical family', () => {
    expect([...VulnerabilitySeveritySchema.options].sort()).toEqual(CANONICAL);
  });

  it('sarif SEVERITY_ORDER ranks exactly the canonical severities', () => {
    expect(Object.keys(SARIF_SEVERITY_ORDER).sort()).toEqual(CANONICAL);
  });

  it('pr-review SEVERITY_ORDER ranks the same severity set as the canonical', () => {
    // NOTE: only the KEY SET is asserted, not the values — the two maps use
    // intentionally INVERTED conventions (sarif: lower = more severe; pr-review:
    // higher = more severe) for opposite sort directions. Don't "fix" them to match.
    expect(Object.keys(PR_REVIEW_SEVERITY_ORDER).sort()).toEqual(CANONICAL);
  });

  it('each SEVERITY_ORDER map is a valid total order (distinct ranks per severity)', () => {
    for (const map of [SARIF_SEVERITY_ORDER, PR_REVIEW_SEVERITY_ORDER]) {
      const ranks = Object.values(map);
      expect(new Set(ranks).size).toBe(ranks.length);
      expect(ranks.length).toBe(CANONICAL.length);
    }
  });
});
