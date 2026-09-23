/**
 * The operator-facing line describing what reached the audit chain.
 *
 * Its own module so the branch behaviour is testable without exporting it from
 * `vote-command.ts` purely for a test — the producer/consumer ratchet is right
 * that a test import is not a consumer.
 *
 * @module cli/vote-audit-line
 */
import { colors, writeLine } from './ansi-output.js';
import type { VoteRecordPersistOutcome } from '../mcp/tools/consensus-vote-recording.js';
import type { ErrorPolicy } from '../mcp/tools/consensus-vote-types.js';
import type { VoteRecordPrBinding } from '../audit/vote-record.js';

/**
 * One operator-facing line describing what reached the audit chain.
 *
 * A persist failure is stated rather than swallowed: the vote itself must not
 * fail because its record could not be written, but a decision that left no
 * record must not look like one that did (#4924).
 */
export function auditLineFor(outcome: VoteRecordPersistOutcome): string {
  if (outcome.persisted) {
    // #6531: name the ledger. A record written into a worktree's ledger that
    // was later reaped printed only its id, so nobody could see where it went.
    return `${colors.dim}Audit record #${String(outcome.record.sequence)} written (${outcome.record.id}) to ${outcome.path}${colors.reset}\n`;
  }
  if (outcome.reason === 'all-simulated') {
    return `${colors.dim}No audit record — votes were simulated${colors.reset}\n`;
  }
  return `${colors.yellow}Vote NOT recorded to the audit chain: ${outcome.detail}${colors.reset}\n`;
}

/**
 * The line that names the record's PR binding (#6227), printed only when the
 * operator passed `--ratifies-pr`. `record <id> bound to PR N @ <sha>` is the
 * grep target for the caller-commits step; the plain `Audit record #n written
 * (<id>)` line above it stays for scripts that already key on it.
 *
 * A binding whose record was not persisted is said out loud on the same rule
 * as {@link auditLineFor}: the append script is keyed on the record id, so a
 * binding with no record behind it reaches nothing.
 */
function prBindingLine(outcome: VoteRecordPersistOutcome, binding: VoteRecordPrBinding): string {
  const target = `PR ${String(binding.pr)} @ ${binding.headSha}`;
  if (outcome.persisted) {
    return `${colors.dim}record ${outcome.record.id} bound to ${target}${colors.reset}\n`;
  }
  return `${colors.yellow}Binding to ${target} NOT recorded — no record was written, so there is nothing for append-ratification-record.ts to copy${colors.reset}\n`;
}

/** The bar a governor-path ratification must run at (#5779, #6211). */
const GOVERNOR_BAR = { strategy: 'supermajority', errorPolicy: 'absolute_quorum' } as const;

/**
 * One-line notice when a `--ratifies-pr` vote ran below the governor bar
 * (#6227). The CLI records the vote as run — the ledger gate, not the CLI,
 * judges the bar — but the operator should not learn which bar applied from
 * the gate's refusal after the panel has already spent its calls.
 *
 * Compares the EFFECTIVE values `executeVoting` stamped (the strategy it
 * resolved, the policy after the per-strategy default), not the raw flags, so
 * the notice describes what the record says. `undefined` when the run met
 * the bar — the named empty case, not a blank line.
 */
function governorBarNotice(ran: {
  readonly strategy: string;
  readonly errorPolicy?: ErrorPolicy | undefined;
}): string | undefined {
  if (ran.strategy === GOVERNOR_BAR.strategy && ran.errorPolicy === GOVERNOR_BAR.errorPolicy) {
    return undefined;
  }
  return (
    `${colors.yellow}Notice: the governor bar is --strategy ${GOVERNOR_BAR.strategy} ` +
    `--error-policy ${GOVERNOR_BAR.errorPolicy}; this vote ran at ${ran.strategy} / ` +
    `${ran.errorPolicy ?? 'unrecorded'} and was recorded as run — the ledger gate judges it, not the CLI` +
    `${colors.reset}\n`
  );
}

/**
 * Every operator-facing line for one persist attempt (#6227): the audit line,
 * then — only when the vote was bound with `--ratifies-pr` — the binding line
 * and, when the run was below the governor bar, the notice. An unbound vote
 * prints exactly what it printed before.
 */
function persistLines(
  outcome: VoteRecordPersistOutcome,
  binding: VoteRecordPrBinding | undefined,
  ran: { readonly strategy: string; readonly errorPolicy?: ErrorPolicy | undefined }
): readonly string[] {
  if (binding === undefined) return [auditLineFor(outcome)];
  const notice = governorBarNotice(ran);
  return [
    auditLineFor(outcome),
    prBindingLine(outcome, binding),
    ...(notice === undefined ? [] : [notice]),
  ];
}

/**
 * Print every line for one persist attempt and return the exit code the
 * outcome forces on the command, or `undefined` when it leaves the decision's
 * exit code alone (#6531). A record that did not read back is a fidelity
 * failure: the command must not exit 0 on it. A write that failed outright
 * keeps its #4924 contract (stated, not fatal).
 */
export function reportPersistOutcome(
  outcome: VoteRecordPersistOutcome,
  binding: VoteRecordPrBinding | undefined,
  ran: { readonly strategy: string; readonly errorPolicy?: ErrorPolicy | undefined }
): number | undefined {
  for (const line of persistLines(outcome, binding, ran)) writeLine(line);
  return !outcome.persisted && outcome.reason === 'read-back-missed' ? 1 : undefined;
}
