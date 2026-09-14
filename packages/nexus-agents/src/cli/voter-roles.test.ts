/**
 * `cli/voter-roles` (#6000 step 1) — who sits on a consensus panel, imported
 * DIRECTLY from the governed module.
 *
 * `getVoterRoles` was module-private in `mcp/tools/consensus-vote.ts`; this is
 * its first direct test. The catfish assertion is the load-bearing one: the
 * `absolute_quorum` verdict requires the contrarian on the full panel, and
 * quick mode is the documented carve-out.
 */

import { describe, it, expect } from 'vitest';
import { VOTER_ROLES, getVoterRoles, type VoterRole } from './voter-roles.js';
import { VOTER_ROLES as fromVoteTypes } from './vote-types.js';

const ALL_ROLES: readonly VoterRole[] = [
  'architect',
  'security',
  'devex',
  'ai_ml',
  'pm',
  'catfish',
  'scope_steward',
];

describe('cli/voter-roles (#6000 step 1)', () => {
  it('describes every role, and only those roles', () => {
    expect(Object.keys(VOTER_ROLES).sort()).toEqual([...ALL_ROLES].sort());
    for (const role of ALL_ROLES) {
      expect(VOTER_ROLES[role].length).toBeGreaterThan(0);
    }
  });

  it('the full panel is the seven roles with the contrarian seated', () => {
    const full = getVoterRoles(false);
    expect(full).toEqual(ALL_ROLES);
    expect(full).toContain('catfish');
    expect(new Set(full).size).toBe(full.length);
  });

  it('the quick panel is three seats without the contrarian (the #4132 carve-out)', () => {
    const quick = getVoterRoles(true);
    expect(quick).toEqual(['architect', 'security', 'scope_steward']);
    expect(quick).not.toContain('catfish');
    for (const role of quick) expect(ALL_ROLES).toContain(role);
  });

  it('the previous home re-exports the SAME table, not a copy', () => {
    expect(fromVoteTypes).toBe(VOTER_ROLES);
  });
});
