/**
 * nexus-agents/consensus - Correlation Persistence
 *
 * Disk persistence for CorrelationTracker voting history. Enables Higher-Order
 * Voting (HOV) to accumulate correlation data across process restarts,
 * activating Bayesian correlation awareness.
 *
 * Data: ~/.nexus-agents/voting/correlations.json (mode 0o600)
 *
 * @module consensus/correlation-persistence
 * (Source: Issue #514)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
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

/** Directory under homedir for voting data */
const VOTING_DIR = path.join('.nexus-agents', 'voting');

/** Filename for persisted correlation data */
const CORRELATIONS_FILE = 'correlations.json';

/** File permissions: user read/write only */
const FILE_MODE = 0o600;

/** Directory permissions: user read/write/execute only */
const DIR_MODE = 0o700;

/** Schema version for forward compatibility */
const SCHEMA_VERSION = 1;

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
 * Top-level persisted correlation data structure.
 * Contains schema version for forward compatibility
 * and an array of proposals that can be replayed.
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
 * Returns the absolute path to the correlation data file.
 *
 * @returns Absolute path to ~/.nexus-agents/voting/correlations.json
 */
export function getCorrelationDataPath(): string {
  return path.join(os.homedir(), VOTING_DIR, CORRELATIONS_FILE);
}

/**
 * Ensures the voting data directory exists with appropriate permissions.
 */
function ensureVotingDirectory(): Result<void, Error> {
  const dirPath = path.join(os.homedir(), VOTING_DIR);
  try {
    fs.mkdirSync(dirPath, { recursive: true, mode: DIR_MODE });
    return ok(undefined);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to create voting directory at ${dirPath}: ${error.message}`));
  }
}

// ============================================================================
// Save
// ============================================================================

/**
 * Merges existing and new proposals, deduplicating by proposalId.
 * Applies FIFO eviction when the merged set exceeds maxProposals.
 */
function mergeProposals(
  existingProposals: PersistedProposal[],
  newProposals: PersistedProposal[],
  maxProposals: number
): PersistedProposal[] {
  // Deduplicate by proposalId, preferring new entries
  const proposalMap = new Map<string, PersistedProposal>();
  for (const proposal of existingProposals) {
    proposalMap.set(proposal.proposalId, proposal);
  }
  for (const proposal of newProposals) {
    proposalMap.set(proposal.proposalId, proposal);
  }

  const merged = Array.from(proposalMap.values());

  // Sort by timestamp ascending for consistent replay order
  merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // FIFO eviction to respect maxProposals
  if (merged.length > maxProposals) {
    return merged.slice(merged.length - maxProposals);
  }

  return merged;
}

/**
 * Saves correlation data to disk.
 *
 * Performs an atomic write (write to temp file, then rename) to prevent
 * corruption from interrupted writes. File permissions are set to 0o600.
 *
 * @param proposals - Array of proposals with their votes and outcomes to persist
 * @param config - Higher-order voting config (used for maxProposals eviction)
 * @returns Result indicating success or failure
 */
export function saveCorrelationData(
  proposals: PersistedProposal[],
  config: HigherOrderVotingConfig = DEFAULT_HIGHER_ORDER_CONFIG
): Result<void, Error> {
  const dirResult = ensureVotingDirectory();
  if (!dirResult.ok) return dirResult;

  const filePath = getCorrelationDataPath();

  // Load existing proposals to merge
  let existingProposals: PersistedProposal[] = [];
  const loadResult = loadCorrelationData();
  if (loadResult.ok) {
    existingProposals = loadResult.value.proposals;
  }

  const merged = mergeProposals(existingProposals, proposals, config.maxProposals);

  const data: PersistedCorrelationData = {
    version: SCHEMA_VERSION,
    proposals: merged,
    savedAt: new Date().toISOString(),
  };

  const json = JSON.stringify(data, null, 2);
  const tempPath = `${filePath}.tmp.${String(process.pid)}`;

  try {
    // Atomic write: write to temp, then rename
    fs.writeFileSync(tempPath, json, { encoding: 'utf-8', mode: FILE_MODE });
    fs.renameSync(tempPath, filePath);

    logger.info('Correlation data saved', {
      path: filePath,
      proposalCount: merged.length,
    });

    return ok(undefined);
  } catch (cause: unknown) {
    // Clean up temp file on failure
    try {
      fs.unlinkSync(tempPath);
    } catch (cleanupErr: unknown) {
      const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      logger.debug('Failed to clean up temp file during correlation save', {
        path: tempPath,
        error: msg,
      });
    }

    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to save correlation data: ${error.message}`));
  }
}

// ============================================================================
// Load
// ============================================================================

/** Read and parse JSON from disk. Returns parsed data or error. */
function readAndParseFile(filePath: string): Result<unknown, Error> {
  if (!fs.existsSync(filePath)) {
    return err(new Error(`Correlation data file not found: ${filePath}`));
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to read correlation data: ${error.message}`));
  }

  try {
    return ok(JSON.parse(rawContent) as unknown);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    logger.warn('Corrupt correlation data file, will start fresh', {
      path: filePath,
      error: error.message,
    });
    return err(new Error(`Corrupt correlation data (invalid JSON): ${error.message}`));
  }
}

/** Validate parsed data against schema and version. */
function validateCorrelationData(
  parsed: unknown,
  filePath: string
): Result<PersistedCorrelationData, Error> {
  const validation = PersistedCorrelationDataSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn('Invalid correlation data schema, will start fresh', {
      path: filePath,
      errors: validation.error.issues.map((issue) => issue.message),
    });
    return err(new Error(`Invalid correlation data schema: ${validation.error.message}`));
  }

  if (validation.data.version > SCHEMA_VERSION) {
    logger.warn('Correlation data from newer version, will start fresh', {
      fileVersion: validation.data.version,
      currentVersion: SCHEMA_VERSION,
    });
    return err(
      new Error(
        `Unsupported schema version ${String(validation.data.version)} (current: ${String(SCHEMA_VERSION)})`
      )
    );
  }

  return ok(validation.data);
}

/**
 * Loads and validates correlation data from disk.
 *
 * Handles corrupt files gracefully by logging a warning and returning
 * an error Result. Callers should start fresh on load failure.
 *
 * @returns Result containing validated data or an error
 */
export function loadCorrelationData(): Result<PersistedCorrelationData, Error> {
  const filePath = getCorrelationDataPath();

  const parseResult = readAndParseFile(filePath);
  if (!parseResult.ok) return parseResult;

  const validateResult = validateCorrelationData(parseResult.value, filePath);
  if (!validateResult.ok) return validateResult;

  logger.info('Correlation data loaded', {
    path: filePath,
    proposalCount: validateResult.value.proposals.length,
    savedAt: validateResult.value.savedAt,
  });

  return validateResult;
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

  const loadResult = loadCorrelationData();
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
