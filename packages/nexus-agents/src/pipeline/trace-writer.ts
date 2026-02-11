/**
 * TraceWriter — Disk Persistence for Execution Traces (Epic #952, Phase 2)
 *
 * Subscribes to EventBus and writes JSONL traces to ./runs/{runId}/.
 * Uses buffered async writes to avoid blocking the pipeline hot path.
 *
 * @module pipeline/trace-writer
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createLogger } from '../core/index.js';
import type { IEventBus, PipelineEvent, Unsubscribe } from './event-types.js';
import type { ExecutionTraceEntry } from './trace-schema.js';

const logger = createLogger({ component: 'TraceWriter' });

// ============================================================================
// Configuration
// ============================================================================

/** Options for TraceWriter behavior. */
export interface TraceWriterOptions {
  /** Base directory for run output (default: ./runs). */
  readonly runsDir: string;
  /** Run identifier (typically TaskContract.id). */
  readonly runId: string;
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
  private stopped = false;

  constructor(
    bus: IEventBus,
    private readonly options: TraceWriterOptions
  ) {
    this.runDir = join(options.runsDir, options.runId);
    this.unsubscribe = bus.subscribe({}, (event) => {
      if (!this.stopped) {
        this.buffer.push(this.eventToTrace(event));
      }
    });
  }

  /** Flush buffered events to disk. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    try {
      await mkdir(this.runDir, { recursive: true });

      const lines = this.buffer.map((e) => JSON.stringify(e)).join('\n');

      const tracePath = join(this.runDir, 'trace.jsonl');
      await writeFile(tracePath, lines + '\n', 'utf-8');

      const indexContent = this.buildIndex();
      const indexPath = join(this.runDir, 'index.md');
      await writeFile(indexPath, indexContent, 'utf-8');

      logger.info('Trace flushed', {
        runId: this.options.runId,
        events: this.buffer.length,
      });
    } catch (err) {
      logger.error('Trace flush failed', err instanceof Error ? err : new Error(String(err)));
    }
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
        return {
          executionId: event.executionId,
          modelId: event.model,
          agentId: event.agentId,
          role: event.role,
          durationMs: event.durationMs,
        };
      case 'routing.decision':
        return {
          modelId: event.selectedModel,
          reasoning: event.reasoning,
          decisionPath: event.decisionPath !== undefined ? [...event.decisionPath] : undefined,
        };
      case 'stage.failed':
        return {
          executionId: event.executionId,
          nodeId: event.stageId,
          error: event.error,
          errorTaxonomy: event.errorTaxonomy,
        };
      case 'stage.started':
        return {
          executionId: event.executionId,
          nodeId: event.stageId,
        };
      case 'stage.completed':
        return {
          executionId: event.executionId,
          nodeId: event.stageId,
          durationMs: event.durationMs,
        };
      case 'pipeline.started':
        return { executionId: event.executionId };
      case 'pipeline.completed':
        return {
          executionId: event.executionId,
          durationMs: event.durationMs,
        };
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
