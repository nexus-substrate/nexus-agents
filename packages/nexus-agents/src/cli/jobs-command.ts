/**
 * nexus-agents/cli - Jobs Command
 *
 * `nexus-agents jobs prune [--dry-run]` runs the job-record retention sweep
 * (#6224, closing #4976 gap 2) on demand and prints what it did. The same
 * sweep runs from `runAsJob` once per process per hour; this command is the
 * operator's way to run it now, and `--dry-run` is the way to see what an
 * hour-from-now sweep would do without doing it.
 *
 * @module cli/jobs-command
 */

import type { CliExitResult, ParsedCliArgs } from '../cli-types.js';
import { EXIT_CODES, cliExit, cliExitFromStatus } from '../cli-types.js';
import { getTimeProvider } from '../core/index.js';
import { nexusDataPath } from '../config/nexus-data-dir.js';
import {
  JOB_RECORD_RETENTION_MS,
  pruneJobRecords,
  type JobPruneCounts,
} from '../mcp/jobs/job-result-store.js';

/** Writes a line to stdout (single sink keeps output testable/consistent). */
function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

function printUsage(): void {
  write('Usage: nexus-agents jobs prune [--dry-run]');
  write('');
  write('  prune       Delete terminal job records older than the retention window');
  write('              and mark abandoned pending records failed. Unreadable files');
  write('              are counted and left in place. Idempotency keys whose record');
  write('              is gone leave with it.');
  write('  --dry-run   Print the counts without changing anything.');
}

/** Render the sweep's counts, one per line, in the order the store defines them. */
function formatCounts(counts: JobPruneCounts, dryRun: boolean): string {
  const header = dryRun ? 'Job record sweep (dry run — nothing changed):' : 'Job record sweep:';
  return [
    header,
    `  deleted: ${String(counts.deleted)}`,
    `  markedAbandoned: ${String(counts.markedAbandoned)}`,
    `  kept: ${String(counts.kept)}`,
    `  unreadable: ${String(counts.unreadable)}`,
    `  deletedKeys: ${String(counts.deletedKeys)}`,
  ].join('\n');
}

/**
 * Handles `nexus-agents jobs <subcommand>`.
 *
 * Only `prune` exists. A missing or unknown subcommand prints usage and exits
 * `INVALID_ARGS`. A jobs directory that exists but cannot be enumerated is a
 * failure exit with the error printed — not a zero-count success.
 *
 * @param args - Parsed CLI arguments
 */
export function handleJobsCommand(args: ParsedCliArgs): CliExitResult {
  if (args.subcommand !== 'prune') {
    printUsage();
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }
  const dryRun = args.options.dryRun;
  const dir = nexusDataPath('jobs');
  write(`Jobs directory: ${dir}`);
  write(`Retention window: ${String(JOB_RECORD_RETENTION_MS)} ms`);
  try {
    const counts = pruneJobRecords({
      nowMs: getTimeProvider().now(),
      retentionMs: JOB_RECORD_RETENTION_MS,
      dryRun,
    });
    write(formatCounts(counts, dryRun));
    return cliExit(EXIT_CODES.SUCCESS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    write(`Job record sweep failed: ${message}`);
    return cliExitFromStatus(1, message);
  }
}
