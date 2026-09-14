/**
 * Seam test (#6172): the verdict an UNGOVERNED caller emits is the verdict the
 * GOVERNED decision functions compute for the same inputs.
 *
 * After #6000 steps 1–3 the pure decision computation (`consensus/decision/`,
 * `cli/voter-roles.ts`) is a governor path and the #6166 lint gate keeps
 * verdict sites from reaching the governed symbols through a legacy home. What
 * no static probe covers: a caller that still imports the governed functions
 * and then ignores their answer — returns its own `approved`, short-circuits
 * the verdict, or stops calling `resolveVoteDecision`. This file lives INSIDE
 * the governed directory so weakening it is itself a governor-path change.
 *
 * Two seams, both driven with fixture tallies and no live adapter:
 *
 * 1. `ConsensusEngine.close()` (`consensus/engine.ts` → `result-builder.ts` →
 *    the strategy classes). Emitted: `ConsensusResult.outcome`. Governed:
 *    `determineFinalStatus(quorum, evaluateThreshold(approve, approve+reject,
 *    VOTING_THRESHOLDS[algorithm], mode).approved)`.
 * 2. `executeVoting()` + `buildResponse()` (`mcp/tools/consensus-vote.ts`,
 *    `consensus-vote-error-policy.ts`, `consensus-vote-option-gate.ts`,
 *    `consensus-vote-types.ts`), with `collectRealVotes` canned. Emitted: the
 *    `decision` stamp pipeline consumers read AND the MCP response's
 *    `decision`. Governed: `resolveVoteDecision(input, governedResult,
 *    errorCount)` over the seam-1 verdict.
 *
 * What the seam does NOT cover: the MCP transport above `executeVoting`
 * (`handleConsensusVote`, the secure handler, async dispatch, the vote-record
 * ledger) — the response is built by the same `buildResponse` this file calls,
 * but the tool registration is not driven here. The option gate's bar lives in
 * `consensus/option-tally.ts` as its own literal; the declared-options row pins
 * it to `VOTING_THRESHOLDS` at one fixture point (3 of 5 under supermajority).
 *
 * Quorum (#6180). The engine's `quorumReached` used to be taken from the
 * caller as an INPUT to the expected side, so a caller that hardcoded it true
 * still matched. It is now DERIVED from the fixture through the governed
 * `isQuorumReached(seats that reached the engine, DEFAULT_MIN_VOTERS_FOR_QUORUM)`
 * and asserted against the emitted flag at both seams. Seam 1 is driven on
 * both sides of the bar (one answering seat vs two). Seam 2 cannot be: the
 * real producer returns one seat per requested role, the `>50%` error floor
 * short-circuits before the engine runs, and any panel that is NOT
 * short-circuited has at least `ceil(N/2) >= 2` seats reaching the engine —
 * so at the tool the engine's bar is unreachable behind the error floor, and
 * the below-quorum rows land there as a short-circuit (`no_quorum`), which
 * the seam also pins.
 *
 * Every expected value is COMPUTED by the governed functions from the fixture
 * tally — no verdict and no bar appears as a literal on the expected side. The
 * `straddles every bar` test proves the paired rows sit on opposite sides, so
 * a row cannot pass vacuously by agreeing with a constant caller.
 *
 * @module consensus/decision/governed-verdict-seam.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import type { ILogger } from '../../core/index.js';
import type { ConsensusAlgorithm, ProposalStatus, Vote } from '../types-core.js';

const collectRealVotesMock =
  vi.fn<(opts: { roles: readonly VoterRole[] }) => Promise<readonly AgentVoteResult[]>>();
vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { roles: readonly VoterRole[] }): Promise<readonly AgentVoteResult[]> =>
    collectRealVotesMock(opts),
}));

// --- the governed side (this directory + cli/voter-roles.ts) ---
import { ERROR_FLOOR_FRACTION, VOTING_THRESHOLDS } from './thresholds.js';
import { getDefaultErrorPolicy, resolveStrategy, strategyToAlgorithm } from './strategy.js';
import { DEFAULT_MIN_VOTERS_FOR_QUORUM, isQuorumReached } from './quorum.js';
import { determineFinalStatus, evaluateThreshold, resolveVoteDecision } from './verdict.js';
import { getVoterRoles } from '../../cli/voter-roles.js';

// --- the ungoverned callers under test ---
import { createConsensusEngine } from '../engine.js';
import { executeVoting, resetCorrelationTracker } from '../../mcp/tools/consensus-vote.js';
import {
  buildResponse,
  type ConsensusVoteInput,
  type ErrorPolicy,
  type ExtendedVotingResult,
  type VoteDecisionStatus,
  type VotingStrategy,
} from '../../mcp/tools/consensus-vote-types.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

const logger: ILogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as ILogger;

// ============================================================================
// Fixture table — a tally on each side of every bar
// ============================================================================

interface SeamRow {
  readonly name: string;
  readonly strategy: VotingStrategy;
  /** Seats that approve, in panel order after none. */
  readonly approve: number;
  /** Seats that reject, after the approvers. */
  readonly reject: number;
  /** Seats that errored (`source: 'error'`), after the rejecters. */
  readonly errored: number;
  /** Omitted → the governed `getDefaultErrorPolicy(strategy)`. */
  readonly errorPolicy?: ErrorPolicy;
  /** Declared options and, per approver in order, the option each selected. */
  readonly options?: { readonly declared: readonly string[]; readonly picks: readonly string[] };
}

const ROWS: readonly SeamRow[] = [
  { name: 'supermajority 4/7', strategy: 'supermajority', approve: 4, reject: 3, errored: 0 },
  { name: 'supermajority 5/7', strategy: 'supermajority', approve: 5, reject: 2, errored: 0 },
  { name: 'simple_majority 3/7', strategy: 'simple_majority', approve: 3, reject: 4, errored: 0 },
  { name: 'simple_majority 4/7', strategy: 'simple_majority', approve: 4, reject: 3, errored: 0 },
  { name: 'unanimous 6/7', strategy: 'unanimous', approve: 6, reject: 1, errored: 0 },
  { name: 'unanimous 7/7', strategy: 'unanimous', approve: 7, reject: 0, errored: 0 },
  {
    name: 'absolute_quorum with one errored seat',
    strategy: 'supermajority',
    approve: 6,
    reject: 0,
    errored: 1,
    errorPolicy: 'absolute_quorum',
  },
  {
    name: 'reduce_denominator with the same errored seat',
    strategy: 'supermajority',
    approve: 6,
    reject: 0,
    errored: 1,
    errorPolicy: 'reduce_denominator',
  },
  {
    name: 'declared options, leading share below the bar',
    strategy: 'supermajority',
    approve: 5,
    reject: 2,
    errored: 0,
    options: { declared: ['A', 'B'], picks: ['A', 'A', 'A', 'B', 'B'] },
  },
  // #6180: the engine's quorum bar. One answering seat is below
  // `DEFAULT_MIN_VOTERS_FOR_QUORUM`; two is at it. Neither is a tally
  // question — 1/1 and 2/2 both clear every ratio bar — so the verdicts
  // differ at seam 1 only through the quorum. At seam 2 both rows exceed the
  // error floor and short-circuit before the engine runs (see the header).
  {
    name: 'quorum: one seat answered',
    strategy: 'supermajority',
    approve: 1,
    reject: 0,
    errored: 6,
  },
  {
    name: 'quorum: two seats answered',
    strategy: 'supermajority',
    approve: 2,
    reject: 0,
    errored: 5,
  },
];

/**
 * The pairs the table must straddle: same bar, opposite governed verdicts.
 * `tool` pairs differ in the seam-2 decision (`resolveVoteDecision` over the
 * option-gated engine verdict); the `engine` pair differs in the seam-1
 * verdict alone — at the tool both of its rows short-circuit to the same
 * `no_quorum` (#6180), so the engine verdict is the only place it straddles.
 */
const STRADDLE_PAIRS: ReadonlyArray<readonly [string, string, 'tool' | 'engine']> = [
  ['supermajority 4/7', 'supermajority 5/7', 'tool'],
  ['simple_majority 3/7', 'simple_majority 4/7', 'tool'],
  ['unanimous 6/7', 'unanimous 7/7', 'tool'],
  [
    'absolute_quorum with one errored seat',
    'reduce_denominator with the same errored seat',
    'tool',
  ],
  ['declared options, leading share below the bar', 'supermajority 5/7', 'tool'],
  ['quorum: one seat answered', 'quorum: two seats answered', 'engine'],
];

const FULL_PANEL = getVoterRoles(false);

function inputFor(row: SeamRow): ConsensusVoteInput {
  return {
    proposal: `seam fixture: ${row.name}`,
    strategy: row.strategy,
    quickMode: false,
    simulateVotes: false,
    project: 'nexus-agents',
    ...(row.errorPolicy !== undefined ? { errorPolicy: row.errorPolicy } : {}),
    ...(row.options !== undefined ? { options: [...row.options.declared] } : {}),
  };
}

function fixtureVote(decision: Vote['decision']): Vote {
  return { decision, confidence: 0.9, reasoning: `fixture ${decision}` };
}

/** The panel as `collectRealVotes` would return it: approvers, rejecters, then errored seats. */
function seatsFor(row: SeamRow): readonly AgentVoteResult[] {
  const seatCount = row.approve + row.reject + row.errored;
  if (seatCount !== FULL_PANEL.length) {
    throw new Error(`row "${row.name}" seats ${String(seatCount)} of ${String(FULL_PANEL.length)}`);
  }
  return FULL_PANEL.map((role, i): AgentVoteResult => {
    if (i < row.approve) {
      const pick = row.options?.picks[i];
      return {
        role,
        vote: fixtureVote('approve'),
        processingTimeMs: 1,
        source: 'llm',
        ...(pick !== undefined ? { selectedOption: pick } : {}),
      };
    }
    if (i < row.approve + row.reject) {
      return { role, vote: fixtureVote('reject'), processingTimeMs: 1, source: 'llm' };
    }
    return { role, vote: fixtureVote('abstain'), processingTimeMs: 1, source: 'error' };
  });
}

// ============================================================================
// The governed expectation, composed from the fixture — never a literal
// ============================================================================

/**
 * The comparison mode of the strategy class that stayed outside the governed
 * directory (#6160 map): `>=` for supermajority, strict `>` for simple
 * majority; unanimous is `>=` against its bar. A mode, not a bar — every bar
 * below is read from `VOTING_THRESHOLDS`.
 */
function inclusiveFor(algorithm: ConsensusAlgorithm): boolean {
  return algorithm !== 'simple_majority';
}

function algorithmFor(row: SeamRow): ConsensusAlgorithm {
  return strategyToAlgorithm(resolveStrategy(inputFor(row)));
}

/**
 * Seam 1 drives the engine directly and an errored seat never votes, so the
 * seats the engine counts toward quorum are the ones that answered.
 */
function seatsAtEngineSeam(row: SeamRow): number {
  return row.approve + row.reject;
}

/**
 * Seam 2: the seats `applyErrorPolicy` (ungoverned,
 * `consensus-vote-error-policy.ts`) hands the engine, stated from its contract
 * so the expected side is a function of the fixture and the governed bars
 * alone: none when errors exceed `ERROR_FLOOR_FRACTION` or `fail_closed` sees
 * any error (the vote short-circuits before the engine runs); every seat under
 * `count_as_abstain` and `absolute_quorum` (errors become abstentions and stay
 * in the panel); the non-errored seats under `reduce_denominator`.
 */
function seatsAtToolSeam(row: SeamRow): number {
  const seats = row.approve + row.reject + row.errored;
  const policy = row.errorPolicy ?? getDefaultErrorPolicy(row.strategy);
  if (row.errored / seats > ERROR_FLOOR_FRACTION) return 0;
  if (policy === 'fail_closed' && row.errored > 0) return 0;
  if (policy === 'count_as_abstain' || policy === 'absolute_quorum') return seats;
  return seats - row.errored;
}

/**
 * The governed quorum over the seats that reached the engine. Both seams
 * construct the engine with no config (`createConsensusEngine()`), so the bar
 * is the governed default — a caller that lowered it would fail the
 * `quorum: one seat answered` row at seam 1.
 */
function governedQuorum(seatsAtEngine: number): boolean {
  return isQuorumReached(seatsAtEngine, DEFAULT_MIN_VOTERS_FOR_QUORUM);
}

/** Seam 1: the engine-level verdict the governed functions compute for the tally. */
function governedEngineVerdict(
  row: SeamRow,
  quorumReached: boolean,
  withOptionGate: boolean
): ProposalStatus {
  const algorithm = algorithmFor(row);
  const bar = VOTING_THRESHOLDS[algorithm];
  const mode = inclusiveFor(algorithm);
  const respondents = row.approve + row.reject;
  // `evaluateThreshold` defines no ratio over zero respondents (the guard is
  // the strategy's, outside this directory); a panel of none approves nothing.
  let approved = respondents > 0 && evaluateThreshold(row.approve, respondents, bar, mode).approved;
  if (withOptionGate && row.options !== undefined) {
    // #4472: the leading option must clear the SAME bar over the approvers.
    const counts = new Map<string, number>();
    for (const pick of row.options.picks) counts.set(pick, (counts.get(pick) ?? 0) + 1);
    const leading = Math.max(0, ...counts.values());
    approved = approved && evaluateThreshold(leading, row.approve, bar, mode).approved;
  }
  return determineFinalStatus(quorumReached, approved);
}

/**
 * Seam 2: the response-level decision, computed by `resolveVoteDecision` over
 * a result whose engine outcome is the seam-1 governed verdict and whose seats
 * are the fixture's. Only the fields the governed function reads are taken from
 * the fixture; the rest of the shape is the caller's. `policyReason` rides
 * along from the caller: no row short-circuits, and the row test pins it
 * `undefined` before calling this.
 */
function governedToolDecision(row: SeamRow, emitted: ExtendedVotingResult): VoteDecisionStatus {
  const governedResult: ExtendedVotingResult = {
    ...emitted,
    votes: seatsFor(row),
    strategy: resolveStrategy(inputFor(row)),
    panelSize: FULL_PANEL.length,
    contrarianRequested: FULL_PANEL.includes('catfish'),
    result: {
      ...emitted.result,
      quorumReached: governedQuorum(seatsAtToolSeam(row)),
      outcome: governedEngineVerdict(row, governedQuorum(seatsAtToolSeam(row)), true),
    },
  };
  return resolveVoteDecision(inputFor(row), governedResult, row.errored).decision;
}

// ============================================================================
// Seam 1 — the real engine
// ============================================================================

async function closeThroughEngine(
  row: SeamRow
): Promise<{ outcome: string; quorumReached: boolean }> {
  const engine = createConsensusEngine(undefined, logger);
  const proposed = await engine.propose({
    title: row.name,
    description: `seam fixture: ${row.name}`,
    algorithm: algorithmFor(row),
  });
  if (!proposed.ok) throw proposed.error;
  // The engine never sees an errored seat: the error policy shapes them out
  // (seam 2). Only the seats that answered vote here.
  for (const seat of seatsFor(row)) {
    if (seat.source === 'error') continue;
    const voted = await engine.vote(proposed.value, seat.role, seat.vote);
    if (!voted.ok) throw voted.error;
  }
  const closed = await engine.close(proposed.value);
  if (!closed.ok) throw closed.error;
  return { outcome: closed.value.outcome, quorumReached: closed.value.quorumReached };
}

describe('seam 1: ConsensusEngine.close() emits the governed verdict (#6172)', () => {
  it.each(ROWS)('$name', async (row) => {
    const emitted = await closeThroughEngine(row);
    // #6180: the quorum is derived from the seats that voted, never read back
    // from the caller — a close path that hardcodes it fails the one-seat row.
    const quorum = governedQuorum(seatsAtEngineSeam(row));
    expect(emitted.quorumReached).toBe(quorum);
    // The engine knows nothing of declared options; that gate is seam 2's.
    expect(emitted.outcome).toBe(governedEngineVerdict(row, quorum, false));
  });

  it('the empty case: zero votes close as the governed no-approval verdict', async () => {
    const engine = createConsensusEngine(undefined, logger);
    const proposed = await engine.propose({
      title: 'empty',
      description: 'seam fixture: zero votes',
      algorithm: 'supermajority',
    });
    if (!proposed.ok) throw proposed.error;
    const closed = await engine.close(proposed.value);
    if (!closed.ok) throw closed.error;
    // `evaluateThreshold` defines no ratio over zero respondents (the guard is
    // the strategy's, outside this directory), so the governed statement of
    // the empty case is: nothing approved, and a panel of none has no quorum.
    expect(closed.value.quorumReached).toBe(governedQuorum(0));
    expect(closed.value.outcome).toBe(determineFinalStatus(governedQuorum(0), false));
    expect(closed.value.outcome).not.toBe('approved');
  });
});

// ============================================================================
// Seam 2 — the real consensus_vote result path
// ============================================================================

describe('seam 2: executeVoting + buildResponse emit the governed decision (#6172)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-governed-seam-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetCorrelationTracker();
    collectRealVotesMock.mockReset();
  });

  afterEach(() => {
    if (originalDataDir === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DATA_DIR');
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetCorrelationTracker();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each(ROWS)('$name', async (row) => {
    collectRealVotesMock.mockResolvedValue(seatsFor(row));
    const input = inputFor(row);

    const emitted = await executeVoting(input, logger);
    const response = buildResponse(input, emitted);

    // The full 7-seat panel was requested and answered by the fixture.
    expect(collectRealVotesMock).toHaveBeenCalledTimes(1);
    expect(collectRealVotesMock.mock.calls[0]?.[0].roles).toEqual(FULL_PANEL);
    // The errored seats reached the result intact, and the vote reached the
    // engine exactly when the fixture says it should: a row over the error
    // floor is a short-circuit (`policyReason` set, the engine never ran, and
    // the synthetic result lists the responding seats per #3124 rather than
    // an engine tally); every other row reaches the engine with exactly the
    // seats the policy hands it.
    expect(emitted.votes.filter((v) => v.source === 'error')).toHaveLength(row.errored);
    const seatsAtEngine = seatsAtToolSeam(row);
    if (seatsAtEngine === 0) {
      expect(emitted.policyReason).toBeDefined();
    } else {
      expect(emitted.policyReason).toBeUndefined();
      expect(emitted.result.votes.size).toBe(seatsAtEngine);
    }

    // #6180: the quorum the tool reports is the governed quorum over the seats
    // that reached the engine, derived from the fixture.
    const quorum = governedQuorum(seatsAtEngine);
    expect(emitted.result.quorumReached).toBe(quorum);
    // Seam 1 through the tool: the engine outcome the tool assembled (after
    // the option gate) is the governed verdict.
    expect(emitted.result.outcome).toBe(governedEngineVerdict(row, quorum, true));
    // Seam 2: both emitted decisions — the stamp and the response — are the
    // governed decision for the same seats.
    const governed = governedToolDecision(row, emitted);
    expect(emitted.decision).toBe(governed);
    expect(response.decision).toBe(governed);
  });

  it('the empty case: zero seats answered resolves to the governed decision, never approved', async () => {
    collectRealVotesMock.mockResolvedValue([]);
    const [firstRow] = ROWS;
    if (firstRow === undefined) throw new Error('fixture table is empty');
    const input = inputFor(firstRow);

    const emitted = await executeVoting(input, logger);
    const response = buildResponse(input, emitted);

    expect(emitted.votes).toHaveLength(0);
    expect(emitted.result.quorumReached).toBe(governedQuorum(0));
    expect(emitted.result.outcome).toBe(determineFinalStatus(governedQuorum(0), false));
    const governed = resolveVoteDecision(input, emitted, 0).decision;
    expect(emitted.decision).toBe(governed);
    expect(response.decision).toBe(governed);
    expect(response.decision).not.toBe('approved');
  });
});

// ============================================================================
// The table is not vacuous: paired rows sit on opposite sides of their bar
// ============================================================================

describe('the fixture table straddles every bar', () => {
  function rowNamed(name: string): SeamRow {
    const row = ROWS.find((r) => r.name === name);
    if (row === undefined) throw new Error(`no fixture row named "${name}"`);
    return row;
  }

  /** The governed seam-1 verdict: the answering seats' tally under their quorum. */
  function governedEngineFor(row: SeamRow): ProposalStatus {
    return governedEngineVerdict(row, governedQuorum(seatsAtEngineSeam(row)), false);
  }

  /** The governed seam-2 decision over the fixture seats. */
  function governedToolFor(row: SeamRow): VoteDecisionStatus {
    const skeleton: ExtendedVotingResult = {
      proposal: inputFor(row).proposal,
      threshold: algorithmFor(row),
      result: {
        proposalId: 'skeleton',
        proposal: { title: row.name, description: row.name, algorithm: algorithmFor(row) },
        outcome: 'pending',
        votes: new Map<string, Vote>(),
        voteCounts: { approve: row.approve, reject: row.reject, abstain: 0, total: 0 },
        approvalPercentage: 0,
        quorumReached: true,
        startedAt: '',
        closedAt: '',
        durationMs: 0,
      },
      votes: [],
      totalTimeMs: 0,
      simulateVotes: false,
      strategy: row.strategy,
    };
    return governedToolDecision(row, skeleton);
  }

  it.each(STRADDLE_PAIRS)('%s vs %s (%s)', (below, above, seam) => {
    const governedFor = seam === 'engine' ? governedEngineFor : governedToolFor;
    expect(governedFor(rowNamed(below))).not.toBe(governedFor(rowNamed(above)));
  });

  it('the quorum pair straddles the bar itself, not a ratio (#6180)', () => {
    // Both rows clear every ratio bar over their answering seats; only the
    // seat count separates them, and only at the engine — at the tool neither
    // reaches it.
    const below = rowNamed('quorum: one seat answered');
    const above = rowNamed('quorum: two seats answered');
    expect(governedQuorum(seatsAtEngineSeam(below))).toBe(false);
    expect(governedQuorum(seatsAtEngineSeam(above))).toBe(true);
    expect(seatsAtToolSeam(below)).toBe(0);
    expect(seatsAtToolSeam(above)).toBe(0);
  });

  it('every straddle pair names a row that exists, and every row is in a pair', () => {
    const paired = new Set(STRADDLE_PAIRS.flatMap(([below, above]) => [below, above]));
    for (const row of ROWS) expect(paired.has(row.name)).toBe(true);
    for (const name of paired) expect(ROWS.some((r) => r.name === name)).toBe(true);
  });
});
