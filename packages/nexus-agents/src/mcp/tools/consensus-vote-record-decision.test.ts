/**
 * Tests for narrowing a response decision to the audit record's vocabulary
 * (#4986).
 *
 * @module mcp/tools/consensus-vote-record-decision.test
 */

import { describe, it, expect } from 'vitest';

import { toRecordDecision } from './consensus-vote-types.js';

describe('toRecordDecision (#4986)', () => {
  it('passes the three record-vocabulary values through', () => {
    expect(toRecordDecision('approved')).toBe('approved');
    expect(toRecordDecision('rejected')).toBe('rejected');
    expect(toRecordDecision('no_quorum')).toBe('no_quorum');
  });

  it('records a timeout as no_quorum, not as a rejection', () => {
    // A panel that ran out of time gave no verdict. Calling it `rejected`
    // attributes one to voters who never voted.
    expect(toRecordDecision('timeout')).toBe('no_quorum');
  });

  it('has no record decision for a vote still in flight', () => {
    // `undefined` means "fall back to derivation", the honest answer for a vote
    // with no decision yet — inventing one would be worse than falling back.
    expect(toRecordDecision('pending')).toBeUndefined();
    expect(toRecordDecision(undefined)).toBeUndefined();
  });
});
