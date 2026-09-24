import { describe, it, expect } from 'vitest';
import {
  EXTERNAL_CONTENT_TRUST_TIER,
  leastTrustedTier,
  resolveContentTrustProvenance,
  resolveContentTrustTier,
} from './content-trust-tier.js';

describe('resolveContentTrustTier (#6751, #6795)', () => {
  it('an omitted declaration makes the task content tier 3, measured (#6795)', () => {
    // A tier-1 caller with no sources and no declaration: the task string's
    // provenance is unknown, so it is Tier 3 (Untrusted), not the caller's '1'.
    expect(resolveContentTrustTier('1', [], undefined)).toBe('3');
  });

  it('a declaration equal to the caller tier, with no sources, keeps that tier', () => {
    expect(resolveContentTrustTier('1', [], '1')).toBe('1');
    expect(resolveContentTrustTier('2', [], '2')).toBe('2');
  });

  it('declared 1 with a research source resolves to 3 (#6795)', () => {
    expect(resolveContentTrustTier('1', [EXTERNAL_CONTENT_TRUST_TIER], '1')).toBe('3');
  });

  it('returns the least-trusted of caller, declaration and sources', () => {
    expect(resolveContentTrustTier('1', ['2', '4', '3'], '1')).toBe('4');
    expect(resolveContentTrustTier('1', [], '2')).toBe('2');
  });

  it('never upgrades a less-trusted caller', () => {
    expect(resolveContentTrustTier('4', ['1', '3'], '1')).toBe('4');
  });

  it('returns undefined for an absent or invalid caller tier (engine fails closed)', () => {
    expect(resolveContentTrustTier(undefined, ['1'], '1')).toBeUndefined();
    expect(resolveContentTrustTier(undefined, [], undefined)).toBeUndefined();
    expect(resolveContentTrustTier('high', [], '1')).toBeUndefined();
  });

  it('labels external content as Tier 3 (Untrusted)', () => {
    expect(EXTERNAL_CONTENT_TRUST_TIER).toBe('3');
  });
});

describe('resolveContentTrustProvenance (#6795)', () => {
  it('clamps a declaration above the measured caller tier, and says so', () => {
    const p = resolveContentTrustProvenance('2', [], '1');
    expect(p.contentTier).toBe('2');
    expect(p.callerTier).toBe('2');
    expect(p.declaredSourceTier).toBe('1');
    expect(p.declarationClamped).toBe(true);
  });

  it('does not report a clamp when the declaration is at or below the caller tier', () => {
    expect(resolveContentTrustProvenance('1', [], '1').declarationClamped).toBe(false);
    expect(resolveContentTrustProvenance('1', [], '3').declarationClamped).toBe(false);
  });

  it('records an omitted declaration as undeclared, applying tier 3', () => {
    const p = resolveContentTrustProvenance('1', [], undefined);
    expect(p.declaredSourceTier).toBeUndefined();
    expect(p.taskContentTier).toBe('3');
    expect(p.contentTier).toBe('3');
  });

  it('records the declaration even when the caller is unmeasured', () => {
    const p = resolveContentTrustProvenance(undefined, ['3'], '1');
    expect(p.callerTier).toBeUndefined();
    expect(p.declaredSourceTier).toBe('1');
    expect(p.sourceTiers).toEqual(['3']);
    expect(p.contentTier).toBeUndefined();
    // Nothing was measured to clamp against.
    expect(p.declarationClamped).toBe(false);
  });
});

describe('leastTrustedTier (#6751)', () => {
  it('returns undefined for no tiers (empty case: unrecorded, not trusted)', () => {
    expect(leastTrustedTier([])).toBeUndefined();
  });

  it('returns the highest-numbered tier', () => {
    expect(leastTrustedTier(['2', '1'])).toBe('2');
    expect(leastTrustedTier(['3', '4', '1'])).toBe('4');
  });
});
