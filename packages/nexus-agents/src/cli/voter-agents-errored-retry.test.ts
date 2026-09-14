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
import { MAX_VOTER_REASONING_CHARS } from '../audit/vote-record.js';

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

describe('a recovered seat carries what it recovered from (#6246)', () => {
  // `recovered.set(r.role, { ...r, retried: true })` discarded `first` — the
  // merged panel said the seat was retried but not what it was retried FROM.
  // On the #6241 ratification panel the catfish seat's first pass errored on
  // two response-parse failures and the retry came back unverifiable; the
  // record carried `retried: true, unverifiable: true` and nothing joined
  // them to the parse errors in the log, so #6244 read the parse errors as a
  // misclassification. The join was missing, not the classification.
  const PARSE_FAILURE =
    'Vote parsing failed: Vote response parsing failed: Unexpected end of JSON input';

  function erroredWith(role: VoterRole, error: string): AgentVoteResult {
    return { ...errored(role), error };
  }

  function unverifiable(role: VoterRole): AgentVoteResult {
    return {
      role,
      vote: { decision: 'abstain', confidence: 0, reasoning: 'UNVERIFIABLE: could not read' },
      processingTimeMs: 900,
      source: 'unverifiable',
      unverifiableSignal: 'reasoning',
    };
  }

  it('first pass errored → the recovered seat carries source error and the first-pass cause', async () => {
    const first = [ok('architect'), erroredWith('catfish', PARSE_FAILURE)];
    const relaunch = vi.fn(() => Promise.resolve([ok('catfish', 'reject')]));

    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);

    const catfish = merged.find((v) => v.role === 'catfish');
    expect(catfish?.retried).toBe(true);
    expect(catfish?.retriedFrom).toEqual({ source: 'error', error: PARSE_FAILURE });
    // The first-pass error string is NOT hoisted to the top level: the seat's
    // own `error` describes the seat that was recorded, which succeeded.
    expect(catfish?.error).toBeUndefined();
  });

  it('first pass unverifiable → source unverifiable, and a retry that is unverifiable again still carries it', async () => {
    const first = [unverifiable('devex'), unverifiable('scope_steward')];
    const relaunch = vi.fn(() => Promise.resolve([ok('devex'), unverifiable('scope_steward')]));

    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);

    expect(merged.find((v) => v.role === 'devex')?.retriedFrom).toEqual({
      source: 'unverifiable',
    });
    // #6094: a second unverifiable result replaces the first, marked retried —
    // and now says it was unverifiable both times.
    const steward = merged.find((v) => v.role === 'scope_steward');
    expect(steward?.source).toBe('unverifiable');
    expect(steward?.retriedFrom).toEqual({ source: 'unverifiable' });
  });

  it('a seat never retried carries NO retriedFrom key — the pair', async () => {
    const first = [ok('architect'), erroredWith('pm', PARSE_FAILURE)];
    const relaunch = vi.fn(() => Promise.resolve([ok('pm')]));
    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);
    const architect = merged.find((v) => v.role === 'architect');
    expect(architect !== undefined && 'retriedFrom' in architect).toBe(false);
    // And a panel with no absent seat is returned untouched: no key anywhere.
    const clean = await retryErroredRoles([ok('architect'), ok('pm')], relaunch, mockLogger(), 0);
    expect(clean.some((v) => 'retriedFrom' in v)).toBe(false);
  });

  it('the retry-fails-again path is unchanged: the first attempt stays unmarked', async () => {
    const first = [erroredWith('pm', PARSE_FAILURE)];
    const relaunch = vi.fn(() => Promise.resolve([errored('pm')]));
    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);
    expect(merged[0]?.source).toBe('error');
    expect(merged[0]?.error).toBe(PARSE_FAILURE);
    expect(merged[0]?.retried).toBeUndefined();
    expect(merged[0]?.retriedFrom).toBeUndefined();
  });

  it('an over-length first-pass cause is clipped WITH the marker, never silently sliced', async () => {
    // Bounded by the #5373 record clip, not a second number: the carried cause
    // reaches the ledger line, and a 100 KB stderr dump must not become a
    // 100 KB voter entry — nor lose its length silently.
    const runaway = 'e'.repeat(MAX_VOTER_REASONING_CHARS + 500);
    const first = [erroredWith('pm', runaway)];
    const relaunch = vi.fn(() => Promise.resolve([ok('pm')]));
    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);
    const from = merged[0]?.retriedFrom;
    expect(from?.error).toHaveLength(MAX_VOTER_REASONING_CHARS);
    expect(from?.errorTruncated).toBe(true);
    // The pair: a cause within the bound carries no marker.
    const short = await retryErroredRoles(
      [erroredWith('pm', PARSE_FAILURE)],
      relaunch,
      mockLogger(),
      0
    );
    const shortFrom = short[0]?.retriedFrom;
    expect(shortFrom !== undefined && 'errorTruncated' in shortFrom).toBe(false);
  });

  it('control characters in the carried cause become spaces — a stderr line cannot inject one', async () => {
    // The cause is rendered on the summary row and written to a JSONL ledger
    // line. An ESC sequence or a newline in a subprocess error must not reach
    // either as-is (security seat's condition on the #6246 panel).
    const hostile = 'Vote parsing failed\x1b[31m: fake\r\n| catfish | APPROVE |\x00end';
    const first = [erroredWith('pm', hostile)];
    const relaunch = vi.fn(() => Promise.resolve([ok('pm')]));
    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);
    const carried = merged[0]?.retriedFrom?.error ?? '';
    expect(carried).toBe('Vote parsing failed [31m: fake  | catfish | APPROVE | end');
    expect(/[\x00-\x1f\x7f]/.test(carried)).toBe(false);
  });

  it('C1 controls are replaced too — \\x9b is the single-byte CSI, equivalent to ESC [', async () => {
    // The #6252 panel's rejection: an ASCII-only range let `\x9b31m` through
    // as a terminal escape on the summary row and the ledger line.
    const hostile = 'Vote parsing failed\x9b31m: fake\x85end\x80';
    const first = [erroredWith('pm', hostile)];
    const relaunch = vi.fn(() => Promise.resolve([ok('pm')]));
    const merged = await retryErroredRoles(first, relaunch, mockLogger(), 0);
    const carried = merged[0]?.retriedFrom?.error ?? '';
    expect(carried).toBe('Vote parsing failed 31m: fake end ');
    expect(/[\x80-\x9f]/.test(carried)).toBe(false);
  });
});
