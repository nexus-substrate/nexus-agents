/**
 * nexus-agents/agents - Wave Checkpoint Persistence
 *
 * Persists completed wave results to disk as JSONL after each wave.
 * If the session dies mid-execution, results from finished waves survive.
 *
 * Storage: ~/.nexus-agents/checkpoints/checkpoint-{sessionId}.jsonl
 * Permissions: directory 0o700, files 0o600
 *
 * (Source: Context Exhaustion Prevention - Issue #769 follow-up)
 *
 * @module agents/wave-checkpoint-persistence
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { createLogger } from '../core/logger.js';
import { getTimeProvider } from '../core/index.js';
import type { WaveTaskResult } from './wave-scheduler-types.js';
import type { WaveCheckpointEntry, CheckpointSummary } from './wave-checkpoint-types.js';
import { WaveCheckpointEntrySchema } from './wave-checkpoint-types.js';

const logger = createLogger({ component: 'wave-checkpoint' });

/** Default checkpoint directory under homedir. */
const CHECKPOINT_DIR = path.join('.nexus-agents', 'checkpoints');

/** File permissions: user read/write only. */
const FILE_MODE = 0o600;

/** Directory permissions: user read/write/execute only. */
const DIR_MODE = 0o700;

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Returns the checkpoint directory path, using a custom dir or the default.
 */
function getCheckpointDir(customDir?: string): string {
  if (customDir !== undefined) {
    return path.resolve(customDir);
  }
  return path.join(os.homedir(), CHECKPOINT_DIR);
}

/**
 * Returns the checkpoint file path for a given session.
 */
function getCheckpointPath(sessionId: string, customDir?: string): string {
  return path.join(getCheckpointDir(customDir), `checkpoint-${sessionId}.jsonl`);
}

/**
 * Validates a session ID to prevent path traversal.
 */
function validateSessionId(sessionId: string): Result<string, Error> {
  if (sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
    return err(new Error(`Invalid session ID: contains path traversal characters`));
  }
  if (sessionId.length === 0 || sessionId.length > 128) {
    return err(new Error(`Invalid session ID: must be 1-128 characters`));
  }
  return ok(sessionId);
}

// ============================================================================
// Directory Management
// ============================================================================

/**
 * Ensures the checkpoint directory exists with secure permissions.
 *
 * @param customDir - Optional custom directory path
 * @returns Result with the directory path or an error
 */
export function ensureCheckpointDir(customDir?: string): Result<string, Error> {
  const dirPath = getCheckpointDir(customDir);
  try {
    fs.mkdirSync(dirPath, { recursive: true, mode: DIR_MODE });
    return ok(dirPath);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to create checkpoint directory at ${dirPath}: ${error.message}`));
  }
}

// ============================================================================
// Write
// ============================================================================

/** Options for appending a wave checkpoint. */
export interface AppendCheckpointOptions {
  /** Unique session identifier. */
  readonly sessionId: string;
  /** Zero-based wave index. */
  readonly waveIndex: number;
  /** Task results from the completed wave. */
  readonly results: readonly WaveTaskResult[];
  /** Total estimated tokens for this wave. */
  readonly totalTokens: number;
  /** Wall-clock duration of this wave in ms. */
  readonly durationMs: number;
  /** Optional custom checkpoint directory. */
  readonly customDir?: string;
}

/**
 * Append a wave checkpoint entry to disk.
 *
 * Creates the checkpoint file if it doesn't exist. Each entry is one
 * JSONL line, enabling atomic appends and streaming reads.
 */
export function appendWaveCheckpoint(options: AppendCheckpointOptions): Result<void, Error> {
  const { sessionId, waveIndex, results, totalTokens, durationMs, customDir } = options;

  const idResult = validateSessionId(sessionId);
  if (!idResult.ok) return idResult;

  const dirResult = ensureCheckpointDir(customDir);
  if (!dirResult.ok) return err(dirResult.error);

  const entry: WaveCheckpointEntry = {
    sessionId,
    waveIndex,
    timestamp: new Date(getTimeProvider().now()).toISOString(),
    results: results.map((r) => ({
      taskId: r.taskId,
      success: r.success,
      output: r.output,
      truncated: r.truncated,
      originalLength: r.originalLength,
      estimatedTokens: r.estimatedTokens,
      durationMs: r.durationMs,
      ...(r.error !== undefined && { error: r.error }),
    })),
    totalTokens,
    durationMs,
  };

  const filePath = getCheckpointPath(sessionId, customDir);
  const line = JSON.stringify(entry) + '\n';

  try {
    fs.appendFileSync(filePath, line, { mode: FILE_MODE });
    logger.debug('Wave checkpoint written', { sessionId, waveIndex, filePath });
    return ok(undefined);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to write checkpoint: ${error.message}`));
  }
}

// ============================================================================
// Read
// ============================================================================

/**
 * Load all checkpoint entries for a session from disk.
 *
 * Skips malformed JSONL lines with a warning rather than failing
 * the entire load, since partial recovery is better than none.
 *
 * @param sessionId - Session identifier to load
 * @param customDir - Optional custom checkpoint directory
 * @returns Result with parsed entries or an error
 */
export function loadCheckpoints(
  sessionId: string,
  customDir?: string
): Result<WaveCheckpointEntry[], Error> {
  const idResult = validateSessionId(sessionId);
  if (!idResult.ok) return idResult;

  const filePath = getCheckpointPath(sessionId, customDir);

  if (!fs.existsSync(filePath)) {
    return ok([]);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const entries: WaveCheckpointEntry[] = [];

    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        const validated = WaveCheckpointEntrySchema.safeParse(parsed);
        if (validated.success) {
          entries.push(validated.data);
        } else {
          logger.warn('Skipping malformed checkpoint entry', {
            sessionId,
            error: validated.error.message,
          });
        }
      } catch {
        logger.warn('Skipping unparseable checkpoint line', { sessionId });
      }
    }

    return ok(entries);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to load checkpoints: ${error.message}`));
  }
}

// ============================================================================
// Summarize
// ============================================================================

/**
 * Produce a summary of checkpoint entries for next-session recovery.
 *
 * @param entries - Loaded checkpoint entries
 * @returns Summary or null if entries are empty
 */
export function summarizeCheckpoints(
  entries: readonly WaveCheckpointEntry[]
): CheckpointSummary | null {
  if (entries.length === 0) return null;

  const first = entries[0];
  if (first === undefined) return null;

  const last = entries[entries.length - 1];
  if (last === undefined) return null;

  return {
    sessionId: first.sessionId,
    waveCount: entries.length,
    totalTokens: entries.reduce((sum, e) => sum + e.totalTokens, 0),
    totalTasks: entries.reduce((sum, e) => sum + e.results.length, 0),
    lastTimestamp: last.timestamp,
  };
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Remove the checkpoint file for a session after successful completion.
 *
 * @param sessionId - Session identifier to clean up
 * @param customDir - Optional custom checkpoint directory
 * @returns Result indicating success or an error
 */
export function cleanupCheckpoint(sessionId: string, customDir?: string): Result<void, Error> {
  const idResult = validateSessionId(sessionId);
  if (!idResult.ok) return idResult;

  const filePath = getCheckpointPath(sessionId, customDir);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug('Checkpoint cleaned up', { sessionId, filePath });
    }
    return ok(undefined);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to cleanup checkpoint: ${error.message}`));
  }
}
