/**
 * nexus-agents/audit - Authentic Vote Record Store (#3897, model revised #3927)
 *
 * Persists a completed `consensus_vote` to an append-only, tamper-evident
 * artifact at vote time. Authenticity rests on a payload-covering tamper-evident
 * record set + monotonic sequence ({@link verifyVoteRecordSet}), not on manual
 * YAML transcription.
 *
 * PATH RESOLUTION (#3991, design vote 7-0 Option B). The RUNTIME ledger now
 * routes through the canonical {@link nexusDataPath} resolver under the
 * `governance/` category, consistent with the 10+ other runtime stores — so it
 * works for sandbox and global-install layouts and always has a writable home:
 *   - `NEXUS_VOTE_RECORDS_PATH` explicit override (absolute used as-is; relative
 *     resolved against cwd per #3963) — the escape hatch, and the ONLY way to
 *     reach the committed `<repo>/governance/vote-records.jsonl` ledger the
 *     promotion gate (#3895) reads (a separate caller-commits/governor-gate
 *     artifact, deferred — never auto-written);
 *   - otherwise `nexusDataPath('governance', 'vote-records.jsonl')` →
 *     `<sandbox-root>/.nexus-agents/governance/...` (sandbox),
 *     `<repo>/.nexus-agents/governance/...` (repo-preferred, gitignored), or
 *     `~/.nexus-agents/governance/vote-records.jsonl` (default / global install).
 * The pre-#3991 `findRepoRoot(cwd)/governance/...` default is GONE — it caused
 * the #3991 silent-skip on global installs (cwd not a repo → undefined → no
 * persist) AND tracked-file churn. The resolver now essentially always returns a
 * path, so the producer essentially always persists into `.nexus-agents`.
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
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { ILogger } from '../core/index.js';
import { createLogger, getErrorMessage } from '../core/index.js';
import type { ConsensusResult, Vote } from '../consensus/types.js';
import type { AgentVoteResult } from '../cli/vote-types.js';
import { getNexusDataDir, nexusDataPath } from '../config/nexus-data-dir.js';

import type {
  VoteRecord,
  VoteRecordOptionCount,
  VoteRecordOptionCoverage,
  VoteRecordPanelCoverage,
  VoterSummary,
} from './vote-record.js';
import { VoteRecordSchema, computeVoteRecordHash, hashProposal } from './vote-record.js';

/**
 * Repo-relative path of the COMMITTED governance ledger the promotion gate
 * (#3895) reads. As of #3991 the runtime store no longer auto-writes here — this
 * committed artifact is reached only via the {@link VOTE_RECORDS_PATH_ENV}
 * override (the separate caller-commits/governor-gate path, deferred). Kept
 * exported as the canonical relative location for the gate + override guidance.
 */
export const VOTE_RECORDS_REL_PATH = 'governance/vote-records.jsonl';

/**
 * {@link nexusDataPath} category + filename for the RUNTIME ledger (#3991).
 * `governance` is a per-repo category in `nexus-data-dir.ts`, so with
 * `NEXUS_REPO_PREFERRED=1` (default) the runtime ledger lands in
 * `<repo>/.nexus-agents/governance/` (gitignored), under a sandbox root when
 * `NEXUS_SANDBOX` is set, and `~/.nexus-agents/governance/` otherwise.
 */
const VOTE_RECORDS_DATA_CATEGORY = 'governance';
const VOTE_RECORDS_FILENAME = 'vote-records.jsonl';

/**
 * Env var to force the artifact path. When set non-empty it is used directly
 * (resolved to an absolute path — see {@link resolveVoteRecordsPath}) and the
 * canonical {@link nexusDataPath} resolution is skipped — the escape hatch for
 * targeting a specific location (e.g. the committed `<repo>/governance/...`
 * ledger the promotion gate reads, or a co-located/CI path).
 */
export const VOTE_RECORDS_PATH_ENV = 'NEXUS_VOTE_RECORDS_PATH';

/** Max proposal chars retained in the human record (full text is hashed). */
const MAX_PROPOSAL_RECORD_CHARS = 500;

/**
 * Actionable message for a write FAILURE (#3991). Since the runtime path now
 * routes through {@link nexusDataPath} it essentially always resolves; the
 * remaining failure mode is an unwritable data dir. Exported so the
 * `consensus_vote` result note can reuse the EXACT guidance the server WARN logs
 * — one source of truth. (Pre-#3991 this covered a no-repo-root skip; that case
 * no longer exists because the resolver always returns a path.)
 */
export function voteRecordWriteFailedMessage(path: string): string {
  return (
    'Authentic vote record NOT persisted: the resolved data directory is not ' +
    `writable (${path}). Check filesystem permissions on the .nexus-agents data ` +
    `dir, or set ${VOTE_RECORDS_PATH_ENV} to a writable absolute file path. See ` +
    'server logs for the underlying filesystem error.'
  );
}

/**
 * Fallback mapping from a consensus outcome to the recorded decision, for
 * callers with no resolved decision to hand over.
 *
 * The void checks come FIRST. They used to sit below an
 * `if (result.outcome === 'approved') return 'approved'` short-circuit, which
 * meant `errorVoided` could only ever rescue a `rejected` — a voided vote whose
 * engine outcome was `approved` persisted as a genuine approval while the tool
 * reported `no_quorum` (#4986). #4053 fixed one half of that and the ordering
 * hid the other.
 *
 * This still cannot see a void the caller knows about but the
 * {@link ConsensusResult} does not express — the `absolute_quorum` path stamps
 * its reason on the response, never on the result — which is why
 * `resolvedDecision` exists and why this is only the fallback.
 */
function outcomeToDecision(
  result: ConsensusResult,
  votes: readonly AgentVoteResult[],
  errorVoided: boolean
): VoteRecord['decision'] {
  const errorCount = votes.filter((v) => v.source === 'error').length;
  const allErrors = errorCount === votes.length && errorCount > 0;
  if (errorVoided || (!result.quorumReached && allErrors)) return 'no_quorum';
  if (result.outcome === 'approved') return 'approved';
  // Only an actual `rejected` is a rejection. `ProposalStatus` also carries
  // `timeout` / `pending` / `voting` / `closed`, and the previous
  // everything-else-is-rejected default recorded a panel that never concluded
  // as one that voted the proposal down (#4986).
  if (result.outcome === 'rejected') return 'rejected';
  return 'no_quorum';
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

/**
 * The decision to persist: the caller's resolved answer when it has one, else
 * the {@link outcomeToDecision} fallback.
 */
function recordDecisionFor(input: BuildVoteRecordInput): VoteRecord['decision'] {
  return (
    input.resolvedDecision ??
    outcomeToDecision(input.result, input.votes, input.errorVoided ?? false)
  );
}

/** Inputs for {@link buildVoteRecord} — the finalized vote data. */
export interface BuildVoteRecordInput {
  readonly id: string;
  readonly proposal: string;
  readonly strategy: VoteRecord['strategy'];
  readonly result: ConsensusResult;
  readonly votes: readonly AgentVoteResult[];
  /** #4053: vote voided by an error-policy short-circuit → record `no_quorum`. */
  readonly errorVoided?: boolean | undefined;
  /**
   * The decision the caller already resolved for this vote, recorded verbatim.
   *
   * `resolveVoteDecision` computes the authoritative three-valued answer once,
   * for the response. Re-deriving it here from `result.outcome` is what let the
   * two disagree (#4986), so a caller that has it MUST pass it. Required rather
   * than optional — including its `undefined` case — so the compiler names
   * every call site instead of letting a new one inherit the fallback in
   * silence.
   */
  readonly resolvedDecision: VoteRecord['decision'] | undefined;
  readonly correlationId?: string | undefined;
  readonly recordedAt?: string | undefined;
  /**
   * The loop/strategy subject this vote RATIFIES (#3927 item 1). Set ONLY for a
   * ratification vote that backs an authority-tier promotion; bound into the
   * self-hash so the gate can trust it. Omitted on an ordinary vote.
   */
  readonly ratifies?: string | undefined;
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
/**
 * Counts how many voters chose each named option (#4452).
 *
 * Returns `undefined` when no vote carries a `selectedOption` — an ordinary
 * yes/no vote — so the record stays on the pre-1.3 hash projection and every
 * historical record keeps verifying.
 *
 * Options are emitted in DESCENDING count, ties broken by option label, so the
 * tally is deterministic regardless of voter order. That matters: the array is
 * hash-covered, and a set of votes that differed only in arrival order must not
 * produce two different hashes.
 */
/**
 * Derive the option tally and its coverage together (#4472).
 *
 * They travel as a pair: coverage without a tally says nothing, and a tally
 * without coverage is the ambiguity this fixes.
 */
function deriveOptionFields(votes: readonly AgentVoteResult[]): {
  optionTally: VoteRecordOptionCount[] | undefined;
  optionCoverage: VoteRecordOptionCoverage | undefined;
} {
  const optionTally = tallySelectedOptions(votes);
  return {
    optionTally,
    optionCoverage: optionTally === undefined ? undefined : coverageOf(votes),
  };
}

/**
 * Schema version implied by the option fields present.
 *
 * 1.4 carries coverage, 1.3 a bare tally (historical only — a tally now always
 * travels with coverage), 1.2 neither.
 */
function recordVersion(
  optionTally: VoteRecordOptionCount[] | undefined,
  optionCoverage: VoteRecordOptionCoverage | undefined,
  panelCoverage: VoteRecordPanelCoverage | undefined
): '1.2' | '1.3' | '1.4' | '1.5' {
  if (panelCoverage !== undefined) return '1.5';
  if (optionCoverage !== undefined) return '1.4';
  return optionTally !== undefined ? '1.3' : '1.2';
}

/**
 * Panel coverage (#5738): what the panel asked for versus what answered.
 *
 * `toVoterSummaries` drops voters at `source: 'error'` and `voteCounts` counts
 * only responders, so without this the record cannot distinguish a genuine
 * three-voter panel from a seven-voter panel that lost four. Returns undefined
 * when every requested voter responded — absence keeps a clean record on the
 * pre-1.5 hash projection.
 */
function panelCoverageOf(votes: readonly AgentVoteResult[]): VoteRecordPanelCoverage | undefined {
  const erroredRoles = votes.filter((v) => v.source === 'error').map((v) => v.role);
  if (erroredRoles.length === 0) return undefined;
  return {
    requested: votes.length,
    responded: votes.length - erroredRoles.length,
    errored: erroredRoles.length,
    erroredRoles,
  };
}

/**
 * Selection coverage over the approving voters (#4472).
 *
 * Counts approvers, not all voters: a rejecter chose no option because they
 * rejected the proposal, which the approve/reject counts already record.
 */
function coverageOf(votes: readonly AgentVoteResult[]): VoteRecordOptionCoverage {
  const approvers = votes.filter((v) => v.vote.decision === 'approve');
  const selectedCount = approvers.filter((v) => v.selectedOption !== undefined).length;
  return {
    approverCount: approvers.length,
    selectedCount,
    unattributedApprovals: approvers.length - selectedCount,
  };
}

function tallySelectedOptions(
  votes: readonly AgentVoteResult[]
): VoteRecordOptionCount[] | undefined {
  const counts = new Map<string, number>();
  for (const v of votes) {
    // Approvers only. The threshold is evaluated over approvers, so a tally
    // that counted rejecters would describe a different population than the
    // verdict it accompanies — and would disagree with `optionCoverage`,
    // which is approvers-only. Found by e2e validation when a rejecting voter
    // named an option and the record credited it (#4472 follow-up).
    if (v.vote.decision !== 'approve') continue;
    if (v.selectedOption === undefined) continue;
    counts.set(v.selectedOption, (counts.get(v.selectedOption) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  return [...counts.entries()]
    .map(([option, count]) => ({ option, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.option.localeCompare(b.option)));
}

export function buildVoteRecord(input: BuildVoteRecordInput): VoteRecord {
  const proposalTruncated =
    input.proposal.length > MAX_PROPOSAL_RECORD_CHARS
      ? input.proposal.slice(0, MAX_PROPOSAL_RECORD_CHARS) + '...'
      : input.proposal;
  // #4452: derive the per-option distribution from the votes themselves, so a
  // multi-option split is recoverable from the structured record instead of by
  // parsing seven free-text `reasoning` fields. Absent when no voter declared an
  // option, which keeps an ordinary yes/no record on the pre-1.3 projection.
  const { optionTally, optionCoverage } = deriveOptionFields(input.votes);
  const panelCoverage = panelCoverageOf(input.votes);
  const payload: Omit<VoteRecord, 'hash'> = {
    version: recordVersion(optionTally, optionCoverage, panelCoverage),
    id: input.id,
    sequence: input.sequence ?? 0,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    proposalHash: hashProposal(input.proposal),
    proposal: proposalTruncated,
    strategy: input.strategy,
    decision: recordDecisionFor(input),
    approvalPercentage: input.result.approvalPercentage,
    voteCounts: {
      approve: input.result.voteCounts.approve,
      reject: input.result.voteCounts.reject,
      abstain: input.result.voteCounts.abstain,
      total: input.result.voteCounts.total,
    },
    voters: toVoterSummaries(input.votes),
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    ...(input.ratifies !== undefined ? { ratifies: input.ratifies } : {}),
    ...(optionTally !== undefined ? { optionTally } : {}),
    ...(optionCoverage !== undefined ? { optionCoverage } : {}),
    ...(panelCoverage !== undefined ? { panelCoverage } : {}),
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

/**
 * Fail-closed path-traversal guard (#3991 security condition, 7-0 vote). Returns
 * `true` iff `target` resolves to an absolute path under `root` (or equal to it)
 * with no `..` segment escaping it. Both inputs are `resolve`d first so a
 * `..` embedded in the override (e.g. `<root>/../../etc/x`) is normalized and
 * caught: if the relative path from `root` to `target` starts with `..` (or is
 * itself absolute on a different volume), the target escaped and we reject.
 */
function isWithin(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (resolvedTarget === resolvedRoot) return true;
  const rel = relative(resolvedRoot, resolvedTarget);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Resolve the RUNTIME vote-records ledger path (#3991, design vote 7-0). Routes
 * through the canonical {@link nexusDataPath} resolver so it supports sandbox and
 * global-install layouts and always has a writable home. Precedence:
 *
 *  1. {@link VOTE_RECORDS_PATH_ENV} (`NEXUS_VOTE_RECORDS_PATH`) when set
 *     non-empty — resolved to an absolute path (an already-absolute value is
 *     returned unchanged; a RELATIVE value is resolved against `process.cwd()`,
 *     #3963). This is the explicit escape hatch and the ONLY way to target the
 *     committed `<repo>/governance/vote-records.jsonl` ledger. The resolved
 *     override is path-traversal validated against its own join base
 *     (fail-closed): a relative override that escapes cwd via `..` is rejected.
 *  2. otherwise `nexusDataPath('governance', 'vote-records.jsonl')` →
 *     a sandbox / repo-preferred / homedir `.nexus-agents/governance/` location.
 *     Validated to stay within the resolved data root (fail-closed).
 *
 * Returns `undefined` only on a genuine resolver failure or a fail-closed
 * traversal rejection — NOT for the former "no repo root" case, which no longer
 * exists (#3991). The caller treats `undefined` as a write-failed/skip and
 * surfaces an actionable note. A whitespace-only override is treated as unset.
 */
export function resolveVoteRecordsPath(): string | undefined {
  const envPath = process.env[VOTE_RECORDS_PATH_ENV];
  if (envPath !== undefined && envPath.trim() !== '') {
    // Honor the absolute-path contract: a relative override is resolved against
    // process.cwd() rather than written verbatim (#3963). isAbsolute short-
    // circuits the common already-absolute case to a no-op for clarity.
    const resolved = isAbsolute(envPath) ? envPath : resolve(envPath);
    // Path-traversal validation (#3991): a relative override must not escape the
    // cwd it is joined against via `..`. An absolute override is the operator's
    // explicit choice (e.g. the committed governance ledger) and is honored as-is
    // — there is no enclosing data root to validate it against.
    if (!isAbsolute(envPath) && !isWithin(process.cwd(), resolved)) {
      return undefined;
    }
    return resolved;
  }
  // Canonical resolver: handles sandbox, repo-preferred, and homedir layouts.
  // nexusDataPath may root the result under the homedir/sandbox data dir OR,
  // when `governance` routes per-repo (NEXUS_REPO_PREFERRED), under
  // `<repo>/.nexus-agents` — so the base differs by layout.
  const resolved = nexusDataPath(VOTE_RECORDS_DATA_CATEGORY, VOTE_RECORDS_FILENAME);
  // Defense-in-depth (#3991): nexusDataPath joins a FIXED category + filename
  // (no caller/user input) so traversal is structurally impossible. But fail
  // closed against a future resolver regression: the result must be absolute,
  // end with the expected `governance/<file>` suffix, and live under a
  // recognized `.nexus-agents` data root — either the homedir/sandbox data dir
  // or, when `governance` routes per-repo, a `<repo>/.nexus-agents/governance/`
  // location (the base differs by layout, so we accept either).
  const expectedSuffix = `${VOTE_RECORDS_DATA_CATEGORY}${sep}${VOTE_RECORDS_FILENAME}`;
  const underHomedirRoot = isWithin(getNexusDataDir(), resolved);
  const underRepoDataDir = resolved.includes(
    `.nexus-agents${sep}${VOTE_RECORDS_DATA_CATEGORY}${sep}`
  );
  if (
    !isAbsolute(resolved) ||
    !resolved.endsWith(expectedSuffix) ||
    !(underHomedirRoot || underRepoDataDir)
  ) {
    return undefined;
  }
  return resolved;
}

/** Options for {@link persistVoteRecord}. `sequence`/`previousHash` are assigned by the store. */
export interface PersistVoteRecordOptions extends Omit<
  BuildVoteRecordInput,
  'previousHash' | 'sequence'
> {
  /**
   * Override the artifact path; takes precedence over {@link VOTE_RECORDS_PATH_ENV}
   * and the {@link nexusDataPath} resolution (see {@link resolveVoteRecordsPath}).
   */
  readonly filePath?: string | undefined;
  readonly logger?: ILogger | undefined;
}

/**
 * Persist an authentic vote record at vote time. Best-effort and append-only:
 * reads the ledger tip (max sequence + advisory last hash), assigns the next
 * monotonic `sequence`, builds a self-hashed record, and appends one JSON line.
 * Returns the written record (or undefined when the path could not be resolved /
 * the write failed) — persistence never throws into the vote path (an audit sink
 * must not break the operation it observes).
 *
 * RUNTIME LEDGER (#3991, design vote 7-0): the default path now routes through
 * {@link nexusDataPath} under `governance/`, so it essentially always resolves to
 * a writable `.nexus-agents/governance/` location (sandbox / repo-preferred /
 * homedir) and the server-side write essentially always succeeds. The committed
 * `<repo>/governance/vote-records.jsonl` ledger the promotion gate (#3895) reads
 * is a SEPARATE caller-commits artifact (deferred), reached only via the
 * {@link VOTE_RECORDS_PATH_ENV} override.
 *
 * Path precedence: `opts.filePath` > {@link VOTE_RECORDS_PATH_ENV} >
 * `nexusDataPath('governance', 'vote-records.jsonl')`.
 */
export function persistVoteRecord(opts: PersistVoteRecordOptions): VoteRecord | undefined {
  const logger = opts.logger ?? createLogger({ component: 'vote-record-store' });
  const filePath = opts.filePath ?? resolveVoteRecordsPath();
  if (filePath === undefined) {
    // Post-#3991 this is rare: the canonical resolver almost always returns a
    // path. It happens only on a fail-closed traversal rejection or resolver
    // failure — surface the write-failed guidance rather than the obsolete
    // "no repo root" message.
    logger.warn(voteRecordWriteFailedMessage('<unresolved>'), { id: opts.id });
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
  if (!existsSync(filePath)) return { records: [], invalidLines: [] };
  return parseVoteRecordsText(readFileSync(filePath, 'utf-8'));
}

/**
 * Parse JSONL vote-record text into records + the 1-based line numbers that
 * failed to parse/validate. The disk-free core of {@link readVoteRecords}, split
 * out (#3927) so the authority-tier gate (`scripts/check-authority-tier-drift.ts`)
 * can resolve `ratificationVoteRef` against the committed ledger TEXT in a pure,
 * unit-testable path without touching the filesystem. Blank lines are skipped.
 * Order is NOT significant — the set is verified by {@link verifyVoteRecordSet}.
 */
export function parseVoteRecordsText(text: string): {
  readonly records: VoteRecord[];
  readonly invalidLines: number[];
} {
  const records: VoteRecord[] = [];
  const invalidLines: number[] = [];
  const lines = text.split('\n').filter((l) => l.trim() !== '');
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
