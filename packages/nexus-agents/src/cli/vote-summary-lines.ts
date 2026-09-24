/**
 * The summary lines the terminal summary and the GitHub comment share.
 *
 * Its own module, like `vote-audit-line.ts`, so the two renderings of one
 * fact are produced by one function and cannot drift apart.
 *
 * @module cli/vote-summary-lines
 */
import { colors } from './ansi-output.js';
import { formatPercentage } from '../core/index.js';
import type { AgentVoteResult, VotingResult } from './vote-types.js';
import { VOTER_ROLES } from './voter-roles.js';
import { panelDiversityOf, seatFallbacks, type SeatFallbackDetail } from './vote-diversity.js';
import type { ResolvedVoterProject } from './voter-project.js';
import type {
  ContrarianCheckStatus,
  ExtendedVotingResult,
} from '../mcp/tools/consensus-vote-types.js';

/** The option gate's verdict as `executeVoting` stamps it: the engine's own tally. */
type OptionGateVerdictView = NonNullable<ExtendedVotingResult['optionGate']>;

/** A CLI voting result plus the #6110 project disclosure `executeVoting` stamps on it. */
export type VotingResultWithProject = VotingResult & {
  readonly project?: ResolvedVoterProject | undefined;
  /** #6587: the option gate verdict carried by CliVoteResult. */
  readonly optionGate?: ExtendedVotingResult['optionGate'];
  /** #6587: declared options for the proposal, when any were declared. */
  readonly declaredOptions?: readonly string[] | undefined;
};

/**
 * The one-line rendering of the project the panel judged and how the name was
 * decided (#6110) — `Project: acme/widgets (derived)`. `executeVoting` always
 * resolves one; an absent value renders as `unresolved` rather than being
 * omitted, so a reader can never mistake a missing disclosure for the default.
 * Plain text — the terminal summary indents it, the GitHub comment bolds it.
 */
export function projectLine(project: ResolvedVoterProject | undefined): string {
  const detail = project === undefined ? 'unresolved' : `${project.name} (${project.source})`;
  return `Project: ${detail}`;
}

/**
 * The one-line rendering of the quick-mode contrarian check (#6111).
 *
 * Always emitted, `ok` included: in quick mode the contrarian is an expert
 * call rather than a seat, so `Errored: 0` beside a `no_quorum` is otherwise
 * unexplained. Plain text — the GitHub comment embeds it as-is.
 */
export function contrarianCheckLine(status: ContrarianCheckStatus): string {
  const detail = status === 'errored' ? ' (quick-mode contrarian voice not obtained)' : '';
  return `Contrarian check: ${status}${detail}`;
}

/** {@link contrarianCheckLine} coloured for the terminal summary, red when errored. */
export function contrarianCheckSummaryLine(status: ContrarianCheckStatus): string {
  const tint = status === 'errored' ? colors.red : '';
  return `  ${tint}${contrarianCheckLine(status)}${colors.reset}`;
}

/**
 * One fallback as the models line names it: `devex: codex→gemini, capacity`
 * for a cross-CLI fallover, `pm: claude-fable-5→claude-opus, capacity` for
 * an in-family substitution (same CLI, different model, #6120).
 */
function fallbackLabel({ role, fallback, toCli, toModel }: SeatFallbackDetail): string {
  const inFamily = fallback.fromCli === toCli && fallback.fromModel !== undefined;
  const from = inFamily ? fallback.fromModel : fallback.fromCli;
  const to = inFamily ? (toModel ?? toCli) : toCli;
  return `${role}: ${from}→${to}, ${fallback.reason}`;
}

/** `2 seats unresolved`; empty for zero, so a clean panel's line is unchanged. */
function seatCount(count: number, label: string): string {
  return count === 0 ? '' : `${String(count)} ${count === 1 ? 'seat' : 'seats'} ${label}`;
}

/**
 * The one-line rendering of panel model diversity (#6115) —
 * `Models: 3 distinct, 2 families, 2 fallbacks (devex: codex→gemini, capacity)`.
 *
 * Always emitted, explicit zeros included: the three single-model panels
 * that motivated it read exactly like a three-model panel because nothing
 * was printed. Plain text — the terminal summary indents it, the GitHub
 * comment bolds it.
 */
export function modelsLine(votes: readonly AgentVoteResult[]): string {
  const { distinctModels, distinctFamilies, unclassifiedSeats, unresolvedSeats, fallbacks } =
    panelDiversityOf(votes);
  const detail = seatFallbacks(votes).map(fallbackLabel).join('; ');
  // #6606: the family count, and the seats it could not classify. #6660: and
  // the answering seats whose model never resolved, which no count includes.
  const families = `${String(distinctFamilies)} ${distinctFamilies === 1 ? 'family' : 'families'}`;
  const uncounted = [
    seatCount(unclassifiedSeats, 'unclassified'),
    seatCount(unresolvedSeats ?? 0, 'unresolved'),
  ].filter((part) => part !== '');
  const caveat = uncounted.length === 0 ? '' : ` (${uncounted.join(', ')})`;
  return (
    `Models: ${String(distinctModels)} distinct, ${families}${caveat}, ` +
    `${String(fallbacks)} fallbacks` +
    (detail === '' ? '' : ` (${detail})`)
  );
}

/**
 * The parenthetical a recovered seat carries on its summary row (#6246):
 * ` (retried after: error: Vote parsing failed: …)`. Empty for a seat that was
 * never retried — the pair that keeps a clean panel's rows unchanged. The
 * carried cause is already single-line and bounded (`voter-retry.ts`); when
 * the bound fired the row says so rather than trailing off.
 */
export function retriedFromLabel(v: Pick<AgentVoteResult, 'retriedFrom'>): string {
  const from = v.retriedFrom;
  if (from === undefined) return '';
  const cause = from.error === undefined ? '' : `: ${from.error}`;
  const clipped = from.errorTruncated === true ? ' [truncated]' : '';
  return ` (retried after: ${from.source}${cause}${clipped})`;
}

/**
 * The terminal-summary row for a seat that did not judge: errored, or
 * unverifiable (#6094 — a seat that never saw the artifact is not an ABSTAIN;
 * rendering it as one is how a blind seat reads as a considered one). Carries
 * the #6246 recovery parenthetical — the #6241 shape is an errored first pass
 * whose retry came back unverifiable. Undefined for a seat that returned a
 * judgment. Moved here from `vote-command.ts` when #6246 put that file over
 * its line cap.
 */
export function absentSeatSummaryRow(v: AgentVoteResult, label: string): string | undefined {
  const recovery = retriedFromLabel(v);
  if (v.source === 'error') {
    const reason = (v.error ?? 'execution failed').split('\n')[0] ?? 'execution failed';
    return `  ${colors.red}✗${colors.reset} ${label}: ${colors.red}ERROR${colors.reset} — ${reason}${recovery}`;
  }
  if (v.source === 'unverifiable') {
    return `  ${colors.yellow}?${colors.reset} ${label}: ${colors.yellow}UNVERIFIABLE${colors.reset} — could not read the artifact (${v.unverifiableSignal ?? 'unknown'} signal)${recovery}`;
  }
  return undefined;
}

/**
 * One `| Agent | Decision | Confidence |` row of the GitHub comment. Moved
 * here from `vote-command.ts` when #6115 put that file over its line cap.
 *
 * `createErrorVoteResult` gives a failed seat `decision: 'abstain',
 * confidence: 0`. Dropping `source` published a timed-out or auth-failed
 * voter as a genuine ABSTAIN — indistinguishable, in the durable
 * governance artifact, from a voter that convened and declined.
 */
const ABSENT_SEAT_LABEL = { error: 'ERRORED', unverifiable: 'UNVERIFIABLE' } as const;

export function commentVoteRow({ role, vote, source }: AgentVoteResult): string {
  const roleLabel = VOTER_ROLES[role].split(' - ')[0] ?? role;
  const absent = source === 'error' || source === 'unverifiable';
  const decision = absent ? ABSENT_SEAT_LABEL[source] : vote.decision.toUpperCase();
  const confidence = absent ? '—' : formatPercentage(vote.confidence);
  return `| ${roleLabel} | ${decision} | ${confidence} |`;
}

/**
 * The tally line of the GitHub comment.
 *
 * Under the default `reduce_denominator` the counts EXCLUDE errored seats, so
 * a 7-row table sat above a 6-voter tally with nothing reconciling them. The
 * errored count is what closes that gap. The unverifiable count (#6094) is
 * always present, explicit 0 included: those seats sit inside Abstain.
 */
export function tallySummaryLine(result: VotingResult): string {
  const errored = result.votes.filter((v) => v.source === 'error').length;
  const unverifiable = result.votes.filter((v) => v.source === 'unverifiable').length;
  const { voteCounts, approvalPercentage } = result.result;
  return (
    `Approve: ${String(voteCounts.approve)}, Reject: ${String(voteCounts.reject)}, ` +
    `Abstain: ${String(voteCounts.abstain)}, Unverifiable: ${String(unverifiable)}` +
    (errored > 0 ? `, Errored: ${String(errored)}` : '') +
    ` (${approvalPercentage.toFixed(1)}% approval` +
    (errored > 0
      ? `, measured over ${String(result.votes.length - errored)} responding voter(s)`
      : '') +
    ')'
  );
}

/** `118s` — whole seconds; sub-second attempts read as `0s`, which is the truth for a stub. */
function seconds(ms: number): string {
  return `${String(Math.round(ms / 1000))}s`;
}

/**
 * The one-line attribution of the panel's wall-clock (#6103) —
 * `Seat timing (queued→ran): architect claude 0s→118s; devex gemini 0s→2s,
 * fallback claude 213s→40s; queued total 331s`. Queue time is the wait behind
 * the CLI's serialized lane (#3348); a fallback attempt is labelled. A seat
 * without timing says `unmeasured`, one refused before any attempt says `no
 * attempt` — neither is rendered as a zero that could read as measured.
 */
function seatTimingLine(votes: readonly AgentVoteResult[]): string {
  if (votes.length === 0) return 'Seat timing (queued→ran): no seats';
  let queuedTotal = 0;
  const parts = votes.map((v) => {
    const attempts = v.timing?.attempts;
    if (attempts === undefined) return `${v.role} unmeasured`;
    if (attempts.length === 0) return `${v.role} no attempt`;
    const rendered = attempts.map((a) => {
      queuedTotal += a.queuedMs;
      return `${a.fallback ? 'fallback ' : ''}${a.cli} ${seconds(a.queuedMs)}→${seconds(a.ranMs)}`;
    });
    return `${v.role} ${rendered.join(', ')}`;
  });
  return `Seat timing (queued→ran): ${parts.join('; ')}; queued total ${seconds(queuedTotal)}`;
}

/**
 * The directory the panel's seats were pointed at (#6258) —
 * `Workspace: /path`. `executeVoting` stamps it on every live panel; absence
 * means no live seat was handed one (a simulated panel), and the line says so
 * rather than being omitted, so a missing stamp never reads as the cwd.
 */
function workspaceLine(workspace: string | undefined): string {
  return `Workspace: ${workspace ?? 'none (no live seat was pointed at one)'}`;
}

/**
 * The always-printed panel-shape lines, in summary order: project (#6110),
 * models (#6115), seat timing (#6103), workspace (#6258). `workspace` is a
 * required parameter so the compiler names every caller that must supply it.
 */
export function panelShapeLines(
  project: ResolvedVoterProject | undefined,
  votes: readonly AgentVoteResult[],
  workspace: string | undefined
): readonly string[] {
  return [projectLine(project), modelsLine(votes), seatTimingLine(votes), workspaceLine(workspace)];
}

/**
 * Which option won, as the option gate decided it. Checked in this order
 * because each arm rules out the next: nobody named an option; the top count
 * is shared (`tallyOptions` orders a tie by label, so `leadingOption` is an
 * ordering there, not a win — and no option bar can be cleared by a tied
 * leader); the leader cleared the bar; the leader fell short of it.
 */
function winnerLine(gate: OptionGateVerdictView): string {
  const [first, second] = gate.tally;
  if (gate.selectedCount === 0 || first === undefined) {
    return 'Winner: none — no voter named a declared option';
  }
  if (second?.count === first.count) {
    const tied = gate.tally.filter((t) => t.count === first.count).map((t) => `"${t.option}"`);
    return `Winner: none — tie at ${String(first.count)} each between ${tied.join(', ')}`;
  }
  const held = `${String(gate.leadingCount)} of ${String(gate.approverCount)} approvers`;
  if (gate.approved) {
    return `Winner: "${first.option}" (${held}; cleared the ${gate.threshold} option bar)`;
  }
  return `Winner: none — leading option "${first.option}" held ${held}, below the ${gate.threshold} option bar`;
}

/**
 * The declared-option block of the terminal summary (#6585): each declared
 * option with the count the option gate tallied (a declared option nobody chose
 * is a measured `0`), the winner, and the coverage — how many approvers named a
 * declared option. Renders the gate's verdict; it computes no tally of its own.
 *
 * No options declared ⇒ no block. Options declared but no verdict on the
 * result ⇒ a line saying so, never an omitted block that reads as "no options".
 */
export function optionSummaryLines(
  declared: readonly string[] | undefined,
  gate: OptionGateVerdictView | undefined
): readonly string[] {
  if (declared === undefined || declared.length === 0) return [];
  if (gate === undefined) return ['Options: declared, but the result carries no option tally'];
  const counts = declared.map(
    (option) => `  ${option}: ${String(gate.tally.find((t) => t.option === option)?.count ?? 0)}`
  );
  const coverage =
    `  Coverage: ${String(gate.selectedCount)} of ${String(gate.approverCount)} approvers` +
    ` named a declared option (${String(gate.unattributedApprovals)} unattributed)`;
  return ['Options:', ...counts, `  ${winnerLine(gate)}`, coverage];
}
