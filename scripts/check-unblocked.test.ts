import { describe, it, expect } from 'vitest';

import { parseBlockers, selectUnblocked, formatReport } from './check-unblocked.js';

const issue = (
  number: number,
  body: string,
  title = `issue ${String(number)}`
): { number: number; title: string; body: string } => ({ number, title, body });

describe('parseBlockers', () => {
  it('reads the forms this repo actually uses', () => {
    // Survey of all 136 open issues: `blocked by` (4), `depends on` (3),
    // `once #N` (1). The others cost nothing and are the same convention.
    expect(parseBlockers('blocked by #4439')).toEqual([4439]);
    expect(parseBlockers('blocked on #12')).toEqual([12]);
    expect(parseBlockers('depends on #7')).toEqual([7]);
    expect(parseBlockers('pick up once #99 lands')).toEqual([99]);
    expect(parseBlockers('do this after #5 merges')).toEqual([5]);
  });

  it('ignores a bare cross-reference', () => {
    // The common case by far, and almost never a dependency. Anchoring on the
    // verb is what keeps this from reporting most of the backlog as blocked.
    expect(parseBlockers('related: #4671, see also #4580')).toEqual([]);
  });

  it('deduplicates and sorts', () => {
    expect(parseBlockers('blocked by #9, depends on #3, blocked by #9')).toEqual([3, 9]);
  });

  it('returns nothing for a body with no blockers', () => {
    expect(parseBlockers('an ordinary issue body')).toEqual([]);
  });
});

describe('selectUnblocked', () => {
  const closed = (b: number): boolean => b < 100;

  it('reports an issue whose every blocker closed', () => {
    const verdict = selectUnblocked([issue(1, 'blocked by #10')], closed);

    expect(verdict.unblocked).toEqual([{ number: 1, title: 'issue 1', blockers: [10] }]);
    expect(verdict.tracked).toBe(1);
  });

  it('does not report an issue with one blocker still open', () => {
    // The pair. Without it, "report everything" satisfies the test above.
    const verdict = selectUnblocked([issue(1, 'blocked by #10 and depends on #200')], closed);

    expect(verdict.unblocked).toEqual([]);
    expect(verdict.tracked).toBe(1);
  });

  it('refuses to treat an unresolvable blocker as closed', () => {
    // Unknown is not closed. Surfacing still-blocked work erodes trust in the
    // report faster than missing an item would.
    const verdict = selectUnblocked([issue(1, 'blocked by #10')], () => undefined);

    expect(verdict.unblocked).toEqual([]);
    expect(verdict.tracked).toBe(1);
  });

  it('does not count an issue that names no blocker', () => {
    const verdict = selectUnblocked([issue(1, 'no dependency here')], closed);

    expect(verdict.tracked).toBe(0);
  });

  it('reports unmeasured when no open issue names a blocker at all', () => {
    // `unblocked: []` looks identical whether the backlog is current or the
    // convention stopped being written. The second is the likelier
    // explanation for a repo this size, so it is stated, not inferred.
    const verdict = selectUnblocked([issue(1, 'ordinary'), issue(2, 'also ordinary')], closed);

    expect(verdict.unmeasured).toBe(true);
    expect(verdict.unblocked).toEqual([]);
  });

  it('is not unmeasured when blockers exist but none have cleared', () => {
    const verdict = selectUnblocked([issue(1, 'blocked by #500')], closed);

    expect(verdict.unmeasured).toBeUndefined();
    expect(verdict.tracked).toBe(1);
  });
});

describe('formatReport', () => {
  it('names the unblocked issues and their blockers', () => {
    const body = formatReport({
      unblocked: [{ number: 4440, title: 'Reconcile TokenUsage', blockers: [4439] }],
      tracked: 12,
    });

    expect(body).toContain('#4440');
    expect(body).toContain('#4439');
    expect(body).toContain('1 of 12');
  });

  it('says so plainly when everything is still blocked', () => {
    expect(formatReport({ unblocked: [], tracked: 5 })).toContain('still have an open blocker');
  });

  it('reports the empty corpus as unmeasured, not clean', () => {
    const body = formatReport({ unblocked: [], tracked: 0, unmeasured: true });

    expect(body).toContain('unmeasured');
    expect(body).not.toContain('Nothing to pick up');
  });
});
