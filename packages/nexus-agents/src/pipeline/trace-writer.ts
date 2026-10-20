/**
 * TraceWriter — Disk Persistence for Execution Traces (Epic #952, Phase 2)
 *
 * Subscribes to EventBus and writes JSONL traces to ./runs/{runId}/.
 * Uses buffered async writes to avoid blocking the pipeline hot path.
 *
 * @module pipeline/trace-writer
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveInsideRoot } from '../security/safe-path.js';

import { createLogger } from '../core/index.js';
import type { IEventBus, PipelineEvent, Unsubscribe } from './event-types.js';
import {
  TraceOriginSchema,
  TraceRunOriginSchema,
  TraceAttributionSnapshotSchema,
  traceRelation,
  type ExecutionTraceEntry,
  type TraceRunOrigin,
} from './trace-schema.js';
import {
  relationCounts,
  traceDigest,
  TRACE_ATTRIBUTION_FILE,
  MAX_TRACE_ATTRIBUTION_BYTES,
} from './trace-attribution.js';

const logger = createLogger({ component: 'TraceWriter' });

// ============================================================================
// Configuration
// ============================================================================

/** Maximum buffer entries before FIFO eviction. */
const MAX_BUFFER_SIZE = 50_000;

/** Options for TraceWriter behavior. */
export interface TraceWriterOptions {
  /** Base directory for run output (default: ./runs). */
  readonly runsDir: string;
  /** Run identifier (typically TaskContract.id). */
  readonly runId: string;
  /** Maximum buffer entries before eviction (default: 50,000). */
  readonly maxBufferSize?: number;
  /** Explicit expected producer context. Run equality never identifies an invocation. */
  readonly origin?: TraceRunOrigin;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Subscribes to EventBus, buffers events, writes trace.jsonl on flush.
 */
export class TraceWriter {
  private readonly buffer: ExecutionTraceEntry[] = [];
  private readonly unsubscribe: Unsubscribe;
  private readonly runDir: string;
  private readonly maxBuffer: number;
  private stopped = false;
  private observed = 0;
  private foreignDropped = 0;
  private evicted = 0;
  private countsOverflow = false;
  private pendingFlush: Promise<void> | undefined;
  private flushAgain = false;

  constructor(
    bus: IEventBus,
    private readonly options: TraceWriterOptions
  ) {
    const origin =
      options.origin === undefined ? undefined : TraceRunOriginSchema.parse(options.origin);
    if (origin !== undefined && origin.runId !== options.runId)
      throw new Error('Trace capture run mismatch');
    this.options = { ...options, ...(origin === undefined ? {} : { origin }) };
    this.runDir = resolve(options.runsDir, options.runId);
    this.maxBuffer = options.maxBufferSize ?? MAX_BUFFER_SIZE;
    if (!Number.isSafeInteger(this.maxBuffer) || this.maxBuffer < 1)
      throw new Error('Invalid trace buffer size');
    this.unsubscribe = bus.subscribe({}, (event) => {
      if (this.stopped) return;
      this.countsOverflow ||= this.observed === Number.MAX_SAFE_INTEGER;
      if (this.countsOverflow) return;
      this.observed++;
      const entry = this.eventToTrace(event);
      if (entry === null) {
        this.foreignDropped++;
        return;
      }
      if (this.buffer.length >= this.maxBuffer) {
        this.buffer.shift();
        this.evicted++;
      }
      this.buffer.push(entry);
    });
  }

  /**
   * Serializes/coalesces bounded pending work. Each snapshot freezes rows and counters
   * before its first await. Files rename individually; readers verify their digest binding.
   */
  flush(): Promise<void> {
    if (this.pendingFlush !== undefined) {
      this.flushAgain = true;
      return this.pendingFlush;
    }
    this.pendingFlush = this.flushSnapshots().finally(() => {
      this.pendingFlush = undefined;
    });
    return this.pendingFlush;
  }

  private async flushSnapshots(): Promise<void> {
    do {
      this.flushAgain = false;
      if (this.countsOverflow) throw new Error('Trace observation counter overflow');
      const entries = [...this.buffer];
      const content =
        entries.length === 0 ? '' : entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      const snapshot = TraceAttributionSnapshotSchema.parse({
        attributionVersion: 1,
        runId: this.options.runId,
        ...(this.options.origin === undefined ? {} : { captureOrigin: this.options.origin }),
        traceSha256: traceDigest(content),
        traceBytes: Buffer.byteLength(content),
        writerObserved: {
          observed: this.observed,
          foreignDropped: this.foreignDropped,
          evicted: this.evicted,
        },
        retained: relationCounts(entries),
      });
      const metadata = JSON.stringify(snapshot) + '\n';
      if (Buffer.byteLength(metadata) > MAX_TRACE_ATTRIBUTION_BYTES)
        throw new Error('Trace metadata exceeds read cap');
      const runDir = this.containedRunDirectory();
      const index = this.buildIndex(entries);
      await mkdir(runDir, { recursive: true });
      await writeAtomic(join(runDir, 'trace.jsonl'), content);
      await writeAtomic(join(runDir, TRACE_ATTRIBUTION_FILE), metadata);
      await writeAtomic(join(runDir, 'index.md'), index);
      logger.info('Trace flushed', { runId: this.options.runId, events: entries.length });
    } while (this.needsAnotherFlush());
  }

  /** Refuse unsafe output during optional diagnostic flush, not task admission. */
  private containedRunDirectory(): string {
    const root = resolve(this.options.runsDir);
    const directory = resolveInsideRoot(this.runDir, root);
    const canonicalRoot = resolveInsideRoot(root, root);
    if (canonicalRoot === null || directory === null || directory === canonicalRoot)
      throw new Error('Trace output must be a contained descendant of runsDir');
    return directory;
  }

  /** Read through a call: another request can set this flag across awaits. */
  private needsAnotherFlush(): boolean {
    return this.flushAgain;
  }

  /** Stop subscribing to events. */
  stop(): void {
    this.stopped = true;
    this.unsubscribe();
  }

  /** Convert a PipelineEvent to an ExecutionTraceEntry. */
  private eventToTrace(event: PipelineEvent): ExecutionTraceEntry | null {
    const parsed = TraceOriginSchema.safeParse(event.origin);
    const origin = parsed.success ? parsed.data : undefined;
    const captureRelation = traceRelation(
      event.type,
      origin,
      this.options.origin,
      this.options.runId
    );
    if (captureRelation === 'foreign') return null;
    const base: ExecutionTraceEntry = {
      attributionVersion: 1,
      captureRelation,
      ...(origin === undefined ? {} : { origin }),
      ...(this.options.origin === undefined ? {} : { captureOrigin: { ...this.options.origin } }),
      ...(event.origin !== undefined && !parsed.success
        ? { attributionIssue: 'invalid_origin' as const }
        : {}),
      timestamp: event.timestamp,
      runId: this.options.runId,
      eventType: event.type,
    };

    return {
      ...base,
      ...this.extractAttribution(event),
      ...extractIdentity(event),
      ...extractSignal(event),
    };
  }

  /** Extract attribution fields from typed events. */

  private extractAttribution(event: PipelineEvent): Partial<ExecutionTraceEntry> {
    switch (event.type) {
      case 'model.called':
        return extractModelAttribution(event);
      case 'routing.decision':
        return extractRoutingAttribution(event);
      case 'stage.failed':
      case 'stage.started':
      case 'stage.completed':
        return extractStageAttribution(event);
      case 'pipeline.started':
      case 'pipeline.completed':
        return extractPipelineAttribution(event);
      case 'wave.started':
      case 'wave.completed':
        return extractWaveAttribution(event);
      default:
        return {};
    }
  }

  /** Build a markdown index summary for this run. */
  private buildIndex(entries: readonly ExecutionTraceEntry[]): string {
    const lines = [
      `# Run: ${this.options.runId}`,
      '',
      `**Generated:** ${new Date().toISOString()}`,
      `**Events:** ${String(entries.length)}`,
      '',
      '## Event Summary',
      '',
    ];

    const counts = new Map<string, number>();
    for (const entry of entries) {
      const prev = counts.get(entry.eventType) ?? 0;
      counts.set(entry.eventType, prev + 1);
    }

    for (const [type, count] of counts) {
      lines.push(`- ${type}: ${String(count)}`);
    }

    lines.push('');
    return lines.join('\n');
  }
}

/** Extract attribution from model.called events. */
function extractModelAttribution(
  event: PipelineEvent & { type: 'model.called' }
): Partial<ExecutionTraceEntry> {
  return {
    executionId: event.executionId,
    modelId: event.model,
    agentId: event.agentId,
    role: event.role,
    durationMs: event.durationMs,
  };
}

/** Extract attribution from routing.decision events. */
function extractRoutingAttribution(
  event: PipelineEvent & { type: 'routing.decision' }
): Partial<ExecutionTraceEntry> {
  const path = event.decisionPath !== undefined ? [...event.decisionPath] : undefined;
  return { modelId: event.selectedModel, reasoning: event.reasoning, decisionPath: path };
}

/** Extract attribution from pipeline lifecycle events. */
function extractPipelineAttribution(
  event: PipelineEvent & { type: 'pipeline.started' | 'pipeline.completed' }
): Partial<ExecutionTraceEntry> {
  if (event.type === 'pipeline.completed') {
    return { executionId: event.executionId, durationMs: event.durationMs };
  }
  return { executionId: event.executionId };
}

/** Extract attribution from stage lifecycle events. */
function extractStageAttribution(
  event: PipelineEvent & { type: 'stage.failed' | 'stage.started' | 'stage.completed' }
): Partial<ExecutionTraceEntry> {
  const base = { executionId: event.executionId, nodeId: event.stageId };
  if (event.type === 'stage.failed') {
    return {
      ...base,
      error: event.error,
      errorTaxonomy: event.errorTaxonomy,
      // #4194 added `model` to StageFailedEvent so a failed stage could be
      // attributed to the model that ran it, and `ExecutionTraceEntry` has had a
      // `modelId` slot for it all along. This branch re-packed the record
      // without it, so `query_trace` could not attribute a failure even when the
      // emitter knew exactly which model produced it. Omitted, never guessed,
      // when the stage had no single model — which is what the emitter's own
      // comment requires.
      ...(event.model !== undefined ? { modelId: event.model } : {}),
    };
  }
  if (event.type === 'stage.completed') {
    return { ...base, durationMs: event.durationMs };
  }
  return base;
}

/** Extract attribution from wave dispatch events. */
function extractWaveAttribution(
  event: PipelineEvent & { type: 'wave.started' | 'wave.completed' }
): Partial<ExecutionTraceEntry> {
  const base = {
    executionId: event.executionId,
    waveNumber: event.waveNumber,
    totalWaves: event.totalWaves,
  };
  if (event.type === 'wave.started') {
    return { ...base, workerCount: event.workerCount };
  }
  return { ...base, durationMs: event.durationMs, workerCount: event.successes + event.errors };
}

/** Exclusive temporary names are filesystem mechanics, never producer identities. */
async function writeAtomic(path: string, content: string): Promise<void> {
  const temporary = `${path}.tmp.${randomUUID()}`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, path);
  } catch (cause: unknown) {
    await unlink(temporary).catch((cleanup: unknown) => {
      const error = cleanup instanceof Error ? cleanup.message : String(cleanup);
      logger.warn('Failed to clean up trace temporary file', { path: temporary, error });
    });
    throw cause;
  }
}

/** Only these event discriminants declare a genuine task identity. */
function taskIdentity(event: PipelineEvent): string | undefined {
  switch (event.type) {
    case 'task.created':
    case 'task.status_changed':
    case 'task.completed':
    case 'task.failed':
    case 'pipeline.started':
      return event.taskId;
    default:
      return undefined;
  }
}

function extractIdentity(event: PipelineEvent): Partial<ExecutionTraceEntry> {
  const result: Partial<ExecutionTraceEntry> = {};
  const identities = {
    intentId: event.intentId,
    attemptId: event.attemptId,
    // CompositeRouter uses routing.taskId for a task-content prefix, not an ID.
    taskId: taskIdentity(event),
    ...(event.type === 'tool.invoked' || event.type === 'tool.completed'
      ? { invocationId: event.invocationId }
      : {}),
  };
  for (const key of ['taskId', 'attemptId', 'intentId', 'invocationId'] as const) {
    const value: unknown = Reflect.get(identities, key);
    if (typeof value !== 'string') continue;
    if (value.length === 0 || value.length > 256) {
      result.provenanceTruncated = true;
      continue;
    }
    result[key] = value;
  }
  return result;
}

/** Bounded allowlist; no prompt, arbitrary payload, or dynamic serialization. */
function extractSignal(event: PipelineEvent): Partial<ExecutionTraceEntry> {
  const result: Partial<ExecutionTraceEntry> = {};
  const bounded = (value: string, limit = 256): string => {
    if (value.length > limit) result.provenanceTruncated = true;
    return value.slice(0, limit);
  };
  if (event.type === 'signal.vote_rejected') {
    result.proposalId = bounded(event.proposalId);
    result.approvalPercentage = event.approvalPercentage;
    if (event.rejectionRules !== undefined) {
      if (event.rejectionRules.length > 20) result.provenanceTruncated = true;
      result.rejectionRules = event.rejectionRules.slice(0, 20).map((rule) => bounded(rule));
    }
  } else if (event.type === 'signal.fitness_declined') {
    result.score = event.score;
    result.floor = event.floor;
    if (event.dimension !== undefined) result.dimension = bounded(event.dimension);
  } else if (event.type === 'signal.swarm_unhealthy') {
    result.agentId = bounded(event.agentId);
    result.reason = bounded(event.reason, 1024);
  }
  return result;
}
