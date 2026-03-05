/**
 * TraceWriter — Disk Persistence for Execution Traces (Epic #952, Phase 2)
 *
 * Subscribes to EventBus and writes JSONL traces to ./runs/{runId}/.
 * Uses buffered async writes to avoid blocking the pipeline hot path.
 *
 * @module pipeline/trace-writer
 */

import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { createLogger } from '../core/index.js';
import type { IEventBus, PipelineEvent, Unsubscribe } from './event-types.js';
import type { ExecutionTraceEntry } from './trace-schema.js';

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

  constructor(
    bus: IEventBus,
    private readonly options: TraceWriterOptions
  ) {
    this.runDir = join(options.runsDir, options.runId);
    this.maxBuffer = options.maxBufferSize ?? MAX_BUFFER_SIZE;
    this.unsubscribe = bus.subscribe({}, (event) => {
      if (!this.stopped) {
        if (this.buffer.length >= this.maxBuffer) {
          this.buffer.shift();
        }
        this.buffer.push(this.eventToTrace(event));
      }
    });
  }

  /** Flush buffered events to disk. Throws on write failure. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    await mkdir(this.runDir, { recursive: true });

    const lines = this.buffer.map((e) => JSON.stringify(e)).join('\n');

    // Atomic write: trace.jsonl via tmp+rename
    const tracePath = join(this.runDir, 'trace.jsonl');
    const traceTmp = `${tracePath}.tmp.${String(process.pid)}`;
    try {
      await writeFile(traceTmp, lines + '\n', 'utf-8');
      await rename(traceTmp, tracePath);
    } catch (err: unknown) {
      await unlink(traceTmp).catch((unlinkErr: unknown) => {
        const msg = unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr);
        logger.warn('Failed to clean up trace temp file', { path: traceTmp, error: msg });
      });
      throw err;
    }

    // Atomic write: index.md via tmp+rename
    const indexContent = this.buildIndex();
    const indexPath = join(this.runDir, 'index.md');
    const indexTmp = `${indexPath}.tmp.${String(process.pid)}`;
    try {
      await writeFile(indexTmp, indexContent, 'utf-8');
      await rename(indexTmp, indexPath);
    } catch (err: unknown) {
      await unlink(indexTmp).catch((unlinkErr: unknown) => {
        const msg = unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr);
        logger.warn('Failed to clean up index temp file', { path: indexTmp, error: msg });
      });
      throw err;
    }

    logger.info('Trace flushed', {
      runId: this.options.runId,
      events: this.buffer.length,
    });
  }

  /** Stop subscribing to events. */
  stop(): void {
    this.stopped = true;
    this.unsubscribe();
  }

  /** Convert a PipelineEvent to an ExecutionTraceEntry. */
  private eventToTrace(event: PipelineEvent): ExecutionTraceEntry {
    const base: ExecutionTraceEntry = {
      timestamp: event.timestamp,
      runId: this.options.runId,
      eventType: event.type,
    };

    return {
      ...base,
      ...this.extractAttribution(event),
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
  private buildIndex(): string {
    const lines = [
      `# Run: ${this.options.runId}`,
      '',
      `**Generated:** ${new Date().toISOString()}`,
      `**Events:** ${String(this.buffer.length)}`,
      '',
      '## Event Summary',
      '',
    ];

    const counts = new Map<string, number>();
    for (const entry of this.buffer) {
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
    return { ...base, error: event.error, errorTaxonomy: event.errorTaxonomy };
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
