/**
 * nexus-agents/consensus - Correlation Persistence
 *
 * Disk persistence for CorrelationTracker voting history. Enables Higher-Order
 * Voting (HOV) to accumulate correlation data across process restarts,
 * activating Bayesian correlation awareness.
 *
 * Storage: append-only JSONL at `~/.nexus-agents/voting/correlations.jsonl`
 * (mode 0o600). Each line is one `PersistedProposal`. Append-only avoids the
 * cross-process read-merge-rename race the previous `correlations.json`
 * design had (#2973): two processes voting concurrently each loaded N
 * entries, each merged their own proposal, each renamed over the same file,
 * losing the loser's proposal. Append guarantees atomic-per-line writes on
 * POSIX so concurrent writers are race-free.
 *
 * Reads dedupe by `proposalId` (last write wins) and apply FIFO eviction
 * past `maxProposals`. A legacy `correlations.json` is read alongside the
 * JSONL on first load (its entries are surfaced like any other history) and
 * is removed by `compactCorrelationData()` after consolidation. New writes
 * always go to the JSONL.
 *
 * @module consensus/correlation-persistence
 * (Source: Issue #514; #2973 for the JSONL switch)
 */

import * as fs from 'node:fs';
import { nexusDataPath } from '../config/nexus-data-dir.js';
import { z } from 'zod';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type { ICorrelationTracker, HigherOrderVotingConfig } from './higher-order-types.js';
import { DEFAULT_HIGHER_ORDER_CONFIG } from './higher-order-types.js';
import type { Vote } from './types-core.js';
import { createCorrelationTracker } from './correlation-tracker.js';

const logger: ILogger = createLogger({ component: 'correlation-persistence' });

/** Subdirectory name under the resolved nexus data dir for voting data. */
const VOTING_SUBDIR = 'voting';

/** Legacy single-JSON file (pre-#2973). Still read on load; never written. */
const CORRELATIONS_FILE = 'correlations.json';

/** Active append-only JSONL store (#2973). */
const CORRELATIONS_JSONL_FILE = 'correlations.jsonl';

/** File permissions: user read/write only */
const FILE_MODE = 0o600;

/** Directory permissions: user read/write/execute only */
const DIR_MODE = 0o700;

/** Schema version for forward compatibility. Bumped to 2 with the JSONL switch. */
const SCHEMA_VERSION = 2;

// ============================================================================
// Persisted Data Types
// ============================================================================

/**
 * A single persisted vote within a proposal.
 */
const PersistedVoteSchema = z.object({
  agentId: z.string(),
  decision: z.enum(['approve', 'reject', 'abstain']),
  confidence: z.number().min(0).max(1),
});

/** Type for a persisted vote entry */
type PersistedVote = z.infer<typeof PersistedVoteSchema>;

/**
 * A persisted proposal with its votes and outcome.
 * Stored as a replayable record so internal tracker state
 * is reconstructed through the public API.
 */
const PersistedProposalSchema = z.object({
  proposalId: z.string(),
  votes: z.array(PersistedVoteSchema),
  outcome: z.enum(['approved', 'rejected']),
  timestamp: z.iso.datetime(),
});

/** Type for a persisted proposal entry */
type PersistedProposal = z.infer<typeof PersistedProposalSchema>;

/**
 * Top-level persisted correlation data structure (legacy `correlations.json`).
 * Kept exported for back-compat — the JSONL format stores `PersistedProposal`
 * directly per line and has no wrapper.
 */
export const PersistedCorrelationDataSchema = z.object({
  version: z.number().int().positive(),
  proposals: z.array(PersistedProposalSchema),
  savedAt: z.iso.datetime(),
});

/** Validated persisted correlation data */
export type PersistedCorrelationData = z.infer<typeof PersistedCorrelationDataSchema>;

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Returns the absolute path to the **legacy** correlation data file. Kept
 * for back-compat — new writes go through `getCorrelationJsonlPath()`.
 */
export function getCorrelationDataPath(): string {
  return nexusDataPath(VOTING_SUBDIR, CORRELATIONS_FILE);
}

/** Returns the absolute path to the active JSONL store (#2973). */
export function getCorrelationJsonlPath(): string {
  return nexusDataPath(VOTING_SUBDIR, CORRELATIONS_JSONL_FILE);
}

/**
 * Ensures the voting data directory exists with appropriate permissions.
 */
function ensureVotingDirectory(): Result<void, Error> {
  const dirPath = nexusDataPath(VOTING_SUBDIR);
  try {
    fs.mkdirSync(dirPath, { recursive: true, mode: DIR_MODE });
    return ok(undefined);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to create voting directory at ${dirPath}: ${error.message}`));
  }
}

// ============================================================================
// Save (append-only, race-free across processes)
// ============================================================================

/**
 * Appends new proposals to the JSONL store. One line per proposal.
 *
 * POSIX `O_APPEND` (used implicitly by `appendFileSync` with `{flag: 'a'}`)
 * guarantees atomic writes for buffer sizes under `PIPE_BUF` (4 KB on Linux,
 * 512 B on macOS). Each line we write is a single `PersistedProposal` — well
 * under those limits in practice for the typical vote-panel size (3–7 voters).
 * Two processes calling this concurrently get all proposals persisted; no
 * read-merge-rename race possible because we never read or rename.
 *
 * @param proposals - Array of proposals with their votes and outcomes to persist
 * @param config - Higher-order voting config (only `maxProposals` is consulted
 *                 on read; this writer is fully append-only)
 * @returns Result indicating success or failure
 */
export function saveCorrelationData(
  proposals: PersistedProposal[],
  // config kept in the signature for ABI compatibility with the legacy
  // implementation; the JSONL writer is append-only so we don't need it here.
  // FIFO truncation happens on read.
  _config: HigherOrderVotingConfig = DEFAULT_HIGHER_ORDER_CONFIG
): Result<void, Error> {
  const dirResult = ensureVotingDirectory();
  if (!dirResult.ok) return dirResult;

  if (proposals.length === 0) return ok(undefined);

  const filePath = getCorrelationJsonlPath();

  try {
    const lines = proposals.map((p) => JSON.stringify(p)).join('\n') + '\n';
    fs.appendFileSync(filePath, lines, { encoding: 'utf-8', mode: FILE_MODE });

    logger.info('Correlation proposals appended', {
      path: filePath,
      proposalCount: proposals.length,
    });

    return ok(undefined);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to append correlation data: ${error.message}`));
  }
}

// ============================================================================
// Load (consolidates JSONL + legacy JSON, dedupes by proposalId, FIFO-truncates)
// ============================================================================

/** Read the legacy `correlations.json` if present; return [] otherwise. */
function loadLegacyJsonProposals(): PersistedProposal[] {
  const filePath = getCorrelationDataPath();
  if (!fs.existsSync(filePath)) return [];

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
  } catch (cause: unknown) {
    logger.warn('Failed to read legacy correlations.json', {
      path: filePath,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (cause: unknown) {
    logger.warn('Corrupt legacy correlations.json — skipping', {
      path: filePath,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return [];
  }

  const result = PersistedCorrelationDataSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn('Invalid legacy correlations.json schema — skipping', {
      path: filePath,
      error: result.error.message,
    });
    return [];
  }
  return result.data.proposals;
}

type LineResult = { kind: 'ok'; proposal: PersistedProposal } | { kind: 'skip'; reason: string };

/** Parse one JSONL line into a typed result so the loader can stay below max-complexity. */
function parseJsonlLine(line: string): LineResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (cause: unknown) {
    return {
      kind: 'skip',
      reason: `JSON.parse: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
  const result = PersistedProposalSchema.safeParse(parsed);
  if (!result.success) return { kind: 'skip', reason: `schema: ${result.error.message}` };
  return { kind: 'ok', proposal: result.data };
}

/** Read JSONL store, dropping malformed lines with a warn log. */
function loadJsonlProposals(): PersistedProposal[] {
  const filePath = getCorrelationJsonlPath();
  if (!fs.existsSync(filePath)) return [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, { encoding: 'utf-8' });
  } catch (cause: unknown) {
    logger.warn('Failed to read correlations.jsonl', {
      path: filePath,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return [];
  }

  const lines = content.split('\n').filter((line) => line.trim() !== '');
  const proposals: PersistedProposal[] = [];
  let skippedCount = 0;
  let firstSkipReason: string | undefined;

  for (const line of lines) {
    const result = parseJsonlLine(line);
    if (result.kind === 'ok') {
      proposals.push(result.proposal);
    } else {
      skippedCount++;
      firstSkipReason ??= result.reason;
    }
  }

  if (skippedCount > 0) {
    logger.warn('Skipped malformed lines in correlations.jsonl', {
      path: filePath,
      skippedCount,
      totalLines: lines.length,
      firstSkipReason,
    });
  }

  return proposals;
}

/**
 * Combines proposals from both stores, dedupes by proposalId (later wins),
 * sorts by timestamp ascending, and FIFO-truncates to `maxProposals`.
 */
function consolidate(
  legacyProposals: PersistedProposal[],
  jsonlProposals: PersistedProposal[],
  maxProposals: number
): PersistedProposal[] {
  const proposalMap = new Map<string, PersistedProposal>();
  // Legacy first, then JSONL — JSONL entries override legacy if same id.
  for (const p of legacyProposals) proposalMap.set(p.proposalId, p);
  for (const p of jsonlProposals) proposalMap.set(p.proposalId, p);

  const all = Array.from(proposalMap.values()).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
  return all.length > maxProposals ? all.slice(all.length - maxProposals) : all;
}

/**
 * Loads and validates correlation data from disk. Combines the JSONL store
 * with the legacy `correlations.json` (if present). Always returns an Ok
 * result when the directory exists; an empty proposals array means "no
 * persisted history" (formerly the "not found" error case).
 */
export function loadCorrelationData(
  config: HigherOrderVotingConfig = DEFAULT_HIGHER_ORDER_CONFIG
): Result<PersistedCorrelationData, Error> {
  const jsonlPath = getCorrelationJsonlPath();
  const legacyPath = getCorrelationDataPath();
  const jsonlExists = fs.existsSync(jsonlPath);
  const legacyExists = fs.existsSync(legacyPath);

  if (!jsonlExists && !legacyExists) {
    return err(new Error(`Correlation data file not found: ${jsonlPath}`));
  }

  const legacy = loadLegacyJsonProposals();
  const jsonl = loadJsonlProposals();
  const proposals = consolidate(legacy, jsonl, config.maxProposals);

  logger.info('Correlation data loaded', {
    legacyCount: legacy.length,
    jsonlCount: jsonl.length,
    afterDedup: proposals.length,
  });

  return ok({
    version: SCHEMA_VERSION,
    proposals,
    savedAt: new Date().toISOString(),
  });
}

// ============================================================================
// Compaction (consolidate JSONL + delete legacy json)
// ============================================================================

/**
 * Rewrites the JSONL store as a deduplicated, sorted snapshot and removes
 * the legacy `correlations.json` (if present). Safe to call periodically
 * (e.g., on session shutdown) to bound the JSONL's size.
 *
 * Within-process: this is the only operation that's NOT race-free across
 * processes. Two processes both running compaction simultaneously could
 * lose appends made between the read and the rename. Callers should
 * serialize compaction — invoke from one process per data dir, or guard
 * with a lockfile.
 */
export function compactCorrelationData(
  config: HigherOrderVotingConfig = DEFAULT_HIGHER_ORDER_CONFIG
): Result<{ before: number; after: number }, Error> {
  const dirResult = ensureVotingDirectory();
  if (!dirResult.ok) return dirResult;

  const legacy = loadLegacyJsonProposals();
  const jsonl = loadJsonlProposals();
  const proposals = consolidate(legacy, jsonl, config.maxProposals);
  const before = legacy.length + jsonl.length;

  const jsonlPath = getCorrelationJsonlPath();
  const tempPath = `${jsonlPath}.tmp.${String(process.pid)}`;
  const body =
    proposals.map((p) => JSON.stringify(p)).join('\n') + (proposals.length > 0 ? '\n' : '');

  try {
    fs.writeFileSync(tempPath, body, { encoding: 'utf-8', mode: FILE_MODE });
    fs.renameSync(tempPath, jsonlPath);
    if (fs.existsSync(getCorrelationDataPath())) {
      fs.unlinkSync(getCorrelationDataPath());
    }
    return ok({ before, after: proposals.length });
  } catch (cause: unknown) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (cleanupErr: unknown) {
      logger.debug('Failed to clean up temp file during compaction', {
        path: tempPath,
        error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      });
    }
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to compact correlation data: ${error.message}`));
  }
}

// ============================================================================
// Persistent Tracker Factory
// ============================================================================

/**
 * Replays persisted proposals into a tracker via `recordProposalVotes()`,
 * reconstructing all internal state through the public API.
 */
function replayProposals(
  tracker: ICorrelationTracker,
  proposals: readonly PersistedProposal[]
): number {
  let replayed = 0;

  for (const proposal of proposals) {
    const votes = new Map<string, Vote>();

    for (const vote of proposal.votes) {
      votes.set(vote.agentId, {
        decision: vote.decision,
        reasoning: 'replayed from persistence',
        confidence: vote.confidence,
      });
    }

    tracker.recordProposalVotes(proposal.proposalId, votes, proposal.outcome);
    replayed++;
  }

  return replayed;
}

/**
 * Creates a correlation tracker pre-loaded with persisted history.
 *
 * On first run (no persisted data), returns a fresh tracker.
 * On subsequent runs, replays all stored proposals through the
 * tracker's public API to reconstruct correlation state.
 *
 * This enables Higher-Order Voting to accumulate enough history
 * across process restarts to activate Bayesian correlation awareness.
 *
 * @param config - Optional partial higher-order voting config
 * @returns A correlation tracker with any persisted history replayed
 */
export function createPersistentCorrelationTracker(
  config?: Partial<HigherOrderVotingConfig>
): ICorrelationTracker {
  const tracker = createCorrelationTracker(config);

  const mergedConfig = { ...DEFAULT_HIGHER_ORDER_CONFIG, ...config };
  const loadResult = loadCorrelationData(mergedConfig);
  if (!loadResult.ok) {
    logger.info('Starting with fresh correlation tracker', {
      reason: loadResult.error.message,
    });
    return tracker;
  }

  const replayedCount = replayProposals(tracker, loadResult.value.proposals);

  logger.info('Correlation tracker restored from persistence', {
    replayedProposals: replayedCount,
    stats: tracker.getStats(),
  });

  return tracker;
}

// ============================================================================
// Proposal Recording Helper
// ============================================================================

/**
 * Creates a persistable proposal record from vote data.
 *
 * Use this to build proposals that can be passed to `saveCorrelationData()`.
 *
 * @param proposalId - Unique proposal identifier
 * @param votes - Map of agent IDs to their votes
 * @param outcome - Final proposal outcome
 * @returns A persistable proposal record
 */
export function createPersistedProposal(
  proposalId: string,
  votes: ReadonlyMap<string, Vote>,
  outcome: 'approved' | 'rejected'
): PersistedProposal {
  const persistedVotes: PersistedVote[] = [];

  for (const [agentId, vote] of votes) {
    persistedVotes.push({
      agentId,
      decision: vote.decision,
      confidence: vote.confidence,
    });
  }

  return {
    proposalId,
    votes: persistedVotes,
    outcome,
    timestamp: new Date().toISOString(),
  };
}
