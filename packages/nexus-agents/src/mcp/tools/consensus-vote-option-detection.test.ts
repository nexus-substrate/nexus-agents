/**
 * Tests for the undeclared-options detector (#5360).
 *
 * The motivating instance: a 7-voter panel on an architecture fork whose
 * alternatives were named in prose as "Option A" / "Option B", with `options`
 * left undeclared. Positions were 3–3; the record said `APPROVED 83.3%`.
 */
import { describe, it, expect } from 'vitest';
import { checkUndeclaredOptions } from './consensus-vote-option-detection.js';
import { buildResponse } from './consensus-vote-types.js';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';

/** Minimal successful vote, enough for buildResponse's counting. */
function okVote(role: string): AgentVoteResult {
  return {
    role: role as VoterRole,
    vote: { decision: 'approve', confidence: 0.9, reasoning: 'stub' },
    processingTimeMs: 1,
    source: 'llm',
    cli: 'stub',
  };
}

/**
 * The REAL proposal shape from the #5360 instance. It used `Option A` in mixed
 * case, not `OPTION A` — the first version of this fixture used uppercase and so
 * would have passed against a detector that could not catch the very vote that
 * motivated it.
 */
const PROSE_FORK =
  'Should we keep raw createAllAdapters() under the liveness-probe exemption, ' +
  'or migrate to getGlobalRegistry()?\n\nOption A — keep it.\nOption B — migrate.';

describe('checkUndeclaredOptions', () => {
  it('flags the exact shape that recorded a 3-3 tie as APPROVED 83.3%', () => {
    const result = checkUndeclaredOptions(PROSE_FORK, undefined);
    expect(result.flagged).toBe(true);
    if (!result.flagged) throw new Error('expected flagged');
    expect(result.warning).toContain('options');
  });

  it('does not flag when options ARE declared — the tally is live', () => {
    expect(checkUndeclaredOptions(PROSE_FORK, ['A - keep', 'B - migrate']).flagged).toBe(false);
  });

  it('treats an EMPTY options array as undeclared, not as declared', () => {
    // `applyOptionGate` early-returns on both `undefined` and `[]`, so an empty
    // array switches the option tally off exactly as absence does. Reading it as
    // "declared" here would let the caller silently opt out of the warning.
    expect(checkUndeclaredOptions(PROSE_FORK, []).flagged).toBe(true);
  });

  it('does not flag an ordinary approve/reject proposal', () => {
    expect(checkUndeclaredOptions('Should we ship the rate-limit fix?', undefined).flagged).toBe(
      false
    );
  });

  it('names the empty proposal case rather than letting a regex answer it', () => {
    expect(checkUndeclaredOptions('', undefined).flagged).toBe(false);
  });

  it('adds the all-approved signal only when every engaged voter approved', () => {
    const withSignal = checkUndeclaredOptions(PROSE_FORK, undefined, true);
    const withoutSignal = checkUndeclaredOptions(PROSE_FORK, undefined, false);
    expect(withSignal.flagged && withSignal.warning).toContain('signature of this defect');
    expect(withoutSignal.flagged && withoutSignal.warning).not.toContain('signature');
  });

  it('omits the signal when the vote outcome is unknown', () => {
    const r = checkUndeclaredOptions(PROSE_FORK, undefined, undefined);
    expect(r.flagged && r.warning).not.toContain('signature');
  });

  describe('the patterns it deliberately does and does not match', () => {
    const flags = (p: string): boolean => checkUndeclaredOptions(p, undefined).flagged;

    it('matches the phrasings a caller uses to ask for a CHOICE', () => {
      expect(flags('Option A — do this. Option B — do that.')).toBe(true);
      expect(flags('OPTION A — do this. OPTION B — do that.')).toBe(true);
      expect(flags('Please choose between the two designs.')).toBe(true);
      expect(flags('Which of these should we adopt?')).toBe(true);
      expect(flags('Pick exactly one.')).toBe(true);
    });

    it('does not match prose that merely mentions options', () => {
      // The documented false-positive risk. These are the cases that would make
      // a refusal unsafe, which is why this ships as a warning.
      expect(flags('This adds a new option to the config schema.')).toBe(false);
      expect(flags('The optional field is undefined by default.')).toBe(false);
      expect(flags('We considered several options and rejected them all.')).toBe(false);
    });

    it('is case-sensitive on the Option-letter form, to avoid matching prose', () => {
      // `option a` in running prose is common; `OPTION A` as a heading is not.
      expect(flags('there is no option a caller can set')).toBe(false);
    });
  });
});

describe('the warning reaches the response (#5360 composition)', () => {
  /**
   * The seam. `checkUndeclaredOptions` being correct and `panelWarning` existing
   * are each true independently of whether anything connects them — which is the
   * shape of every defect found around this tool. Asserted through
   * `buildResponse`, the function that actually assembles the caller's answer.
   */
  it('surfaces the warning on panelWarning for a prose fork with no options', () => {
    const response = buildResponse(
      { proposal: 'Option A — keep it. Option B — migrate.', strategy: 'higher_order' } as never,
      {
        strategy: 'higher_order',
        votes: [okVote('architect'), okVote('security')],
        result: {
          outcome: 'approved',
          approvalPercentage: 100,
          voteCounts: { approve: 2, reject: 0, abstain: 0 },
        },
        totalTimeMs: 1,
        simulateVotes: false,
      } as never
    );

    expect(response.panelWarning).toBeDefined();
    expect(response.panelWarning).toContain('options');
    // Both voters approved, so the sharper signal must be present too.
    expect(response.panelWarning).toContain('signature of this defect');
  });

  it('stays silent when options are declared', () => {
    const response = buildResponse(
      {
        proposal: 'Option A — keep it. Option B — migrate.',
        strategy: 'higher_order',
        options: ['A - keep', 'B - migrate'],
      } as never,
      {
        strategy: 'higher_order',
        votes: [okVote('architect')],
        result: {
          outcome: 'approved',
          approvalPercentage: 100,
          voteCounts: { approve: 1, reject: 0, abstain: 0 },
        },
        totalTimeMs: 1,
        simulateVotes: false,
      } as never
    );

    expect(response.panelWarning ?? '').not.toContain('#5360');
  });
});
