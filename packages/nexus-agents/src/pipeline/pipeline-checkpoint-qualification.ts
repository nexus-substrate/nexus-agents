/** Qualify an existing approval; checkpoint identity and task lineage are caller responsibilities. */
import { readVoteRecords, resolveVoteRecordsPath } from '../audit/vote-record-store.js';
import type { ParsedVoteLedger } from '../audit/vote-record-store.js';
import { hashProposal, verifyVoteRecordSet } from '../audit/vote-record.js';
import type { VoteRecord } from '../audit/vote-record.js';
import { extractBoundArtifact } from '../cli/vote-artifact.js';

export interface CheckpointApprovalInput {
  readonly voteRecordId: string;
  /** Complete proposal rebuilt by the canonical producer, never a checkpoint-supplied hash. */
  readonly reconstructedProposal: string;
}

export type CheckpointApprovalQualification =
  | {
      readonly status: 'qualified';
      readonly recordId: string;
      readonly recordHash: string;
      readonly proposalHash: string;
    }
  | {
      readonly status: 'unavailable';
      readonly reason:
        | 'ledger-path-unavailable'
        | 'ledger-unreadable'
        | 'ledger-empty'
        | 'approval-missing'
        | 'approval-policy-unavailable'
        | 'approval-coverage-unavailable'
        | 'approval-evidence-redacted';
    }
  | {
      readonly status: 'invalid';
      readonly reason:
        | 'ledger-invalid'
        | 'ledger-ambiguous'
        | 'approval-not-approved'
        | 'approval-policy-mismatch'
        | 'proposal-mismatch'
        | 'artifact-invalid';
    };

/** Read the canonical runtime ledger once; errors never expose private proposal or path text. */
export function qualifyCheckpointApproval(
  input: CheckpointApprovalInput
): CheckpointApprovalQualification {
  let ledger: ParsedVoteLedger;
  try {
    const path = resolveVoteRecordsPath();
    if (path === undefined) return { status: 'unavailable', reason: 'ledger-path-unavailable' };
    ledger = readVoteRecords(path);
  } catch {
    return { status: 'unavailable', reason: 'ledger-unreadable' };
  }
  return qualifyLedger(input, ledger);
}

function qualifyLedger(
  input: CheckpointApprovalInput,
  ledger: ParsedVoteLedger
): CheckpointApprovalQualification {
  if (ledger.invalidLines.length > 0) return { status: 'invalid', reason: 'ledger-invalid' };
  const ids = [...ledger.records, ...ledger.redactions].map((record) => record.id);
  if (new Set(ids).size !== ids.length) return { status: 'invalid', reason: 'ledger-ambiguous' };
  const verification = verifyVoteRecordSet(ledger.records, ledger.redactions);
  if (!verification.ok) return { status: 'invalid', reason: 'ledger-invalid' };
  if (ledger.records.length === 0 || verification.notVerified !== undefined) {
    return { status: 'unavailable', reason: 'ledger-empty' };
  }
  const record = ledger.records.find((candidate) => candidate.id === input.voteRecordId);
  if (record === undefined) return { status: 'unavailable', reason: 'approval-missing' };
  if (verification.redacted?.some((entry) => entry.recordId === record.id) === true) {
    return { status: 'unavailable', reason: 'approval-evidence-redacted' };
  }
  return qualifyRecord(input.reconstructedProposal, record);
}

/** Check recorded provenance and coverage, not a second implementation of consensus thresholds. */
function hasWholeRecordedPanel(record: VoteRecord): boolean {
  const voters = record.voters;
  if (voters.length === 0 || voters.length !== record.voteCounts.total) return false;
  if (new Set(voters.map((voter) => voter.role)).size !== voters.length) return false;
  if (voters.some((voter) => voter.unverifiable === true)) return false;
  // The canonical producer omits this field for clean, unbound panels; absolute_quorum
  // provenance is checked separately. Presence must agree with the actual roster.
  const coverage = record.panelCoverage;
  return (
    coverage === undefined ||
    (coverage.errored === 0 &&
      coverage.erroredRoles.length === 0 &&
      coverage.requested === voters.length &&
      coverage.responded === voters.length)
  );
}

function qualifyRecord(proposal: string, record: VoteRecord): CheckpointApprovalQualification {
  if (record.decision !== 'approved') return { status: 'invalid', reason: 'approval-not-approved' };
  if (record.errorPolicy === undefined) {
    return { status: 'unavailable', reason: 'approval-policy-unavailable' };
  }
  if (record.errorPolicy !== 'absolute_quorum') {
    return { status: 'invalid', reason: 'approval-policy-mismatch' };
  }
  if (!hasWholeRecordedPanel(record)) {
    return { status: 'unavailable', reason: 'approval-coverage-unavailable' };
  }
  if (
    !proposal.isWellFormed() ||
    proposal.includes('\0') ||
    extractBoundArtifact(proposal) === undefined
  ) {
    return { status: 'invalid', reason: 'artifact-invalid' };
  }
  if (hashProposal(proposal) !== record.proposalHash) {
    return { status: 'invalid', reason: 'proposal-mismatch' };
  }
  return {
    status: 'qualified',
    recordId: record.id,
    recordHash: record.hash,
    proposalHash: record.proposalHash,
  };
}
