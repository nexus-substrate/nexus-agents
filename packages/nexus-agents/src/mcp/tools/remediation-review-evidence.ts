/** Verify review provenance using the canonical persisted vote-record reader. */
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { computeVoteRecordHash, hashProposal, type VoteRecord } from '../../audit/vote-record.js';
import { readVoteRecords, MAX_PROPOSAL_RECORD_CHARS } from '../../audit/vote-record-store.js';
import { RemediationSoakRecordSchema } from './improvement-remediation-shadow.js';
import {
  buildRemediationPanelProposal,
  isRemediationPanelEligible,
  INELIGIBLE_REMEDIATION_PANEL_REASON,
} from './remediation-review-proposal.js';
import {
  currentRemediationJudgments,
  isOverriddenPanelRejection,
  isJudgmentAttestationSource,
} from './remediation-review-sample.js';
import { hashSoakRecordLine, soakRefOf, type ReviewRecord } from './remediation-review.js';

export interface VerifiedReviewEvidence {
  readonly records: readonly ReviewRecord[];
  readonly evictedReviewRows: number;
  readonly evictedPanelRows: number;
  readonly unverifiablePanelRows: number;
  readonly supersededPanelRows: number;
  readonly unverifiablePanelReasons: readonly string[];
}

interface PersistedVotes {
  readonly votes: ReadonlyMap<string, VoteRecord>;
  readonly failure?: string;
}

/** Keep the ledger failure cause alongside its empty vote set. */
function persistedVotes(path: string | undefined): PersistedVotes {
  const votes = new Map<string, VoteRecord>();
  if (path === undefined || !isAbsolute(path))
    return { votes, failure: `missing ledger at ${path ?? '<unrecorded path>'}` };
  try {
    statSync(path);
    const ledger = readVoteRecords(path);
    if (ledger.invalidLines.length > 0)
      return { votes, failure: `unreadable ledger at ${path} (invalid lines)` };
    return { votes: new Map(ledger.records.map((vote) => [vote.id, vote])) };
  } catch (error: unknown) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    return { votes, failure: `${missing ? 'missing' : 'unreadable'} ledger at ${path}` };
  }
}

/** Both the full proposal hash and the stored (possibly clipped) text must bind this line. */
function panelFailure(row: ReviewRecord, raw: string, ledger: PersistedVotes): string | undefined {
  if (!isRemediationPanelEligible(RemediationSoakRecordSchema.parse(JSON.parse(raw))))
    return INELIGIBLE_REMEDIATION_PANEL_REASON;
  if (ledger.failure !== undefined) return ledger.failure;
  const vote = ledger.votes.get(row.voteRecordId ?? '');
  if (vote === undefined) return `record id not found: ${row.voteRecordId ?? '<absent>'}`;
  if (vote.hash !== computeVoteRecordHash(vote)) return 'vote record hash mismatch';
  if (vote.decision !== (row.sound ? 'approved' : 'rejected')) return 'vote decision mismatch';
  if (row.soakRecordHash !== hashSoakRecordLine(raw)) return 'soak record hash mismatch';
  return proposalFailure(vote, raw);
}

/** Clipped proposal text and its full hash must both match the target artifact. */
function proposalFailure(vote: VoteRecord, raw: string): string | undefined {
  const proposal = buildRemediationPanelProposal(raw);
  if (vote.proposalHash !== hashProposal(proposal)) return 'proposal hash mismatch';
  const stored =
    proposal.length > MAX_PROPOSAL_RECORD_CHARS
      ? proposal.slice(0, MAX_PROPOSAL_RECORD_CHARS) + '...'
      : proposal;
  return vote.proposal === stored ? undefined : 'proposal text mismatch';
}

/** Reuse one read of each pinned ledger across the verification batch. */
function cachedPanelFailure(
  row: ReviewRecord,
  raw: string,
  ledgers: Map<string | undefined, PersistedVotes>
): string | undefined {
  const path = row.voteLedgerPath;
  let votes = ledgers.get(path);
  if (votes === undefined) {
    votes = persistedVotes(path);
    ledgers.set(path, votes);
  }
  return panelFailure(row, raw, votes);
}

/** Index exact artifacts and retain ambiguity rather than arbitrarily choosing a duplicate. */
function indexArtifacts(
  rawSoakLines: readonly string[],
  indexed?: ReadonlyMap<string, string>
): {
  lines: Map<string, string>;
  duplicates: Set<string>;
} {
  const lines = new Map<string, string>(indexed);
  const duplicates = new Set<string>();
  for (const raw of indexed === undefined ? rawSoakLines : []) {
    try {
      const ref = soakRefOf(RemediationSoakRecordSchema.parse(JSON.parse(raw)));
      if (lines.has(ref)) duplicates.add(ref);
      lines.set(ref, raw);
    } catch {
      /* Malformed soak lines cannot verify any review. */
    }
  }
  return { lines, duplicates };
}

function retainsCurrentJudgment(row: ReviewRecord, primary: ReviewRecord | undefined): boolean {
  return (
    row.judgeKind === 'owner-sample' || row === primary || isJudgmentAttestationSource(row, primary)
  );
}

/** Recovery sampling retains historical rejections even when their vote ledger is gone. */
function retainRejectedPanel(
  row: ReviewRecord,
  current: ReadonlyMap<string, ReviewRecord>,
  artifacts: ReturnType<typeof indexArtifacts>,
  enabled: boolean
): boolean {
  return (
    enabled &&
    isOverriddenPanelRejection(row, current) &&
    artifacts.lines.has(row.soakRef) &&
    !artifacts.duplicates.has(row.soakRef)
  );
}

/** Report superseded panels separately; only current panel failures block readiness. */
export function verifyRemediationReviewEvidence(
  rows: readonly ReviewRecord[],
  rawSoakLines: readonly string[],
  indexedSoakLines?: ReadonlyMap<string, string>,
  retainOverriddenRejections = false
): VerifiedReviewEvidence {
  const { lines, duplicates } = indexArtifacts(rawSoakLines, indexedSoakLines);
  const latest = currentRemediationJudgments(rows);
  const ledgers = new Map<string | undefined, PersistedVotes>();
  let evictedReviewRows = 0;
  let evictedPanelRows = 0;
  let supersededPanelRows = 0;
  const unverifiablePanelReasons: string[] = [];
  const records = rows.filter((row) => {
    if (row.judgeKind === 'panel' && latest.get(row.soakRef) !== row) {
      supersededPanelRows++;
      return retainRejectedPanel(row, latest, { lines, duplicates }, retainOverriddenRejections);
    }
    const raw = lines.get(row.soakRef);
    if (raw === undefined) {
      evictedReviewRows++;
      if (row.judgeKind === 'panel') evictedPanelRows++;
      return false;
    }
    if (row.judgeKind === 'panel') {
      const failure = duplicates.has(row.soakRef)
        ? 'duplicate soak reference'
        : cachedPanelFailure(row, raw, ledgers);
      if (failure !== undefined) {
        unverifiablePanelReasons.push(`${row.soakRef}: ${failure}`);
        return false;
      }
    }
    if (duplicates.has(row.soakRef)) return false;
    return retainsCurrentJudgment(row, latest.get(row.soakRef));
  });
  return {
    records,
    evictedReviewRows,
    evictedPanelRows,
    supersededPanelRows,
    unverifiablePanelRows: unverifiablePanelReasons.length,
    unverifiablePanelReasons,
  };
}
