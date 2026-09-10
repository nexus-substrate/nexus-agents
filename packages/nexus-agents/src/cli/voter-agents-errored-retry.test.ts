/**
 * An errored voter seat is retried once before the tally (#5578).
 *
 * The panel launches once and a voter at `source: 'error'` is dropped. Under
 * `reduce_denominator` — the default for every strategy but `unanimous` — its
 * seat silently leaves the denominator, so a 6-of-7 panel clears supermajority
 * on six seats and the record reads as a clean six-voter approval. Under
 * `absolute_quorum` the whole vote voids and the caller replays all N voters
 * for one failure.
 *
 * Design panel on #5578 chose option (b), 6 of 6 approvers: one bounded retry
 * of the errored roles under every error policy.
 */
import { describe, it, expect, vi } from 'vitest';

import { retryErroredRoles } from './voter-retry.js';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import type { ILogger } from '../core/index.js';

function mockLogger(): ILogger {
  const l: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  (l.child as ReturnType<typeof vi.fn>).mockReturnValue(l);
  return l;
}

function ok(role: VoterRole, decision: 'approve' | 'reject' = 'approve'): AgentVoteResult {
  return {
    role,
    vote: { decision, confidence: 0.9, reasoning: 'r' },
    processingTimeMs: 5,
    source: 'llm',
  };
}

function errored(role: VoterRole): AgentVoteResult {
  return {
    role,
    vote: { decision: 'abstain', confidence: 0, reasoning: '[Error] deadline exceeded' },
    processingTimeMs: 0,
    source: 'error',
  };
}

describe('retryErroredRoles (#5578)', () => {
  it('recovers the errored seat and marks it retried', async () => {
    const first = [ok('architect'), ok('security'), errored('pm')];
    const relaunch = vi.fn((roles: readonly VoterRole[]) => {
      expect(roles).toEqual(['pm']);
      return Promise.resolve([ok('pm', 'reject')]);
    });

    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);

    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(merged).toHaveLength(3);
    const pm = merged.find((v) => v.role === 'pm');
    expect(pm?.source).toBe('llm');
    expect(pm?.vote.decision).toBe('reject');
    expect(pm?.retried).toBe(true);
    // Untouched seats keep their first-attempt result and carry no marker.
    expect(merged.find((v) => v.role === 'architect')?.retried).toBeUndefined();
  });

  it('relaunches ONLY the errored roles, not the whole panel', async () => {
    const first = [ok('architect'), errored('security'), ok('devex'), errored('catfish')];
    const relaunch = vi.fn(() => Promise.resolve([ok('security'), ok('catfish')]));

    await retryErroredRoles(first, relaunch, mockLogger(), 0);

    expect(relaunch).toHaveBeenCalledWith(['security', 'catfish']);
  });

  it('issues NO retry when the whole panel responded', async () => {
    // The empty case, named: a healthy vote must cost exactly what it did
    // before this change.
    const first = [ok('architect'), ok('security'), ok('devex')];
    const relaunch = vi.fn(() => Promise.resolve([]));

    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);

    expect(relaunch).not.toHaveBeenCalled();
    expect(merged).toBe(first);
  });

  it('keeps the errored result when the retry errors again', async () => {
    // The retry recovers seats; it never manufactures one. A role that fails
    // twice stays errored so the existing error policy decides unchanged.
    const first = [ok('architect'), errored('pm')];
    const relaunch = vi.fn(() => Promise.resolve([errored('pm')]));

    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);

    const pm = merged.find((v) => v.role === 'pm');
    expect(pm?.source).toBe('error');
    expect(pm?.retried).toBeUndefined();
  });

  it('keeps a seat that errors again while recovering one that does not', async () => {
    const first = [errored('pm'), errored('catfish'), ok('architect')];
    const relaunch = vi.fn(() => Promise.resolve([ok('pm'), errored('catfish')]));

    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);

    expect(merged.find((v) => v.role === 'pm')?.retried).toBe(true);
    expect(merged.find((v) => v.role === 'catfish')?.source).toBe('error');
  });

  describe('an unverifiable seat is retried exactly once (#6094)', () => {
    function unverifiable(role: VoterRole): AgentVoteResult {
      return {
        role,
        vote: {
          decision: 'abstain',
          confidence: 0,
          reasoning: "Shell reads failed with 'bwrap: loopback: Failed RTM_NEWADDR'",
        },
        processingTimeMs: 900,
        source: 'unverifiable',
        unverifiableSignal: 'reasoning',
      };
    }

    it('relaunches the unverifiable role alongside the errored ones', async () => {
      const first = [ok('architect'), unverifiable('devex'), errored('pm')];
      const relaunch = vi.fn(() => Promise.resolve([ok('devex'), ok('pm')]));

      const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);

      expect(relaunch).toHaveBeenCalledTimes(1);
      expect(relaunch).toHaveBeenCalledWith(['devex', 'pm']);
      const devex = merged.find((v) => v.role === 'devex');
      expect(devex?.source).toBe('llm');
      expect(devex?.retried).toBe(true);
    });

    it('a second unverifiable result is recorded ONCE, marked retried', async () => {
      // The retry is bounded to one call: a deterministic host failure makes a
      // second attempt futile, so the panel keeps the retried unverifiable
      // seat rather than looping or keeping two entries for one role.
      const first = [ok('architect'), unverifiable('scope_steward')];
      const relaunch = vi.fn(() => Promise.resolve([unverifiable('scope_steward')]));

      const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);

      expect(relaunch).toHaveBeenCalledTimes(1);
      expect(merged).toHaveLength(2);
      const seat = merged.filter((v) => v.role === 'scope_steward');
      expect(seat).toHaveLength(1);
      expect(seat[0]?.source).toBe('unverifiable');
      expect(seat[0]?.retried).toBe(true);
      expect(seat[0]?.vote.decision).toBe('abstain');
    });

    it('a retry that errors keeps the first unverifiable result', async () => {
      const first = [unverifiable('devex')];
      const relaunch = vi.fn(() => Promise.resolve([errored('devex')]));
      const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);
      expect(merged[0]?.source).toBe('unverifiable');
      expect(merged[0]?.retried).toBeUndefined();
    });
  });

  it('waits the backoff before relaunching', async () => {
    const first = [errored('pm')];
    const order: string[] = [];
    const relaunch = vi.fn(() => {
      order.push('relaunch');
      return Promise.resolve([ok('pm')]);
    });

    const started = Date.now();
    await retryErroredRoles(first, relaunch, mockLogger(), 25);
    const elapsed = Date.now() - started;

    expect(order).toEqual(['relaunch']);
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });
});
