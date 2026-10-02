/** Independent panel evidence, with provenance bound to the exact stored soak line. */
import { RemediationSoakRecordSchema } from './improvement-remediation-shadow.js';
import { hashSoakRecordLine } from './remediation-review.js';

/**
 * Explicit allowlist: signalKey/timestamp identify the selection;
 * category/priority/severity and signal title/description/evidence describe the
 * signal; planSteps and planStepCount describe the selected remediation.
 * reason, voteOutcome and dryRunResult describe earlier decisions/results and
 * can disclose their verdict, so they and all future fields stay outside the
 * panel evidence. soakRecordHash still binds every byte of the original line.
 */
export function buildRemediationPanelProposal(raw: string): string {
  const record = RemediationSoakRecordSchema.parse(JSON.parse(raw));
  const evidence = {
    soakRecordHash: hashSoakRecordLine(raw),
    signalKey: record.signalKey,
    timestamp: record.timestamp,
    category: record.category,
    priority: record.priority,
    severity: record.severity,
    planStepCount: record.planStepCount,
    signalTitle: record.signalTitle,
    signalDescription: record.signalDescription,
    signalEvidence: record.signalEvidence,
    planSteps: record.planSteps,
  };
  return `Was this remediation selection sound?\n${JSON.stringify(evidence, null, 2)}`;
}
