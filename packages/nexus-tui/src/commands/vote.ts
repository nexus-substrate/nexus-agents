/**
 * nexus-tui — Vote command
 *
 * Run consensus votes through the ConsensusEngine using real CLI adapters.
 * Records outcomes to the OutcomeStore for status/outcomes visibility.
 *
 * @module commands/vote
 */

import type { CommandHandler, CommandResult } from '../types.js';
import { sanitizeOutput } from '../sanitize.js';

/** Voter role type alias. */
type VoterRole = 'architect' | 'security' | 'devex' | 'ai_ml' | 'pm' | 'catfish';

/** Valid voting strategy strings. */
type VotingStrategy =
  | 'simple_majority'
  | 'supermajority'
  | 'unanimous'
  | 'proof_of_learning'
  | 'higher_order';

/** Typed vote result from collectRealVotes. */
interface VoteResult {
  readonly role: string;
  readonly vote: { decision: string; reasoning: string };
  readonly source: string;
}

/** Typed consensus result. */
interface DecideResult {
  readonly outcome: string;
}

/** Dependencies loaded from nexus-agents. */
interface VoteDeps {
  collectRealVotes: (opts: Record<string, unknown>) => Promise<readonly VoteResult[]>;
  createConsensusEngine: () => {
    createProposal: (
      p: string,
      s: string
    ) => { ok: boolean; value: string; error: { message: string } };
    vote: (id: string, role: string, v: unknown) => void;
    decide: (id: string, alg: string) => DecideResult;
  };
  getOutcomeStore: () => { append: (entry: Record<string, unknown>) => void };
}

const FULL_ROLES: readonly VoterRole[] = [
  'architect',
  'security',
  'devex',
  'ai_ml',
  'pm',
  'catfish',
];
const QUICK_ROLES: readonly VoterRole[] = ['architect', 'security', 'pm'];

const VALID_STRATEGIES = new Set<string>([
  'simple_majority',
  'supermajority',
  'unanimous',
  'proof_of_learning',
  'higher_order',
]);

const ALGORITHM_MAP: Record<string, string> = {
  simple_majority: 'simple_majority',
  supermajority: 'supermajority',
  unanimous: 'unanimous',
  proof_of_learning: 'proof_of_learning',
  higher_order: 'opinion_wise',
};

/** Load voting dependencies from nexus-agents. */
async function loadVoteDeps(): Promise<VoteDeps> {
  const mod = await import('nexus-agents');
  return mod as unknown as VoteDeps;
}

/** Create the vote command handler. */
export function createVoteCommand(): CommandHandler {
  return {
    name: 'vote',
    description: 'Run consensus vote on a proposal',
    usage: 'vote <proposal> [--strategy=majority|supermajority|unanimous] [--quick] [--simulate]',
    async execute(args: readonly string[]): Promise<CommandResult> {
      const proposal = args.filter((a) => !a.startsWith('--')).join(' ');
      if (proposal.length === 0) {
        return { output: 'Usage: vote <proposal text>', isError: true };
      }
      return runVote(proposal, args);
    },
  };
}

/** Parse vote flags from args. */
function parseVoteFlags(args: readonly string[]): {
  strategy: VotingStrategy;
  quick: boolean;
  simulate: boolean;
  roles: readonly VoterRole[];
} {
  const strategyArg = args.find((a) => a.startsWith('--strategy='))?.slice(11);
  const strategy: VotingStrategy = VALID_STRATEGIES.has(strategyArg ?? '')
    ? (strategyArg as VotingStrategy)
    : 'simple_majority';
  const quick = args.includes('--quick');
  const simulate = args.includes('--simulate');
  const roles = quick ? QUICK_ROLES : FULL_ROLES;
  return { strategy, quick, simulate, roles };
}

/** Format vote results into display lines. */
function formatVoteResults(
  votes: readonly VoteResult[],
  outcome: string,
  durationMs: number
): readonly string[] {
  const lines: string[] = ['Votes:'];
  for (const v of votes) {
    const decision = v.source === 'error' ? 'ERROR' : v.vote.decision;
    const reasoning = v.source === 'error' ? '(failed)' : v.vote.reasoning.slice(0, 80);
    lines.push(`  ${v.role}: ${decision} — ${reasoning}`);
  }
  lines.push('', `Outcome: ${outcome}`, `Duration: ${String(durationMs)}ms`);
  return lines;
}

/** Execute the vote. */
async function runVote(proposal: string, args: readonly string[]): Promise<CommandResult> {
  const { strategy, quick, simulate, roles } = parseVoteFlags(args);
  const header = [
    `Proposal: ${sanitizeOutput(proposal)}`,
    `Strategy: ${strategy}`,
    `Mode: ${quick ? 'quick (3 agents)' : 'full (6 agents)'}`,
    '',
  ];

  try {
    const deps = await loadVoteDeps();
    const startMs = Date.now();
    const votes = await deps.collectRealVotes({ roles, proposal, simulate, allowSimulation: true });
    const engine = deps.createConsensusEngine();
    const proposalResult = engine.createProposal(proposal, 'tui-vote');
    if (!proposalResult.ok) {
      return { output: `Vote failed: ${proposalResult.error.message}`, isError: true };
    }

    for (const v of votes) {
      if (v.source !== 'error') engine.vote(proposalResult.value, v.role, v.vote);
    }
    const result = engine.decide(
      proposalResult.value,
      ALGORITHM_MAP[strategy] ?? 'simple_majority'
    );
    const durationMs = Date.now() - startMs;

    const display = [...header, ...formatVoteResults(votes, result.outcome, durationMs)];
    recordOutcome(deps, strategy, proposal, result.outcome === 'approved', durationMs);
    return { output: display.join('\n') };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { output: [...header, `Vote failed: ${msg}`].join('\n'), isError: true };
  }
}

/** Best-effort outcome recording. */
function recordOutcome(
  deps: VoteDeps,
  strategy: string,
  proposal: string,
  success: boolean,
  durationMs: number
): void {
  try {
    deps.getOutcomeStore().append({
      cli: 'nexus-tui',
      category: 'consensus',
      model: `vote-${strategy}`,
      task: `Vote: ${proposal.slice(0, 100)}`,
      success,
      durationMs,
      timestamp: new Date().toISOString(),
      source: 'tui-vote',
    });
  } catch {
    // Best-effort
  }
}
