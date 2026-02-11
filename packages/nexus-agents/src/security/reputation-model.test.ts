/**
 * nexus-agents/security - Reputation Model Tests
 *
 * @module security/reputation-model.test
 */

import { describe, it, expect, vi } from 'vitest';

import type { GitHubUserMetadata } from './reputation-model.js';
import { assessReputation, ReputationCache } from './reputation-model.js';

// Helper factory for test metadata
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMetadata(overrides?: Partial<GitHubUserMetadata>) {
  return {
    username: 'testuser',
    accountAgeDays: 365,
    priorContributions: 10,
    recentCommentCount: 1,
    recentCommentWindowMinutes: 60,
    authorAssociation: 'CONTRIBUTOR',
    injectionFlags: [],
    ...overrides,
  } as GitHubUserMetadata;
}

describe('assessReputation', () => {
  it('clean contributor → Tier 2, not suspicious', () => {
    const result = assessReputation(makeMetadata());
    expect(result.userRole).toBe('contributor');
    expect(result.effectiveTrustTier).toBe('2');
    expect(result.isSuspicious).toBe(false);
    expect(result.suspiciousSignals).toHaveLength(0);
    expect(result.reputationScore).toBeGreaterThan(50);
  });

  it('clean owner → Tier 1, high score', () => {
    const result = assessReputation(
      makeMetadata({
        authorAssociation: 'OWNER',
        accountAgeDays: 1000,
        priorContributions: 50,
      })
    );
    expect(result.userRole).toBe('owner');
    expect(result.effectiveTrustTier).toBe('1');
    expect(result.isSuspicious).toBe(false);
    expect(result.reputationScore).toBeGreaterThanOrEqual(90);
  });

  it('new account → suspicious signal new_account', () => {
    const result = assessReputation(makeMetadata({ accountAgeDays: 5 }));
    expect(result.suspiciousSignals).toContain('new_account');
    expect(result.isSuspicious).toBe(true);
  });

  it('no contributions → no_prior_contributions signal', () => {
    const result = assessReputation(makeMetadata({ priorContributions: 0 }));
    expect(result.suspiciousSignals).toContain('no_prior_contributions');
  });

  it('rapid comments → rapid_comments signal', () => {
    const result = assessReputation(
      makeMetadata({
        recentCommentCount: 10,
        recentCommentWindowMinutes: 5,
      })
    );
    expect(result.suspiciousSignals).toContain('rapid_comments');
  });

  it('injection detected → injection_patterns_detected', () => {
    const result = assessReputation(makeMetadata({ injectionFlags: ['instruction_pattern'] }));
    expect(result.suspiciousSignals).toContain('injection_patterns_detected');
  });

  it('authority mismatch from NONE → Tier 4', () => {
    const result = assessReputation(
      makeMetadata({
        authorAssociation: 'NONE',
        injectionFlags: ['authority_claim'],
      })
    );
    expect(result.suspiciousSignals).toContain('mismatched_authority_claim');
    expect(result.effectiveTrustTier).toBe('4');
  });

  it('authority from owner → NO mismatch', () => {
    const result = assessReputation(
      makeMetadata({
        authorAssociation: 'OWNER',
        injectionFlags: ['authority_claim'],
      })
    );
    expect(result.suspiciousSignals).not.toContain('mismatched_authority_claim');
  });

  it('multiple signals downgrade tier by 1', () => {
    const result = assessReputation(
      makeMetadata({
        accountAgeDays: 5,
        priorContributions: 0,
      })
    );
    expect(result.suspiciousSignals.length).toBeGreaterThanOrEqual(2);
    expect(result.effectiveTrustTier).toBe('3'); // contributor base 2 + 1
  });

  it('hostile signals force Tier 4', () => {
    const result = assessReputation(
      makeMetadata({
        injectionFlags: ['authority_claim'],
        authorAssociation: 'NONE',
      })
    );
    expect(result.effectiveTrustTier).toBe('4');
  });

  it('score clamping → cannot go below 0', () => {
    const result = assessReputation(
      makeMetadata({
        accountAgeDays: 1,
        priorContributions: 0,
        authorAssociation: 'NONE',
        injectionFlags: ['authority_claim'],
        recentCommentCount: 10,
        recentCommentWindowMinutes: 5,
      })
    );
    expect(result.reputationScore).toBeGreaterThanOrEqual(0);
  });

  it('score clamping → cannot exceed 100', () => {
    const result = assessReputation(
      makeMetadata({
        authorAssociation: 'OWNER',
        accountAgeDays: 5000,
        priorContributions: 1000,
      })
    );
    expect(result.reputationScore).toBeLessThanOrEqual(100);
  });

  it('reputation score ordering: owner > contributor > unknown', () => {
    const owner = assessReputation(makeMetadata({ authorAssociation: 'OWNER' }));
    const contributor = assessReputation(makeMetadata());
    const unknown = assessReputation(makeMetadata({ authorAssociation: 'NONE' }));

    expect(owner.reputationScore).toBeGreaterThan(contributor.reputationScore);
    expect(contributor.reputationScore).toBeGreaterThan(unknown.reputationScore);
  });

  it('FIRST_TIME_CONTRIBUTOR maps to unknown', () => {
    const result = assessReputation(makeMetadata({ authorAssociation: 'FIRST_TIME_CONTRIBUTOR' }));
    expect(result.userRole).toBe('unknown');
  });

  it('zero-day account with injection → Tier 4, low score', () => {
    const result = assessReputation(
      makeMetadata({
        accountAgeDays: 0,
        injectionFlags: ['instruction_pattern'],
      })
    );
    expect(result.effectiveTrustTier).toBe('4');
    expect(result.reputationScore).toBeLessThan(50);
  });

  it('high-rep user with rapid comments → moderate downgrade', () => {
    const result = assessReputation(
      makeMetadata({
        authorAssociation: 'COLLABORATOR',
        accountAgeDays: 1000,
        priorContributions: 100,
        recentCommentCount: 10,
        recentCommentWindowMinutes: 5,
      })
    );
    expect(result.suspiciousSignals).toHaveLength(1);
    expect(result.reputationScore).toBeGreaterThan(50);
  });

  it('assessedAt timestamp present in ISO 8601', () => {
    const result = assessReputation(makeMetadata());
    expect(result.assessedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('reason string describes signals', () => {
    const result = assessReputation(makeMetadata({ accountAgeDays: 5 }));
    expect(result.reason).toContain('new_account');
  });
});

describe('ReputationCache', () => {
  it('cache miss returns undefined', () => {
    const cache = new ReputationCache();
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('cache hit returns stored assessment', () => {
    const cache = new ReputationCache();
    const assessment = assessReputation(makeMetadata(), cache);
    const hit = cache.get('testuser');
    expect(hit).toEqual(assessment);
  });

  it('cache expires after TTL', () => {
    vi.useFakeTimers();
    const cache = new ReputationCache(1000);
    const assessment = assessReputation(makeMetadata(), cache);

    expect(cache.get('testuser')).toEqual(assessment);
    vi.advanceTimersByTime(1001);
    expect(cache.get('testuser')).toBeUndefined();

    vi.useRealTimers();
  });

  it('cache clear removes all entries', () => {
    const cache = new ReputationCache();
    assessReputation(makeMetadata({ username: 'user1' }), cache);
    assessReputation(makeMetadata({ username: 'user2' }), cache);
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('cache size reports count', () => {
    const cache = new ReputationCache();
    expect(cache.size).toBe(0);
    assessReputation(makeMetadata({ username: 'user1' }), cache);
    expect(cache.size).toBe(1);
  });

  it('custom TTL works', () => {
    vi.useFakeTimers();
    const shortTTL = 500;
    const cache = new ReputationCache(shortTTL);
    assessReputation(makeMetadata(), cache);

    vi.advanceTimersByTime(400);
    expect(cache.get('testuser')).toBeDefined();
    vi.advanceTimersByTime(200);
    expect(cache.get('testuser')).toBeUndefined();

    vi.useRealTimers();
  });

  it('enforces max size and evicts oldest entry', () => {
    const cache = new ReputationCache(60000, 3);
    assessReputation(makeMetadata({ username: 'user1' }), cache);
    assessReputation(makeMetadata({ username: 'user2' }), cache);
    assessReputation(makeMetadata({ username: 'user3' }), cache);
    expect(cache.size).toBe(3);

    assessReputation(makeMetadata({ username: 'user4' }), cache);
    expect(cache.size).toBe(3);
    expect(cache.get('user1')).toBeUndefined();
    expect(cache.get('user4')).toBeDefined();
  });

  it('does not evict when updating existing entry', () => {
    const cache = new ReputationCache(60000, 2);
    assessReputation(makeMetadata({ username: 'user1' }), cache);
    assessReputation(makeMetadata({ username: 'user2' }), cache);
    assessReputation(makeMetadata({ username: 'user1' }), cache);
    expect(cache.size).toBe(2);
    expect(cache.get('user1')).toBeDefined();
    expect(cache.get('user2')).toBeDefined();
  });
});
