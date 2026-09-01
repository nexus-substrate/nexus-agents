/**
 * Tests for vote command GitHub recording functionality.
 * (Source: Issue #227)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VotingResult } from './vote-types.js';
import type { ConsensusResult, Vote } from '../consensus/types.js';
import type { AgentVoteResult } from './voter-agents.js';

const { safeExecSandboxedMock, executeVotingMock, recordAuthenticVoteMock } = vi.hoisted(() => ({
  safeExecSandboxedMock: vi.fn(),
  executeVotingMock: vi.fn(),
  // Default impl so every describe that does not care about persistence still
  // gets a well-formed outcome back.
  recordAuthenticVoteMock: vi.fn(() => ({
    persisted: true,
    record: { id: 'vote-1', sequence: 7 },
  })),
}));
vi.mock('./sandbox-exec.js', () => ({ safeExecSandboxed: safeExecSandboxedMock }));
// #4135: stub executeVoting so voteCommand exit-code mapping can be driven by a
// fixed response-layer decision (approved / rejected / no_quorum).
vi.mock('../mcp/tools/consensus-vote.js', () => ({ executeVoting: executeVotingMock }));
vi.mock('../mcp/tools/consensus-vote-recording.js', () => ({
  recordAuthenticVote: recordAuthenticVoteMock,
}));

import {
  formatVoteComment,
  formatVoteRow,
  explainOutcome,
  recordVoteToGitHub,
  voteCommand,
} from './vote-command.js';
import { auditLineFor } from './vote-audit-line.js';

function createMockConsensusResult(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  return {
    proposalId: 'test-proposal-id',
    proposal: {
      title: 'CLI Vote',
      description: 'Test proposal',
      algorithm: 'supermajority',
    },
    outcome: 'approved',
    votes: new Map<string, Vote>(),
    voteCounts: { approve: 4, reject: 1, abstain: 0, total: 5 },
    approvalPercentage: 80,
    quorumReached: true,
    startedAt: new Date().toISOString(),
    closedAt: new Date().toISOString(),
    durationMs: 500,
    ...overrides,
  };
}

function createMockVotingResult(overrides: Partial<VotingResult> = {}): VotingResult {
  return {
    proposal: 'Test proposal for feature X',
    threshold: 'supermajority',
    result: createMockConsensusResult(),
    votes: [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'Good design', confidence: 0.9 },
        processingTimeMs: 100,
        source: 'llm',
      },
      {
        role: 'security',
        vote: { decision: 'approve', reasoning: 'Secure', confidence: 0.85 },
        processingTimeMs: 110,
        source: 'llm',
      },
      {
        role: 'devex',
        vote: { decision: 'approve', reasoning: 'Easy to use', confidence: 0.88 },
        processingTimeMs: 95,
        source: 'llm',
      },
      {
        role: 'ai_ml',
        vote: { decision: 'reject', reasoning: 'Concerns', confidence: 0.7 },
        processingTimeMs: 120,
        source: 'llm',
      },
      {
        role: 'pm',
        vote: { decision: 'approve', reasoning: 'Business value', confidence: 0.92 },
        processingTimeMs: 105,
        source: 'llm',
      },
    ],
    totalTimeMs: 530,
    simulateVotes: false,
    ...overrides,
  };
}

describe('formatVoteComment', () => {
  it('should format approved vote result as markdown', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('## Consensus Vote Result');
    expect(comment).toContain('**Result:** ✅ **APPROVED**');
    expect(comment).toContain('supermajority');
    expect(comment).toContain('Test proposal for feature X');
    expect(comment).toContain('| Agent | Decision | Confidence |');
  });

  it('should format rejected vote result with correct emoji', () => {
    const result = createMockVotingResult({
      result: createMockConsensusResult({
        outcome: 'rejected',
        voteCounts: { approve: 1, reject: 4, abstain: 0, total: 5 },
        approvalPercentage: 20,
      }),
    });
    const comment = formatVoteComment(result);

    expect(comment).toContain('**Result:** ❌ **REJECTED**');
  });

  it('should include vote table with all agents', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('| Software Architect | APPROVE |');
    expect(comment).toContain('| Security Engineer | APPROVE |');
    expect(comment).toContain('| Developer Experience | APPROVE |');
    expect(comment).toContain('| AI/ML Engineer | REJECT |');
    expect(comment).toContain('| Product Manager | APPROVE |');
  });

  it('should include confidence percentages', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('90%');
    expect(comment).toContain('85%');
  });

  it('should include vote summary', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('Approve: 4');
    expect(comment).toContain('Reject: 1');
    expect(comment).toContain('Abstain: 0');
    expect(comment).toContain('80.0% approval');
  });

  it('should truncate long proposals', () => {
    const longProposal = 'A'.repeat(300);
    const result = createMockVotingResult({ proposal: longProposal });
    const comment = formatVoteComment(result);

    expect(comment).toContain('A'.repeat(200) + '...');
    expect(comment).not.toContain('A'.repeat(201));
  });

  it('should include protocol attribution', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('CLAUDE.md Consensus Voting Protocol');
  });

  it('should include date in ET timezone', () => {
    const result = createMockVotingResult();
    const comment = formatVoteComment(result);

    expect(comment).toContain('(ET)');
    // Date format should be MM/DD/YYYY
    expect(comment).toMatch(/\*\*Date:\*\* \d{2}\/\d{2}\/\d{4}/);
  });
});

// ============================================================================
// Issue #2441 — fail-closed UX: errors must NOT render as `[sim]`
// ============================================================================

function makeVoteRow(overrides: Partial<AgentVoteResult> = {}): AgentVoteResult {
  return {
    role: 'architect',
    vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
    processingTimeMs: 100,
    source: 'llm',
    ...overrides,
  };
}

// Strip ANSI escape codes so tests don't depend on the active color theme.
function stripAnsi(s: string): string {
  return s.replace(/\[[0-9;]*m/g, '');
}

describe('formatVoteRow reasoning (#5339)', () => {
  const dissent = makeVoteRow({
    role: 'catfish',
    vote: {
      decision: 'reject',
      reasoning: 'Failing closed to high will bury teams in false blocking findings.',
      confidence: 0.85,
    },
  });

  it('omits reasoning by default, keeping the default panel scannable', () => {
    const row = stripAnsi(formatVoteRow(dissent));
    expect(row).not.toContain('Failing closed');
    expect(row).toContain('REJECT');
  });

  it('includes the reasoning when verbose', () => {
    const row = stripAnsi(formatVoteRow(dissent, { verbose: true }));
    // The grounds of a blocking dissent are the one thing a reviewer needs and
    // the CLI already held in memory — generateVoteHash hashes `vote.reasoning`
    // while nothing ever displayed it.
    expect(row).toContain('Failing closed to high will bury teams');
  });

  it('shows reasoning for approvals too, not just dissents', () => {
    const row = stripAnsi(
      formatVoteRow(
        makeVoteRow({
          vote: { decision: 'approve', reasoning: 'Sound fail-closed default.', confidence: 0.9 },
        }),
        { verbose: true }
      )
    );
    expect(row).toContain('Sound fail-closed default.');
  });

  it('does not invent reasoning for an errored voter', () => {
    const row = stripAnsi(
      formatVoteRow(makeVoteRow({ source: 'error', error: 'quota exceeded' }), { verbose: true })
    );
    expect(row).toContain('ERROR');
    expect(row).toContain('quota exceeded');
    // An errored voter produced no judgment; rendering the placeholder
    // reasoning from the vote stub would fabricate one.
    expect(row).not.toContain('ok');
  });
});

describe('formatVoteRow (#2441)', () => {
  it('renders an LLM vote with no badge', () => {
    const row = stripAnsi(formatVoteRow(makeVoteRow({ source: 'llm' })));
    expect(row).not.toContain('[SIMULATED]');
    expect(row).not.toContain('ERROR');
    expect(row).toContain('APPROVE');
  });

  it('renders a simulated vote with the loud red [SIMULATED] badge', () => {
    const row = stripAnsi(formatVoteRow(makeVoteRow({ source: 'simulation' })));
    // Loud, capitalized — NOT the old quiet `[sim]`.
    expect(row).toContain('[SIMULATED]');
    expect(row).not.toMatch(/\[sim\]/);
  });

  it('renders an errored vote as ✗ ERROR with the parsed reason — never as [sim]', () => {
    const row = stripAnsi(formatVoteRow(makeVoteRow({ source: 'error', error: 'Not logged in' })));
    expect(row).toContain('✗');
    expect(row).toContain('ERROR');
    expect(row).toContain('Not logged in');
    // The whole point of #2441: errors must be visually distinct from simulations.
    expect(row).not.toContain('[SIMULATED]');
    expect(row).not.toMatch(/\[sim\]/);
  });

  it('truncates multi-line error reasons to the first line', () => {
    const row = stripAnsi(
      formatVoteRow(makeVoteRow({ source: 'error', error: 'auth failed\nstack trace here' }))
    );
    expect(row).toContain('auth failed');
    expect(row).not.toContain('stack trace');
  });

  it('falls back to "execution failed" when no error message is attached', () => {
    const row = stripAnsi(formatVoteRow(makeVoteRow({ source: 'error' })));
    expect(row).toContain('execution failed');
  });
});

describe('explainOutcome (#2441 + #2442)', () => {
  const baseVotes: readonly AgentVoteResult[] = [
    makeVoteRow({ role: 'architect', source: 'llm' }),
    makeVoteRow({ role: 'security', source: 'error', error: 'Not logged in' }),
    makeVoteRow({ role: 'scope_steward', source: 'error', error: 'MCP closed' }),
  ];

  function ctx(
    overrides: Partial<Parameters<typeof explainOutcome>[0]> = {}
  ): Parameters<typeof explainOutcome>[0] {
    return {
      outcome: 'rejected',
      quorumReached: false,
      errored: 0,
      votes: [] as readonly AgentVoteResult[],
      approvalPercentage: 0,
      threshold: 'supermajority' as const,
      ...overrides,
    };
  }

  // #5362: a vote rejected because the option tally could not be attributed fell
  // through to the threshold arm and printed the APPROVE percentage as the
  // cause — a number that clears the bar it claimed was missed.
  it('names option attribution as the cause, not the approval percentage', () => {
    const explained = stripAnsi(
      explainOutcome(
        ctx({
          quorumReached: true,
          approvalPercentage: 83.3,
          optionGate: {
            reason:
              'Leading option "migrate to registry" took 1 of 5 approvals (20%), below the supermajority bar',
            unattributedApprovals: 4,
            approverCount: 5,
            selectedCount: 1,
          },
        })
      )
    );

    expect(explained).toContain('migrate to registry');
    expect(explained).toContain('4');
    // The approval percentage is the one number that does NOT explain this
    // outcome: 83.3% clears the 67% supermajority bar.
    expect(explained).not.toContain('83.3');
  });

  it('still cites the threshold when the rejection really was the approval bar', () => {
    const explained = stripAnsi(
      explainOutcome(ctx({ quorumReached: true, approvalPercentage: 40 }))
    );
    expect(explained).toContain('threshold not met');
    expect(explained).toContain('40.0');
  });

  it('prefers the quorum explanation over the option one', () => {
    // Ordering matters for the same reason osvCoverageNote's does (#5018): the
    // more specific cause must be checked first or it falls through.
    const explained = stripAnsi(
      explainOutcome(
        ctx({
          quorumReached: false,
          errored: 3,
          votes: [baseVotes[0]] as readonly AgentVoteResult[],
          optionGate: {
            reason: 'should not win',
            unattributedApprovals: 1,
            approverCount: 1,
            selectedCount: 0,
          },
        })
      )
    );
    expect(explained).toContain('quorum not reached');
    expect(explained).not.toContain('should not win');
  });

  it('prefers a bare quorum failure over the option one', () => {
    // The sibling above covers quorum-failed-WITH-errors, which exits at the
    // first arm. This covers the second arm — mutation testing showed nothing
    // exercised it, so moving the option check above it went unnoticed.
    const explained = stripAnsi(
      explainOutcome(
        ctx({
          quorumReached: false,
          errored: 0,
          optionGate: {
            reason: 'should not win',
            unattributedApprovals: 1,
            approverCount: 1,
            selectedCount: 0,
          },
        })
      )
    );
    expect(explained).toContain('quorum not reached');
    expect(explained).not.toContain('should not win');
  });

  it('returns empty string when outcome is approved', () => {
    expect(explainOutcome(ctx({ outcome: 'approved', quorumReached: true }))).toBe('');
  });

  it('explains "quorum not reached" with errored-voter count when applicable', () => {
    const explained = stripAnsi(
      explainOutcome(ctx({ quorumReached: false, errored: 2, votes: baseVotes }))
    );
    expect(explained).toContain('quorum not reached');
    expect(explained).toContain('2 of 3 voter(s) failed');
    expect(explained).toContain('1 vote(s) recorded');
  });

  it('explains "quorum not reached" without error count when no voters errored', () => {
    const explained = stripAnsi(explainOutcome(ctx({ quorumReached: false, errored: 0 })));
    expect(explained).toContain('quorum not reached');
    expect(explained).not.toContain('voter(s) failed');
  });

  it('explains threshold-not-met when quorum reached but rejected (#2442)', () => {
    // The original report: "Approval: 100% / Result: REJECTED" with no
    // explanation. After this fix, the result line names the threshold and
    // the actual approval that fell short of it.
    const explained = stripAnsi(
      explainOutcome(
        ctx({ quorumReached: true, approvalPercentage: 60, threshold: 'supermajority' })
      )
    );
    expect(explained).toContain('supermajority threshold not met');
    expect(explained).toContain('60.0%');
    // Must NOT collapse to the empty string the way the pre-#2442 code did.
    expect(explained.length).toBeGreaterThan(0);
  });

  it('formats unanimous threshold rejection cleanly', () => {
    const explained = stripAnsi(
      explainOutcome(ctx({ quorumReached: true, approvalPercentage: 80, threshold: 'unanimous' }))
    );
    expect(explained).toContain('unanimous threshold not met');
    expect(explained).toContain('80.0%');
  });
});

// #2863 (audit #2824 bullet 10): the comment body must be piped to `gh` via
// stdin, never embedded in the command string — every vote comment contains a
// markdown table (`|`) and a `(NN% approval)` parenthetical, which the sandbox
// `validateArgs` gate rejects, silently dropping the comment.
describe('recordVoteToGitHub', () => {
  beforeEach(() => {
    safeExecSandboxedMock.mockReset();
  });

  it('pipes the comment via --body-file - stdin, not an inline --body arg', () => {
    safeExecSandboxedMock.mockReturnValue('commented');

    recordVoteToGitHub(42, createMockVotingResult());

    expect(safeExecSandboxedMock).toHaveBeenCalledWith(
      'gh issue comment 42 --body-file -',
      expect.objectContaining({
        context: 'gh',
        stdin: expect.stringContaining('## Consensus Vote Result') as string,
      })
    );
  });

  it('keeps shell-unsafe characters out of the command string', () => {
    safeExecSandboxedMock.mockReturnValue('commented');

    recordVoteToGitHub(7, createMockVotingResult());

    const commandString = safeExecSandboxedMock.mock.calls[0]?.[0] as string;
    // The body (which contains `|`, `(`, `)`) lives in stdin, not the command.
    expect(commandString).not.toMatch(/[|()]/);
  });
});

describe('formatVoteComment — no_quorum labeling (#4135)', () => {
  it('labels a no_quorum decision distinctly (not APPROVED/REJECTED)', () => {
    // Engine outcome stays 'rejected' (2-valued); the decision is the void.
    const result = createMockVotingResult({
      result: createMockConsensusResult({ outcome: 'rejected' }),
    });
    const comment = formatVoteComment(result, 'no_quorum');
    expect(comment).toContain('NO QUORUM');
    expect(comment).not.toContain('**REJECTED**');
    expect(comment).not.toContain('**APPROVED**');
  });

  it('falls back to the engine outcome label when no decision is passed (back-compat)', () => {
    const result = createMockVotingResult();
    expect(formatVoteComment(result)).toContain('**APPROVED**');
  });
});

describe('voteCommand — exit-code mapping for no_quorum (#4135)', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function extendedResult(decision: string) {
    return {
      proposal: 'p',
      threshold: 'simple_majority',
      result: createMockConsensusResult({ outcome: 'rejected' }),
      votes: [],
      totalTimeMs: 5,
      simulateVotes: false,
      strategy: 'simple_majority',
      decision,
    };
  }

  beforeEach(() => {
    executeVotingMock.mockReset();
    safeExecSandboxedMock.mockReset();
  });

  it('default (fail) → exit 1 on a no_quorum (back-compat)', async () => {
    executeVotingMock.mockResolvedValue(extendedResult('no_quorum'));
    const code = await voteCommand({ proposal: 'p' });
    expect(code).toBe(1);
  });

  it('--on-no-quorum=exit2 → distinct exit 2 on a no_quorum', async () => {
    executeVotingMock.mockResolvedValue(extendedResult('no_quorum'));
    const code = await voteCommand({ proposal: 'p', onNoQuorum: 'exit2' });
    expect(code).toBe(2);
  });

  it('--on-no-quorum=retry → re-runs the vote once, then falls to exit 1', async () => {
    executeVotingMock.mockResolvedValue(extendedResult('no_quorum'));
    const code = await voteCommand({ proposal: 'p', onNoQuorum: 'retry' });
    expect(code).toBe(1);
    // 1 initial run + 1 retry.
    expect(executeVotingMock).toHaveBeenCalledTimes(2);
  });

  it('an approved decision → exit 0 regardless of policy', async () => {
    executeVotingMock.mockResolvedValue(extendedResult('approved'));
    expect(await voteCommand({ proposal: 'p', onNoQuorum: 'exit2' })).toBe(0);
  });

  it('a rejected decision → exit 1 (unchanged)', async () => {
    executeVotingMock.mockResolvedValue(extendedResult('rejected'));
    expect(await voteCommand({ proposal: 'p', onNoQuorum: 'exit2' })).toBe(1);
  });
});

// =============================================================================
// The CLI writes its own audit record (#4924)
// =============================================================================

/** A minimal `persisted: true` outcome; only `id` and `sequence` are read. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function persistedOutcome() {
  return { persisted: true, record: { id: 'vote-1', sequence: 7 } } as unknown as Parameters<
    typeof auditLineFor
  >[0];
}

describe('voteCommand persists to the audit chain (#4924)', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function extendedResult(decision: string) {
    return {
      proposal: 'p',
      threshold: 'supermajority',
      result: createMockConsensusResult({ outcome: 'approved' }),
      votes: [],
      totalTimeMs: 5,
      simulateVotes: false,
      strategy: 'higher_order',
      decision,
    };
  }

  beforeEach(() => {
    executeVotingMock.mockReset();
    recordAuthenticVoteMock.mockReset();
    recordAuthenticVoteMock.mockReturnValue(
      persistedOutcome() as unknown as {
        persisted: boolean;
        record: { id: string; sequence: number };
      }
    );
  });

  it('records the vote', () => {
    // `persistVoteRecord` had exactly one caller — the MCP tool — so every
    // decision made at a terminal was absent from the tamper-evident chain
    // while `verify_audit_chain` reported it intact.
    executeVotingMock.mockResolvedValue(extendedResult('approved'));

    return voteCommand({ proposal: 'p' }).then(() => {
      expect(recordAuthenticVoteMock).toHaveBeenCalledTimes(1);
    });
  });

  it('records the strategy that was actually applied, not the CLI display value', async () => {
    // The CLI narrows `ExtendedVotingResult` to the base view for printing,
    // which drops `strategy`. Recording the printed `threshold` instead would
    // put `supermajority` in the chain for a `higher_order` run.
    executeVotingMock.mockResolvedValue(extendedResult('approved'));

    await voteCommand({ proposal: 'p' });

    const firstCall = recordAuthenticVoteMock.mock.calls[0] as unknown[] | undefined;
    expect(firstCall?.[0]).toMatchObject({ strategy: 'higher_order' });
  });

  it('records a rejection too', async () => {
    // A rejected vote is a decision. Recording only approvals would make the
    // chain a record of what passed rather than of what was decided.
    executeVotingMock.mockResolvedValue(extendedResult('rejected'));

    await voteCommand({ proposal: 'p' });

    expect(recordAuthenticVoteMock).toHaveBeenCalledTimes(1);
  });

  it('does not record a dry run', async () => {
    // Simulated votes must never seed governance (#2319). The recorder skips
    // them on its own; not calling it at all keeps the CLI from printing a
    // persistence line for a vote that never happened.
    executeVotingMock.mockResolvedValue({ ...extendedResult('approved'), simulateVotes: true });

    await voteCommand({ proposal: 'p', dryRun: true });

    expect(recordAuthenticVoteMock).not.toHaveBeenCalled();
  });
});

describe('auditLineFor (#4924)', () => {
  it('names the sequence when the record was written', () => {
    expect(auditLineFor(persistedOutcome())).toContain('7');
  });

  it('says a write failure out loud rather than staying silent', () => {
    const line = auditLineFor({
      persisted: false,
      reason: 'write-failed',
      detail: 'data dir unwritable at /x',
    });

    expect(line).toMatch(/not recorded/i);
    expect(line).toContain('/x');
  });

  it('distinguishes a skipped simulation from a failure', () => {
    // Both are `persisted: false`. Collapsing them would report a deliberate
    // skip in the same alarming words as an unwritable data dir — the
    // `not.toMatch` is what catches that, and a weaker one on /failed/ did
    // not, since the failure line says "NOT recorded" rather than "failed".
    const line = auditLineFor({
      persisted: false,
      reason: 'all-simulated',
      detail: 'simulated',
    });

    expect(line).toMatch(/simulat/i);
    expect(line).not.toMatch(/NOT recorded/i);
  });
});

// =============================================================================
// Multi-option votes from the CLI (#4941)
// =============================================================================

describe('voteCommand forwards options to the engine (#4941)', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function extendedResult() {
    return {
      proposal: 'p',
      threshold: 'simple_majority',
      result: createMockConsensusResult({ outcome: 'approved' }),
      votes: [],
      totalTimeMs: 5,
      simulateVotes: false,
      strategy: 'simple_majority',
      decision: 'approved',
    };
  }

  beforeEach(() => {
    executeVotingMock.mockReset();
    executeVotingMock.mockResolvedValue(extendedResult());
    recordAuthenticVoteMock.mockClear();
  });

  it('passes the declared alternatives through', async () => {
    // Without this the engine records `optionTally: null` and the decision
    // cannot say which of A/B/C the panel chose — verified on two real votes
    // before this flag existed.
    await voteCommand({ proposal: 'pick one', options: ['A', 'B'] });

    const input = executeVotingMock.mock.calls[0]?.[0] as { options?: string[] } | undefined;
    expect(input?.options).toEqual(['A', 'B']);
  });

  it('omits the field entirely for an ordinary vote', async () => {
    // The pair, and it matters: the engine treats a PRESENT `options` array as
    // "this is a multi-option vote" and applies the leading-option bar on top
    // of the approve/reject one. Sending an empty array would change the
    // threshold semantics of every yes/no vote.
    await voteCommand({ proposal: 'ship it' });

    const input = executeVotingMock.mock.calls[0]?.[0] as { options?: string[] } | undefined;
    expect(input).not.toHaveProperty('options');
  });
});

// =============================================================================
// A voided vote is recorded as a void, not a rejection (#4953)
// =============================================================================

describe('voteCommand records an error-policy void correctly (#4953)', () => {
  // #4925 added the CLI audit record and passed four fields, omitting
  // `errorVoided`. `outcomeToDecision` then reads it as false and returns
  // `rejected` — the CLI prints `no_quorum` and the chain disagrees.
  //
  // Every test in #4925 asserted what was passed TO the mocked recorder, so
  // the one field missing from the call was the one field no assertion
  // mentioned. These assert it explicitly.
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function voidedResult() {
    return {
      proposal: 'p',
      threshold: 'unanimous',
      result: createMockConsensusResult({ outcome: 'rejected' }),
      votes: [],
      totalTimeMs: 5,
      simulateVotes: false,
      strategy: 'unanimous',
      decision: 'no_quorum',
      policyReason: 'fail_closed: 4 voters errored',
    };
  }

  beforeEach(() => {
    executeVotingMock.mockReset();
    recordAuthenticVoteMock.mockClear();
  });

  it('flags the record as voided when an error policy short-circuited', async () => {
    executeVotingMock.mockResolvedValue(voidedResult());

    await voteCommand({ proposal: 'p' });

    const call = recordAuthenticVoteMock.mock.calls[0] as unknown[] | undefined;
    expect(call?.[0]).toMatchObject({ errorVoided: true });
  });

  it('does not flag an ordinary rejection as voided', async () => {
    // The pair. Always-true would make every genuine rejection read as a void,
    // which is the same conflation in the other direction.
    executeVotingMock.mockResolvedValue({ ...voidedResult(), policyReason: undefined });

    await voteCommand({ proposal: 'p' });

    const call = recordAuthenticVoteMock.mock.calls[0] as unknown[] | undefined;
    expect(call?.[0]).toMatchObject({ errorVoided: false });
  });
});
