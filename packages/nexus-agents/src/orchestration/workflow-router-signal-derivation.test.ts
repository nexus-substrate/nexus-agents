/**
 * Routing-accuracy eval for goal-text → structural-signal derivation (#3989).
 *
 * A labeled goal→expected-pattern set proving that consensus/wave goals reach the
 * richer strategy via AUTO selection (no caller hints / forceStrategy), plus the
 * false-positive guards that keep coding tasks mentioning the words from tripping it.
 */

import { describe, it, expect } from 'vitest';

import { createWorkflowRouter } from './workflow-router.js';
import { deriveStructuralSignals } from './workflow-router-signal-derivation.js';
import type { TaskSignals } from './workflow-router-types.js';

function patternFor(description: string): string {
  return createWorkflowRouter().route({ description }).pattern;
}

describe('deriveStructuralSignals (#3989) — pure derivation', () => {
  it('fills requiresConsensus from a named consensus process', () => {
    const out = deriveStructuralSignals({ description: 'hold a consensus vote on the DB choice' });
    expect(out.requiresConsensus).toBe(true);
  });

  it('fills dependencyStructure=independent from a named wave/decomposition', () => {
    const out = deriveStructuralSignals({ description: 'run a multi-agent wave over these files' });
    expect(out.dependencyStructure).toBe('independent');
  });

  it('NEVER overrides a caller-provided signal (authoritative escape hatch)', () => {
    const explicitFalse: TaskSignals = {
      description: 'hold a consensus vote on adopting GraphQL',
      requiresConsensus: false,
    };
    expect(deriveStructuralSignals(explicitFalse).requiresConsensus).toBe(false);

    const explicitDep: TaskSignals = {
      description: 'split into independent subtasks',
      dependencyStructure: 'linear',
    };
    expect(deriveStructuralSignals(explicitDep).dependencyStructure).toBe('linear');
  });
});

describe('routing-accuracy eval (#3989) — named consensus process → consensus', () => {
  it.each([
    'hold a consensus vote on the database choice',
    'we need a consensus decision on the API redesign',
    'do a multi-perspective review of the auth rewrite',
  ])('routes "%s" to consensus', (goal) => {
    expect(patternFor(goal)).toBe('consensus');
  });
});

describe('routing-accuracy eval (#3989) — named wave/decomposition → wave', () => {
  it.each([
    'run a multi-agent wave over these modules',
    'decompose into independent subtasks',
    'dispatch a wave of agents to audit each service',
  ])('routes "%s" to wave', (goal) => {
    expect(patternFor(goal)).toBe('wave');
  });
});

describe('routing-accuracy eval (#3989) — false-positive guards (must NOT over-route)', () => {
  // The #3989 review's realistic over-trigger cases — these are ordinary dev goals
  // that merely mention the words and MUST NOT be sent to an expensive panel/wave.
  it.each([
    'fix the consensus engine bug in engine.ts',
    'implement the consensus voting algorithm',
    'reach consensus on the leader election in raft.ts',
    'let users vote on posts',
    'add an upvote/downvote button on comments',
    'should we use a Map or an array here',
    'should we adopt GraphQL or REST?',
    'document the API from multiple perspectives',
    // #3989 review residuals — code nouns with no decision-subject preposition:
    'add a consensus vote endpoint',
    'persist the consensus decision to the raft log',
  ])('does NOT route "%s" to consensus', (goal) => {
    expect(patternFor(goal)).not.toBe('consensus');
  });

  it.each([
    'implement parallel array processing',
    'load these rows in parallel for latency',
    'fan out the API calls to all shards',
    'parallelize the hot loop in image.ts',
    // #3989 review residuals — self-referential maintenance goals in this repo:
    'fix the wave scheduler retry bug',
    'optimize wave execution latency',
    'fan out to workers for the image resize',
  ])('does NOT route "%s" to wave', (goal) => {
    expect(patternFor(goal)).not.toBe('wave');
  });
});
