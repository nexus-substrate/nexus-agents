/** Real IO with narrow fault/barrier instrumentation for snapshot boundaries. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';

const io = vi.hoisted(() => ({
  grow: false,
  growAfterDescriptorStat: false,
  nonregularDescriptor: false,
  replaceBeforeOpen: false,
  metadataFd: undefined as number | undefined,
  metadataPath: '',
  openFlags: [] as unknown[],
  descriptorChecks: 0,
  metadataCloses: 0,
  metadataReadBytes: 0,
  pause: false,
  pauseAfterTraceRename: false,
  entered: undefined as (() => void) | undefined,
  gate: undefined as Promise<void> | undefined,
  snapshots: [] as { writerObserved: { observed: number } }[],
  traceWrites: [] as string[],
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    statSync: (...args: unknown[]) => {
      const result: unknown = Reflect.apply(actual.statSync, actual, args);
      if (io.grow && String(args[0]).endsWith('trace-attribution.json')) {
        io.grow = false;
        actual.appendFileSync(String(args[0]), ' '.repeat(32 * 1024));
      }
      return result;
    },
    openSync: (...args: unknown[]) => {
      const metadata = String(args[0]).endsWith('trace-attribution.json');
      if (metadata && io.replaceBeforeOpen) {
        io.replaceBeforeOpen = false;
        actual.renameSync(String(args[0]), `${String(args[0])}.original`);
        actual.copyFileSync(`${String(args[0])}.original`, String(args[0]));
      }
      const fd = Reflect.apply(actual.openSync, actual, args) as number;
      if (metadata) {
        io.metadataFd = fd;
        io.metadataPath = String(args[0]);
        io.openFlags.push(args[1]);
      }
      return fd;
    },
    fstatSync: (...args: unknown[]) => {
      const result = Reflect.apply(actual.fstatSync, actual, args) as import('node:fs').Stats;
      if (args[0] !== io.metadataFd) return result;
      io.descriptorChecks++;
      if (io.growAfterDescriptorStat) {
        io.growAfterDescriptorStat = false;
        actual.appendFileSync(io.metadataPath, ' '.repeat(32 * 1024));
      }
      return io.nonregularDescriptor
        ? new Proxy(result, {
            get: (target, key, receiver): unknown =>
              key === 'isFile' ? () => false : Reflect.get(target, key, receiver),
          })
        : result;
    },
    closeSync: (...args: unknown[]) => {
      if (args[0] === io.metadataFd) io.metadataCloses++;
      Reflect.apply(actual.closeSync, actual, args);
    },
    readFileSync: (...args: unknown[]) => {
      const result: unknown = Reflect.apply(actual.readFileSync, actual, args);
      if (String(args[0]).endsWith('trace-attribution.json'))
        io.metadataReadBytes +=
          typeof result === 'string'
            ? Buffer.byteLength(result)
            : Buffer.isBuffer(result)
              ? result.length
              : 0;
      return result;
    },
    readSync: (...args: unknown[]) => {
      const result: unknown = Reflect.apply(actual.readSync, actual, args);
      if (typeof result === 'number') io.metadataReadBytes += result;
      return result;
    },
  };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir: async (...args: unknown[]) => {
      if (io.pause) {
        io.pause = false;
        io.entered?.();
        await io.gate;
      }
      return Reflect.apply(actual.mkdir, actual, args) as Promise<unknown>;
    },
    rename: async (...args: unknown[]) => {
      await Reflect.apply(actual.rename, actual, args);
      if (io.pauseAfterTraceRename && String(args[1]).endsWith('trace.jsonl')) {
        io.pauseAfterTraceRename = false;
        io.entered?.();
        await io.gate;
      }
    },
    writeFile: async (...args: unknown[]) => {
      const file = String(args[0]);
      if (file.includes('trace.jsonl.tmp.')) io.traceWrites.push(file);
      if (file.includes('trace-attribution.json.tmp.') && typeof args[1] === 'string')
        io.snapshots.push(JSON.parse(args[1]) as { writerObserved: { observed: number } });
      return Reflect.apply(actual.writeFile, actual, args) as Promise<void>;
    },
  };
});
import { EventBus } from './event-bus.js';
import { TraceWriter } from './trace-writer.js';
import { queryTraceFromDisk } from '../mcp/tools/query-trace-tool.js';
import { parseTraceJsonl, extractDecisions } from '../replay/replay-executor.js';

const origin = { kind: 'run', producer: 'dev-pipeline', runId: 'pipeline-a' } as const;
const event = {
  type: 'stage.completed',
  timestamp: 1,
  executionId: 'dev-pipeline-plan',
  stageId: 'plan',
  durationMs: 1,
  success: true,
  origin,
} as const;
let dir: string;
let bus: EventBus;
let writer: TraceWriter;
const trace = (): string => join(dir, 'pipeline-a', 'trace.jsonl');
const sidecar = (): string => join(dir, 'pipeline-a', 'trace-attribution.json');
async function meta(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(sidecar(), 'utf8')) as Record<string, unknown>;
}
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trace-boundary-'));
  bus = new EventBus();
  writer = new TraceWriter(bus, { runsDir: dir, runId: 'pipeline-a', origin });
  io.grow = false;
  io.growAfterDescriptorStat = false;
  io.nonregularDescriptor = false;
  io.replaceBeforeOpen = false;
  io.metadataFd = undefined;
  io.metadataPath = '';
  io.openFlags.length = 0;
  io.descriptorChecks = 0;
  io.metadataCloses = 0;
  io.metadataReadBytes = 0;
  io.pause = false;
  io.pauseAfterTraceRename = false;
  io.snapshots.length = 0;
  io.traceWrites.length = 0;
});
afterEach(async () => {
  writer.stop();
  await rm(dir, { recursive: true, force: true });
});

describe('snapshot loss cannot hide behind plausible metadata', () => {
  it('keeps valid Unicode metadata but refuses invalid UTF-8 replacement decoding', async () => {
    writer.stop();
    const unicodeOrigin = { ...origin, taskId: 'task-\uFFFD' };
    writer = new TraceWriter(bus, { runsDir: dir, runId: origin.runId, origin: unicodeOrigin });
    bus.emit({ ...event, origin: unicodeOrigin });
    await writer.flush();
    expect(await queryTraceFromDisk({ runId: origin.runId }, dir)).toMatchObject({
      attribution: { status: 'measured' },
    });
    const original = await readFile(sidecar());
    const offset = original.indexOf(Buffer.from('\uFFFD'));
    expect(offset).toBeGreaterThanOrEqual(0);
    const changed = Buffer.concat([
      original.subarray(0, offset),
      Buffer.from([0xe1, 0x80]),
      original.subarray(offset + 3),
    ]);
    expect(changed.toString('utf8')).toBe(original.toString('utf8'));
    await writeFile(sidecar(), changed);
    expect(await queryTraceFromDisk({ runId: origin.runId }, dir)).toMatchObject({
      attribution: { status: 'unmeasured', retained: null },
    });
  });

  it('uses nonblocking no-follow metadata open flags and closes the regular descriptor', async () => {
    bus.emit(event);
    await writer.flush();
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, dir)).toMatchObject({
      attribution: { status: 'measured' },
    });
    expect(io.openFlags[0]).toBe(constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    expect(io.descriptorChecks).toBe(1);
    expect(io.metadataCloses).toBe(1);
  });
  it('rejects a nonregular opened descriptor before reading and closes it', async () => {
    bus.emit(event);
    await writer.flush();
    io.nonregularDescriptor = true;
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, dir)).toMatchObject({
      attribution: { status: 'unmeasured', retained: null },
    });
    expect(io.descriptorChecks).toBe(1);
    expect(io.metadataReadBytes).toBe(0);
    expect(io.metadataCloses).toBe(1);
  });
  it('rejects metadata replaced between path stat and open, then recovers', async () => {
    bus.emit(event);
    await writer.flush();
    io.replaceBeforeOpen = true;
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, dir)).toMatchObject({
      attribution: { status: 'unmeasured', retained: null },
    });
    expect(io.metadataReadBytes).toBe(0);
    expect(io.metadataCloses).toBe(1);
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, dir)).toMatchObject({
      attribution: { status: 'measured' },
    });
  });
  it('bounds bytes when metadata grows after the descriptor stat', async () => {
    bus.emit(event);
    await writer.flush();
    io.growAfterDescriptorStat = true;
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, dir)).toMatchObject({
      attribution: { status: 'unmeasured' },
    });
    expect(io.metadataReadBytes).toBe(16 * 1024 + 1);
    expect(io.metadataCloses).toBe(1);
  });

  it('bounds the actual sidecar bytes read even if it grows after stat', async () => {
    bus.emit(event);
    await writer.flush();
    io.grow = true;
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, dir)).toMatchObject({
      attribution: { status: 'unmeasured' },
    });
    expect(io.metadataReadBytes).toBeLessThanOrEqual(16 * 1024 + 1);
  });
  it.each(['digest', 'context', 'version', 'unsafe-counter'] as const)(
    'refuses plausible but wrong %s and recovers the matching positive',
    async (mode) => {
      bus.emit(event);
      await writer.flush();
      const good = await readFile(sidecar(), 'utf8');
      const original = JSON.parse(good) as Record<string, unknown>;
      const changed = {
        ...original,
        ...(mode === 'digest' ? { traceSha256: '0'.repeat(64) } : {}),
        ...(mode === 'context'
          ? { captureOrigin: { ...origin, producer: 'contract-pipeline' } }
          : {}),
        ...(mode === 'version' ? { attributionVersion: 2 } : {}),
        ...(mode === 'unsafe-counter'
          ? {
              writerObserved: {
                observed: Number.MAX_SAFE_INTEGER + 1,
                evicted: 0,
                foreignDropped: 0,
              },
            }
          : {}),
      };
      await writeFile(sidecar(), JSON.stringify(changed));
      expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, dir)).toMatchObject({
        attribution: { status: 'unmeasured', writerObserved: null },
      });
      await writeFile(sidecar(), good);
      expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, dir)).toMatchObject({
        attribution: { status: 'measured' },
      });
    }
  );
  it.each([
    'broken',
    'null',
    '7',
    '[]',
    '{"timestamp":1,"runId":"pipeline-a","eventType":"hidden","attributionVersion":1,"captureRelation":"attempt_owned"}',
  ])('refuses whole-stream loss despite matching digest and filtering: %s', async (bad) => {
    bus.emit(event);
    await writer.flush();
    const text = (await readFile(trace(), 'utf8')) + bad + '\n';
    await writeFile(trace(), text);
    await writeFile(
      sidecar(),
      JSON.stringify({
        ...(await meta()),
        traceBytes: Buffer.byteLength(text),
        traceSha256: createHash('sha256').update(text).digest('hex'),
      })
    );
    const result = await queryTraceFromDisk(
      { runId: 'pipeline-a', eventType: 'stage.completed', limit: 1 },
      dir
    );
    expect(result).toMatchObject({
      totalEvents: 1,
      attribution: { status: 'unmeasured', retained: null, filtered: null, returned: null },
    });
    expect(result.events[0]?.['captureRelation']).not.toBe('run_related');
  });
  it('preserves explicit run-level routing only with a matching snapshot and consistent schema', async () => {
    bus.emit({
      type: 'routing.decision',
      timestamp: 1,
      taskId: 'task',
      selectedModel: 'codex',
      origin,
    });
    await writer.flush();
    const text = await readFile(trace(), 'utf8');
    const snapshot = await meta();
    expect(extractDecisions(parseTraceJsonl(text, snapshot))).toHaveLength(1);
    expect(extractDecisions(parseTraceJsonl(text))).toEqual([]);
    expect(
      extractDecisions(parseTraceJsonl(text, { ...snapshot, traceSha256: '0'.repeat(64) }))
    ).toEqual([]);
  });
});

describe('bounded serialized snapshots', () => {
  it('freezes first rows and counters before IO, coalesces calls, then publishes later observations', async () => {
    let release!: () => void;
    let entered!: () => void;
    io.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    io.entered = entered;
    io.pause = true;
    bus.emit(event);
    const first = writer.flush();
    await started;
    bus.emit(event);
    bus.emit({ ...event, origin: { ...origin, runId: 'pipeline-b' } });
    const concurrent = Array.from({ length: 100 }, () => writer.flush());
    release();
    await Promise.all([first, ...concurrent]);
    expect(io.snapshots.map((s) => s.writerObserved.observed)).toEqual([1, 3]);
    expect(io.traceWrites).toHaveLength(2);
    expect(new Set(io.traceWrites).size).toBe(2);
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, dir)).toMatchObject({
      totalEvents: 2,
      attribution: {
        status: 'measured',
        writerObserved: { observed: 3, foreignDropped: 1, evicted: 0 },
      },
    });
  });
});

describe('same-path and replay boundary controls', () => {
  it('two writers sharing one logical path detect a torn pair and recover without merged history', async () => {
    const contract = { ...origin, producer: 'contract-pipeline' } as const;
    const other = new TraceWriter(bus, { runsDir: dir, runId: origin.runId, origin: contract });
    let release!: () => void;
    try {
      for (let i = 0; i < 3; i++) bus.emit(event);
      bus.emit({ ...event, origin: contract });
      io.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        io.entered = resolve;
      });
      io.pauseAfterTraceRename = true;
      const first = writer.flush();
      await entered;
      await other.flush();
      expect(await queryTraceFromDisk({ runId: origin.runId }, dir)).toMatchObject({
        totalEvents: 1,
        attribution: { status: 'measured', writerObserved: { observed: 4, foreignDropped: 3 } },
      });
      release();
      await first;
      expect(await queryTraceFromDisk({ runId: origin.runId }, dir)).toMatchObject({
        attribution: { status: 'unmeasured', writerObserved: null },
      });
      await writer.flush();
      expect(await queryTraceFromDisk({ runId: origin.runId }, dir)).toMatchObject({
        totalEvents: 3,
        attribution: { status: 'measured', writerObserved: { observed: 4, foreignDropped: 1 } },
      });
      expect(
        (await readdir(join(dir, origin.runId))).filter((file) => file.includes('.tmp.'))
      ).toEqual([]);
      expect(new Set(io.traceWrites).size).toBe(io.traceWrites.length);
    } finally {
      release?.();
      other.stop();
    }
  });

  it('excludes snapshot-valid unattributed routing from replay', async () => {
    bus.emit({ type: 'routing.decision', timestamp: 1, taskId: 'task', selectedModel: 'codex' });
    await writer.flush();
    const entries = parseTraceJsonl(await readFile(trace(), 'utf8'), await meta());
    expect(entries).toHaveLength(1);
    expect(entries[0]?.captureRelation).toBe('unattributed');
    expect(extractDecisions(entries)).toEqual([]);
  });
});
