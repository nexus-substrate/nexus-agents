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
import type { ContrarianCheckStatus } from '../mcp/tools/consensus-vote-types.js';

/** A CLI voting result plus the #6110 project disclosure `executeVoting` stamps on it. */
export type VotingResultWithProject = VotingResult & { readonly project?: ResolvedVoterProject };

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

/**
 * The one-line rendering of panel model diversity (#6115) —
 * `Models: 3 distinct, 2 fallbacks (devex: codex→gemini, capacity)`.
 *
 * Always emitted, explicit zeros included: the three single-model panels
 * that motivated it read exactly like a three-model panel because nothing
 * was printed. Plain text — the terminal summary indents it, the GitHub
 * comment bolds it.
 */
export function modelsLine(votes: readonly AgentVoteResult[]): string {
  const { distinctModels, fallbacks } = panelDiversityOf(votes);
  const detail = seatFallbacks(votes).map(fallbackLabel).join('; ');
  return (
    `Models: ${String(distinctModels)} distinct, ${String(fallbacks)} fallbacks` +
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
