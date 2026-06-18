/**
 * nexus-agents/audit - Authentic Vote Record Store (#3897, model revised #3927)
 *
 * Persists a completed `consensus_vote` to a COMMITTABLE, append-only,
 * tamper-evident artifact at vote time, distinct from the per-developer home-dir
 * stores (`~/.nexus-agents/voting`, `~/.nexus-agents/learning`) a CI gate cannot
 * read. The artifact lives at `<repo-root>/governance/vote-records.jsonl` so the
 * promotion gate (#3895) can read it from CI; authenticity rests on a
 * payload-covering tamper-evident record set + monotonic sequence
 * ({@link verifyVoteRecordSet}), not on manual YAML transcription.
 *
 * DRY/drift hazard (DevEx, #3897). This is the AUTOMATED authoring path: the
 * record is written as a side effect of the live vote, so the committed artifact
 * cannot drift from what actually happened the way a hand-edited
 * `ratification-votes.yaml` entry can. Each record is self-hashed (covering its
 * `sequence`), so a forged/edited line breaks verification.
 *
 * MERGE SAFETY (#3927). The ledger is a SET, not a chain: `sequence` is assigned
 * as (max existing sequence)+1, and the self-hash excludes `previousHash`, so
 * two branches that each append from the same tip merge conflict-free under the
 * `governance/vote-records.jsonl merge=union` attribute. Duplicate sequences
 * from such a merge are a benign fork signal, not tampering.
 *
 * @module audit/vote-record-store
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ILogger } from '../core/index.js';
import { createLogger, getErrorMessage } from '../core/index.js';
import type { ConsensusResult, Vote } from '../consensus/types.js';
import type { AgentVoteResult } from '../cli/vote-types.js';
import { findRepoRoot } from '../config/repo-root-detection.js';

import type { VoteRecord, VoterSummary } from './vote-record.js';
import { VoteRecordSchema, computeVoteRecordHash, hashProposal } from './vote-record.js';

/** Repo-relative committable artifact path (read by the gate/CI). */
export const VOTE_RECORDS_REL_PATH = 'governance/vote-records.jsonl';

/** Max proposal chars retained in the human record (full text is hashed). */
const MAX_PROPOSAL_RECORD_CHARS = 500;

/** Map a consensus outcome to the recorded decision vocabulary. */
function outcomeToDecision(result: ConsensusResult): VoteRecord['decision'] {
  if (result.outcome === 'approved') return 'approved';
  if (!result.quorumReached && result.outcome !== 'rejected') return 'no_quorum';
  return 'rejected';
}

/** Build the per-voter summary from the (real) agent votes, skipping errors. */
function toVoterSummaries(votes: readonly AgentVoteResult[]): VoterSummary[] {
  const summaries: VoterSummary[] = [];
  for (const v of votes) {
    if (v.source === 'error') continue;
    const vote: Vote = v.vote;
    summaries.push({ role: v.role, decision: vote.decision, confidence: vote.confidence });
  }
  return summaries;
}

/** Inputs for {@link buildVoteRecord} — the finalized vote data. */
export interface BuildVoteRecordInput {
  readonly id: string;
  readonly proposal: string;
  readonly strategy: VoteRecord['strategy'];
  readonly result: ConsensusResult;
  readonly votes: readonly AgentVoteResult[];
  readonly correlationId?: string | undefined;
  readonly recordedAt?: string | undefined;
  /**
   * Monotonic sequence number for this record (#3927). Defaults to 0 (first
   * record) when omitted; the producer ({@link persistVoteRecord}) supplies
   * (max existing sequence)+1.
   */
  readonly sequence?: number | undefined;
  /**
   * Advisory tip hash (audit texture only). NOT covered by the self-hash and
   * NOT verified — retained so a reviewer can see the write-time tip (#3927).
   */
  readonly previousHash?: string | undefined;
}

/**
 * Construct a fully self-hashed {@link VoteRecord} from a completed vote. Pure
 * (no I/O) so it is unit-testable and reusable by the gate seam. The self-hash
 * covers `sequence` but EXCLUDES `previousHash`, so the record is
 * position-independent (#3927). The proposal is hashed in full but stored
 * truncated.
 */
export function buildVoteRecord(input: BuildVoteRecordInput): VoteRecord {
  const proposalTruncated =
    input.proposal.length > MAX_PROPOSAL_RECORD_CHARS
      ? input.proposal.slice(0, MAX_PROPOSAL_RECORD_CHARS) + '...'
      : input.proposal;
  const payload: Omit<VoteRecord, 'hash'> = {
    version: '1.1',
    id: input.id,
    sequence: input.sequence ?? 0,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    proposalHash: hashProposal(input.proposal),
    proposal: proposalTruncated,
    strategy: input.strategy,
    decision: outcomeToDecision(input.result),
    approvalPercentage: input.result.approvalPercentage,
    voteCounts: {
      approve: input.result.voteCounts.approve,
      reject: input.result.voteCounts.reject,
      abstain: input.result.voteCounts.abstain,
      total: input.result.voteCounts.total,
    },
    voters: toVoterSummaries(input.votes),
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    ...(input.previousHash !== undefined ? { previousHash: input.previousHash } : {}),
  };
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

/**
 * Read the current ledger tip (#3927): the max existing `sequence` (so the next
 * record gets max+1) and the last line's hash (advisory `previousHash` for audit
 * texture only). Returns `{ maxSequence: -1, lastHash: undefined }` for an empty
 * or unreadable file, so the first record lands at sequence 0.
 */
function readLedgerTip(
  filePath: string,
  logger: ILogger
): { maxSequence: number; lastHash: string | undefined } {
  if (!existsSync(filePath)) return { maxSequence: -1, lastHash: undefined };
  try {
    const { records } = readVoteRecords(filePath);
    if (records.length === 0) return { maxSequence: -1, lastHash: undefined };
    let maxSequence = -1;
    for (const record of records) {
      if (record.sequence > maxSequence) maxSequence = record.sequence;
    }
    const last = records[records.length - 1];
    return { maxSequence, lastHash: last?.hash };
  } catch (error: unknown) {
    logger.warn('Failed to read vote-record ledger tip', { error: getErrorMessage(error) });
    return { maxSequence: -1, lastHash: undefined };
  }
}

/** Resolve the committable artifact path under the current repo root, if any. */
export function resolveVoteRecordsPath(): string | undefined {
  const root = findRepoRoot(process.cwd());
  if (root === null) return undefined;
  return join(root, VOTE_RECORDS_REL_PATH);
}

/** Options for {@link persistVoteRecord}. `sequence`/`previousHash` are assigned by the store. */
export interface PersistVoteRecordOptions
  extends Omit<BuildVoteRecordInput, 'previousHash' | 'sequence'> {
  /** Override the artifact path (tests); defaults to the repo-root resolution. */
  readonly filePath?: string | undefined;
  readonly logger?: ILogger | undefined;
}

/**
 * Persist an authentic vote record to the committable artifact at vote time.
 * Best-effort and append-only: reads the ledger tip (max sequence + advisory
 * last hash), assigns the next monotonic `sequence`, builds a self-hashed
 * record, and appends one JSON line. Returns the written record (or undefined
 * when no committable location exists / the write failed) — persistence never
 * throws into the vote path (an audit sink must not break the operation it
 * observes).
 */
export function persistVoteRecord(opts: PersistVoteRecordOptions): VoteRecord | undefined {
  const logger = opts.logger ?? createLogger({ component: 'vote-record-store' });
  const filePath = opts.filePath ?? resolveVoteRecordsPath();
  if (filePath === undefined) {
    logger.debug('No committable repo root; skipping authentic vote record persist');
    return undefined;
  }
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const { maxSequence, lastHash } = readLedgerTip(filePath, logger);
    const record = buildVoteRecord({
      ...opts,
      sequence: maxSequence + 1,
      previousHash: lastHash,
    });
    appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
    logger.info('Persisted authentic vote record', {
      id: record.id,
      decision: record.decision,
      path: filePath,
    });
    return record;
  } catch (error: unknown) {
    logger.warn('Failed to persist authentic vote record', {
      error: getErrorMessage(error),
      path: filePath,
    });
    return undefined;
  }
}

/**
 * Read the persisted vote-record set from disk. The GATE SEAM (#3897): a future
 * `check-authority-tier-drift.ts` revision resolves a `ratificationVoteRef`
 * against these records and rejects a set that fails {@link verifyVoteRecordSet}.
 * File-line order is NOT significant (#3927) — verification treats the records
 * as a set. Returns the parsed records and any line that failed to parse.
 */
export function readVoteRecords(filePath: string): {
  readonly records: VoteRecord[];
  readonly invalidLines: number[];
} {
  const records: VoteRecord[] = [];
  const invalidLines: number[] = [];
  if (!existsSync(filePath)) return { records, invalidLines };
  const lines = readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim() !== '');
  for (const [i, line] of lines.entries()) {
    try {
      const parsed = VoteRecordSchema.safeParse(JSON.parse(line));
      if (parsed.success) records.push(parsed.data);
      else invalidLines.push(i + 1);
    } catch {
      invalidLines.push(i + 1);
    }
  }
  return { records, invalidLines };
}
