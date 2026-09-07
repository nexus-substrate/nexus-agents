/**
 * Tests for the regex/keyword fallback deriver (#1977 condition 1 partial).
 */

import { describe, it, expect } from 'vitest';
import type { TaskAccessPolicy } from './index.js';
import { deriveFallbackPolicy, FALLBACK_KEYWORDS, checkAccess } from './index.js';

describe('deriveFallbackPolicy', () => {
  it('returns empty ops for destructive verbs — which does NOT refuse (#5895)', () => {
    const p = deriveFallbackPolicy('please deploy this to prod', 'audit', 'abc');
    expect(p.allowedOperations).toEqual([]);
    expect(p.source).toBe('fallback-keyword');
    expect(p.allowedTools).toEqual([]);
    // The test name used to say "returns refuse". Nothing reads
    // `allowedOperations`, so the empty array screens nothing; the matched
    // verb below is the part that survives to a reader.
    expect(p.refuseVerbMatched).toBe('deploy');
  });

  it('returns read+write for modify-style tasks', () => {
    const p = deriveFallbackPolicy('fix the login bug in src/auth.ts', 'audit', 'abc');
    expect(p.allowedOperations).toEqual(['read', 'write']);
  });

  it('returns read-only for view-style tasks', () => {
    const p = deriveFallbackPolicy('show me the latest router config', 'audit', 'abc');
    expect(p.allowedOperations).toEqual(['read']);
  });

  it('defaults to read-only for ambiguous tasks', () => {
    const p = deriveFallbackPolicy('hmm', 'audit', 'abc');
    expect(p.allowedOperations).toEqual(['read']);
  });

  it('propagates the mode field', () => {
    const p = deriveFallbackPolicy('fix bug', 'enforce', 'abc');
    expect(p.mode).toBe('enforce');
  });

  it('propagates the objectiveHash', () => {
    const p = deriveFallbackPolicy('anything', 'off', 'myhash');
    expect(p.objectiveHash).toBe('myhash');
  });

  it('is case-insensitive', () => {
    const p = deriveFallbackPolicy('DEPLOY NOW', 'audit', 'abc');
    expect(p.allowedOperations).toEqual([]);
  });
});

describe('FALLBACK_KEYWORDS', () => {
  it('exports the three keyword groups', () => {
    expect(FALLBACK_KEYWORDS.readOnly.length).toBeGreaterThan(5);
    expect(FALLBACK_KEYWORDS.readWrite.length).toBeGreaterThan(3);
    expect(FALLBACK_KEYWORDS.refuse.length).toBeGreaterThan(3);
  });
});

describe('the matched refuse verb reaches the decision (#5895)', () => {
  // The seam this exercises is deriver -> policy -> checkAccess. Asserting the
  // deriver alone would leave the middle link untested: `refuseVerbMatched`
  // could be produced and then dropped, which is exactly the shape of the
  // defect being fixed (`allowedOperations` is produced by five files and read
  // by none).
  const refusePolicy = (objective: string): TaskAccessPolicy =>
    deriveFallbackPolicy(objective, 'enforce', 'h');

  it('carries the verb that actually matched, not a fixed literal', () => {
    // Two different verbs, so a hard-coded value cannot satisfy both. Both
    // objectives are otherwise ordinary sentences.
    expect(refusePolicy('rm -rf the build cache').refuseVerbMatched).toBe('rm -rf');
    expect(refusePolicy('force push the branch').refuseVerbMatched).toBe('force push');
  });

  it('leaves the field absent for an ordinary objective', () => {
    expect(refusePolicy('fix the login bug in src/auth.ts').refuseVerbMatched).toBeUndefined();
    expect(refusePolicy('show me the router config').refuseVerbMatched).toBeUndefined();
  });

  it('names the verb on the decision, and still does not deny', () => {
    const decision = checkAccess('exec_shell', refusePolicy('drop table users'));

    // The verdict is unchanged: this is disclosure, not enforcement. #5022's
    // empty-allowlist guard still decides, and the panel on #5895 explicitly
    // declined to make this a deny before the benign population is measured.
    expect(decision.decision).toBe('unmeasured');
    if (decision.decision !== 'unmeasured') throw new Error('unreachable');

    expect(decision.refuseVerbMatched).toBe('drop table');
    expect(decision.reason).toContain('drop table');
    // The reason must say the quiet part: naming a destructive verb next to a
    // non-denying verdict is exactly the place a reader could mistake
    // disclosure for a screen.
    expect(decision.reason).toContain('does NOT deny');
  });

  it('makes a destructive objective distinguishable from an ordinary one', () => {
    // This is the whole point of the change. Before #5895 both produced the
    // byte-identical `unmeasured` decision, so no counter could tell them
    // apart and the signal could not reach #2077's evidence base.
    const destructive = checkAccess('exec_shell', refusePolicy('publish the package'));
    const ordinary = checkAccess('exec_shell', refusePolicy('read the router config'));

    expect(destructive.decision).toBe('unmeasured');
    expect(ordinary.decision).toBe('unmeasured');
    expect(destructive).not.toEqual(ordinary);
  });

  it('does not attach the verb to a derivation-failure bypass policy', () => {
    // orchestrate.ts and execute-expert.ts also emit `allowedOperations: []`,
    // on the fail-closed derivation-failure path. They carry source 'bypass',
    // and they must not be read as destructive objectives.
    const bypass = {
      ...refusePolicy('deploy to prod'),
      source: 'bypass' as const,
      refuseVerbMatched: undefined,
    };
    const decision = checkAccess('exec_shell', bypass);
    expect(decision.decision).toBe('unmeasured');
    if (decision.decision !== 'unmeasured') throw new Error('unreachable');
    expect(decision.refuseVerbMatched).toBeUndefined();
    expect(decision.reason).not.toContain('destructive verb');
  });
});
