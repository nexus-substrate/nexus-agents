import { describe, it, expect } from 'vitest';
import {
  EXTERNAL_CONTENT_TRUST_TIER,
  leastTrustedTier,
  resolveContentTrustTier,
} from './content-trust-tier.js';

describe('resolveContentTrustTier (#6751)', () => {
  it('returns the caller tier when no source fed the run (empty case)', () => {
    expect(resolveContentTrustTier('2', [])).toBe('2');
  });

  it('returns the least-trusted of caller and sources', () => {
    expect(resolveContentTrustTier('1', [EXTERNAL_CONTENT_TRUST_TIER])).toBe('3');
    expect(resolveContentTrustTier('1', ['2', '4', '3'])).toBe('4');
  });

  it('never upgrades a less-trusted caller', () => {
    expect(resolveContentTrustTier('4', ['1', '3'])).toBe('4');
  });

  it('returns undefined for an absent or invalid caller tier (engine fails closed)', () => {
    expect(resolveContentTrustTier(undefined, ['1'])).toBeUndefined();
    expect(resolveContentTrustTier('high', [])).toBeUndefined();
  });

  it('labels external content as Tier 3 (Untrusted)', () => {
    expect(EXTERNAL_CONTENT_TRUST_TIER).toBe('3');
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
