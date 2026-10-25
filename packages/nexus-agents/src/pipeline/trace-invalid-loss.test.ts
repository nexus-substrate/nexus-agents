/** Invalid capture loss must not poison subsequent rows or evict valid rows (#7552). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { queryTraceFromDisk } from '../mcp/tools/query-trace-tool.js';
import { EventBus } from './event-bus.js';
import type { PipelineEvent } from './event-types.js';
import { TraceWriter } from './trace-writer.js';

const runId = 'invalid-loss-local';
const origin = {
  kind: 'run',
  producer: 'contract-pipeline',
  runId,
  taskId: 'local-task',
  attemptId: 'local-attempt',
} as const;
let directory: string;
const writers: TraceWriter[] = [];

function writer(bus: EventBus, maxBufferSize = 1): TraceWriter {
  const value = new TraceWriter(bus, { runsDir: directory, runId, maxBufferSize, origin });
  writers.push(value);
  return value;
}

function validEvent(): PipelineEvent {
  return {
    type: 'pipeline.started',
    executionId: 'local-execution',
    taskId: origin.taskId,
    attemptId: origin.attemptId,
    origin,
    timestamp: 1,
  };
}

async function expectReadableControl(value: TraceWriter): Promise<void> {
  await value.flush();
  const result = await queryTraceFromDisk({ runId }, directory);
  expect(result.attribution).toMatchObject({
    status: 'measured',
    writerObserved: { observed: 2, invalidDropped: 1, foreignDropped: 0, evicted: 0 },
    retained: { run_related: 0, attempt_owned: 1, global_context: 0, unattributed: 0 },
  });
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({
    eventType: 'pipeline.started',
    taskId: origin.taskId,
    attemptId: origin.attemptId,
    captureRelation: 'attempt_owned',
  });
  const metadata: unknown = JSON.parse(
    await readFile(join(directory, runId, 'trace-attribution.json'), 'utf8')
  );
  expect(metadata).toMatchObject({
    writerObserved: { observed: 2, invalidDropped: 1, foreignDropped: 0, evicted: 0 },
  });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'trace-invalid-loss-'));
});
afterEach(async () => {
  for (const value of writers.splice(0)) value.stop();
  await rm(directory, { recursive: true, force: true });
});

describe('invalid trace capture loss on the actual bus', () => {
  it('counts a conversion throw once and keeps the subsequent valid row readable', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    const badEvent = validEvent();
    // The real bus buffers raw events. Only the trace subscriber reads this getter.
    Object.defineProperty(badEvent, 'origin', {
      get: () => {
        throw new Error('FAKE_TEST conversion failure');
      },
    });
    expect(() => {
      bus.emit(badEvent);
    }).not.toThrow();
    expect(() => {
      bus.emit(validEvent());
    }).not.toThrow();
    expect(bus.totalEmitted).toBe(2);
    expect(bus.bufferSize).toBe(2);
    await expectReadableControl(value);
  });

  it('counts task identity disagreement before buffering so the matching control survives', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit(validEvent());
    bus.emit({
      type: 'pipeline.started',
      executionId: 'contradictory-task-execution',
      taskId: 'different-task',
      attemptId: origin.attemptId,
      origin,
      timestamp: 2,
    });
    expect(bus.totalEmitted).toBe(2);
    await expectReadableControl(value);
  });

  it('counts attempt identity disagreement before buffering so the matching control survives', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit(validEvent());
    bus.emit({
      type: 'pipeline.started',
      executionId: 'contradictory-attempt-execution',
      taskId: origin.taskId,
      attemptId: 'different-attempt',
      origin,
      timestamp: 2,
    });
    expect(bus.totalEmitted).toBe(2);
    await expectReadableControl(value);
  });
});

describe('invalid loss edge controls after the initial RED cases', () => {
  it('emits explicit zero loss for an empty new writer', async () => {
    const value = writer(new EventBus());
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events).toEqual([]);
    expect(result.attribution).toMatchObject({
      status: 'measured',
      writerObserved: { observed: 0, invalidDropped: 0, foreignDropped: 0, evicted: 0 },
      retained: { run_related: 0, attempt_owned: 0, global_context: 0, unattributed: 0 },
    });
    const raw = await readFile(join(directory, runId, 'trace-attribution.json'), 'utf8');
    expect(JSON.parse(raw)).toMatchObject({ writerObserved: { invalidDropped: 0 } });
  });

  it('persists invalid-only observations as readable empty rows with counted loss', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit({ ...validEvent(), attemptId: 'contradictory-attempt' });
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events).toEqual([]);
    expect(result.attribution).toMatchObject({
      status: 'measured',
      writerObserved: { observed: 1, invalidDropped: 1, foreignDropped: 0, evicted: 0 },
      retained: { run_related: 0, attempt_owned: 0, global_context: 0, unattributed: 0 },
    });
    expect(await readFile(join(directory, runId, 'trace.jsonl'), 'utf8')).toBe('');
  });

  it('keeps genuine foreign drops separate from invalid loss and retained participation', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit(validEvent());
    bus.emit({ ...validEvent(), origin: { ...origin, runId: 'foreign-run' } });
    bus.emit({ ...validEvent(), attemptId: 'contradictory-attempt' });
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.attribution).toMatchObject({
      status: 'measured',
      writerObserved: { observed: 3, invalidDropped: 1, foreignDropped: 1, evicted: 0 },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ taskId: origin.taskId, attemptId: origin.attemptId });
  });

  it('counts FIFO eviction separately while an invalid row consumes no buffer slot', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit(validEvent());
    bus.emit({ ...validEvent(), attemptId: 'contradictory-attempt' });
    bus.emit({ ...validEvent(), timestamp: 3 });
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.attribution).toMatchObject({
      status: 'measured',
      writerObserved: { observed: 3, invalidDropped: 1, foreignDropped: 0, evicted: 1 },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ timestamp: 3, taskId: origin.taskId });
  });

  it('preserves totals across repeated and coalesced flushes without counting rows twice', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit(validEvent());
    bus.emit({ ...validEvent(), attemptId: 'contradictory-attempt' });
    const first = value.flush();
    bus.emit({ ...validEvent(), timestamp: 3 });
    const coalesced = value.flush();
    await Promise.all([first, coalesced]);
    const before = await readFile(join(directory, runId, 'trace-attribution.json'), 'utf8');
    await value.flush();
    expect(await readFile(join(directory, runId, 'trace-attribution.json'), 'utf8')).toBe(before);
    expect(await queryTraceFromDisk({ runId }, directory)).toMatchObject({
      events: [{ timestamp: 3 }],
      attribution: {
        status: 'measured',
        writerObserved: { observed: 3, invalidDropped: 1, foreignDropped: 0, evicted: 1 },
      },
    });
  });

  it.each(['observed', 'invalidDropped'] as const)(
    'fails certification explicitly when the %s counter overflows',
    async (counter) => {
      const bus = new EventBus();
      const value = writer(bus);
      // Test-only numeric boundary seam, not a claim of runtime-scale observation.
      expect(Reflect.set(value, counter, Number.MAX_SAFE_INTEGER)).toBe(true);
      bus.emit({ ...validEvent(), attemptId: 'contradictory-attempt' });
      await expect(value.flush()).rejects.toThrow('Trace observation counter overflow');
      await expect(
        readFile(join(directory, runId, 'trace-attribution.json'), 'utf8')
      ).rejects.toThrow();
      expect(bus.totalEmitted).toBe(1);
    }
  );

  it('preserves the business return value and original throw while diagnostics reject rows', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    const result = { business: 'unchanged' };
    const originalFailure = new Error('FAKE_TEST original business failure');
    const emitInvalid = (): void => {
      bus.emit({ ...validEvent(), attemptId: 'contradictory-attempt' });
    };
    const succeeds = (): typeof result => {
      emitInvalid();
      return result;
    };
    const fails = (): never => {
      emitInvalid();
      throw originalFailure;
    };
    expect(succeeds()).toBe(result);
    expect(fails).toThrow(originalFailure);
    await value.flush();
    expect(await queryTraceFromDisk({ runId }, directory)).toMatchObject({
      events: [],
      attribution: {
        status: 'measured',
        writerObserved: { observed: 2, invalidDropped: 2, foreignDropped: 0, evicted: 0 },
      },
    });
  });

  it('warns only once per writer without raw exception text or rejected identity payload', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    const canary = 'FAKE_TEST_REJECTED_PAYLOAD_7552';
    const output: string[] = [];
    const writes = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    try {
      const throwing = validEvent();
      Object.defineProperty(throwing, 'origin', {
        get: () => {
          throw new Error(canary);
        },
      });
      bus.emit(throwing);
      bus.emit({ ...validEvent(), attemptId: canary });
      bus.emit({ ...validEvent(), attemptId: canary });
      await value.flush();
    } finally {
      writes.mockRestore();
    }
    const diagnostics = output.filter((line) => line.includes('Invalid trace events were dropped'));
    expect(diagnostics).toHaveLength(1);
    expect(Buffer.byteLength(diagnostics[0] ?? '')).toBeLessThan(512);
    expect(output.join('')).not.toContain(canary);
    expect(await readFile(join(directory, runId, 'trace.jsonl'), 'utf8')).not.toContain(canary);
    expect(await readFile(join(directory, runId, 'trace-attribution.json'), 'utf8')).not.toContain(
      canary
    );
    expect(await queryTraceFromDisk({ runId }, directory)).toMatchObject({
      attribution: { writerObserved: { observed: 3, invalidDropped: 3 } },
    });
  });
});
