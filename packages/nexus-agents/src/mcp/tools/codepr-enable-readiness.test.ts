/**
 * Tests for the code-PR enable-readiness DOUBLE-GATE (#3670, Stage 2). The point
 * of the gate is that the raw OFF→on flag ALONE can NEVER make it ready — these
 * tests prove the flag-only case stays denied and each missing criterion is named.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateCodePrEnableReadiness,
  DEFAULT_CODEPR_ENABLE_READINESS_CONFIG,
  type CodePrEnableReadinessEvidence,
} from './codepr-enable-readiness.js';

const SOAK = DEFAULT_CODEPR_ENABLE_READINESS_CONFIG.minGuardsGreenSoak;

/** A fully-satisfying evidence object; override fields per test. */
function fullEvidence(
  over: Partial<CodePrEnableReadinessEvidence> = {}
): CodePrEnableReadinessEvidence {
  return {
    flagEnabled: true,
    enableVoteRef: 'vote-3670-enable',
    consecutiveGreenDryRuns: SOAK,
    owner: 'william',
    ...over,
  };
}

describe('evaluateCodePrEnableReadiness', () => {
  it('flag-only (no vote/soak/owner) is NOT ready — the flag alone can never activate', () => {
    const r = evaluateCodePrEnableReadiness({
      flagEnabled: true,
      enableVoteRef: '',
      consecutiveGreenDryRuns: 0,
      owner: '',
    });
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('enable-vote-ref');
    expect(r.blockers).toContain('guards-green-soak');
    expect(r.blockers).toContain('owner-ack');
    // The flag itself IS met — proving "flag set but still not ready".
    expect(r.criteria.find((c) => c.name === 'flag-enabled')?.met).toBe(true);
  });

  it('all criteria satisfied → ready:true with no blockers', () => {
    const r = evaluateCodePrEnableReadiness(fullEvidence());
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.criteria.every((c) => c.met)).toBe(true);
  });

  it('missing flag → ready:false naming flag-enabled', () => {
    const r = evaluateCodePrEnableReadiness(fullEvidence({ flagEnabled: false }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual(['flag-enabled']);
  });

  it('missing enable-vote ref → ready:false naming enable-vote-ref', () => {
    const r = evaluateCodePrEnableReadiness(fullEvidence({ enableVoteRef: '' }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual(['enable-vote-ref']);
    expect(r.criteria.find((c) => c.name === 'enable-vote-ref')?.detail).toBe('no enable-vote ref');
  });

  it('whitespace-only vote ref counts as absent', () => {
    const r = evaluateCodePrEnableReadiness(fullEvidence({ enableVoteRef: '   ' }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual(['enable-vote-ref']);
  });

  it('soak below threshold → ready:false naming guards-green-soak', () => {
    const r = evaluateCodePrEnableReadiness(fullEvidence({ consecutiveGreenDryRuns: SOAK - 1 }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual(['guards-green-soak']);
  });

  it('soak exactly at threshold is met (>=)', () => {
    const r = evaluateCodePrEnableReadiness(fullEvidence({ consecutiveGreenDryRuns: SOAK }));
    expect(r.ready).toBe(true);
  });

  it('missing owner → ready:false naming owner-ack', () => {
    const r = evaluateCodePrEnableReadiness(fullEvidence({ owner: '' }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual(['owner-ack']);
    // #4181: pin THIS copy's wording. readiness-verdict.ts documents that the two
    // presenceCriterion copies deliberately diverge ("no {label}" here vs
    // "no named {label}" in improvement-enforce-readiness) — do not unify.
    expect(r.criteria.find((c) => c.name === 'owner-ack')?.detail).toBe('no owner');
  });

  it('reports every criterion with the exact detail wording (#4181)', () => {
    const r = evaluateCodePrEnableReadiness(fullEvidence());
    expect(r.criteria).toEqual([
      { name: 'flag-enabled', met: true, detail: 'OFF→on flag is set' },
      { name: 'enable-vote-ref', met: true, detail: 'enable-vote ref: vote-3670-enable' },
      {
        name: 'guards-green-soak',
        met: true,
        detail: `${String(SOAK)} consecutive green dry-runs (need ≥ ${String(SOAK)})`,
      },
      { name: 'owner-ack', met: true, detail: 'owner: william' },
    ]);
  });

  it('pins the unmet-side detail wording (#4181)', () => {
    const r = evaluateCodePrEnableReadiness({
      flagEnabled: false,
      enableVoteRef: '',
      consecutiveGreenDryRuns: 0,
      owner: '',
    });
    expect(r.criteria).toEqual([
      { name: 'flag-enabled', met: false, detail: 'OFF→on flag is not set' },
      { name: 'enable-vote-ref', met: false, detail: 'no enable-vote ref' },
      {
        name: 'guards-green-soak',
        met: false,
        detail: `0 consecutive green dry-runs (need ≥ ${String(SOAK)})`,
      },
      { name: 'owner-ack', met: false, detail: 'no owner' },
    ]);
  });

  it('config can drop the vote/owner requirement (still needs flag + soak)', () => {
    const r = evaluateCodePrEnableReadiness(
      { flagEnabled: true, enableVoteRef: '', consecutiveGreenDryRuns: 5, owner: '' },
      { minGuardsGreenSoak: 5, requireEnableVoteRef: false, requireOwnerAck: false }
    );
    expect(r.ready).toBe(true);
  });

  it('malformed evidence fails closed (ready:false, evidence-shape blocker)', () => {
    const bad = { flagEnabled: 'yes' } as unknown as CodePrEnableReadinessEvidence;
    const r = evaluateCodePrEnableReadiness(bad);
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual(['evidence-shape']);
  });
});
