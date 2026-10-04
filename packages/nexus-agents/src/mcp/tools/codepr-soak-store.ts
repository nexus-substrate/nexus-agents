/**
 * Durable code-PR guards-green-soak store (#3670, Stage 2.5).
 *
 * The SOAK-evidence persistence the {@link evaluateCodePrEnableReadiness}
 * double-gate consumes for its `guards-green-soak` criterion. Each AUDIT-mode
 * cycle that runs {@link planCodePrRun} in dry-run over a code-touching
 * remediation appends ONE data point here: green (no guard denial) or denied.
 *
 * The readiness gate wants CONSECUTIVE green dry-runs (`consecutiveGreenDryRuns`
 * compared against `minGuardsGreenSoak`) — a denial RESETS the streak to 0. So
 * the read surface ({@link readCodePrGuardsGreenSoak}) counts the TRAILING run of
 * production green records: the number of production green data points since the
 * last production denial. Test rows are excluded and counted in the summary. This
 * matches the readiness semantics exactly (a single denial mid-soak forfeits the
 * accumulated streak, which is the conservative, fail-closed reading).
 *
 * Persistence mirrors the audit-mode soak store (#3762): the shared
 * {@link JsonlStore} primitive under `NEXUS_DATA_DIR` (hydrate-on-construct,
 * append-on-write, Zod-validate-each-line, oldest-eviction). NO push, NO PR-open,
 * NO live writes — this only records what the dry-run orchestrator already did
 * with zero blast radius.
 *
 * @module mcp/tools/codepr-soak-store
 */

import { z } from 'zod';

import { getTimeProvider } from '../../core/index.js';
import { JsonlStore } from '../../config/jsonl-store.js';
import { nexusDataPath } from '../../config/nexus-data-dir.js';
import type { GuardDenialReason } from './codepr-guards.js';

/**
 * One durable code-PR soak data point — the outcome of a single dry-run
 * {@link planCodePrRun} over a proposed code-touching remediation change set.
 * Records ONLY realized facts (a green/denied verdict + non-secret counts); the
 * orchestrator already discarded its throwaway worktree before this is written.
 */
export const CodePrSoakRecordSchema = z
  .object({
    /** ISO-8601 capture time. */
    timestamp: z.string(),
    /** Correlates the data point to the dry-run's orchestrator runId. */
    runId: z.string(),
    /** The improvement signal's stable key that triggered the dry-run. */
    signalKey: z.string(),
    /** Explicit provenance on new writes; absent only on legacy records. */
    origin: z.enum(['production', 'test']).optional(),
    /** True when the dry-run plan succeeded with ZERO guard denial. */
    green: z.boolean(),
    /** The guard denial reason when `green` is false; omitted for a green plan. */
    denialReason: z.string().optional(),
    /** Files the dry-run plan touched (0 on denial before the diff was realized). */
    filesTouched: z.number().int().nonnegative(),
  })
  .strict();
export type CodePrSoakRecord = z.infer<typeof CodePrSoakRecordSchema>;

/**
 * Retention cap for the durable code-PR soak file. Generous enough to hold a
 * full guards-green soak (the readiness default `minGuardsGreenSoak` is 50, but a
 * real soak interleaves denials) while bounding disk usage via oldest-eviction.
 */
export const CODEPR_SOAK_MAX_RECORDS = 10_000;

/** JSONL file under NEXUS_DATA_DIR holding the durable code-PR soak evidence. */
export function getCodePrSoakFile(): string {
  return nexusDataPath('learning', 'codepr-guards-soak.jsonl');
}

/** Durable sink for code-PR soak records. Persists; never throws. */
export interface CodePrSoakSink {
  record(record: CodePrSoakRecord): void;
}

/** A {@link CodePrSoakSink} that also exposes its persisted records. */
export interface IRecordingCodePrSoakSink extends CodePrSoakSink {
  getRecords(): readonly CodePrSoakRecord[];
}

/**
 * Create a durable code-PR soak sink backed by an append-only JSONL file
 * (reuses the shared {@link JsonlStore} — the same storage seam the #3762
 * audit-mode soak store uses).
 */
export function createCodePrSoakSink(
  filePath: string = getCodePrSoakFile(),
  maxRecords: number = CODEPR_SOAK_MAX_RECORDS
): IRecordingCodePrSoakSink {
  const store = new JsonlStore<CodePrSoakRecord>({
    filePath,
    schema: CodePrSoakRecordSchema,
    maxRecords,
    component: 'CodePrSoakSink',
  });
  return {
    record(record: CodePrSoakRecord): void {
      store.append({ ...record, origin: record.origin ?? soakOrigin() });
    },
    getRecords(): readonly CodePrSoakRecord[] {
      return store.all();
    },
  };
}

let soakSingleton: IRecordingCodePrSoakSink | undefined;

/** Process-wide durable code-PR soak sink (lazily constructed, hydrates from disk). */
export function getCodePrSoakSink(): IRecordingCodePrSoakSink {
  soakSingleton ??= createCodePrSoakSink();
  return soakSingleton;
}

function soakOrigin(): 'production' | 'test' {
  return process.env['VITEST'] === 'true' ? 'test' : 'production';
}

/** Build a green code-PR soak record from a clean dry-run plan. */
export function greenCodePrSoakRecord(args: {
  runId: string;
  signalKey: string;
  filesTouched: number;
}): CodePrSoakRecord {
  return {
    origin: soakOrigin(),
    timestamp: new Date(getTimeProvider().now()).toISOString(),
    runId: args.runId,
    signalKey: args.signalKey,
    green: true,
    filesTouched: args.filesTouched,
  };
}

/** Build a denied code-PR soak record from a guard-denied (or errored) dry-run plan. */
export function deniedCodePrSoakRecord(args: {
  runId: string;
  signalKey: string;
  denialReason: GuardDenialReason;
}): CodePrSoakRecord {
  return {
    origin: soakOrigin(),
    timestamp: new Date(getTimeProvider().now()).toISOString(),
    runId: args.runId,
    signalKey: args.signalKey,
    green: false,
    denialReason: args.denialReason,
    filesTouched: 0,
  };
}

/**
 * Count the CONSECUTIVE production green dry-runs ending at the most-recent production record — the
 * trailing run of `green === true` since the last denial. This is the value fed
 * to {@link evaluateCodePrEnableReadiness} as `consecutiveGreenDryRuns`: a denial
 * anywhere forfeits the streak before it, matching the gate's "N CONSECUTIVE
 * dry-run plans with zero guard denials" requirement.
 *
 * Pure over its input; does no I/O.
 */
export function countTrailingGreen(records: readonly CodePrSoakRecord[]): number {
  // Empty production evidence is unmeasured, represented here by zero.
  if (records.length === 0) return 0;
  let count = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record === undefined || isTestSoakRecord(record)) continue;
    if (record.green) count++;
    else break;
  }
  return count;
}

/**
 * Read the durable soak evidence and return the production consecutive guards-green count —
 * the `consecutiveGreenDryRuns` evidence the code-PR enable-readiness gate
 * consumes. Convenience over {@link countTrailingGreen}.
 */
export function readCodePrGuardsGreenSoak(
  sink: IRecordingCodePrSoakSink = getCodePrSoakSink()
): number {
  return countTrailingGreen(sink.getRecords());
}

/**
 * Legacy migration rule (#7026): ONLY unstamped audit-soak-<digits> keys are
 * known leaked e2e output. Other unstamped rows remain production evidence.
 * Explicit origin takes precedence. Exclusion is read-only, never a ledger rewrite.
 */
function isTestSoakRecord(record: CodePrSoakRecord): boolean {
  return (
    record.origin === 'test' ||
    (record.origin === undefined && /^audit-soak-\d+$/.test(record.signalKey))
  );
}

/** Production-only evidence and visible test exclusions over retained ledger rows. */
export interface CodePrSoakSummary {
  readonly scope: 'production';
  readonly status: 'measured' | 'unmeasured';
  readonly consecutiveGreenDryRuns: number;
  readonly excludedTestRows: number;
}

/** Read production readiness evidence without modifying or removing test rows. */
export function readCodePrSoakSummary(
  sink: IRecordingCodePrSoakSink = getCodePrSoakSink()
): CodePrSoakSummary {
  const records = sink.getRecords();
  const excludedTestRows = records.filter(isTestSoakRecord).length;
  return {
    scope: 'production',
    // Empty and test-only ledgers provide no production measurement.
    status: records.length === excludedTestRows ? 'unmeasured' : 'measured',
    consecutiveGreenDryRuns: countTrailingGreen(records),
    excludedTestRows,
  };
}
