/**
 * The operator-facing line describing what reached the audit chain.
 *
 * Its own module so the branch behaviour is testable without exporting it from
 * `vote-command.ts` purely for a test — the producer/consumer ratchet is right
 * that a test import is not a consumer.
 *
 * @module cli/vote-audit-line
 */
import { colors } from './ansi-output.js';
import type { VoteRecordPersistOutcome } from '../mcp/tools/consensus-vote-recording.js';

/**
 * One operator-facing line describing what reached the audit chain.
 *
 * A persist failure is stated rather than swallowed: the vote itself must not
 * fail because its record could not be written, but a decision that left no
 * record must not look like one that did (#4924).
 */
export function auditLineFor(outcome: VoteRecordPersistOutcome): string {
  if (outcome.persisted) {
    return `${colors.dim}Audit record #${String(outcome.record.sequence)} written (${outcome.record.id})${colors.reset}\n`;
  }
  if (outcome.reason === 'all-simulated') {
    return `${colors.dim}No audit record — votes were simulated${colors.reset}\n`;
  }
  return `${colors.yellow}Vote NOT recorded to the audit chain: ${outcome.detail}${colors.reset}\n`;
}
