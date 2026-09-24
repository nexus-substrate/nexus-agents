/**
 * Candidate job-result resolution across data directories (#5472).
 *
 * When an MCP server starts, `activeWorkspaceRoot` is initially unset until
 * the client completes its `roots/list` handshake. Jobs dispatched during
 * this window land in `~/.nexus-agents/jobs/` (`nexusSharedPath`), while jobs
 * settled after root discovery land in `<repo>/.nexus-agents/jobs/` (`nexusDataPath`).
 *
 * This module resolves candidate paths, ranks records so terminal status
 * outranks stale pending records, and propagates updates across directories.
 *
 * @module mcp/jobs/job-result-candidates
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { nexusDataPath, nexusSharedPath } from '../../config/nexus-data-dir.js';
import { findRepoRoot } from '../../config/repo-root-detection.js';
import type { ILogger } from '../../core/index.js';
import { JobResultSchema, type JobResult } from './job-result-store.js';
import { isValidJobId } from './job-id.js';

type CandidatePathsResolver = (jobId: string) => readonly string[] | undefined;
let candidatePathsResolverForTests: CandidatePathsResolver | undefined;

/** Test helper — override candidate paths resolution for tests. */
export function _setCandidatePathsResolverForTests(
  resolver: CandidatePathsResolver | undefined
): void {
  candidatePathsResolverForTests = resolver;
}

function getExplicitDataDir(): string | undefined {
  const env = process.env['NEXUS_DATA_DIR']?.trim();
  return env !== undefined && env.length > 0 ? env : undefined;
}

function appendUniquePath(paths: string[], candidate: string | null): void {
  if (candidate !== null && !paths.includes(candidate)) {
    paths.push(candidate);
  }
}

/**
 * Resolves all candidate paths where a job-result sidecar might reside (#5472).
 *
 * Returns all possible candidate paths for a given `jobId`:
 * 1. Primary path (`nexusDataPath('jobs', ...)`)
 * 2. Shared path (`nexusSharedPath('jobs', ...)`)
 * 3. Cwd-discovered repo path (if different and known)
 */
export function candidateJobResultPaths(
  jobId: string,
  resolvePrimary: (subdir: string, ...segments: string[]) => string = nexusDataPath,
  resolveShared: (subdir: string, ...segments: string[]) => string = nexusSharedPath,
  repoRootFinder: (start: string) => string | null = findRepoRoot
): readonly string[] {
  // A job id is interpolated into a file name: an id outside the minted format
  // has no candidate path, so readers report it as not found.
  if (!isValidJobId(jobId)) return [];
  if (candidatePathsResolverForTests !== undefined) {
    const overridden = candidatePathsResolverForTests(jobId);
    if (overridden !== undefined) return overridden;
  }
  const filename = `result-${jobId}.json`;
  const primary = resolvePrimary('jobs', filename);
  if (getExplicitDataDir() !== undefined) {
    return [primary];
  }

  const paths: string[] = [primary];
  appendUniquePath(paths, resolveShared('jobs', filename));

  const cwdRepo = repoRootFinder(process.cwd());
  const cwdRepoPath = cwdRepo !== null ? join(cwdRepo, '.nexus-agents', 'jobs', filename) : null;
  appendUniquePath(paths, cwdRepoPath);

  return paths;
}

function compareTerminalRecords(a: JobResult, b: JobResult): number {
  if (a.status === 'cancelled' && b.status !== 'cancelled') return -1;
  if (b.status === 'cancelled' && a.status !== 'cancelled') return 1;

  const aSettled = Date.parse(a.completedAt ?? a.createdAt);
  const bSettled = Date.parse(b.completedAt ?? b.createdAt);
  if (Number.isFinite(aSettled) && Number.isFinite(bSettled) && aSettled !== bSettled) {
    return bSettled - aSettled;
  }
  return 0;
}

function comparePendingRecords(a: JobResult, b: JobResult): number {
  const aActivity = Date.parse(a.lastProgressAt ?? a.createdAt);
  const bActivity = Date.parse(b.lastProgressAt ?? b.createdAt);
  if (Number.isFinite(aActivity) && Number.isFinite(bActivity) && aActivity !== bActivity) {
    return bActivity - aActivity;
  }
  return 0;
}

/**
 * Compares two job records to determine which is more authoritative (#5472).
 *
 * Ranking rules:
 * 1. Terminal status (`complete`, `failed`, `cancelled`) outranks `pending`.
 * 2. Cancellation preservation (#4017): `cancelled` outranks `complete` and `failed`.
 * 3. If both are terminal (or neither is `cancelled`), later `completedAt ?? createdAt` wins.
 * 4. If both are `pending`, later `lastProgressAt ?? createdAt` wins.
 * 5. Stable tie-break (returns 0).
 */
export function compareJobRecords(a: JobResult, b: JobResult): number {
  const aTerminal = a.status !== 'pending';
  const bTerminal = b.status !== 'pending';

  if (aTerminal && !bTerminal) return -1;
  if (!aTerminal && bTerminal) return 1;

  return aTerminal ? compareTerminalRecords(a, b) : comparePendingRecords(a, b);
}

/**
 * Selects the winning job record among multiple candidate records (#5472),
 * carrying forward any recorded heartbeat (`lastProgressAt`) if the winner
 * lacks one.
 */
export function selectAuthoritativeJobRecord(records: readonly JobResult[]): JobResult {
  const sorted = [...records].sort(compareJobRecords);
  const winner = sorted[0];
  if (winner === undefined) {
    throw new Error('selectAuthoritativeJobRecord called with empty records');
  }

  if (winner.lastProgressAt !== undefined) {
    return winner;
  }

  for (const r of records) {
    if (r.lastProgressAt !== undefined) {
      return { ...winner, lastProgressAt: r.lastProgressAt };
    }
  }

  return winner;
}

/**
 * Read and validate a job-result file from disk. Returns null on parse/schema failure.
 */
export function readJobResultFile(path: string, jobId: string, logger: ILogger): JobResult | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    const parsed = JobResultSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('Job result file failed schema check', { jobId, path });
      return null;
    }
    return parsed.data;
  } catch (err) {
    logger.warn('Job result file unreadable', {
      jobId,
      path,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Read a job-result record across candidate data directories (#5472).
 */
export function readJobResultAcrossCandidates(jobId: string, logger: ILogger): JobResult | null {
  const candidates = candidateJobResultPaths(jobId);
  const records: JobResult[] = [];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const record = readJobResultFile(path, jobId, logger);
    if (record !== null) {
      records.push(record);
    }
  }
  const first = records[0];
  if (first === undefined) return null;
  if (records.length === 1) return first;
  return selectAuthoritativeJobRecord(records);
}

/**
 * Syncs a settled or updated job record to any existing alternate candidate
 * paths (#5472) so readers looking at either repo or shared directories
 * immediately observe the current status.
 */
export function syncAlternateCandidates(
  jobId: string,
  primaryPath: string,
  record: JobResult,
  logger: ILogger,
  persistFn: (path: string, record: JobResult) => void
): void {
  const candidates = candidateJobResultPaths(jobId);
  for (const candidatePath of candidates) {
    if (candidatePath === primaryPath) continue;
    if (!existsSync(candidatePath)) continue;
    try {
      persistFn(candidatePath, record);
      logger.debug('Synced job record to alternate candidate path', {
        jobId,
        path: candidatePath,
        status: record.status,
      });
    } catch (err) {
      logger.warn('Failed to sync job record to alternate candidate path', {
        jobId,
        path: candidatePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
