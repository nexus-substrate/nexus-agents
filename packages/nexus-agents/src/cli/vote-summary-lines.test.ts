/**
 * Tests for the declared-option block of the vote summary (#6585).
 *
 * The block renders the option gate's own verdict — the tally the engine
 * already produced — so every fixture below is a gate verdict, not votes.
 */
import { describe, it, expect } from 'vitest';
import { optionSummaryLines } from './vote-summary-lines.js';
import type { ExtendedVotingResult } from '../mcp/tools/consensus-vote-types.js';

type Gate = NonNullable<ExtendedVotingResult['optionGate']>;

const DECLARED = ['Delete now', 'Deprecate first', 'Keep'] as const;

function gate(overrides: Partial<Gate> = {}): Gate {
  return {
    tally: [],
    leadingCount: 0,
    approverCount: 0,
    selectedCount: 0,
    unattributedApprovals: 0,
    leadingShare: 0,
    threshold: 'majority',
    approved: false,
    ...overrides,
  };
}

describe('optionSummaryLines (#6585)', () => {
  it('lists every declared option with its count, the winner and the coverage', () => {
    const lines = optionSummaryLines(
      DECLARED,
      gate({
        tally: [
          { option: 'Delete now', count: 4 },
          { option: 'Deprecate first', count: 1 },
        ],
        leadingOption: 'Delete now',
        leadingCount: 4,
        approverCount: 6,
        selectedCount: 5,
        unattributedApprovals: 1,
        leadingShare: 4 / 6,
        threshold: 'majority',
        approved: true,
      })
    );
    expect(lines).toEqual([
      'Options:',
      '  Delete now: 4',
      '  Deprecate first: 1',
      // A declared option nobody chose is a measured zero, not an omission.
      '  Keep: 0',
      '  Winner: "Delete now" (4 of 6 approvers; cleared the majority option bar)',
      '  Coverage: 5 of 6 approvers named a declared option (1 unattributed)',
    ]);
  });

  it('prints no block when no options were declared', () => {
    expect(optionSummaryLines(undefined, undefined)).toEqual([]);
    expect(optionSummaryLines([], undefined)).toEqual([]);
  });

  it('names the empty case: options declared, no voter named one', () => {
    const lines = optionSummaryLines(
      DECLARED,
      gate({ approverCount: 3, unattributedApprovals: 3, threshold: 'supermajority' })
    );
    expect(lines).toEqual([
      'Options:',
      '  Delete now: 0',
      '  Deprecate first: 0',
      '  Keep: 0',
      '  Winner: none — no voter named a declared option',
      '  Coverage: 0 of 3 approvers named a declared option (3 unattributed)',
    ]);
  });

  it('reports a tie instead of the tally order as a winner', () => {
    // tallyOptions breaks ties by label, so `leadingOption` is set on a tie;
    // it is an ordering, not a win.
    const lines = optionSummaryLines(
      DECLARED,
      gate({
        tally: [
          { option: 'Deprecate first', count: 2 },
          { option: 'Keep', count: 2 },
        ],
        leadingOption: 'Deprecate first',
        leadingCount: 2,
        approverCount: 4,
        selectedCount: 4,
        leadingShare: 0.5,
      })
    );
    expect(lines).toContain('  Winner: none — tie at 2 each between "Deprecate first", "Keep"');
    expect(lines).toContain('  Deprecate first: 2');
    expect(lines).toContain('  Keep: 2');
  });

  it('says the leader fell short when the option bar was not cleared', () => {
    const lines = optionSummaryLines(
      DECLARED,
      gate({
        tally: [
          { option: 'Keep', count: 3 },
          { option: 'Delete now', count: 2 },
        ],
        leadingOption: 'Keep',
        leadingCount: 3,
        approverCount: 5,
        selectedCount: 5,
        leadingShare: 0.6,
        threshold: 'supermajority',
      })
    );
    expect(lines).toContain(
      '  Winner: none — leading option "Keep" held 3 of 5 approvers, below the supermajority option bar'
    );
  });

  it('says so when options were declared but the result carries no option tally', () => {
    expect(optionSummaryLines(DECLARED, undefined)).toEqual([
      'Options: declared, but the result carries no option tally',
    ]);
  });
});
