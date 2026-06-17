/**
 * nexus-agents/audit - Authentic Vote Record Store (#3897)
 *
 * Persists a completed `consensus_vote` to a COMMITTABLE, append-only,
 * hash-chained artifact at vote time, distinct from the per-developer home-dir
 * stores (`~/.nexus-agents/voting`, `~/.nexus-agents/learning`) a CI gate cannot
 * read. The artifact lives at `<repo-root>/governance/vote-records.jsonl` so the
 * promotion gate (#3895) can read it from CI; authenticity rests on the
 * payload-covering hash chain ({@link verifyVoteRecordChain}), not on manual
 * YAML transcription.
 *
 * DRY/drift hazard (DevEx, #3897). This is the AUTOMATED authoring path: the
 * record is written as a side effect of the live vote, so the committed artifact
 * cannot drift from what actually happened the way a hand-edited
 * `ratification-votes.yaml` entry can. The chain links each new record to the
 * last persisted one, so a forged/edited line breaks verification.
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
  readonly previousHash?: string | undefined;
}

/**
 * Construct a fully-hashed {@link VoteRecord} from a completed vote, chained to
 * `previousHash`. Pure (no I/O) so it is unit-testable and reusable by the gate
 * seam. The proposal is hashed in full but stored truncated.
 */
export function buildVoteRecord(input: BuildVoteRecordInput): VoteRecord {
  const proposalTruncated =
    input.proposal.length > MAX_PROPOSAL_RECORD_CHARS
      ? input.proposal.slice(0, MAX_PROPOSAL_RECORD_CHARS) + '...'
      : input.proposal;
  const payload: Omit<VoteRecord, 'hash'> = {
    version: '1.0',
    id: input.id,
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

/** Read the last persisted record's hash so the next record chains onto it. */
function readLastHash(filePath: string, logger: ILogger): string | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim() !== '');
    const last = lines[lines.length - 1];
    if (last === undefined) return undefined;
    const parsed = VoteRecordSchema.safeParse(JSON.parse(last));
    return parsed.success ? parsed.data.hash : undefined;
  } catch (error: unknown) {
    logger.warn('Failed to read prior vote record hash', { error: getErrorMessage(error) });
    return undefined;
  }
}

/** Resolve the committable artifact path under the current repo root, if any. */
export function resolveVoteRecordsPath(): string | undefined {
  const root = findRepoRoot(process.cwd());
  if (root === null) return undefined;
  return join(root, VOTE_RECORDS_REL_PATH);
}

/** Options for {@link persistVoteRecord}. */
export interface PersistVoteRecordOptions extends Omit<BuildVoteRecordInput, 'previousHash'> {
  /** Override the artifact path (tests); defaults to the repo-root resolution. */
  readonly filePath?: string | undefined;
  readonly logger?: ILogger | undefined;
}

/**
 * Persist an authentic vote record to the committable artifact at vote time.
 * Best-effort and append-only: reads the prior hash, builds a chained record,
 * and appends one JSON line. Returns the written record (or undefined when no
 * committable location exists / the write failed) — persistence never throws
 * into the vote path (an audit sink must not break the operation it observes).
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
    const previousHash = readLastHash(filePath, logger);
    const record = buildVoteRecord({ ...opts, previousHash });
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
 * Read + verify the persisted vote-record chain from disk. The GATE SEAM
 * (#3897): a future `check-authority-tier-drift.ts` revision resolves a
 * `ratificationVoteRef` against these records and rejects a chain that fails
 * verification. Returns the parsed records and any line that failed to parse.
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
