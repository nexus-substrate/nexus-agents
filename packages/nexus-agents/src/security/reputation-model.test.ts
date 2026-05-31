/**
 * nexus-agents/security - Reputation Model Tests
 *
 * @module security/reputation-model.test
 */

import { describe, it, expect, vi } from 'vitest';

import type { GitHubUserMetadata, ReputationAssessment } from './reputation-model.js';
import { assessReputation, ReputationCache, reconcileTrustTier } from './reputation-model.js';
import type { TrustTier } from './trust-types.js';

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
  };
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

  it('hostile injection flag → injection_patterns_detected', () => {
    const result = assessReputation(
      makeMetadata({ injectionFlags: ['system_prompt_manipulation'] })
    );
    expect(result.suspiciousSignals).toContain('injection_patterns_detected');
  });

  it('benign instruction_pattern flag does NOT trigger injection_patterns_detected', () => {
    const result = assessReputation(makeMetadata({ injectionFlags: ['instruction_pattern'] }));
    expect(result.suspiciousSignals).not.toContain('injection_patterns_detected');
  });

  it('benign urgency_manipulation flag does NOT trigger injection_patterns_detected', () => {
    const result = assessReputation(makeMetadata({ injectionFlags: ['urgency_manipulation'] }));
    expect(result.suspiciousSignals).not.toContain('injection_patterns_detected');
  });

  it('benign base64_encoded flag does NOT trigger injection_patterns_detected', () => {
    const result = assessReputation(makeMetadata({ injectionFlags: ['base64_encoded'] }));
    expect(result.suspiciousSignals).not.toContain('injection_patterns_detected');
  });

  it('benign external_link_instruction flag does NOT trigger injection_patterns_detected', () => {
    const result = assessReputation(
      makeMetadata({ injectionFlags: ['external_link_instruction'] })
    );
    expect(result.suspiciousSignals).not.toContain('injection_patterns_detected');
  });

  it('hostile fake_conversation flag triggers injection_patterns_detected', () => {
    const result = assessReputation(makeMetadata({ injectionFlags: ['fake_conversation'] }));
    expect(result.suspiciousSignals).toContain('injection_patterns_detected');
  });

  it('hostile authority_claim flag triggers injection_patterns_detected', () => {
    const result = assessReputation(makeMetadata({ injectionFlags: ['authority_claim'] }));
    expect(result.suspiciousSignals).toContain('injection_patterns_detected');
  });

  it('hostile hidden_content flag triggers injection_patterns_detected', () => {
    const result = assessReputation(makeMetadata({ injectionFlags: ['hidden_content'] }));
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

  it('zero-day account with hostile injection → Tier 4, low score', () => {
    const result = assessReputation(
      makeMetadata({
        accountAgeDays: 0,
        injectionFlags: ['system_prompt_manipulation'],
      })
    );
    expect(result.effectiveTrustTier).toBe('4');
    expect(result.reputationScore).toBeLessThan(50);
  });

  it('zero-day account with benign injection flag → NOT Tier 4', () => {
    const result = assessReputation(
      makeMetadata({
        accountAgeDays: 0,
        injectionFlags: ['instruction_pattern'],
      })
    );
    // instruction_pattern is benign — should not force Tier 4
    expect(result.effectiveTrustTier).not.toBe('4');
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

  it('enforces max size and evicts oldest entries in batch', () => {
    const cache = new ReputationCache(60000, 3);
    assessReputation(makeMetadata({ username: 'user1' }), cache);
    assessReputation(makeMetadata({ username: 'user2' }), cache);
    assessReputation(makeMetadata({ username: 'user3' }), cache);
    expect(cache.size).toBe(3);

    // With maxSize=3, batch = max(1, floor(3*0.1)) = 1
    assessReputation(makeMetadata({ username: 'user4' }), cache);
    expect(cache.size).toBeLessThanOrEqual(3);
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

  it('respects maxSize under rapid insertions', () => {
    const maxSize = 20;
    const cache = new ReputationCache(60000, maxSize);
    for (let i = 0; i < 50; i++) {
      assessReputation(makeMetadata({ username: `rapid-${String(i)}` }), cache);
    }
    expect(cache.size).toBeLessThanOrEqual(maxSize);
  });

  it('batch eviction removes ~10% when triggered', () => {
    const maxSize = 20;
    const cache = new ReputationCache(60000, maxSize);
    // Fill to capacity
    for (let i = 0; i < maxSize; i++) {
      assessReputation(makeMetadata({ username: `fill-${String(i)}` }), cache);
    }
    expect(cache.size).toBe(maxSize);

    // Insert one more to trigger batch eviction (10% of 20 = 2)
    assessReputation(makeMetadata({ username: 'overflow' }), cache);
    // Evicted 2, then added 1 → size = 19
    expect(cache.size).toBe(maxSize - 1);
  });

  it('oldest entries are evicted first', () => {
    const maxSize = 10;
    const cache = new ReputationCache(60000, maxSize);
    // Fill cache: oldest-0 through oldest-9
    for (let i = 0; i < maxSize; i++) {
      assessReputation(makeMetadata({ username: `oldest-${String(i)}` }), cache);
    }

    // Trigger eviction — batch = max(1, floor(10*0.1)) = 1
    assessReputation(makeMetadata({ username: 'new-entry' }), cache);

    // oldest-0 should be evicted (inserted first)
    expect(cache.get('oldest-0')).toBeUndefined();
    // oldest-1 through oldest-9 should remain
    expect(cache.get('oldest-1')).toBeDefined();
    expect(cache.get('oldest-9')).toBeDefined();
    expect(cache.get('new-entry')).toBeDefined();
  });
});

describe('reconcileTrustTier (#3119)', () => {
  function rep(effectiveTrustTier: TrustTier, reputationScore = 50): ReputationAssessment {
    return {
      username: 'u',
      userRole: 'unknown',
      suspiciousSignals: [],
      isSuspicious: false,
      effectiveTrustTier,
      reputationScore,
      reason: 'test',
      assessedAt: new Date().toISOString(),
    };
  }

  it('demotes to the stricter (higher) tier — reputation raises it', () => {
    expect(reconcileTrustTier('2', rep('3'))).toBe('3');
  });

  it('never loosens — a stricter classifier tier wins over reputation', () => {
    expect(reconcileTrustTier('4', rep('3'))).toBe('4');
  });

  it('no phantom demotion when tiers are equal', () => {
    expect(reconcileTrustTier('2', rep('2'))).toBe('2');
  });

  it('Tier-1 / allowlist wins — reputation never demotes it', () => {
    expect(reconcileTrustTier('1', rep('4'))).toBe('1');
  });

  it('absent reputation keeps the classifier tier (no fabrication, no escalation)', () => {
    expect(reconcileTrustTier('2', undefined)).toBe('2');
    expect(reconcileTrustTier('3', undefined)).toBe('3');
  });

  it('reputationScore is advisory — score never moves the tier, only effectiveTrustTier does', () => {
    expect(reconcileTrustTier('3', rep('3', 100))).toBe('3'); // excellent score, still T3
    expect(reconcileTrustTier('2', rep('2', 0))).toBe('2'); // terrible score, no extra demotion
  });
});
