/** Read-only persisted inputs for the weekly decision-cost report (#6809). */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  summarizeConsensusDecisionTokens,
  type LinkedVote,
  type ConsensusDecisionTokenReport,
} from '../../observability/consensus-decision-tokens.js';
import { verifyVoteRecordSet } from '../../audit/vote-record.js';
import { readVoteRecords, resolveVoteRecordsPath } from '../../audit/vote-record-store.js';
import { isPersistenceEnabled } from '../../config/learning-persistence.js';
import {
  DecisionCostStore,
  type DecisionCostRecord,
} from '../../observability/decision-cost-store.js';
import { nexusDataPath } from '../../config/nexus-data-dir.js';
import { readTraceSnapshot, decodeTraceBytes } from '../../pipeline/trace-attribution.js';
import { isPipelineRunId } from '../../pipeline/pipeline-run-id.js';
import {
  ExecutionTraceEntrySchema,
  type ExecutionTraceEntry,
} from '../../pipeline/trace-schema.js';
import { resolveInsideRoot } from '../../security/safe-path.js';
import { aggregateDecisionCosts } from '../../observability/decision-cost-aggregate.js';
import type { TaskOutcome } from '../../orchestration/outcomes/outcome-types.js';
import { getOutcomeStore } from '../../orchestration/outcomes/outcome-store.js';
import { strategyCostProfiles } from '../../orchestration/strategy-manifest-registry.js';
import type { CostSection, WeatherReportConfig } from './weather-report-types.js';
import type { WeatherReportDeps } from './weather-report.js';

/** Same per-file read bound as query_trace (100 MB). */
const MAX_TRACE_FILE_BYTES = 100 * 1024 * 1024;
type PipelineTraceMeasurement = 'measured' | 'partial' | 'incomplete' | 'unmeasured' | 'unreadable';

/** Validate the whole trace before allowing any surviving row to certify a run. */
function traceInWindow(path: string, runId: string, since: number): PipelineTraceMeasurement {
  const stat = statSync(path);
  if (stat.mtimeMs < since) return 'unmeasured';
  if (stat.size > MAX_TRACE_FILE_BYTES) throw new Error('pipeline trace exceeds read cap');
  const content = readFileSync(path);
  const decoded = decodeTraceBytes(content);
  if (decoded === null) throw new Error('Pipeline trace is not valid UTF-8');
  const snapshot = readTraceSnapshot(path, nexusDataPath('runs'), content, runId);
  const inspected = inspectTraceRows(decoded, runId, since);
  if (inspected.requiresBinding && snapshot.status === 'unmeasured') {
    throw new Error('Unmeasured pipeline trace snapshot binding');
  }
  if (snapshot.status !== 'measured') return 'unmeasured';
  const incomplete = snapshot.snapshot.writerObserved.invalidDropped !== 0;
  if (!inspected.measured) return incomplete ? 'incomplete' : 'unmeasured';
  return incomplete ? 'partial' : 'measured';
}

/** Validate all rows before a surviving row can certify logical participation. */
function inspectTraceRows(
  content: string,
  runId: string,
  since: number
): { measured: boolean; requiresBinding: boolean } {
  let measured = false;
  let requiresBinding = false;
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error('invalid persisted pipeline trace JSON');
    }
    const parsed = ExecutionTraceEntrySchema.safeParse(raw);
    if (!parsed.success) throw new Error('invalid persisted pipeline trace entry');
    requiresBinding ||= parsed.data.attributionVersion === 1;
    measured ||= isWindowedDevTrace(parsed.data, runId, since);
  }
  return { measured, requiresBinding };
}

/** Contract IDs can collide; only the dev-stage producer's attribution certifies a run. */
function isWindowedDevTrace(entry: ExecutionTraceEntry, runId: string, since: number): boolean {
  return (
    entry.runId === runId &&
    entry.timestamp >= since &&
    entry.eventType.startsWith('stage.') &&
    entry.attributionVersion === 1 &&
    entry.captureRelation === 'run_related' &&
    entry.origin?.kind === 'run' &&
    entry.origin.producer === 'dev-pipeline' &&
    entry.origin.runId === runId
  );
}

/** Missing/old traces are unmeasured; empty captures can still carry loss evidence. */
function windowedPipelineRun(root: string, runId: string, since: number): PipelineTraceMeasurement {
  try {
    const path = resolveInsideRoot(join(root, runId, 'trace.jsonl'), root);
    if (path === null) return 'unreadable';
    return existsSync(path) ? traceInWindow(path, runId, since) : 'unmeasured';
  } catch {
    return 'unreadable';
  }
}

interface PipelineTraceRead {
  readonly runIds: readonly string[];
  readonly unreadablePipelineTraces: number;
  readonly hasIncompleteCapture: boolean;
}

/** Read each run independently; unreadable runs cannot certify coverage. */
function resolveWeatherPipelineRunIds(
  windowMs: number,
  injected?: readonly string[],
  hasInjectedCosts = false
): PipelineTraceRead {
  const empty = { runIds: [], unreadablePipelineTraces: 0, hasIncompleteCapture: false };
  if (injected !== undefined) return { ...empty, runIds: injected };
  if (hasInjectedCosts || !isPersistenceEnabled()) return empty;
  const root = nexusDataPath('runs');
  if (!existsSync(root)) return empty;
  const since = windowMs > 0 ? Date.now() - windowMs : -Infinity;
  return readWeatherPipelineRuns(root, since);
}

/** Preserve retained joins while withholding coverage for counted or unknown loss. */
function readWeatherPipelineRuns(root: string, since: number): PipelineTraceRead {
  const runIds: string[] = [];
  let unreadablePipelineTraces = 0;
  let hasIncompleteCapture = false;
  const entries = readdirSync(root, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && isPipelineRunId(entry.name)
  );
  for (const entry of entries) {
    const reading = windowedPipelineRun(root, entry.name, since);
    if (reading === 'measured' || reading === 'partial') runIds.push(entry.name);
    hasIncompleteCapture ||= reading === 'partial' || reading === 'incomplete';
    if (reading === 'unreadable') unreadablePipelineTraces++;
  }
  return { runIds, unreadablePipelineTraces, hasIncompleteCapture };
}

/** Use the injected snapshot or the existing durable cost store, within lookback. */
export function resolveWeatherDecisionCosts(
  windowMs: number,
  injected?: readonly DecisionCostRecord[]
): readonly DecisionCostRecord[] {
  if (injected !== undefined) return injected;
  if (!isPersistenceEnabled()) return [];
  const store = new DecisionCostStore();
  if (!store.hydrationComplete) throw new Error('invalid persisted decision cost lines');
  if (windowMs <= 0) return store.all();
  const since = new Date(Date.now() - windowMs).toISOString();
  return store.query({ since });
}

/** The caller supplies injected rows to avoid mixing a test snapshot with a host ledger. */
export function resolveWeatherVoteRecords(
  windowMs: number,
  injectedVotes?: readonly LinkedVote[],
  hasInjectedCosts = false
): readonly LinkedVote[] {
  if (injectedVotes !== undefined) return injectedVotes;
  if (hasInjectedCosts || !isPersistenceEnabled()) return [];
  const path = resolveVoteRecordsPath();
  if (path === undefined || !existsSync(path)) return [];
  const ledger = readVoteRecords(path);
  if (ledger.invalidLines.length > 0) throw new Error('invalid runtime vote ledger lines');
  if (!verifyVoteRecordSet(ledger.records, ledger.redactions).ok) {
    throw new Error('runtime vote ledger integrity check failed');
  }
  const { records } = ledger;
  if (windowMs <= 0) return records;
  const since = new Date(Date.now() - windowMs).toISOString();
  return records.filter((record) => record.recordedAt >= since);
}

/** Keep the routing read restricted to consensus rows; display callers also join pipeline stages. */
function weatherJoinOutcomes(
  windowMs: number,
  includePipelineJoins: boolean
): readonly TaskOutcome[] {
  const since = windowMs > 0 ? new Date(Date.now() - windowMs).toISOString() : undefined;
  return getOutcomeStore().query({
    since,
    ...(includePipelineJoins ? {} : { source: 'consensus' as const }),
  });
}

/** A partial trace read reports surviving counts but cannot certify coverage. */
function withTraceReading(
  tokens: ConsensusDecisionTokenReport,
  traces?: PipelineTraceRead
): ConsensusDecisionTokenReport {
  if (traces === undefined) return tokens;
  return {
    ...tokens,
    unreadablePipelineTraces: traces.unreadablePipelineTraces,
    pipelineOutcomeJoinCoverage:
      traces.unreadablePipelineTraces > 0 ||
      traces.hasIncompleteCapture ||
      traces.runIds.length === 0
        ? null
        : (tokens.pipelineOutcomeJoinCoverage ?? null),
  };
}

/**
 * Builds the cost section (Epic G, #3856): MEASURED per-gate decision-cost
 * aggregates over the lookback window + each strategy's declared cost profile.
 *
 * The strategy cost profiles always come from the manifest registry (pure). The
 * decision-cost records come from `deps.decisionCostRecords` when injected
 * (tests), else from the durable {@link DecisionCostStore} — but ONLY when
 * persistence is enabled, so a persistence-off context (or a test that mocks it
 * off) never constructs the store and the section degrades to an empty
 * `decisionCosts` rather than throwing.
 */
export function buildWeatherCostSection(
  cfg: WeatherReportConfig,
  deps?: WeatherReportDeps,
  includePipelineJoins = false
): CostSection {
  const windowMs = cfg.outcomeLookbackMs;
  const records = resolveWeatherDecisionCosts(windowMs, deps?.decisionCostRecords);
  const votes = resolveWeatherVoteRecords(
    windowMs,
    deps?.voteRecords,
    deps?.decisionCostRecords !== undefined
  );
  const traces = includePipelineJoins
    ? resolveWeatherPipelineRunIds(
        windowMs,
        deps?.pipelineRunIds,
        deps?.decisionCostRecords !== undefined
      )
    : undefined;
  const tokens = summarizeConsensusDecisionTokens(
    records,
    votes,
    weatherJoinOutcomes(windowMs, includePipelineJoins),
    traces?.runIds ?? null
  );
  return {
    decisionCosts: aggregateDecisionCosts(records, windowMs),
    consensusDecisionTokens: withTraceReading(tokens, traces),
    strategyCostProfiles: strategyCostProfiles(),
  };
}
