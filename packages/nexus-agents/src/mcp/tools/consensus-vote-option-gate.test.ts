import { describe, expect, it } from 'vitest';

import { evaluateOptionGate, optionThresholdFor } from './consensus-vote-option-gate.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';

const OPTIONS = ['Rewrite', 'Patch'];

/** Minimal AgentVoteResult carrying only what the gate reads. */
const vote = (
  decision: 'approve' | 'reject' | 'abstain',
  selectedOption?: string
): AgentVoteResult => ({
  role: 'architect',
  vote: { decision, reasoning: 'because', confidence: 0.9 },
  processingTimeMs: 1,
  source: 'llm',
  ...(selectedOption !== undefined ? { selectedOption } : {}),
});

describe('optionThresholdFor', () => {
  it('mirrors the strategy bar onto the option bar', () => {
    expect(optionThresholdFor('unanimous')).toBe('unanimous');
    expect(optionThresholdFor('supermajority')).toBe('supermajority');
    expect(optionThresholdFor('simple_majority')).toBe('majority');
  });

  it('honours the legacy threshold field when it is stricter', () => {
    expect(optionThresholdFor('higher_order', 'unanimous')).toBe('unanimous');
    expect(optionThresholdFor('higher_order', 'supermajority')).toBe('supermajority');
  });

  it('gates an unrecognised strategy rather than letting it opt out', () => {
    expect(optionThresholdFor('some_future_strategy')).toBe('majority');
  });
});

describe('evaluateOptionGate', () => {
  it('vetoes a 6-1 option split that cleared unanimous on approvals', () => {
    // The headline #4452 case: all 7 approve, so approvals read 100%.
    const votes = [
      ...Array.from({ length: 6 }, () => vote('approve', 'Rewrite')),
      vote('approve', 'Patch'),
    ];

    const outcome = evaluateOptionGate(votes, OPTIONS, 'unanimous', true);

    expect(outcome.vetoed).toBe(true);
    expect(outcome.verdict.leadingShare).toBeCloseTo(6 / 7);
    expect(outcome.reason).toContain('Rewrite');
  });

  it('does not veto when every approver chose the same option', () => {
    const votes = Array.from({ length: 7 }, () => vote('approve', 'Rewrite'));

    expect(evaluateOptionGate(votes, OPTIONS, 'unanimous', true).vetoed).toBe(false);
  });

  it('leaves an already-rejected vote alone rather than double-failing it', () => {
    const votes = [vote('approve', 'Rewrite'), vote('reject'), vote('reject')];

    const outcome = evaluateOptionGate(votes, OPTIONS, 'unanimous', false);

    expect(outcome.vetoed).toBe(false);
    expect(outcome.reason).toBeUndefined();
  });

  it('counts only approvers, leaving rejections to the existing gate', () => {
    // 4 approve all for Rewrite, 3 reject. The option tally alone would read
    // 4/4 = unanimous; composition is what makes the overall vote fail.
    const votes = [
      ...Array.from({ length: 4 }, () => vote('approve', 'Rewrite')),
      ...Array.from({ length: 3 }, () => vote('reject')),
    ];

    const outcome = evaluateOptionGate(votes, OPTIONS, 'unanimous', false);

    expect(outcome.verdict.approverCount).toBe(4);
    expect(outcome.verdict.leadingShare).toBe(1);
    expect(outcome.vetoed).toBe(false);
  });

  it('vetoes unanimous when one approver recorded no usable selection', () => {
    const votes = [...Array.from({ length: 6 }, () => vote('approve', 'Rewrite')), vote('approve')];

    const outcome = evaluateOptionGate(votes, OPTIONS, 'unanimous', true);

    expect(outcome.vetoed).toBe(true);
    expect(outcome.verdict.unattributedApprovals).toBe(1);
  });

  it('says the unmeasured selection is unmeasured, not dissent', () => {
    const votes = [
      ...Array.from({ length: 6 }, () => vote('approve', 'Rewrite')),
      vote('approve', 'not-a-declared-option'),
    ];

    const outcome = evaluateOptionGate(votes, OPTIONS, 'unanimous', true);

    expect(outcome.reason).toContain('unmeasured, not counted as dissent');
  });

  it('vetoes a supermajority whose leading option is only a plurality', () => {
    const votes = [
      vote('approve', 'Rewrite'),
      vote('approve', 'Rewrite'),
      vote('approve', 'Rewrite'),
      vote('approve', 'Patch'),
      vote('approve', 'Patch'),
    ];

    const outcome = evaluateOptionGate(votes, OPTIONS, 'supermajority', true);

    expect(outcome.verdict.leadingShare).toBeCloseTo(3 / 5);
    expect(outcome.vetoed).toBe(true);
  });

  it('reports when nobody selected a declared option at all', () => {
    const votes = Array.from({ length: 3 }, () => vote('approve'));

    const outcome = evaluateOptionGate(votes, OPTIONS, 'majority', true);

    expect(outcome.vetoed).toBe(true);
    expect(outcome.reason).toContain('no voter selected a declared option');
  });
});
