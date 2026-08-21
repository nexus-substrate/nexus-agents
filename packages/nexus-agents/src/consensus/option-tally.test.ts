import { describe, expect, it } from 'vitest';

import { matchDeclaredOption, tallyOptions, evaluateOptionThreshold } from './option-tally.js';
import type { OptionTallyResult } from './option-tally.js';

/** An approving voter that selected `selectedOption` (or nothing). */
const approver = (selectedOption?: string): { decision: 'approve'; selectedOption?: string } =>
  selectedOption === undefined ? { decision: 'approve' } : { decision: 'approve', selectedOption };

const rejecter = (): { decision: 'reject' } => ({ decision: 'reject' });

const OPTIONS = ['A', 'B', 'C'];

describe('matchDeclaredOption', () => {
  it('matches an exact declared option', () => {
    expect(matchDeclaredOption('B', OPTIONS)).toBe('B');
  });

  it('matches ignoring surrounding whitespace and case', () => {
    expect(matchDeclaredOption('  b  ', OPTIONS)).toBe('B');
  });

  it('returns the declared spelling, not the voter spelling', () => {
    expect(matchDeclaredOption('option one', ['Option One'])).toBe('Option One');
  });

  it('returns undefined for a string matching no declared option', () => {
    expect(matchDeclaredOption('D', OPTIONS)).toBeUndefined();
  });

  it('returns undefined for an absent selection rather than defaulting', () => {
    expect(matchDeclaredOption(undefined, OPTIONS)).toBeUndefined();
  });

  it('does not partial-match a longer string onto a declared option', () => {
    expect(matchDeclaredOption('A and B', OPTIONS)).toBeUndefined();
  });
});

describe('tallyOptions', () => {
  it('counts only approving voters and orders by descending count', () => {
    const result = tallyOptions([approver('A'), approver('B'), approver('B'), rejecter()], OPTIONS);

    expect(result.tally).toEqual([
      { option: 'B', count: 2 },
      { option: 'A', count: 1 },
    ]);
    expect(result.leadingOption).toBe('B');
    expect(result.leadingCount).toBe(2);
  });

  it('breaks count ties by option label so the tally is deterministic', () => {
    const result = tallyOptions([approver('B'), approver('A')], OPTIONS);

    expect(result.tally.map((t) => t.option)).toEqual(['A', 'B']);
  });

  it('keeps a non-selecting approver in the denominator, crediting no option', () => {
    // Option A semantics: 6 pick X, 1 unparseable => 6/7, not 6/6.
    const votes = [...Array.from({ length: 6 }, () => approver('A')), approver(undefined)];

    const result = tallyOptions(votes, OPTIONS);

    expect(result.approverCount).toBe(7);
    expect(result.selectedCount).toBe(6);
    expect(result.unattributedApprovals).toBe(1);
    expect(result.leadingCount).toBe(6);
    expect(result.leadingShare).toBeCloseTo(6 / 7);
  });

  it('treats an unmatched option string exactly like an absent one', () => {
    const absent = tallyOptions([approver('A'), approver(undefined)], OPTIONS);
    const unmatched = tallyOptions([approver('A'), approver('Z')], OPTIONS);

    expect(unmatched.unattributedApprovals).toBe(absent.unattributedApprovals);
    expect(unmatched.leadingShare).toBe(absent.leadingShare);
  });

  it('does not let one selector among many unparseable read as full agreement', () => {
    // The Option B failure mode this design rejected: must be 1/7, not 1/1.
    const votes = [approver('A'), ...Array.from({ length: 6 }, () => approver(undefined))];

    const result = tallyOptions(votes, OPTIONS);

    expect(result.leadingShare).toBeCloseTo(1 / 7);
    expect(result.leadingShare).not.toBe(1);
  });

  it('reports no leading option when nobody selected one', () => {
    const result = tallyOptions([approver(undefined), approver(undefined)], OPTIONS);

    expect(result.leadingOption).toBeUndefined();
    expect(result.leadingCount).toBe(0);
    expect(result.leadingShare).toBe(0);
  });

  it('reports a zero share rather than dividing by zero when nobody approved', () => {
    const result = tallyOptions([rejecter()], OPTIONS);

    expect(result.approverCount).toBe(0);
    expect(result.leadingShare).toBe(0);
  });

  it('is monotone: adding a non-selecting approver never raises the leading share', () => {
    // The anti-#4452 invariant — degradation must never look like more agreement.
    const before = tallyOptions([approver('A'), approver('A')], OPTIONS);
    const after = tallyOptions([approver('A'), approver('A'), approver(undefined)], OPTIONS);

    expect(after.leadingShare).toBeLessThanOrEqual(before.leadingShare);
  });
});

describe('evaluateOptionThreshold', () => {
  const tallyOf = (
    votes: Array<{ decision: 'approve' | 'reject'; selectedOption?: string }>
  ): OptionTallyResult => tallyOptions(votes, OPTIONS);

  it('clears unanimous only when every approver chose the same option', () => {
    const all = tallyOf([approver('A'), approver('A'), approver('A')]);

    expect(evaluateOptionThreshold(all, 'unanimous').approved).toBe(true);
  });

  it('fails unanimous on a 6-1 option split', () => {
    // The headline acceptance criterion of #4472.
    const split = tallyOf([...Array.from({ length: 6 }, () => approver('A')), approver('B')]);

    const verdict = evaluateOptionThreshold(split, 'unanimous');

    expect(verdict.approved).toBe(false);
    expect(verdict.leadingShare).toBeCloseTo(6 / 7);
  });

  it('fails unanimous when one approver did not select, even with no dissent', () => {
    const degraded = tallyOf([
      ...Array.from({ length: 6 }, () => approver('A')),
      approver(undefined),
    ]);

    expect(evaluateOptionThreshold(degraded, 'unanimous').approved).toBe(false);
  });

  it('never clears unanimous when nobody selected an option', () => {
    const none = tallyOf([approver(undefined), approver(undefined)]);

    expect(evaluateOptionThreshold(none, 'unanimous').approved).toBe(false);
  });

  it('measures supermajority on the leading option share, not total approvals', () => {
    // All 7 approve, so an approval-based reading would be 100%. The leading
    // option holds 4/7 = 57%, which must NOT clear a 2/3 supermajority.
    const split = tallyOf([
      approver('A'),
      approver('A'),
      approver('A'),
      approver('A'),
      approver('B'),
      approver('B'),
      approver('C'),
    ]);

    const verdict = evaluateOptionThreshold(split, 'supermajority');

    expect(verdict.leadingShare).toBeCloseTo(4 / 7);
    expect(verdict.approved).toBe(false);
  });

  it('clears supermajority when the leading option holds enough share', () => {
    const strong = tallyOf([...Array.from({ length: 6 }, () => approver('A')), approver('B')]);

    expect(evaluateOptionThreshold(strong, 'supermajority').approved).toBe(true);
  });

  it('measures majority on the leading option share', () => {
    const narrow = tallyOf([approver('A'), approver('A'), approver('B')]);

    expect(evaluateOptionThreshold(narrow, 'majority').approved).toBe(true);
  });

  it('fails majority when the leading option is only a plurality', () => {
    const plurality = tallyOf([approver('A'), approver('A'), approver('B'), approver('C')]);

    expect(evaluateOptionThreshold(plurality, 'majority').approved).toBe(false);
  });

  it('carries coverage through so a diluted share is visibly partial', () => {
    const degraded = tallyOf([approver('A'), approver('A'), approver(undefined)]);

    const verdict = evaluateOptionThreshold(degraded, 'majority');

    expect(verdict.unattributedApprovals).toBe(1);
    expect(verdict.approverCount).toBe(3);
    expect(verdict.selectedCount).toBe(2);
  });
});
