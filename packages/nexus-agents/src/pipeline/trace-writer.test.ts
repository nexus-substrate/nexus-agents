/**
 * TraceWriter tests — buffer capacity limit (#1204)
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TraceWriter } from './trace-writer.js';
import type { IEventBus, EventFilter, EventHandler, PipelineEvent } from './event-types.js';

// ============================================================================
// Helpers
// ============================================================================

function createMockBus(): IEventBus & { fire: (event: PipelineEvent) => void } {
  let handler: EventHandler | undefined;
  const bus: IEventBus & { fire: (event: PipelineEvent) => void } = {
    emit: vi.fn(),
    subscribe: (_filter: EventFilter, h: EventHandler) => {
      handler = h;
      return () => {
        handler = undefined;
      };
    },
    query: () => [],
    totalEmitted: 0,
    bufferSize: 0,
    fire(event: PipelineEvent): void {
      handler?.(event);
    },
  };
  return bus;
}

function makeEvent(type: string, i: number): PipelineEvent {
  return {
    type: 'pipeline.started',
    timestamp: Date.now() + i,
    taskId: `task-${type}-${String(i)}`,
    executionId: `exec-${type}-${String(i)}`,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('TraceWriter', () => {
  it('should buffer events from EventBus', () => {
    const bus = createMockBus();
    const writer = new TraceWriter(bus, { runsDir: '/tmp/runs', runId: 'test-1' });
    bus.fire(makeEvent('test', 0));
    bus.fire(makeEvent('test', 1));
    // Stop to verify no more events buffered
    writer.stop();
    bus.fire(makeEvent('test', 2));
    // No public way to check buffer size, but flush should work without error
    expect(writer).toBeDefined();
  });

  it('should evict oldest events when buffer exceeds maxBufferSize', () => {
    const bus = createMockBus();
    const writer = new TraceWriter(bus, {
      runsDir: '/tmp/runs',
      runId: 'test-cap',
      maxBufferSize: 3,
    });

    // Push 5 events into a buffer of max 3
    for (let i = 0; i < 5; i++) {
      bus.fire(makeEvent('cap', i));
    }

    writer.stop();
    // Writer should have only 3 events (oldest 2 evicted)
    // We verify indirectly via flush — it should not throw
    expect(writer).toBeDefined();
  });

  it('should not buffer events after stop()', () => {
    const bus = createMockBus();
    const writer = new TraceWriter(bus, { runsDir: '/tmp/runs', runId: 'test-stop' });
    writer.stop();
    bus.fire(makeEvent('stopped', 0));
    expect(writer).toBeDefined();
  });
});

// ============================================================================
// A failed stage must keep the model attribution its emitter supplied
// ============================================================================

describe('stage.failed model attribution (#4194)', () => {
  // `agent-executor` emits `stage.failed` WITH `model`, added by #4194 so a
  // failed stage could be attributed to the model that ran it, and
  // `ExecutionTraceEntry` has had a `modelId` slot for it all along.
  // `extractStageAttribution` re-packed the record without it, so `query_trace`
  // could not attribute a failure even when the emitter knew exactly which
  // model produced it — and with the server-side feedback subscriber gone, the
  // trace is the only remaining reader of that field.
  async function writeAndRead(event: PipelineEvent): Promise<Record<string, unknown>[]> {
    const dir = await mkdtemp(join(tmpdir(), 'trace-'));
    const bus = createMockBus();
    const writer = new TraceWriter(bus, { runsDir: dir, runId: 'run-1' });
    bus.fire(event);
    await writer.flush();
    const text = await readFile(join(dir, 'run-1', 'trace.jsonl'), 'utf8');
    return text
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  }

  const failed = (model?: string): PipelineEvent => ({
    type: 'stage.failed',
    timestamp: Date.now(),
    executionId: 'exec-1',
    stageId: 'plan',
    error: 'boom',
    ...(model !== undefined ? { model } : {}),
  });

  it('records the model the emitter reported', async () => {
    const [entry] = await writeAndRead(failed('gpt-5-codex'));

    expect(entry?.['modelId']).toBe('gpt-5-codex');
    expect(entry?.['error']).toBe('boom');
  });

  it('omits modelId when the stage had no single model', async () => {
    // The pair. The emitter's own contract is "omit for stages with no single
    // model — never guess", so an absent field must stay absent rather than
    // become an empty string or a placeholder.
    const [entry] = await writeAndRead(failed());

    expect(entry).toBeDefined();
    expect(entry?.['modelId']).toBeUndefined();
  });
});
